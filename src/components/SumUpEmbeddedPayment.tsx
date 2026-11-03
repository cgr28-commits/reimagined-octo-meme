"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Embedded SumUp card form (SumUp Payment Widget) for an existing checkout.
 *
 * Preview only: shown when embedded payments are switched on for this browser
 * (see embeddedPaymentPreviewEnabled). The hosted SumUp page stays available as a
 * fallback link. Card details go straight to SumUp; the booking is confirmed by the
 * same /booking-confirmed/ return flow, which checks the checkout status server-side.
 */
type SumUpCardApi = {
  mount: (options: Record<string, unknown>) => { unmount: () => void } | undefined;
};

declare global {
  interface Window {
    SumUpCard?: SumUpCardApi;
  }
}

const SDK_SRC = "https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js";
const PREVIEW_KEY = "matni-embedded-pay";

/** On with ?embeddedPay=1 (remembered in this browser), off with ?embeddedPay=0. */
export function embeddedPaymentPreviewEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const param = new URLSearchParams(window.location.search).get("embeddedPay");
    if (param === "1") window.localStorage.setItem(PREVIEW_KEY, "1");
    if (param === "0") window.localStorage.removeItem(PREVIEW_KEY);
    return window.localStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

function loadSdk(): Promise<SumUpCardApi> {
  if (window.SumUpCard) return Promise.resolve(window.SumUpCard);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    const script = existing ?? document.createElement("script");
    const done = () => (window.SumUpCard ? resolve(window.SumUpCard) : reject(new Error("SumUp did not load")));
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => reject(new Error("SumUp did not load")), { once: true });
    if (!existing) {
      script.src = SDK_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

export default function SumUpEmbeddedPayment({
  checkoutId,
  amountLabel,
  hostedPaymentUrl,
  onPaid,
  onClose,
}: {
  checkoutId: string;
  amountLabel: string;
  hostedPaymentUrl: string;
  /** Payment form reported success: go to the confirmation page, which verifies it. */
  onPaid: () => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "processing" | "error">("loading");
  const [message, setMessage] = useState("");
  const paidRef = useRef(false);
  const onPaidRef = useRef(onPaid);
  onPaidRef.current = onPaid;

  useEffect(() => {
    let widget: { unmount: () => void } | undefined;
    let cancelled = false;
    loadSdk()
      .then((sdk) => {
        if (cancelled) return;
        widget = sdk.mount({
          id: "sumup-card",
          checkoutId,
          locale: "en-GB",
          country: "GB",
          currency: "GBP",
          amount: amountLabel.replace(/[^0-9.]/g, "") || undefined,
          onLoad: () => setStatus("ready"),
          onResponse: (type: string, body: { message?: string } | undefined) => {
            if (type === "sent" || type === "auth-screen") {
              setStatus("processing");
              setMessage("");
            } else if (type === "success") {
              if (paidRef.current) return;
              paidRef.current = true;
              onPaidRef.current();
            } else if (type === "fail") {
              setStatus("ready");
              setMessage("The payment didn't go through. You haven't been charged. Please try again or use another card.");
            } else if (type === "error") {
              setStatus("ready");
              setMessage(body?.message ? String(body.message) : "Something went wrong with the payment. Please try again.");
            } else if (type === "invalid") {
              setStatus("ready");
            }
          },
        });
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setMessage("The card form couldn't load. Use SumUp's secure payment page instead.");
      });
    return () => {
      cancelled = true;
      try {
        widget?.unmount();
      } catch {
        // ignore
      }
    };
  }, [checkoutId, amountLabel]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-navy-dark/80 p-4" data-embedded-payment>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pay securely"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 text-navy shadow-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold">Pay securely</p>
            <p className="text-sm text-slate-600">
              {amountLabel} · card details go straight to SumUp, our payment provider
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={status === "processing"}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            Close
          </button>
        </div>
        {status === "loading" ? <p className="py-6 text-center text-sm text-slate-600">Loading secure card form…</p> : null}
        <div id="sumup-card" />
        {status === "processing" ? (
          <p className="mt-2 text-center text-sm text-slate-600">Processing your payment… please don&apos;t close this window.</p>
        ) : null}
        {message ? (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {message}
          </p>
        ) : null}
        <p className="mt-4 text-center text-xs text-slate-500">
          Having trouble?{" "}
          <a href={hostedPaymentUrl} className="font-semibold text-navy underline">
            Pay on SumUp&apos;s secure page instead
          </a>
        </p>
      </div>
    </div>
  );
}
