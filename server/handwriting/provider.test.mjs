import assert from "node:assert/strict";
import { test } from "node:test";
import { Ledger } from "./ledger.mjs";
import { INSTRUCTIONS, OpenAITranscriber } from "./provider.mjs";

const completed = (...texts) =>
  Response.json({
    status: "completed",
    output: [
      { type: "reasoning", summary: [] },
      {
        type: "message",
        content: texts.map((text) => ({ type: "output_text", text })),
      },
    ],
    usage: { input_tokens: 1200, output_tokens: 80 },
  });

function transcriber(fetcher, ledger = new Ledger(":memory:", () => 0)) {
  return new OpenAITranscriber({
    key: "server-secret",
    ledger,
    wait: async () => {},
    fetcher,
  });
}

test("sends the image to gpt-5.4 unstored, with verbatim instructions, and returns its exact text", async () => {
  let request;
  const openai = transcriber(async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return completed("# Image Reader\n", "* Grap conpilence");
  });
  const result = await openai.transcribe(
    Buffer.from("png bytes"),
    "image/png",
    "nodi-1.png",
    1,
  );
  assert.equal(result.text, "# Image Reader\n* Grap conpilence");
  assert.deepEqual(result.usage, { input_tokens: 1200, output_tokens: 80 });
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  assert.equal(request.options.headers.Authorization, "Bearer server-secret");
  assert.equal(request.options.redirect, "manual");
  assert.equal(request.body.model, "gpt-5.4");
  assert.equal(request.body.store, false);
  assert.equal(request.body.instructions, INSTRUCTIONS);
  assert.match(INSTRUCTIONS, /Never correct, translate, complete, summarize/);
  // Wrapped lines are joined, meaningful marks are kept, show-through is not.
  assert.match(
    INSTRUCTIONS,
    /only wraps onto the next line .* join it into one line/,
  );
  assert.match(INSTRUCTIONS, /check mark as ✓ .* cross mark as ✗/);
  assert.match(INSTRUCTIONS, /shows through from the back of the page/);
  assert.deepEqual(request.body.input[0].content, [
    {
      type: "input_image",
      image_url: `data:image/png;base64,${Buffer.from("png bytes").toString("base64")}`,
      detail: "high",
    },
  ]);
});

test("sends a PDF as a file and scales the output budget to its pages", async () => {
  let body;
  const openai = transcriber(async (_url, options) => {
    body = JSON.parse(options.body);
    return completed("page one\n\npage two");
  });
  await openai.transcribe(
    Buffer.from("%PDF"),
    "application/pdf",
    "nodi.pdf",
    70,
  );
  assert.equal(body.input[0].content[0].type, "input_file");
  assert.equal(body.input[0].content[0].filename, "nodi.pdf");
  assert.match(
    body.input[0].content[0].file_data,
    /^data:application\/pdf;base64,/,
  );
  assert.equal(body.max_output_tokens, 128000);
});

test("a higher effort raises the reasoning, output budget and timeout per page", async () => {
  const bodies = [];
  const signals = [];
  const openai = transcriber(async (_url, options) => {
    bodies.push(JSON.parse(options.body));
    signals.push(options.signal);
    return completed("text");
  });
  await openai.transcribe(Buffer.from("png"), "image/png", "a.png", 1);
  await openai.transcribe(Buffer.from("png"), "image/png", "a.png", 2, "high");
  await openai.transcribe(
    Buffer.from("png"),
    "image/png",
    "a.png",
    10,
    "xhigh",
  );
  assert.deepEqual(
    bodies.map((body) => [body.reasoning.effort, body.max_output_tokens]),
    [
      ["none", 4000],
      ["high", 40000],
      ["xhigh", 128000],
    ],
  );
  assert.ok(signals.every((signal) => signal instanceof AbortSignal));
  await assert.rejects(
    openai.transcribe(Buffer.from("png"), "image/png", "a.png", 1, "max"),
    { code: "invalid_effort" },
  );
  assert.equal(bodies.length, 3);
});

test("maps provider failures to fixed codes without leaking content", async () => {
  const ledger = new Ledger(":memory:", () => 0);
  const cases = [
    [
      () =>
        new Response(null, {
          status: 307,
          headers: { Location: "https://x.example" },
        }),
      "provider_redirect",
      false,
    ],
    [
      () =>
        Response.json({ error: { code: "invalid_api_key" } }, { status: 401 }),
      "provider_auth",
      false,
    ],
    [
      () =>
        Response.json(
          { error: { code: "credit_balance_exhausted" } },
          { status: 429 },
        ),
      "provider_credits",
      false,
    ],
    [
      () =>
        Response.json(
          { error: { code: "project_spend_limit_exceeded" } },
          { status: 429 },
        ),
      "provider_credits",
      false,
    ],
    [
      () => Response.json({ error: {} }, { status: 500 }),
      "provider_unavailable",
      true,
    ],
    [
      () =>
        Response.json({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
        }),
      "transcription_incomplete",
      false,
    ],
    [
      () =>
        Response.json({
          status: "completed",
          output: [
            { type: "message", content: [{ type: "refusal", refusal: "no" }] },
          ],
        }),
      "transcription_refused",
      false,
    ],
    [
      () => {
        throw new Error("sensitive internal content");
      },
      "provider_timeout",
      false,
    ],
  ];
  for (const [respond, code, retryable] of cases) {
    const openai = transcriber(async () => respond(), ledger);
    await assert.rejects(
      () => openai.transcribe(Buffer.from("x"), "image/png", "n.png", 1),
      (error) =>
        error.code === code &&
        error.retryable === retryable &&
        !error.message.includes("sensitive"),
      code,
    );
  }
  ledger.db.close();
});

test("rate limits are retryable and push back the shared request slot", async () => {
  const ledger = new Ledger(":memory:", () => 0);
  const openai = transcriber(
    async () =>
      Response.json(
        { error: { code: "rate_limit_exceeded" } },
        { status: 429, headers: { "Retry-After": "20" } },
      ),
    ledger,
  );
  await assert.rejects(
    () => openai.transcribe(Buffer.from("x"), "image/png", "n.png", 1),
    (error) =>
      error.code === "rate_limited" &&
      error.retryable &&
      error.retryAfterMs === 20000,
  );
  assert.ok(ledger.providerSlot() >= 20000);
  ledger.db.close();
});

test("requires a server key and a valid model configuration", () => {
  const ledger = new Ledger();
  assert.throws(
    () => new OpenAITranscriber({ ledger }),
    /provider_unconfigured/,
  );
  assert.throws(
    () => new OpenAITranscriber({ key: "k", ledger, model: "../other" }),
    /invalid_model/,
  );
  assert.throws(
    () => new OpenAITranscriber({ key: "k", ledger, effort: "max" }),
    /invalid_model/,
  );
  ledger.db.close();
});
