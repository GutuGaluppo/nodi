import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import config from "../../landing/plans.json" with { type: "json" };
import { ServiceError } from "./ledger.mjs";

const json = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Ports are mandatory integrations, never stand-in authentication or payments. */
export function createService({
  ledger,
  provider,
  storage,
  authenticate,
  inspectDocument,
  payments,
  commercialAgreement = false,
  allowedOrigins = [],
}) {
  ledger.db.exec(
    "CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY, user_id TEXT NOT NULL, pages INTEGER NOT NULL, mime TEXT NOT NULL, extension TEXT NOT NULL, expires INTEGER NOT NULL)",
  );
  const ready =
    commercialAgreement && provider && authenticate && inspectDocument;
  const quoteFor = (user, id) => {
    const quote = ledger.db
      .prepare("SELECT * FROM quotes WHERE user_id=? AND id=?")
      .get(user, id);
    if (!quote) throw new ServiceError("not_found", 404);
    return quote;
  };
  const resultPath = (id) => join(storage, `${id}.txt`);
  const sourcePath = (id) => join(storage, `${id}.source`);

  async function status(user, id) {
    const doc = ledger.document(user, id);
    const base = {
      id,
      pages: doc.pages,
      status: doc.status,
      retryAfterMs: 5000,
    };
    if (doc.status === "processed") {
      try {
        return { ...base, text: await readFile(resultPath(id), "utf8") };
      } catch {
        return { ...base, status: "expired" };
      }
    }
    if (doc.status === "failed") return base;
    let providerId = doc.provider_id;
    if (!providerId) {
      // Upload timeouts/crashes are reconciled by the unique server-generated filename.
      const quote = quoteFor(user, doc.quote_id);
      const name = `nodi-${doc.id}.${quote.extension}`;
      for (let page = 1; page <= 20; page++) {
        const list = await provider.request(
          `documents?per_page=200&page=${page}&updated_since=${encodeURIComponent(new Date(doc.created - 60000).toISOString())}`,
        );
        const match = list.documents?.find((item) => item.file_name === name);
        if (match) {
          providerId = match.id;
          ledger.update(id, "queued", providerId);
          break;
        }
        if (!list.last_page || page >= list.last_page) break;
      }
      if (!providerId) return { ...base, status: "pending" };
    }
    const response = await provider.status(providerId);
    if (response.status === "failed") {
      // Confirmed failure refunds the user. Provider costs stay the application's cost.
      ledger.update(id, "failed");
      return { ...base, status: "failed" };
    }
    if (response.status !== "processed")
      return { ...base, status: "processing" };
    if (response.page_count !== doc.pages) {
      // Do not silently charge more than the accepted quote or release unknown usage.
      ledger.update(id, "reconciliation");
      return { ...base, status: "pending" };
    }
    if (
      !Array.isArray(response.results) ||
      response.results.some((page) => typeof page.transcript !== "string")
    )
      throw new ServiceError("provider_response", 502);
    const text = [...response.results]
      .sort((a, b) => a.page_number - b.page_number)
      .map((page) => page.transcript)
      .join("\n\n");
    await writeFile(resultPath(id), text, { mode: 0o600 });
    ledger.update(id, "processed");
    await unlink(sourcePath(doc.quote_id)).catch(() => {});
    return { ...base, status: "processed", text };
  }

  async function cleanup() {
    await mkdir(storage, { recursive: true, mode: 0o700 });
    // Unsubmitted files expire in 15 minutes. Results and submitted sources expire in 1h.
    for (const file of await readdir(storage)) {
      if (file.endsWith(".txt")) {
        const doc = ledger.db
          .prepare("SELECT updated FROM documents WHERE id=?")
          .get(file.slice(0, -4));
        if (doc && doc.updated + 3600000 < ledger.now())
          await unlink(join(storage, file)).catch(() => {});
      } else if (file.endsWith(".source")) {
        const quote = ledger.db
          .prepare("SELECT * FROM quotes WHERE id=?")
          .get(file.slice(0, -7));
        const doc =
          quote &&
          ledger.db
            .prepare("SELECT created FROM documents WHERE quote_id=?")
            .get(quote.id);
        if (
          quote &&
          (doc ? doc.created + 3600000 : quote.expires) < ledger.now()
        )
          await unlink(join(storage, file)).catch(() => {});
      }
    }
  }

  async function handle(request) {
    try {
      await cleanup();
      const path = new URL(request.url).pathname;
      if (
        path === "/v1/handwriting/payment-webhook" &&
        request.method === "POST"
      ) {
        if (!payments?.verifyWebhook)
          throw new ServiceError("payments_unconfigured", 503);
        const event = await payments.verifyWebhook(request);
        if (!event) throw new ServiceError("invalid_payment", 401);
        ledger.payment(event);
        return json({ received: true });
      }
      if (!ready) throw new ServiceError("service_unconfigured", 503);
      const user = await authenticate(request);
      if (!user?.id) throw new ServiceError("unauthenticated", 401);
      if (path === "/v1/handwriting/usage" && request.method === "GET")
        return json({
          ...ledger.usage(user.id),
          deleteAfterSeconds: provider.retention,
          paymentsAvailable: Boolean(payments?.checkout),
          restoreAvailable: Boolean(payments?.restore),
        });
      if (path === "/v1/handwriting/quote" && request.method === "POST") {
        if (request.headers.get("X-Processing-Consent") !== "handwriting")
          throw new ServiceError("consent_required");
        const declared = Number(request.headers.get("Content-Length"));
        if (declared > config.maxBytes)
          throw new ServiceError("file_too_large", 413);
        // Bounded stream, rather than buffering an arbitrarily large request.
        const reader = request.body?.getReader();
        if (!reader) throw new ServiceError("invalid_file");
        const chunks = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > config.maxBytes) {
            await reader.cancel();
            throw new ServiceError("file_too_large", 413);
          }
          chunks.push(value);
        }
        if (size === 0) throw new ServiceError("invalid_file");
        const bytes = Buffer.concat(chunks);
        // Trusted server parser must validate actual bytes, PDF encryption/page tree,
        // multi-frame images, decompression limits and provider-compatible page counts.
        const document = await inspectDocument(bytes);
        if (
          !config.mimeTypes.includes(document.mime) ||
          !/^[a-z]{3,4}$/.test(document.extension) ||
          !Number.isSafeInteger(document.pages) ||
          document.pages < 1 ||
          document.pages > config.maxPages
        )
          throw new ServiceError("invalid_file");
        const id = randomUUID();
        await writeFile(sourcePath(id), bytes, { mode: 0o600 });
        const expires = ledger.now() + 900000;
        ledger.db
          .prepare("INSERT INTO quotes VALUES(?,?,?,?,?,?)")
          .run(
            id,
            user.id,
            document.pages,
            document.mime,
            document.extension,
            expires,
          );
        return json({
          id,
          pages: document.pages,
          credits: document.pages,
          expiresAt: new Date(expires).toISOString(),
        });
      }
      if (path === "/v1/handwriting/documents" && request.method === "POST") {
        const { quoteId } = await request.json();
        const quote = quoteFor(user.id, quoteId);
        const existing = ledger.db
          .prepare("SELECT id FROM documents WHERE user_id=? AND quote_id=?")
          .get(user.id, quoteId);
        if (existing) return json({ id: existing.id, status: "pending" }, 202);
        if (quote.expires <= ledger.now())
          throw new ServiceError("quote_expired", 409);
        const bytes = await readFile(sourcePath(quote.id));
        const { document: doc, fresh } = ledger.reserve(user.id, quote);
        if (!fresh) return json({ id: doc.id, status: "pending" }, 202);
        ledger.update(doc.id, "pending");
        try {
          const result = await provider.upload(
            new Blob([bytes], { type: quote.mime }),
            `nodi-${doc.id}.${quote.extension}`,
          );
          ledger.update(doc.id, "queued", result.id);
        } catch (error) {
          if (error.uncertain === false) {
            ledger.update(doc.id, "failed");
            throw error;
          }
          // Unknown outcome: reservation is retained and upload is never repeated.
        }
        return json({ id: doc.id, status: "pending" }, 202);
      }
      if (path === "/v1/handwriting/documents" && request.method === "GET") {
        return json(
          ledger.db
            .prepare(
              "SELECT id,pages,status FROM documents WHERE user_id=? AND created>? ORDER BY created DESC",
            )
            .all(user.id, ledger.now() - 3600000),
        );
      }
      const lookup = path.match(
        /^\/v1\/handwriting\/quotes\/([a-f0-9-]+)\/document$/,
      );
      if (lookup && request.method === "GET") {
        quoteFor(user.id, lookup[1]);
        const doc = ledger.db
          .prepare("SELECT id FROM documents WHERE user_id=? AND quote_id=?")
          .get(user.id, lookup[1]);
        return json(doc || null);
      }
      const match = path.match(/^\/v1\/handwriting\/documents\/([a-f0-9-]+)$/);
      if (match && request.method === "GET")
        return json(await status(user.id, match[1]));
      if (path === "/v1/handwriting/checkout" && request.method === "POST") {
        if (!payments?.checkout)
          throw new ServiceError("payments_unconfigured", 503);
        const { product } = await request.json();
        if (
          product !== "manage" &&
          product !== "pack" &&
          !config.plans.some((p) => p.id === product && p.monthly)
        )
          throw new ServiceError("invalid_product");
        return json(await payments.checkout(user.id, product));
      }
      if (path === "/v1/handwriting/restore" && request.method === "POST") {
        if (!payments?.restore)
          throw new ServiceError("payments_unconfigured", 503);
        const events = await payments.restore(user.id);
        for (const event of events) {
          if (event.userId !== user.id)
            throw new ServiceError("invalid_payment", 403);
          ledger.payment(event);
        }
        return json(ledger.usage(user.id));
      }
      throw new ServiceError("not_found", 404);
    } catch (error) {
      // Deliberately return only fixed error codes: no secrets, files or transcripts.
      const response = json(
        {
          code:
            error instanceof ServiceError ? error.code : "service_unavailable",
        },
        error instanceof ServiceError ? error.status : 503,
      );
      if (error instanceof ServiceError && error.status === 429)
        response.headers.set(
          "Retry-After",
          String(Math.ceil((error.retryAfterMs || 5000) / 1000)),
        );
      return response;
    }
  }
  async function withCors(request) {
    const origin = request.headers.get("Origin");
    if (origin && !allowedOrigins.includes(origin))
      return json({ code: "origin_refused" }, 403);
    let response;
    if (request.method === "OPTIONS") {
      if (!origin) return json({ code: "origin_refused" }, 403);
      response = new Response(null, { status: 204 });
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS",
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type, X-Processing-Consent",
      );
      response.headers.set("Access-Control-Max-Age", "300");
    } else response = await handle(request);
    if (origin) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Expose-Headers", "Retry-After");
      response.headers.set("Vary", "Origin");
    }
    return response;
  }
  return { handle: withCors, cleanup };
}
