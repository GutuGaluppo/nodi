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
  convertDocument,
  payments,
  commercialAgreement = false,
  allowedOrigins = [],
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
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

  // Transcriptions running in this process. The provider's answer arrives
  // only on its own call, so a job missing from here (after a restart) can
  // never deliver text: it is a confirmed failure and the user is refunded.
  const running = new Map();

  async function transcribe(doc, quote, effort, plan) {
    try {
      const bytes = await readFile(sourcePath(quote.id));
      let result;
      for (let attempt = 1; ; attempt++) {
        try {
          result = await provider.transcribe(
            bytes,
            quote.mime,
            `nodi-${doc.id}.${quote.extension}`,
            doc.pages,
            effort,
            plan,
          );
          break;
        } catch (error) {
          if (!error.retryable || attempt >= 3) throw error;
          await wait(Math.min(60000, error.retryAfterMs ?? 5000 * attempt));
        }
      }
      await writeFile(resultPath(doc.id), result.text, { mode: 0o600 });
      ledger.update(doc.id, "processed");
    } catch {
      // Refunds the user. Any provider charge for the attempt is NODI's cost.
      ledger.update(doc.id, "failed");
    } finally {
      await unlink(sourcePath(quote.id)).catch(() => {});
      running.delete(doc.id);
    }
  }

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
    if (running.has(id)) return { ...base, status: "processing" };
    ledger.update(id, "failed");
    return { ...base, status: "failed" };
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
      if (path === "/v1/handwriting/usage" && request.method === "GET") {
        const usage = ledger.usage(user.id);
        return json({
          ...usage,
          model: provider.modelFor(usage.plan),
          effort: provider.effortFor(usage.plan, provider.effort ?? "none"),
          paymentsAvailable: Boolean(payments?.checkout),
          restoreAvailable: Boolean(payments?.restore),
        });
      }
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
        let document = await inspectDocument(bytes);
        if (
          !config.mimeTypes.includes(document.mime) ||
          !/^[a-z]{3,4}$/.test(document.extension) ||
          !Number.isSafeInteger(document.pages) ||
          document.pages < 1 ||
          document.pages > config.maxPages
        )
          throw new ServiceError("invalid_file");
        // The model reads PNG, JPEG, WEBP, GIF and PDF; HEIC and TIFF become JPEG.
        let source = bytes;
        if (document.mime === "image/heic" || document.mime === "image/tiff") {
          if (!convertDocument) throw new ServiceError("invalid_file");
          source = await convertDocument(bytes);
          document = { ...document, mime: "image/jpeg", extension: "jpg" };
        }
        const id = randomUUID();
        await writeFile(sourcePath(id), source, { mode: 0o600 });
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
        const { quoteId, effort = provider.effort ?? "none" } =
          await request.json();
        const quote = quoteFor(user.id, quoteId);
        // Higher reasoning effort costs NODI more, so it uses more credits per page.
        if (!config.efforts.some((item) => item.id === effort))
          throw new ServiceError("invalid_effort");
        const plan = ledger.usage(user.id).plan;
        // Plans on Handwriting OCR ignore reasoning effort, so they pay one credit per page.
        const chosen = provider.effortFor(plan, effort);
        const level = config.efforts.find((item) => item.id === chosen);
        const existing = ledger.db
          .prepare("SELECT id FROM documents WHERE user_id=? AND quote_id=?")
          .get(user.id, quoteId);
        if (existing) return json({ id: existing.id, status: "pending" }, 202);
        if (quote.expires <= ledger.now())
          throw new ServiceError("quote_expired", 409);
        const { document: doc, fresh } = ledger.reserve(
          user.id,
          quote,
          quote.pages * level.credits,
        );
        if (!fresh) return json({ id: doc.id, status: "pending" }, 202);
        ledger.update(doc.id, "pending");
        running.set(doc.id, transcribe(doc, quote, chosen, plan));
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
  /** Waits for transcriptions in progress (tests and graceful shutdown). */
  const settle = () => Promise.all(running.values());
  return { handle: withCors, cleanup, settle };
}
