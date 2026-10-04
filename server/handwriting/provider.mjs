import { setTimeout as sleep } from "node:timers/promises";
import config from "../../landing/plans.json" with { type: "json" };
import { ServiceError } from "./ledger.mjs";

export class ProviderError extends ServiceError {
  constructor(code, status, uncertain = false) {
    super(code, status);
    this.uncertain = uncertain;
  }
}

export class HandwritingProvider {
  constructor({
    key,
    ledger,
    fetcher = fetch,
    wait = sleep,
    retention = config.deleteAfterSeconds,
  }) {
    if (!key) throw new ServiceError("provider_unconfigured", 503);
    if (!Number.isInteger(retention) || retention < 300 || retention > 1209600)
      throw new ServiceError("invalid_retention");
    Object.assign(this, { key, ledger, fetcher, wait, retention });
    this.queue = Promise.resolve();
  }
  request(path, options = {}) {
    const work = this.queue.then(() => this.perform(path, options));
    this.queue = work.catch(() => {});
    return work;
  }
  async perform(path, options = {}) {
    await this.wait(this.ledger.providerSlot());
    let response;
    try {
      response = await this.fetcher(
        `https://api.handwritingocr.com/v3/${path}`,
        {
          ...options,
          headers: {
            Authorization: `Bearer ${this.key}`,
            Accept: "application/json",
          },
          redirect: "manual",
          signal: AbortSignal.timeout(30000),
        },
      );
    } catch {
      throw new ProviderError(
        "provider_timeout",
        504,
        options.method === "POST",
      );
    }
    // Never follow redirects, including those carrying a download address.
    if (response.status >= 300 && response.status < 400)
      throw new ProviderError(
        "provider_redirect",
        502,
        options.method === "POST",
      );
    if (response.status === 429) {
      const value = response.headers.get("Retry-After");
      const seconds = Number(value);
      const delay =
        value && !Number.isFinite(seconds)
          ? Date.parse(value) - Date.now()
          : (seconds || 5) * 1000;
      this.ledger.providerSlot(Math.max(5000, delay || 0));
      const error = new ProviderError("rate_limited", 429);
      error.retryAfterMs = Math.max(5000, delay || 0);
      throw error;
    }
    if (!response.ok) {
      const code =
        {
          400: "invalid_file",
          401: "provider_auth",
          402: "provider_credits",
          403: "provider_unavailable",
          415: "invalid_file",
          422: "invalid_file",
        }[response.status] || "provider_unavailable";
      throw new ProviderError(
        code,
        503,
        options.method === "POST" && response.status >= 500,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new ProviderError(
        "provider_response",
        502,
        options.method === "POST",
      );
    }
  }
  async upload(file, name) {
    const form = new FormData();
    form.append("file", file, name);
    form.append("action", "transcribe");
    form.append("delete_after", String(this.retention));
    const result = await this.request("documents", {
      method: "POST",
      body: form,
    });
    if (typeof result.id !== "string" || !/^[a-zA-Z0-9]+$/.test(result.id))
      throw new ProviderError("provider_response", 502, true);
    return result;
  }
  status(id) {
    if (!/^[a-zA-Z0-9]+$/.test(id)) throw new ServiceError("invalid_document");
    return this.request(`documents/${id}`);
  }
}
