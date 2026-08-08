"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import GoogleAdsConversion from "@/components/GoogleAdsConversion";
import { SITE } from "@/lib/data";
import {
  finalizePaidBookingFromUrl,
  isPaymentReturnSearch,
  parseAmountValue,
  type FinalizePaidBookingResult,
} from "@/lib/finalize-paid-booking";

type ViewStatus = "loading" | "confirmed" | "pending" | "missing" | "error";

export default function BookingConfirmedClient() {
  const [status, setStatus] = useState<ViewStatus>("loading");
  const [summary, setSummary] = useState("Confirming your payment…");
  const [amountPaid, setAmountPaid] = useState<string | undefined>();
  const [paymentReference, setPaymentReference] = useState<string | undefined>();
  const [fireConversion, setFireConversion] = useState(false);

  useEffect(() => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const hasPaymentReturn =
      isPaymentReturnSearch(search) ||
      Boolean(params.get("return_token")) ||
      Boolean(params.get("checkout_id"));

    // Clean tracking params from the address bar after first load, keep stable /booking-confirmed/
    if (hasPaymentReturn) {
      window.history.replaceState(null, "", "/booking-confirmed/");
    }

    let cancelled = false;

    void (async () => {
      // Arrival from owner-approved SumUp flow (/booking-payment → here after pay).
      if (params.get("paid") === "1") {
        if (!cancelled) {
          const amount = params.get("amount")?.trim() || undefined;
          const ref = params.get("ref")?.trim() || undefined;
          setAmountPaid(amount);
          setPaymentReference(ref);
          setStatus("confirmed");
          setSummary(
            amount
              ? `Payment of ${amount} received. Your booking is confirmed — we’ve emailed your confirmation.`
              : "Thank you — your booking payment is complete. We’ve emailed your confirmation.",
          );
          setFireConversion(true);
          window.history.replaceState(null, "", "/booking-confirmed/");
        }
        return;
      }

      // Direct visits keep the thank-you URL for Ads destination goals, but we only
      // fire the event tag after a real payment confirmation.
      if (!hasPaymentReturn) {
        if (!cancelled) {
          setStatus("confirmed");
          setSummary(
            "Thank you — if you’ve just paid, your confirmation email is on its way. Keep this page as your booking confirmation.",
          );
        }
        return;
      }

      const result: FinalizePaidBookingResult = await finalizePaidBookingFromUrl(search);
      if (cancelled) return;

      setSummary(result.summary);
      setAmountPaid(result.amountPaid);
      setPaymentReference(result.paymentReference);
      setStatus(result.status === "confirmed" ? "confirmed" : result.status);
      if (result.status === "confirmed") {
        setFireConversion(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const conversionValue = parseAmountValue(amountPaid);

  return (
    <>
      <GoogleAdsConversion
        fire={fireConversion}
        value={conversionValue}
        transactionId={paymentReference}
      />

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald">{SITE.name}</p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
          {status === "confirmed"
            ? "Booking confirmed"
            : status === "pending"
              ? "Payment processing"
              : status === "error"
                ? "Payment check"
                : status === "loading"
                  ? "Confirming payment"
                  : "Thank you"}
        </h1>
        <p
          className={`mt-4 text-sm leading-relaxed sm:text-base ${
            status === "error"
              ? "text-red-100"
              : status === "confirmed"
                ? "text-emerald-light"
                : "text-white/75"
          }`}
        >
          {summary}
        </p>
        {paymentReference ? (
          <p className="mt-3 text-sm text-white/50">Reference: {paymentReference}</p>
        ) : null}
        {amountPaid ? (
          <p className="mt-1 text-sm text-white/50">Amount paid: {amountPaid}</p>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/"
            className="rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald-light"
          >
            Back to home
          </Link>
          <a
            href={`mailto:${SITE.email}`}
            className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/40"
          >
            Email us
          </a>
          {(status === "pending" || status === "error") && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl border border-emerald/40 px-4 py-2.5 text-sm font-semibold text-emerald transition-colors hover:border-emerald"
            >
              Refresh
            </button>
          )}
        </div>
      </div>
    </>
  );
}
