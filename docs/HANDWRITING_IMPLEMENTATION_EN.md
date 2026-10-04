# Handwriting OCR and Freemium Plans — Implementation Prompt

Implement Handwriting OCR integration and freemium plans in this application. Add a complete pricing section to the landing page and a condensed version in Settings.

## 1. Review the project and preserve its design

Before editing, examine the existing structure, stack, authentication, backend, payments, and components.

Follow the current design: typography, colors, spacing, icons, borders, shadows, animations, responsiveness, and wording. Reuse existing components and project patterns. Do not redesign the application or add unnecessary dependencies.

Identify the current import, transcription, landing page, and Settings screens to integrate the workflow.

## 2. Integrate Handwriting OCR

Consult the current official documentation:
https://www.handwritingocr.com/api/docs

Implement the actual workflow:

1. Select an image or PDF.
2. Validate the format, size, and number of pages.
3. Show how many credits will be consumed before submitting.
4. Check and reserve the available credits.
5. Submit the document for transcription.
6. Track processing progress.
7. Display the returned text, allowing users to copy, edit, and export it.

Use API v3, Bearer authentication, and `action=transcribe`. Request automatic document deletion with `delete_after=3600`, confirming this parameter in the documentation.

Keep the provider API key exclusively on the server, using an environment variable or a secrets mechanism. Do not include it in the frontend, distributed application, repository, or logs. App users should not need to provide their own key.

For desktop or mobile applications, use an authenticated backend to access the provider. Do not embed a shared key in the application binary.

Respect the provider's global limit of 2 requests per second per account. Prefer webhooks with signature validation when suitable infrastructure is available; otherwise, use polling with appropriate intervals, backoff, and respect for `Retry-After`.

In Cloudflare Workers, use `redirect: "manual"` and handle redirect responses explicitly. Never forward the key to another address.

Handle invalid files, file size limits, insufficient credits, invalid authentication, service unavailability, timeouts, rate limits, and processing failures. Do not replace words or automatically “correct” the transcribed text.

## 3. Configure the plans

Create a central configuration shared by the landing page, Settings, and backend:

| Plan | Price | Allowance |
| --- | --- | --- |
| Free | €0 | 1 trial page, once only |
| Essential | €4.99/month | 10 pages per monthly billing cycle |
| Plus | €9.99/month | 30 pages per monthly billing cycle |
| Pro | €19.99/month | 70 pages per monthly billing cycle |
| One-time pack | €4.99 | 10 additional pages, valid for 12 months |

Rules:

- One page or image equals one credit, according to the page count accepted by the provider.
- The free page is funded by the application; it does not depend on the provider's trial offer.
- The monthly allowance resets on the billing cycle date, with no rollover.
- Purchased additional credits remain separate from the monthly allowance and stay available after subscription cancellation until they expire.
- Consume the credits with the earliest expiration first.
- Do not offer unlimited transcriptions.
- Do not create annual plans in this implementation.
- Prices and taxes must follow the actual checkout configuration. Do not use the hypothetical 20% tax from the financial simulation.

## 4. Manage credits and payments

Enforce permissions and balances on the server. Do not trust values submitted by the client.

Implement a usage ledger recording the user, document, page count, credit source, status, and timestamps. Use atomic reservations and idempotency to prevent negative balances, duplicate charges, and accidental resubmissions.

Checking or downloading an existing result must not consume additional credits. Reprocessing a document must require confirmation of the new credit consumption.

When a timeout leaves the outcome unknown, keep the document pending and reconcile its status before releasing credits or resubmitting. Define a clear policy for confirmed failures, distinguishing the user's credit balance from charges incurred with the provider.

Reuse the existing payment integration. Validate subscriptions and purchases on the server; update access entitlements only after verifiable payment confirmation. Handle renewal, cancellation, expiration, refunds, and purchase restoration where applicable.

If a payment provider or credentials are missing, implement the structure and report the blocker. Do not simulate successful purchases or enable paid benefits without confirmed payment.

## 5. Landing page

Add a “Plans” section with the four plans and the one-time pack. Follow the existing style and subtly highlight Plus.

Explain:

- Free: “1 page to try, no subscription required.”
- Monthly page allowances.
- Renewal without rollover.
- Availability of additional credits.
- Cancellation through the original purchase channel.

Present only features that are actually available in each plan. Do not advertise exports, batch uploads, or advanced organization features that do not yet work. Do not promise 100% accuracy.

Buttons must lead to the actual registration, subscription, or purchase flow, preserving the existing navigation.

## 6. Settings

Add “Plan and usage,” showing:

- Current plan.
- Pages remaining in the monthly allowance.
- Additional credit balance and expiration.
- Next renewal date, where applicable.
- A compact plan summary.
- “Change plan,” “Buy pages,” and “Manage subscription” actions.
- “Restore purchases,” if required by the platform.

Update balances after each transcription and payment confirmation. Include loading, error, and no-subscription states.

## 7. Privacy and launch

Before submission, inform users that the document will be processed by Handwriting OCR. Do not log files, transcriptions, or secrets.

Allow retention to be configured and explain the policies actually applied by the application and the provider.

Handwriting OCR's terms require written consent to resell or redistribute the service. Prepare the implementation, but make commercial launch conditional on confirmation of that agreement. Do not present authorization as already obtained.

## 8. Validation and delivery

Verify transcription, recovery after timeouts, insufficient credits, concurrent credit consumption, renewal, one-time purchases, and cancellation. Test the interface on desktop and mobile, and confirm that images do not cover controls.

When finished, report:

- What was implemented.
- How to configure secrets and payments.
- Which tests passed.
- Which external dependencies still prevent launch.
- Which files were changed.

Complete all work that can be performed in the project. Do not stop at an implementation plan.
