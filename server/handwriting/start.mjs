import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import config from "../../landing/plans.json" with { type: "json" };
import { createConverter, createInspector } from "./inspect.mjs";
import { Ledger } from "./ledger.mjs";
import {
  HandwritingTranscriber,
  OpenAITranscriber,
  TranscriptionRouter,
} from "./provider.mjs";
import { createService } from "./service.mjs";

// Deployment supplies reviewed integrations; no demo accounts or fake payments.
if (!process.env.NODI_HANDWRITING_ADAPTER)
  throw new Error(
    "Configure NODI_HANDWRITING_ADAPTER with authentication and document inspection adapters.",
  );
const adapters = await import(
  pathToFileURL(resolve(process.env.NODI_HANDWRITING_ADAPTER)).href
);
const ledger = new Ledger(
  process.env.NODI_HANDWRITING_DATABASE || "handwriting.sqlite",
);
const transcribers = {};
if (process.env.OPENAI_API_KEY)
  transcribers.openai = new OpenAITranscriber({
    key: process.env.OPENAI_API_KEY,
    ledger,
    model: process.env.OPENAI_MODEL || "gpt-5.4",
    effort: process.env.OPENAI_REASONING_EFFORT || "none",
  });
if (process.env.HANDWRITING_API_KEY)
  transcribers.handwriting = new HandwritingTranscriber({
    key: process.env.HANDWRITING_API_KEY,
    ledger,
    retention: Number(process.env.HANDWRITING_DELETE_AFTER || 3600),
  });
const provider = Object.keys(transcribers).length
  ? new TranscriptionRouter({ routes: config.transcribers, transcribers })
  : null;
const service = createService({
  ledger,
  provider,
  storage: process.env.NODI_HANDWRITING_STORAGE || "handwriting-files",
  ...adapters,
  inspectDocument:
    adapters.inspectDocument ||
    (process.env.NODI_HANDWRITING_INSPECTOR
      ? createInspector(process.env.NODI_HANDWRITING_INSPECTOR)
      : null),
  convertDocument:
    adapters.convertDocument ||
    (process.env.NODI_HANDWRITING_INSPECTOR
      ? createConverter(process.env.NODI_HANDWRITING_INSPECTOR)
      : null),
  allowedOrigins: (process.env.NODI_HANDWRITING_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  // Handwriting OCR needs written resale permission before it serves customers.
  commercialAgreement:
    process.env.TRANSCRIPTION_LAUNCH_APPROVED === "true" &&
    (!transcribers.handwriting ||
      process.env.HANDWRITING_RESALE_APPROVED === "true"),
});
const cleanup = setInterval(
  () => void service.cleanup().catch(() => {}),
  60000,
);
cleanup.unref();
createServer(async (incoming, outgoing) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 20000000) {
        outgoing.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const request = new Request(`http://localhost${incoming.url}`, {
      method: incoming.method,
      headers: incoming.headers,
      body: ["GET", "HEAD"].includes(incoming.method)
        ? undefined
        : Buffer.concat(chunks),
    });
    const response = await service.handle(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(503).end();
  }
}).listen(Number(process.env.PORT || 8787), "127.0.0.1");
