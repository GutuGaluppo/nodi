import { afterEach, describe, expect, it, vi } from "vitest";
import { handwritingClient, validateFile } from "./client";
import { handwritingEfforts, handwritingPack, handwritingPlans } from "./plans";

describe("Handwriting configuration and file validation", () => {
  it("uses the requested plans and no annual or unlimited plans", () => {
    expect(
      handwritingPlans.map((plan) => [plan.id, plan.priceCents, plan.pages]),
    ).toEqual([
      ["free", 0, 1],
      ["essential", 499, 10],
      ["plus", 999, 30],
      ["pro", 1999, 70],
    ]);
    expect(
      handwritingEfforts.map((effort) => [effort.id, effort.credits]),
    ).toEqual([
      ["none", 1],
      ["low", 1],
      ["medium", 2],
      ["high", 3],
      ["xhigh", 5],
    ]);
    expect(handwritingPack).toMatchObject({
      priceCents: 499,
      pages: 10,
      validMonths: 12,
    });
  });
  it("accepts PDF and WEBP, refuses unsupported, empty and oversized documents", () => {
    expect(() =>
      validateFile(new File(["pdf"], "notes.pdf", { type: "application/pdf" })),
    ).not.toThrow();
    expect(() =>
      validateFile(new File(["webp"], "image.webp", { type: "image/webp" })),
    ).not.toThrow();
    expect(() =>
      validateFile(new File(["bmp"], "image.bmp", { type: "image/bmp" })),
    ).toThrow("Arquivo inválido");
    expect(() =>
      validateFile(new File([], "empty.png", { type: "image/png" })),
    ).toThrow();
    expect(() =>
      validateFile(
        new File([new Uint8Array(20000001)], "large.png", {
          type: "image/png",
        }),
      ),
    ).toThrow("20 MB");
  });
  it("never invents a balance or subscription without configuration", async () => {
    expect(handwritingClient.available).toBe(false);
    await expect(handwritingClient.usage()).rejects.toThrow(
      "ainda não está disponível",
    );
    await expect(handwritingClient.checkout("plus")).rejects.toThrow();
  });
});

describe("local development server", () => {
  async function loadClient(dev: boolean, env: Record<string, string>) {
    vi.resetModules();
    vi.stubEnv("DEV", dev);
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    return (await import("./client")).handwritingClient;
  }
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses a loopback server and the developer's token in development", async () => {
    const fetcher = vi.fn(
      async (
        _url: string,
        _options: { body?: unknown; headers: Record<string, string> },
      ) => Response.json({ plan: "free" }),
    );
    vi.stubGlobal("fetch", fetcher);
    const client = await loadClient(true, {
      VITE_HANDWRITING_BACKEND_URL: "http://127.0.0.1:8787",
      VITE_HANDWRITING_DEV_TOKEN: "local-token",
    });
    expect(client.available).toBe(true);
    await client.usage();
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8787/v1/handwriting/usage");
    expect(options.headers.Authorization).toBe("Bearer local-token");
    await client.submit("quote-1", "high");
    expect(JSON.parse(String(fetcher.mock.calls[1][1].body))).toEqual({
      quoteId: "quote-1",
      effort: "high",
    });
  });

  it("refuses plain HTTP and the developer's token outside development", async () => {
    const client = await loadClient(false, {
      VITE_HANDWRITING_BACKEND_URL: "http://127.0.0.1:8787",
      VITE_HANDWRITING_DEV_TOKEN: "local-token",
    });
    expect(client.available).toBe(false);
  });

  it("refuses plain HTTP to another machine even in development", async () => {
    const client = await loadClient(true, {
      VITE_HANDWRITING_BACKEND_URL: "http://nodi.example:8787",
    });
    expect(client.available).toBe(false);
  });
});
