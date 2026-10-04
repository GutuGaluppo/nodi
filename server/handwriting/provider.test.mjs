import assert from "node:assert/strict";
import { test } from "node:test";
import { Ledger } from "./ledger.mjs";
import { HandwritingProvider } from "./provider.mjs";

test("v3 multipart transcription uses Bearer and 1-hour deletion; never follows redirects", async () => {
  const ledger = new Ledger();
  let calls = 0;
  const provider = new HandwritingProvider({
    key: "server-secret",
    ledger,
    wait: async () => {},
    fetcher: async (url, options) => {
      calls++;
      assert.equal(url, "https://api.handwritingocr.com/v3/documents");
      assert.equal(options.headers.Authorization, "Bearer server-secret");
      assert.equal(options.redirect, "manual");
      assert.equal(options.body.get("action"), "transcribe");
      assert.equal(options.body.get("delete_after"), "3600");
      return new Response(null, {
        status: 307,
        headers: { Location: "https://other.example" },
      });
    },
  });
  await assert.rejects(
    () => provider.upload(new Blob(["file"]), "nodi.pdf"),
    (e) => e.code === "provider_redirect" && e.uncertain,
  );
  assert.equal(calls, 1);
  ledger.db.close();
});

test("timeouts are uncertain uploads, 429 honors Retry-After without uploading twice", async () => {
  const ledger = new Ledger(":memory:", () => 0);
  let calls = 0;
  const provider = new HandwritingProvider({
    key: "server-secret",
    ledger,
    wait: async () => {},
    fetcher: async () => {
      calls++;
      return new Response(null, {
        status: 429,
        headers: { "Retry-After": "20" },
      });
    },
  });
  await assert.rejects(
    () => provider.upload(new Blob(["file"]), "file.pdf"),
    (e) => e.code === "rate_limited",
  );
  assert.equal(calls, 1);
  assert.ok(ledger.providerSlot() >= 20000);
  provider.fetcher = async () => {
    throw new Error("sensitive internal content");
  };
  await assert.rejects(
    () => provider.upload(new Blob(["file"]), "file.pdf"),
    (e) =>
      e.code === "provider_timeout" &&
      e.uncertain &&
      !e.message.includes("sensitive"),
  );
  ledger.db.close();
});

test("validates retention and rejects missing server key", () => {
  const ledger = new Ledger();
  assert.throws(
    () => new HandwritingProvider({ ledger }),
    /provider_unconfigured/,
  );
  assert.throws(
    () => new HandwritingProvider({ key: "key", ledger, retention: 60 }),
    /invalid_retention/,
  );
  ledger.db.close();
});
