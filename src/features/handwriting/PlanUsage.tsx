import { useQuery } from "@tanstack/react-query";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import {
  type HandwritingClient,
  handwritingClient,
  handwritingUsageKey,
} from "./client";
import { handwritingPack, handwritingPlans, planPrice } from "./plans";

export default function PlanUsage({
  onClose,
  client = handwritingClient,
}: {
  onClose: () => void;
  client?: HandwritingClient;
}) {
  const usage = useQuery({
    queryKey: handwritingUsageKey,
    queryFn: () => client.usage(),
    enabled: client.available,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: client.available ? 30000 : false,
  });
  const heading = useRef<HTMLHeadingElement>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  // A full-page view: land on its title so keyboard and screen reader users start here.
  useEffect(() => {
    heading.current?.focus();
  }, []);
  // Returning from the original checkout channel refreshes verified entitlements.
  useEffect(() => {
    const refresh = () => {
      if (client.available) void usage.refetch();
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [client.available, usage.refetch]);
  async function action(product: string): Promise<void> {
    setBusy(true);
    setStatus("");
    setCheckoutUrl(null);
    try {
      if (product === "restore") {
        await client.restore();
        await usage.refetch();
        setStatus("Purchases restored after payment verification.");
      } else {
        const { url } = await client.checkout(product);
        if (!/^https:\/\//.test(url)) throw new Error("Checkout unavailable.");
        // The app's webview does not open new windows; the browser does.
        if (isTauri()) {
          await invoke("open_handwriting_checkout", { url });
          setStatus(
            "The purchase page opened in your browser. Your pages update here after payment is confirmed.",
          );
        } else setCheckoutUrl(url);
      }
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not open the purchase flow.",
      );
    } finally {
      setBusy(false);
    }
  }
  const data = usage.data;
  const selected = handwritingPlans.find((plan) => plan.id === data?.plan);
  return (
    <main
      className="about-page plan-usage-page"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="about-header">
        <div>
          <p className="eyebrow">SETTINGS</p>
          <h1 ref={heading} tabIndex={-1}>
            Plan and usage
          </h1>
          <p className="about-intro">
            Pages for handwriting transcription, read by OpenAI or by
            Handwriting OCR, depending on your plan. Your notes stay on your
            Mac.
          </p>
        </div>
        <button type="button" className="text-button" onClick={onClose}>
          Back to NODI
        </button>
      </header>
      {!client.available ? (
        <p className="handwriting-notice" role="status">
          Transcription and purchases are not available yet. You can keep using
          your local notes.
        </p>
      ) : usage.isPending ? (
        <p role="status">Loading plan and usage…</p>
      ) : usage.isError ? (
        <div role="alert">
          <p>{usage.error.message}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => void usage.refetch()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {data ? (
        <dl className="data-report">
          <div className="data-row">
            <dt>Current plan</dt>
            <dd>
              {selected?.name ?? "Unavailable"}
              {data.plan === "free" ? " · No subscription" : ""}
            </dd>
          </div>
          <div className="data-row">
            <dt>Monthly pages remaining</dt>
            <dd>{data.monthlyRemaining}</dd>
          </div>
          <div className="data-row">
            <dt>Trial page remaining</dt>
            <dd>{data.trialRemaining}</dd>
          </div>
          <div className="data-row">
            <dt>Additional pages</dt>
            <dd>
              {data.additional.length
                ? data.additional.map((pack) => (
                    <p key={pack.expiresAt}>
                      {pack.remaining} pages · expires{" "}
                      {new Date(pack.expiresAt).toLocaleDateString()}
                    </p>
                  ))
                : "No additional pages"}
            </dd>
          </div>
          <div className="data-row">
            <dt>Next renewal</dt>
            <dd>
              {data.renewalAt
                ? new Date(data.renewalAt).toLocaleDateString()
                : "No scheduled renewal"}
            </dd>
          </div>
        </dl>
      ) : null}
      <h2>Plans</h2>
      <p>
        One image or page uses one credit with the fastest reading effort and up
        to five with more careful reading. Monthly pages reset on your billing
        date without rollover. Additional pages stay available after
        cancellation until they expire.
      </p>
      <div className="handwriting-plans">
        {handwritingPlans.map((plan) => (
          <article
            key={plan.id}
            className={
              plan.id === "plus"
                ? "handwriting-plan featured"
                : "handwriting-plan"
            }
          >
            <h3>{plan.name}</h3>
            <p className="handwriting-price">
              {planPrice(plan.priceCents)}
              {plan.monthly ? "/month" : ""}
            </p>
            <p>
              {plan.monthly
                ? `${plan.pages} pages per billing cycle`
                : "1 page to try, no subscription required. Once only."}
            </p>
            {plan.monthly ? (
              <button
                type="button"
                className="secondary-button"
                disabled={!data?.paymentsAvailable || busy}
                onClick={() => void action(plan.id)}
              >
                Change plan to {plan.name}
              </button>
            ) : null}
          </article>
        ))}
      </div>
      <p>
        <strong>
          {handwritingPack.name}: {planPrice(handwritingPack.priceCents)}
        </strong>{" "}
        · 10 additional pages, valid for 12 months. Final prices and taxes are
        confirmed at checkout.
      </p>
      <div className="handwriting-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={!data?.paymentsAvailable || busy}
          onClick={() => void action("pack")}
        >
          Buy pages
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={!data?.paymentsAvailable || data.plan === "free" || busy}
          onClick={() => void action("manage")}
        >
          Manage subscription
        </button>
        {data?.restoreAvailable ? (
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void action("restore")}
          >
            Restore purchases
          </button>
        ) : null}
        {checkoutUrl ? (
          <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
            Continue in your purchase channel
          </a>
        ) : null}
      </div>
      <p role="status">{status}</p>
      <p>
        Cancel through the original purchase channel. Transcriptions are read by
        an AI model and can contain mistakes; always review them.
      </p>
    </main>
  );
}
