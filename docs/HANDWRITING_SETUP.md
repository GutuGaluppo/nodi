# Handwriting transcription — implementation and configuration

Branch `test/gpt-5.4-transcription`, October 4, 2026. Follows [the implementation brief](HANDWRITING_IMPLEMENTATION_EN.md), with OpenAI's `gpt-5.4` replacing Handwriting OCR as the transcription provider. The Handwriting OCR version is commit `c144ba1`.

The desktop's image-to-note entry sends an image or PDF, with consent, to the optional NODI server, which transcribes it with `gpt-5.4` and returns the text for review. Local image indexing for search still uses Apple Vision. Notes remain canonical Tiptap JSON in the desktop SQLite database; original documents are stored as attachments outside SQLite. The optional server has its own SQLite usage ledger and stores transient files outside it. No deployment, accounts, purchases or production credentials have been created.

## What depends on you

Nothing below can be done from the codebase. Until the first three items exist, the feature stays unavailable, as the app and landing say.

1. **An OpenAI API key** for a NODI project on platform.openai.com, with prepaid credits or billing, added as `OPENAI_API_KEY` in `server/handwriting/.env` (local testing) and in the production secret store. The current `.env` only has the Handwriting OCR key. Set a monthly spend limit on that project: when it is reached, transcriptions fail and pages are refunded, but nothing is charged twice.
2. **A deployed HTTPS server and real sign-in.** Choose the identity provider (for example Sign in with Apple, Clerk or Auth0) and hosting. The server needs a verified `authenticate(request)` adapter; the desktop needs the sign-in UI and its backend origin in Tauri's `connect-src`.
3. **A payment platform** (Stripe, Paddle, Mac App Store…) with real product IDs for Essential, Plus, Pro and the pack, its webhook secret, and the actual prices and taxes checked against `landing/plans.json`.
4. **Data protection decisions.** OpenAI keeps abuse-monitoring logs of API requests for up to 30 days and does not train on API data. If documents must not be retained, or if processing must stay in Europe (data residency), apply to OpenAI for Zero Data Retention or Modified Abuse Monitoring; both require OpenAI's approval. Then review the privacy text in the app and landing, and sign OpenAI's Data Processing Addendum if you serve EU users.
5. **A launch decision.** `TRANSCRIPTION_LAUNCH_APPROVED` replaces the Handwriting resale flag. OpenAI's business terms allow building products on the API, so no resale permission is needed, but set the flag only after items 1–4 and a review of OpenAI's usage policies.
6. **Quality acceptance.** Transcribe a set of your real documents (handwritten notes, receipts, multi-page PDFs) and decide whether `gpt-5.4` is good enough, and with which `OPENAI_REASONING_EFFORT`. An AI model can misread, skip or invent words; the review screen and the `[?]` marker help, but cannot guarantee exact text.
7. **Pricing check against real usage.** OpenAI charges per token, not per page. The estimate below must be confirmed on the OpenAI usage dashboard after the quality test.
8. **What to do with Handwriting OCR.** Keep, cancel or delete the Handwriting OCR key and account, and decide whether this branch replaces it on `master`.

## Known gaps before launch

- The privacy text in the app (`ImageToTextDialog.tsx`, `PlanUsage.tsx`) and on the landing page (`landing/index.html`, four languages) names only OpenAI. The Pro plan sends documents to Handwriting OCR, so the wording and the data-retention promises must be reviewed for that provider too.
- Login, purchases, Pro entitlements and the Tauri updater need the external accounts listed above; see `CHECKLIST_LANCAMENTO.md`.

## Provider behaviour

Verified on October 4, 2026 in OpenAI's documentation:

- [gpt-5.4](https://developers.openai.com/api/docs/models/gpt-5.4): snapshot `gpt-5.4-2026-03-05`, text and image input, 128,000 output tokens, reasoning effort `none` (default) to `xhigh`; US$2.50 per million input tokens and US$15 per million output tokens. Tier 1 allows 500 requests and 500,000 tokens per minute.
- [Images](https://developers.openai.com/api/docs/guides/images-vision): PNG, JPEG, WEBP and non-animated GIF. TIFF and HEIC are not accepted, so the server re-encodes them as JPEG first. With `detail: "high"`, gpt-5.4 uses up to 2,500 image patches (2,048 px maximum side).
- [PDF](https://developers.openai.com/api/docs/guides/pdf-files): up to 50 MB; the API sends both the extracted text and an image of each page to the model.
- [Data controls](https://developers.openai.com/api/docs/guides/your-data): API data is not used for training by default; abuse-monitoring logs are kept for up to 30 days; `store: false` keeps no response for later retrieval.
- [Errors](https://developers.openai.com/api/docs/guides/error-codes): 401 bad key, 429 rate limit or exhausted credits/spend limits, 503 overload.

The server calls `POST https://api.openai.com/v1/responses` with Bearer authentication, `store: false`, `detail: "high"`, `redirect: "manual"` and a timeout of 60 s plus 5 s per page (at most 10 minutes). Instructions ask for a verbatim transcription in the document's language: no corrections, translations, completions or summaries; line breaks kept; Markdown only for the document's own titles, lists and emphasis; `[?]` for an unreadable word. The output budget is 4,000 tokens per page, up to 128,000.

**Estimated cost per page** (to be confirmed): a high-detail page image is at most about 3,000 input tokens and a handwritten page about 300–600 output tokens, roughly US$0.01–0.02 per page with `none` effort. Higher reasoning effort adds output tokens (reasoning tokens count toward `max_output_tokens`), so the user pays more credits per page for it and the server raises the output budget and timeout per page. On the Essential plan (€4.99, 10 pages) that is about US$0.10–0.20 of provider cost.

## Server configuration

Run the optional server separately from the distributed app, on Node.js 22.16 or later. There is no new npm dependency: the server calls the API with `fetch`. The supplied document inspector uses PDFKit/ImageIO and requires macOS; other platforms can supply `inspectDocument` and `convertDocument` through the adapter.

```sh
mkdir -p server/handwriting/.build
swiftc server/handwriting/InspectDocument.swift -o server/handwriting/.build/nodi-document-inspector
```

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | OpenAI key, exclusively on the server |
| `OPENAI_MODEL` | Defaults to `gpt-5.4` |
| `OPENAI_REASONING_EFFORT` | Effort preselected in the app: `none` (default), `low`, `medium`, `high` or `xhigh`. The user chooses per transcription; credits per page come from `efforts` in `landing/plans.json` (1, 1, 2, 3, 5) |
| `TRANSCRIPTION_LAUNCH_APPROVED` | Must remain `false` until the launch decision above |
| `HANDWRITING_API_KEY` | Handwriting OCR key (pay as you go or subscription), server only. Enables the `handwriting` route |
| `HANDWRITING_DELETE_AFTER` | Seconds the provider keeps its copy (300 to 1209600); the server deletes it right after reading the result |
| `HANDWRITING_RESALE_APPROVED` | Set to `true` only after Handwriting OCR gives written resale permission. While `HANDWRITING_API_KEY` is set and this is `false`, the whole transcription service stays unavailable |

Which provider serves each plan is set by `transcribers` in `landing/plans.json`: `pro` uses `handwriting`, the other plans use `openai`. Handwriting plans ignore reasoning effort and charge one credit per page.
| `NODI_HANDWRITING_ADAPTER` | Absolute path to verified authentication/payment integrations |
| `NODI_HANDWRITING_INSPECTOR` | Absolute path to the inspector binary (also converts HEIC/TIFF) |
| `NODI_HANDWRITING_DATABASE` | Dedicated durable server SQLite database |
| `NODI_HANDWRITING_STORAGE` | Private transient document/result directory |
| `NODI_HANDWRITING_ALLOWED_ORIGINS` | Exact comma-separated desktop origins |
| `VITE_HANDWRITING_BACKEND_URL` | Public HTTPS backend origin in the desktop build, never a secret |

Production requires an HTTPS reverse proxy. CORS denies origins outside the list. Authentication is required for all document, usage and checkout endpoints; payment webhooks require their own verified signatures. The server never accepts user IDs, page counts, prices or balances from frontend JSON.

For local testing only, a development build (`import.meta.env.DEV`) accepts a loopback `http://127.0.0.1` backend and a token from `VITE_HANDWRITING_DEV_TOKEN`; production builds strip that path.

## Integration ports

The adapter module must export `authenticate(request)`, returning `{ id: stableVerifiedAccountId }` only after verifying the session's signature, issuer, audience and expiry against the identity provider, or `null`. Do not use emails, device IDs, client-supplied IDs or a shared desktop token as proof of identity.

Optional `inspectDocument(bytes)` and `convertDocument(bytes)` exports replace the native inspector. The supplied one accepts PDF up to 70 pages and single-frame JPEG, PNG, WEBP, GIF, HEIC and TIFF up to 20 MB and 40 megapixels, and re-encodes HEIC/TIFF as JPEG with their orientation. Encrypted, malformed and multi-frame documents are refused. Page counts come from this inspector, never from the client or the model.

The optional `payments` export (`checkout`, `verifyWebhook`, `restore`) and its normalized events are unchanged from the Handwriting OCR version: see commit `c144ba1`'s guide. The plans are Free (€0, one trial page once), Essential (€4.99/10 monthly pages), Plus (€9.99/30), Pro (€19.99/70) and a €4.99/10-page pack valid for 12 months, from `landing/plans.json`. There are no annual or unlimited plans.

## Document, credit and privacy policy

Consent precedes the preflight upload to NODI. The server returns a quote valid for 15 minutes. A separate confirmation atomically reserves credits, earliest expiry first; each quote can create only one document, so retries resolve to the same job.

The transcription then runs inside the server. The model's answer arrives only on its own call and nothing is stored at OpenAI for retrieval, so there are no unknown outcomes to reconcile: a document either gets its text or fails. Rate limits and overloads are retried up to three times, honouring `Retry-After`. Any other failure — invalid key, exhausted OpenAI credits, timeout, refusal, an answer cut short by the output limit, or a server restart while the job was running — is a confirmed failure: the user's pages are returned, and any OpenAI charge for the attempt is NODI's cost. Run one server process per ledger.

Unsubmitted files are deleted after 15 minutes. Submitted sources are deleted as soon as the transcription ends. Result text is deleted one hour after it was produced. Ledger metadata is kept for idempotency, audit and the once-only trial. At OpenAI, requests are not stored as responses but may stay in abuse-monitoring logs for up to 30 days unless Zero Data Retention is approved. Approved notes and originals stay on the Mac. When a note is created, Markdown headings, lists and emphasis become Tiptap formatting; the review field, TXT export and stored search text keep the model's text exactly. No documents, text or credentials are logged.

## Validation

- `pnpm check`: TypeScript, Biome, 391 frontend tests, 19 server tests, landing/config consistency.
- `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`: 7 passed, including the 390 px dialog and translated landing.
- `cargo test --lib`: 65 passed. `ocr::tests::points_out_misread_words_with_suggestions` (Apple's spell checker, unchanged here) failed once and then passed in three full runs.

Server tests cover the exact Responses API request (model, `store: false`, verbatim instructions, image/PDF inputs, output budget), error mapping without leaking content, retried rate limits, refunds on failure and after a restart, HEIC/TIFF conversion, concurrent duplicate submissions, one lifetime trial and origin restrictions. The native inspector test converts real HEIC and TIFF files. OpenAI calls are mocked: **no live gpt-5.4 transcription has been run yet**, because no OpenAI key is configured (item 1).

## Changed files

- Server: `server/handwriting/provider.mjs` (OpenAI transcriber), `service.mjs` (in-process jobs, refunds, conversion), `inspect.mjs` and `InspectDocument.swift` (WEBP, HEIC/TIFF → JPEG), `start.mjs`, `.env.example`, tests.
- Desktop: `src/features/handwriting/client.ts`, `PlanUsage.tsx`, `src/features/imageToText/ImageToTextDialog.tsx`, their tests; `src-tauri/src/attachments.rs` (WEBP originals).
- Landing/config: `landing/index.html` (four languages), `landing/plans.json`.
- Setup and history: `.env.example`, `README.md`, `e2e/handwriting.spec.ts`, this guide, `docs/DECISIONS.md`, `docs/ABOUT.md`, `src/features/about/About.tsx`, `src/app/App.test.tsx`, a new `docs/about/screenshots/ocr-007-gpt-transcription.png`.
