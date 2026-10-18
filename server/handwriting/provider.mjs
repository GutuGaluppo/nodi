import { setTimeout as sleep } from "node:timers/promises";
import { ServiceError } from "./ledger.mjs";

export class ProviderError extends ServiceError {
  constructor(code, status, retryable = false) {
    super(code, status);
    this.retryable = retryable;
  }
}

/** Verbatim transcription: never correct, translate, complete or summarize. */
export const INSTRUCTIONS = `You transcribe handwritten and printed documents for a note-taking app.
Output only the transcription of the attached document, in the language it is written in.
Copy every word exactly as written, including spelling mistakes, abbreviations and punctuation. Never correct, translate, complete, summarize, explain or add words.
Keep the reading order. Start a new line for each separate line of content, list item or paragraph. When a sentence or list item only wraps onto the next line because it ran out of space, join it into one line.
Use Markdown only to mirror the document's own structure: "# " for a title, "* " for a bulleted item (whatever its handwritten marker: dot, dash or arrow), "1. " for a numbered item, **bold** for clearly emphasized words.
Transcribe marks that carry meaning: a check mark as ✓ and a cross mark as ✗, placed at the end of the item they mark; an arrow inside a line as →.
Ignore text that shows through from the back of the page, and stray lines or doodles.
Write [?] in place of a word you cannot read.
Separate pages with a blank line.
If the document contains no text, output nothing.`;

const MODELS = /^gpt-[a-z0-9.-]+$/;
const EFFORTS = ["none", "low", "medium", "high", "xhigh"];
// Reasoning tokens count toward max_output_tokens and take time, so a
// higher effort needs a larger budget and a longer wait per page.
const BUDGET = { none: 1, low: 2, medium: 3, high: 5, xhigh: 8 };

/**
 * OpenAI Responses API. The answer arrives in the same call and nothing is
 * stored as a response (`store: false`), so a lost answer cannot be fetched
 * again: callers treat every failure as confirmed and return user credits.
 */
export class OpenAITranscriber {
  constructor({
    key,
    ledger,
    model = "gpt-5.4",
    effort = "none",
    fetcher = fetch,
    wait = sleep,
  }) {
    if (!key) throw new ServiceError("provider_unconfigured", 503);
    if (!MODELS.test(model) || !EFFORTS.includes(effort))
      throw new ServiceError("invalid_model");
    Object.assign(this, { key, ledger, model, effort, fetcher, wait });
  }
  async transcribe(bytes, mime, name, pages, effort = this.effort) {
    if (!EFFORTS.includes(effort)) throw new ServiceError("invalid_effort");
    const budget = BUDGET[effort];
    const data = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
    const content =
      mime === "application/pdf"
        ? {
            type: "input_file",
            filename: name,
            file_data: data,
            detail: "high",
          }
        : { type: "input_image", image_url: data, detail: "high" };
    const body = {
      model: this.model,
      instructions: INSTRUCTIONS,
      input: [{ role: "user", content: [content] }],
      store: false,
      reasoning: { effort },
      max_output_tokens: Math.min(128000, pages * 4000 * budget),
    };
    await this.wait(this.ledger.providerSlot());
    let response;
    try {
      response = await this.fetcher("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        redirect: "manual",
        // Long documents take minutes; the answer cannot be fetched later.
        signal: AbortSignal.timeout(
          Math.min(600000, 60000 + pages * 10000 * budget),
        ),
      });
    } catch {
      throw new ProviderError("provider_timeout", 504);
    }
    if (response.status >= 300 && response.status < 400)
      throw new ProviderError("provider_redirect", 502);
    const result = await response.json().catch(() => null);
    if (response.status === 429 || response.status === 503) {
      const code = result?.error?.code;
      // Exhausted prepaid credits or spend limits are not solved by waiting.
      if (
        code === "credit_balance_exhausted" ||
        code === "insufficient_quota" ||
        /spend_limit|usage_limit/.test(code ?? "")
      )
        throw new ProviderError("provider_credits", 503);
      const seconds = Number(response.headers.get("Retry-After"));
      const delay = Math.max(
        5000,
        (Number.isFinite(seconds) ? seconds : 5) * 1000,
      );
      this.ledger.providerSlot(delay);
      const error = new ProviderError("rate_limited", 429, true);
      error.retryAfterMs = delay;
      throw error;
    }
    if (!response.ok)
      throw new ProviderError(
        {
          400: "invalid_file",
          401: "provider_auth",
          403: "provider_unavailable",
        }[response.status] || "provider_unavailable",
        503,
        response.status >= 500,
      );
    if (result?.status !== "completed")
      throw new ProviderError(
        result?.incomplete_details?.reason === "max_output_tokens"
          ? "transcription_incomplete"
          : "transcription_failed",
        502,
      );
    const parts = (result.output ?? [])
      .filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? []);
    if (parts.some((part) => part.type === "refusal"))
      throw new ProviderError("transcription_refused", 502);
    const texts = parts.filter((part) => part.type === "output_text");
    if (texts.some((part) => typeof part.text !== "string"))
      throw new ProviderError("provider_response", 502);
    return {
      text: texts.map((part) => part.text).join(""),
      usage: result.usage ?? null,
    };
  }
}

const HANDWRITING_API = "https://api.handwritingocr.com/v3";

/**
 * Handwriting OCR API v3. Upload, poll until processed, then delete the
 * document at the provider. Only the upload is retried on its own: once it has
 * been accepted, a retry would be a second charge for the same pages.
 */
export class HandwritingTranscriber {
  constructor({
    key,
    ledger,
    retention = 3600,
    fetcher = fetch,
    wait = sleep,
    pollMs = 3000,
  }) {
    if (!key) throw new ServiceError("provider_unconfigured", 503);
    if (!Number.isInteger(retention) || retention < 300 || retention > 1209600)
      throw new ServiceError("invalid_retention");
    Object.assign(this, { key, ledger, retention, fetcher, wait, pollMs });
  }
  get model() {
    return "handwriting-ocr";
  }
  // Reasoning effort does not apply: every page costs one credit.
  get effort() {
    return "none";
  }
  async request(method, path, body) {
    await this.wait(this.ledger.providerSlot());
    let response;
    try {
      response = await this.fetcher(`${HANDWRITING_API}/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          Accept: "application/json",
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new ProviderError("provider_timeout", 504, method === "POST");
    }
    if (response.status >= 300 && response.status < 400)
      throw new ProviderError("provider_redirect", 502, method === "POST");
    if (response.status === 429) {
      const seconds = Number(response.headers.get("Retry-After"));
      const delay = Math.max(
        5000,
        (Number.isFinite(seconds) ? seconds : 5) * 1000,
      );
      this.ledger.providerSlot(delay);
      const error = new ProviderError("rate_limited", 429, true);
      error.retryAfterMs = delay;
      throw error;
    }
    // Still processing.
    if (response.status === 202) return null;
    if (response.status === 204) return null;
    if (!response.ok)
      throw new ProviderError(
        {
          400: "invalid_file",
          401: "provider_auth",
          402: "provider_credits",
          403: "provider_unavailable",
          415: "invalid_file",
          422: "invalid_file",
        }[response.status] || "provider_unavailable",
        503,
        response.status >= 500 && method === "POST",
      );
    return response.json().catch(() => {
      throw new ProviderError("provider_response", 502);
    });
  }
  async transcribe(bytes, mime, name, pages) {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), name);
    form.append("action", "transcribe");
    form.append("delete_after", String(this.retention));
    const upload = await this.request("POST", "documents", form);
    if (typeof upload?.id !== "string" || !/^[a-zA-Z0-9]+$/.test(upload.id))
      throw new ProviderError("provider_response", 502);
    const id = upload.id;
    const deadline = Date.now() + Math.min(600000, 120000 + pages * 30000);
    for (;;) {
      if (Date.now() > deadline)
        throw new ProviderError("provider_timeout", 504);
      let document = null;
      try {
        document = await this.request("GET", `documents/${id}`);
      } catch (error) {
        if (error.code !== "rate_limited") throw error;
        await this.wait(error.retryAfterMs);
        continue;
      }
      if (document?.status === "failed")
        throw new ProviderError("transcription_failed", 502);
      if (document?.status === "processed") {
        if (!Array.isArray(document.results))
          throw new ProviderError("provider_response", 502);
        const text = [...document.results]
          .sort((a, b) => a.page_number - b.page_number)
          .map((page) => page.transcript)
          .join("\n\n");
        // The text is kept by NODI; the provider's copy is removed now.
        await this.request("DELETE", `documents/${id}`).catch(() => {});
        return { text, usage: null };
      }
      await this.wait(this.pollMs);
    }
  }
}

/**
 * Chooses the transcriber by the account's plan (`transcribers` in
 * landing/plans.json). Plans without a route use OpenAI.
 */
export class TranscriptionRouter {
  constructor({ routes, transcribers }) {
    Object.assign(this, { routes, transcribers });
  }
  pick(plan) {
    const name = this.routes[plan] ?? "openai";
    const transcriber = this.transcribers[name];
    if (!transcriber) throw new ServiceError("provider_unconfigured", 503);
    return transcriber;
  }
  modelFor(plan) {
    return this.pick(plan).model;
  }
  effortFor(plan, effort) {
    return this.routes[plan] === "handwriting" ? "none" : effort;
  }
  get effort() {
    return this.transcribers.openai?.effort ?? "none";
  }
  transcribe(bytes, mime, name, pages, effort, plan) {
    return this.pick(plan).transcribe(bytes, mime, name, pages, effort);
  }
}
