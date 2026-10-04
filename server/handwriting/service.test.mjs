import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Ledger } from "./ledger.mjs";
import { ProviderError } from "./provider.mjs";
import { createService } from "./service.mjs";

async function fixture(overrides = {}) {
  const ledger = new Ledger();
  const storage = await mkdtemp(join(tmpdir(), "nodi-handwriting-"));
  const uploads = [];
  const provider = {
    retention: 3600,
    upload: async (_blob, name) => {
      uploads.push(name);
      return { id: "abc123" };
    },
    status: async () => ({
      status: "processed",
      page_count: 1,
      results: [
        { page_number: 1, transcript: "Grap conpilence\nExact provider text" },
      ],
    }),
    request: async () => ({
      documents: uploads.map((file_name) => ({ id: "abc123", file_name })),
      last_page: 1,
    }),
  };
  const service = createService({
    ledger,
    provider,
    storage,
    commercialAgreement: true,
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
    provider,
    uploads,
    call,
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
  assert.equal(f.uploads.length, 1);
  const result = await (await f.call(`documents/${jobs[0].id}`)).json();
  assert.equal(result.text, "Grap conpilence\nExact provider text");
  await f.call(`documents/${jobs[0].id}`);
  assert.equal(f.ledger.usage("u").trialRemaining, 0);
  const another = await getQuote(f);
  assert.equal(
    (await f.call("documents", "POST", { quoteId: another.id })).status,
    402,
  );
  await f.close();
});

test("unknown upload timeout retains credits and reconciles without resubmission", async () => {
  const f = await fixture();
  f.provider.upload = async (_file, name) => {
    f.uploads.push(name);
    throw new ProviderError("provider_timeout", 504, true);
  };
  const q = await getQuote(f);
  const job = await (
    await f.call("documents", "POST", { quoteId: q.id })
  ).json();
  assert.equal(f.ledger.usage("u").trialRemaining, 0);
  await f.call("documents", "POST", { quoteId: q.id });
  assert.equal(f.uploads.length, 1);
  assert.equal(
    (await (await f.call(`quotes/${q.id}/document`)).json()).id,
    job.id,
  );
  const result = await (await f.call(`documents/${job.id}`)).json();
  assert.equal(result.status, "processed");
  assert.equal(f.uploads.length, 1);
  await f.close();
});

test("confirmed failures refund; mismatch stays pending; hostile page claims cannot bypass server parser", async () => {
  const f = await fixture();
  const q = await getQuote(f);
  const job = await (
    await f.call("documents", "POST", { quoteId: q.id })
  ).json();
  f.provider.status = async () => ({
    status: "processed",
    page_count: 2,
    results: [],
  });
  assert.equal(
    (await (await f.call(`documents/${job.id}`)).json()).status,
    "pending",
  );
  assert.equal(f.ledger.usage("u").trialRemaining, 0);
  f.provider.status = async () => ({ status: "failed" });
  await f.call(`documents/${job.id}`);
  assert.equal(f.ledger.usage("u").trialRemaining, 1);
  await f.close();
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
