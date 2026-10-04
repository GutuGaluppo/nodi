# Handwriting implementation and configuration

Implemented on October 2, 2026, following [the active implementation brief](HANDWRITING_IMPLEMENTATION_EN.md).

The desktop's image-to-note entry now uses the Handwriting workflow. Local image indexing for search still uses Apple Vision. Notes remain canonical Tiptap JSON in the desktop SQLite database; original documents are stored as attachments outside SQLite. The optional server has its own SQLite usage ledger and stores transient files outside that ledger. No deployment, accounts, purchases or provider credentials have been created.

## Availability

The feature deliberately remains unavailable in this checkout. There is no deployed authenticated NODI service, no identity/payment integration, no provider key, and no evidence of written resale permission. The shipped desktop CSP still blocks remote connections. A build variable alone cannot enable transcription. The landing displays the requested prices, explicitly marks the feature unavailable and disables purchases; it does not advertise a registration or checkout flow that does not exist.

Before launch, supply the real identity provider and checkout integrations, deploy the service behind HTTPS, connect verified sign-in to the desktop session, allow only that backend origin in Tauri's `connect-src`, and update the network-policy tests and privacy copy to describe that precise permission. Keep local note use account-free. Review the actual checkout prices, tax handling and product IDs against `landing/plans.json` before enabling purchases.

The provider's [v3 documentation](https://www.handwritingocr.com/api/docs) specifies Bearer authentication and a global account limit of two requests per second. The [upload reference](https://www.handwritingocr.com/api/docs/upload-document) confirms that `delete_after=3600` is valid (allowed range: 300–1,209,600 seconds) and the supported file formats/20 MB limit. The [terms](https://www.handwritingocr.com/terms#acceptable-use) require written consent for resale or redistribution. Approval has not been assumed.

## Server configuration

Run the optional server separately from the distributed app, on Node.js 22.16 or later. Use `server/handwriting/.env.example` as a configuration reference and inject real secrets through the deployment's secret mechanism. There is no new npm dependency. The supplied document inspector uses PDFKit/ImageIO and requires macOS; other server platforms can supply an equivalent validated parser through the adapter port.

Compile the server-only inspector:

```sh
mkdir -p server/handwriting/.build
swiftc server/handwriting/InspectDocument.swift -o server/handwriting/.build/nodi-document-inspector
```

Set `NODI_HANDWRITING_INSPECTOR` to that binary's absolute path. Set `NODI_HANDWRITING_ADAPTER` to a reviewed ESM module exporting the integration functions described below. The optional server can then run with `pnpm handwriting:server`; it binds to loopback port 8787 by default. Production requires an HTTPS reverse proxy. Set the database/storage variables to private, durable directories. Do not use the desktop database as the server ledger.

| Variable | Purpose |
| --- | --- |
| `HANDWRITING_API_KEY` | Provider key, exclusively on the server |
| `HANDWRITING_DELETE_AFTER` | Provider retention request in seconds; defaults to 3600 |
| `HANDWRITING_RESALE_APPROVED` | Must remain `false` until written permission is confirmed |
| `NODI_HANDWRITING_ADAPTER` | Absolute path to verified authentication/payment integrations |
| `NODI_HANDWRITING_INSPECTOR` | Absolute path to the supplied parser binary, when no parser override is exported |
| `NODI_HANDWRITING_DATABASE` | Dedicated durable server SQLite database |
| `NODI_HANDWRITING_STORAGE` | Private transient document/result directory |
| `NODI_HANDWRITING_ALLOWED_ORIGINS` | Exact comma-separated desktop origins; add the exact development origin only for development |
| `VITE_HANDWRITING_BACKEND_URL` | Public HTTPS backend origin in the desktop build, never a provider secret |

CORS denies origins outside that explicit list. Authentication is required for all document, usage and checkout endpoints; payment webhooks instead require their own verified signatures. The server never accepts user IDs, page counts, prices or balances from frontend JSON. Use `setHandwritingSession` only after real sign-in verification, and clear it at sign-out. The session token is kept in memory; an IdP-specific login/refresh UI still needs to be connected once the provider is selected.

## Integration ports

The adapter module must export `authenticate(request)`, returning `{ id: stableVerifiedAccountId }` only after verifying the session's signature, issuer, audience and expiry against the actual identity provider. Return `null` for an invalid session. Do not use email strings, device IDs, arbitrary client-supplied IDs or a shared desktop token as proof of identity. Keeping the same stable identity across restoration prevents a fresh trial page on every launch.

An optional `inspectDocument(bytes)` export can replace the supplied native inspector. It must validate actual content and determine provider-compatible page counts, independently of file extensions and client values. The supplied parser accepts PDF up to 70 pages and single-frame JPEG, PNG, TIFF, HEIC and GIF up to 20 MB and 40 megapixels. Encrypted, malformed and multi-frame documents are refused. Multi-frame image billing must be verified before expanding support. If the provider reports a different page count, the job remains pending for reconciliation; no additional credits are silently charged.

The optional `payments` export has these methods:

- `checkout(userId, product) -> { url }`: use real server-configured product IDs for `essential`, `plus`, `pro`, `pack`, or `manage`. Return only an actual HTTPS checkout/account-management URL in the original purchase channel. Never grant credits here. The desktop opens that address in the default browser through the native `open_handwriting_checkout` command, which refuses anything but a plain HTTPS URL.
- `verifyWebhook(request) -> event | null`: verify the raw body/signature using the selected payment platform, query authoritative payment/subscription details where required, and normalize only confirmed events. Return `null` for an invalid signature.
- `restore(userId) -> events`: query the original purchase channel and return only verified purchases belonging to this authenticated user. Include this method only for platforms that need restoration.

Normalized events contain `id` (the provider's unique event ID), `userId`, and `type`. A `renewal` event also contains `plan`, `entitlementId` (stable billing-cycle entitlement ID), `cycleStart` and `cycleEnd` in epoch milliseconds. Supply events only for the currently effective paid cycle; scheduled plan changes take effect through the next confirmed cycle. A `pack` contains a stable purchase `entitlementId` and authoritative `purchasedAt`. A `refund` contains the affected `entitlementId`. `cancel` stops automatic renewal while keeping paid pages until their original expiry; `expired` revokes monthly access, leaving packs alone. The adapter must resolve out-of-order cancellation/expiry events against the payment platform's current subscription state before normalizing them. The ledger itself ignores older renewal events and duplicate event/entitlement IDs.

The plans are Free (€0, one trial page once), Essential (€4.99/10 monthly pages), Plus (€9.99/30), Pro (€19.99/70), and a €4.99/10-page pack valid for 12 months. The free page is funded by NODI's provider account. It does not call the provider's trial or credit-purchase endpoint. Taxes are determined by the real checkout, not an assumed percentage. There are no annual or unlimited plans.

## Document, credit and privacy policy

Consent precedes the preflight upload to NODI. The server returns a quote valid for 15 minutes. A separate confirmation submits that quote for transcription and atomically reserves credits in SQLite, earliest expiry first. Each quote can create only one document: retries with the same quote resolve to the same job. A new transcription requires a new quote and explicit confirmation.

Provider calls use v3, `action=transcribe`, Bearer authentication, requested deletion after one hour, manual redirects, timeouts, serialized requests and shared SQLite rate-limit slots. Run one provider dispatcher per account; horizontal replicas must use a single dispatcher, not independent SQLite copies. Polling starts after five seconds, backs off to 30 seconds and honors `Retry-After`. No provider webhook is enabled because there is no webhook infrastructure; therefore no unsigned provider callbacks are accepted.

If the upload response is lost, its reservation remains pending. A status consultation locates the uniquely named provider document and never repeats the upload. If it cannot be found, the reservation remains pending until a provider-confirmed outcome is available. Confirmed failures return user credits; any provider charge for the attempt is NODI's cost. Page-count mismatches and unknown outcomes require operator reconciliation with provider evidence. Absence from a list after automatic deletion is not proof that an upload failed. Do not release or resubmit based on that absence.

Unsubmitted files are deleted after the 15-minute quote expiry. Submitted sources are deleted when their text is retrieved, or after one hour from submission. Cached result text is deleted one hour after retrieval. The cleanup timer runs every minute, also on each request and after restart; it must remain running in deployment. Ledger metadata is retained for idempotency, audit and the once-only trial. Configure provider retention within the documented range; the dialogue reads the effective provider value from the server. Approved notes and originals stay locally until the user deletes them. The provider returns Markdown; when a note is created, `#`–`######` headings, `* `/`- ` items, `**bold**` and `*italic*` become Tiptap formatting, and words are never replaced. The review field, the TXT export and the stored search text keep the provider's text exactly. Recovering a job after closing the dialogue can save its text without the original file. No documents, text or credentials are logged.

## Validation

- `pnpm check`: TypeScript, Biome, frontend tests, server tests and landing/config consistency.
- `pnpm build`: production desktop frontend build.
- `PLAYWRIGHT_CHANNEL=chrome pnpm test:e2e`: use the installed Chrome if the Playwright-managed Chromium binary is absent. Includes desktop, 390 px dialog, and translated/responsive landing plans.
- `cargo test --lib`: native storage/migration/OCR checks, including the attachment, TXT export and purchase-address tests. All 65 passed on this Mac.

Server tests cover real PNG/PDF inspection, rejected malformed documents, concurrent reservations/concurrent duplicate uploads, one lifetime trial, monthly resets, pack validity, cancellation, refunds, restart persistence, insufficient credits, uncertain timeouts and reconciliation, redirect refusal, provider throttling, origin restrictions and disabled unconfigured payment flows. Provider calls and payment adapters are mocked in automated tests. Live transcription, real payment confirmations and purchase restoration still require the external integrations listed above.

## Changed files

- Desktop flow: `src/features/imageToText/ImageToTextDialog.tsx`, its tests, `imageToNote.ts`, its tests; removed the old `useImageToNote.ts` local-reading hook.
- Settings/configuration: new `src/features/handwriting/{client,plans,PlanUsage}` modules and tests; `src/app/App.tsx`, `src/components/layout/DesktopShell.tsx`, `src/styles/global.css`.
- Native attachment storage: `src-tauri/src/attachments.rs`, `src-tauri/src/handwriting.rs` (native TXT save dialog, opening the purchase page in the browser), `src-tauri/src/lib.rs`.
- Optional server: `server/handwriting/{ledger,provider,service,start,inspect}.mjs`, `InspectDocument.swift`, tests and `.env.example`.
- Landing/config sync: `landing/index.html`, `landing/plans.json`, `scripts/sync-handwriting-plans.mjs`.
- Validation/setup: `package.json`, `playwright.config.ts`, `e2e/handwriting.spec.ts`, `e2e/baseline.spec.ts` (stopped overwriting a historical screenshot), `.env.example`, `.gitignore`, `README.md`, this guide.
- Permanent history: `docs/ABOUT.md`, `docs/DECISIONS.md`, `src/features/about/About.tsx`, and a new `docs/about/screenshots/ocr-006-handwriting.png`.

Pre-existing changes to Apple OCR, its handwritten fixture, and the OCR-005 history entry were preserved.
