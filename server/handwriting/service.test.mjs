import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Ledger } from "./ledger.mjs";
import { ProviderError } from "./provider.mjs";
import { createService } from "./service.mjs";

async function fixture(overrides = {}, shared = {}) {
  const ledger = shared.ledger ?? new Ledger();
  const storage =
    shared.storage ?? (await mkdtemp(join(tmpdir(), "nodi-handwriting-")));
  const calls = [];
  const provider = {
    model: "gpt-5.4",
    transcribe: async (bytes, mime, name, pages, effort) => {
      calls.push({ bytes: bytes.toString(), mime, name, pages, effort });
      return { text: "Grap conpilence\nExact provider text" };
    },
  };
  const service = createService({
    ledger,
    provider,
    storage,
    commercialAgreement: true,
    wait: async () => {},
    authenticate: async (request) =>
      request.headers.get("Authorization") === "Bearer verified-session"
        ? { id: "u" }
        : null,
    inspectDocument: async () => ({
      pages: 1,
      mime: "image/png",
      extension: "png",
    }),
    ...overrides,
  });
  const call = async (path, method = "GET", data, headers = {}) =>
    service.handle(
      new Request(`https://nodi.example/v1/handwriting/${path}`, {
        method,
        headers: { Authorization: "Bearer verified-session", ...headers },
        body:
          data === undefined
            ? undefined
            : typeof data === "string"
              ? data
              : JSON.stringify(data),
      }),
    );
  return {
    ledger,
    storage,
    provider,
    calls,
    call,
    settle: () => service.settle(),
    close: async () => {
      ledger.db.close();
      await rm(storage, { recursive: true });
    },
  };
}
const getQuote = async (f) =>
  (
    await f.call("quote", "POST", "image bytes", {
      "X-Processing-Consent": "handwriting",
    })
  ).json();

test("consent, verified auth and commercial agreement are required; no fake purchases", async () => {
  const f = await fixture();
  assert.equal((await f.call("quote", "POST", "bytes")).status, 400);
  assert.equal(
    (await f.call("usage", "GET", undefined, { Authorization: "invalid" }))
      .status,
    401,
  );
  assert.equal(
    (await f.call("checkout", "POST", { product: "plus" })).status,
    503,
  );
  assert.equal((await f.call("payment-webhook", "POST", {})).status, 503);
  await f.close();
  const disabled = await fixture({ commercialAgreement: false });
  assert.equal((await disabled.call("usage")).status, 503);
  await disabled.close();
});

const submit = async (f, quote) =>
  (await f.call("documents", "POST", { quoteId: quote.id })).json();

test("quote/submission is idempotent under concurrent requests, text is exact, reads never charge", async () => {
  const f = await fixture();
  const q = await getQuote(f);
  assert.equal(q.credits, 1);
  const responses = await Promise.all([
    f.call("documents", "POST", { quoteId: q.id, pages: 0 }),
    f.call("documents", "POST", { quoteId: q.id }),
  ]);
  const jobs = await Promise.all(responses.map((r) => r.json()));
  assert.equal(jobs[0].id, jobs[1].id);
  await f.settle();
  assert.equal(f.calls.length, 1);
  assert.deepEqual(f.calls[0], {
    bytes: "image bytes",
    mime: "image/png",
    name: `nodi-${jobs[0].id}.png`,
    pages: 1,
    effort: "none",
  });
  const result = await (await f.call(`documents/${jobs[0].id}`)).json();
  assert.equal(result.status, "processed");
  assert.equal(result.text, "Grap conpilence\nExact provider text");
  await f.call(`documents/${jobs[0].id}`);
  assert.equal(f.calls.length, 1);
  assert.equal(f.ledger.usage("u").trialRemaining, 0);
  assert.deepEqual(await readdir(f.storage), [`${jobs[0].id}.txt`]);
  const another = await getQuote(f);
  assert.equal(
    (await f.call("documents", "POST", { quoteId: another.id })).status,
    402,
  );
  await f.close();
});

test("the chosen effort sets the credits charged and reaches the provider", async () => {
  const f = await fixture();
  f.ledger.ensureUser("u");
  f.ledger.db
    .prepare("INSERT INTO grants VALUES('pack:u','u','pack',10,NULL,0)")
    .run();
  const usage = await (await f.call("usage")).json();
  assert.equal(usage.effort, "none");
  const invalid = await getQuote(f);
  assert.equal(
    (await f.call("documents", "POST", { quoteId: invalid.id, effort: "max" }))
      .status,
    400,
  );
  const q = await getQuote(f);
  await f.call("documents", "POST", { quoteId: q.id, effort: "xhigh" });
  await f.settle();
  assert.equal(f.calls.at(-1).effort, "xhigh");
  const after = f.ledger.usage("u");
  assert.equal(after.trialRemaining + after.additional[0].remaining, 6);
  await f.close();
});

test("a failed transcription refunds the page and deletes the source", async () => {
  const f = await fixture();
  let fail;
  f.provider.transcribe = () =>
    new Promise((_, reject) => {
      fail = () => reject(new ProviderError("transcription_failed", 502));
    });
  const job = await submit(f, await getQuote(f));
  assert.equal(f.ledger.usage("u").trialRemaining, 0);
  assert.equal(
    (await (await f.call(`documents/${job.id}`)).json()).status,
    "processing",
  );
  fail();
  await f.settle();
  assert.equal(
    (await (await f.call(`documents/${job.id}`)).json()).status,
    "failed",
  );
  assert.equal(f.ledger.usage("u").trialRemaining, 1);
  assert.deepEqual(await readdir(f.storage), []);
  await f.close();
});

test("rate limits are retried without charging twice", async () => {
  const f = await fixture();
  let attempts = 0;
  f.provider.transcribe = async () => {
    attempts++;
    if (attempts === 1) throw new ProviderError("rate_limited", 429, true);
    return { text: "after retry" };
  };
  const job = await submit(f, await getQuote(f));
  await f.settle();
  assert.equal(attempts, 2);
  assert.equal(
    (await (await f.call(`documents/${job.id}`)).json()).text,
    "after retry",
  );
  assert.equal(f.ledger.usage("u").trialRemaining, 0);
  await f.close();
});

test("a transcription lost to a restart is a confirmed failure and refunds the page", async () => {
  const first = await fixture();
  first.provider.transcribe = () => new Promise(() => {});
  const job = await submit(first, await getQuote(first));
  assert.equal(first.ledger.usage("u").trialRemaining, 0);
  // Same database and files, new process: the answer can never arrive.
  const restarted = await fixture(
    {},
    { ledger: first.ledger, storage: first.storage },
  );
  assert.equal(
    (await (await restarted.call(`documents/${job.id}`)).json()).status,
    "failed",
  );
  assert.equal(restarted.ledger.usage("u").trialRemaining, 1);
  await restarted.close();
});

test("HEIC and TIFF are converted to JPEG on the server before transcription", async () => {
  const f = await fixture({
    inspectDocument: async () => ({
      pages: 1,
      mime: "image/heic",
      extension: "heic",
    }),
    convertDocument: async (bytes) => Buffer.from(`jpeg of ${bytes}`),
  });
  const job = await submit(f, await getQuote(f));
  await f.settle();
  assert.equal(f.calls[0].mime, "image/jpeg");
  assert.equal(f.calls[0].bytes, "jpeg of image bytes");
  assert.equal(f.calls[0].name, `nodi-${job.id}.jpg`);
  await f.close();
  const unconverted = await fixture({
    inspectDocument: async () => ({
      pages: 1,
      mime: "image/tiff",
      extension: "tiff",
    }),
  });
  assert.equal(
    (
      await unconverted.call("quote", "POST", "bytes", {
        "X-Processing-Consent": "handwriting",
      })
    ).status,
    400,
  );
  await unconverted.close();
});

test("hostile page claims cannot bypass the server parser", async () => {
  const invalid = await fixture({
    inspectDocument: async () => ({
      pages: 999,
      mime: "image/png",
      extension: "png",
    }),
  });
  assert.equal(
    (
      await invalid.call("quote", "POST", "bytes", {
        "X-Processing-Consent": "handwriting",
      })
    ).status,
    400,
  );
  await invalid.close();
});

test("CORS accepts only configured desktop origins, including authenticated preflight", async () => {
  const f = await fixture({ allowedOrigins: ["tauri://localhost"] });
  const accepted = await f.call("usage", "OPTIONS", undefined, {
    Origin: "tauri://localhost",
  });
  assert.equal(accepted.status, 204);
  assert.equal(
    accepted.headers.get("Access-Control-Allow-Origin"),
    "tauri://localhost",
  );
  assert.equal(
    (
      await f.call("usage", "GET", undefined, {
        Origin: "https://untrusted.example",
      })
    ).status,
    403,
  );
  await f.close();
});
