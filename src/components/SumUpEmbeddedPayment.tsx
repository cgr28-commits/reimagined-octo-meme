"use client";

import { useEffect, useRef, useState } from "react";
import { formatUkDateTime } from "../../shared/uk-time";
import { withBasePath } from "@/lib/paths";

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

export type EmbeddedPaymentSummary = {
  pickupLabel?: string;
  dropoffLabel?: string;
  tripDate?: string;
  tripTime?: string;
  returnJourney?: boolean;
  returnDate?: string;
  returnTime?: string;
  passengers?: number;
  suitcases?: number;
  vehicle?: string;
};

function when(date?: string, time?: string): string {
  if (!date) return "";
  try {
    return time ? formatUkDateTime(date, time) : date;
  } catch {
    return [date, time].filter(Boolean).join(" ");
  }
}

const SDK_SRC = "https://gateway.sumup.com/gateway/ecom/card/v2/sdk.js";
const PREVIEW_KEY = "matni-embedded-pay";
const GOOGLE_PAY_MERCHANT_ID = process.env.NEXT_PUBLIC_GOOGLE_PAY_MERCHANT_ID?.trim() ?? "";

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
  summary,
  onPaid,
  onClose,
}: {
  checkoutId: string;
  amountLabel: string;
  hostedPaymentUrl: string;
  summary?: EmbeddedPaymentSummary;
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
          // Google Pay shows once SumUp enables it and Google issues a merchant ID.
          ...(GOOGLE_PAY_MERCHANT_ID
            ? { googlePay: { merchantId: GOOGLE_PAY_MERCHANT_ID, merchantName: "My Airport Taxi NI" } }
            : {}),
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

  const vehicleShort = String(summary?.vehicle ?? "").replace(/\s*\(.*\)\s*$/, "");
  const outbound = when(summary?.tripDate, summary?.tripTime);
  const inbound = summary?.returnJourney ? when(summary?.returnDate, summary?.returnTime) : "";
  const party = [
    summary?.passengers ? `${summary.passengers} passenger${summary.passengers === 1 ? "" : "s"}` : "",
    summary?.suitcases != null ? `${summary.suitcases} suitcase${summary.suitcases === 1 ? "" : "s"}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-navy-dark/80 p-3 sm:p-4" data-embedded-payment>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Pay securely"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white text-navy shadow-2xl md:max-w-3xl"
      >
        <div className="flex items-center justify-between gap-3 rounded-t-2xl bg-navy px-5 py-4">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withBasePath("/logo-header.webp")} alt="My Airport Taxi NI" width={62} height={48} className="h-10 w-auto" />
            <div>
              <p className="text-base font-bold text-white">Pay securely</p>
              <p className="text-xs text-white/70">🔒 Secure payment by SumUp</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={status === "processing"}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-white/80 hover:bg-white/10 disabled:opacity-40"
          >
            Close
          </button>
        </div>

        <div className="grid gap-5 p-5 md:grid-cols-[1fr_1.15fr] md:gap-6">
          <section aria-label="Your booking" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm" data-embedded-payment-summary>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Your booking</p>
            {summary?.pickupLabel ? (
              <p className="mt-2 font-semibold leading-snug">
                {summary.pickupLabel}
                <span className="block text-slate-500">↓</span>
                {summary.dropoffLabel}
              </p>
            ) : null}
            <dl className="mt-3 space-y-1.5 text-slate-700">
              {outbound ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">{inbound ? "Outbound" : "Pickup"}</dt>
                  <dd className="text-right font-medium">{outbound}</dd>
                </div>
              ) : null}
              {inbound ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Return</dt>
                  <dd className="text-right font-medium">{inbound}</dd>
                </div>
              ) : null}
              {party ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Party</dt>
                  <dd className="text-right font-medium">{party}</dd>
                </div>
              ) : null}
              {vehicleShort ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Vehicle</dt>
                  <dd className="text-right font-medium">{vehicleShort}</dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-3 flex items-baseline justify-between border-t border-slate-200 pt-3">
              <span className="font-semibold">Fixed price</span>
              <span className="text-xl font-bold">{amountLabel}</span>
            </div>
            <ul className="mt-3 space-y-1 text-xs text-slate-600">
              <li>✓ Free cancellation up to 24 hours before pickup</li>
              <li>✓ Pre-booked local driver, flight monitored</li>
              <li>✓ No extra charges on the day</li>
            </ul>
          </section>

          <section aria-label="Card details">
            <p className="mb-2 text-sm font-semibold">Card details</p>
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
          </section>
        </div>
      </div>
    </div>
  );
}
