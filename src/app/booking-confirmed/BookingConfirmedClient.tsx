"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import GoogleAdsConversion from "@/components/GoogleAdsConversion";
import { saveToContactsHref } from "@/lib/contact-card";
import { SITE } from "@/lib/data";
import {
  finalizePaidBookingFromUrl,
  isPaymentReturnSearch,
  parseAmountValue,
  type FinalizePaidBookingResult,
} from "@/lib/finalize-paid-booking";
import { readPendingPayment } from "@/lib/pending-payment";
import { submitQuoteFunnelEvent } from "@/lib/submit-quote-funnel";

type ViewStatus = "loading" | "confirmed" | "pending" | "missing" | "error";

export default function BookingConfirmedClient() {
  const [status, setStatus] = useState<ViewStatus>("loading");
  const [summary, setSummary] = useState("Confirming your payment…");
  const [amountPaid, setAmountPaid] = useState<string | undefined>();
  const [paymentReference, setPaymentReference] = useState<string | undefined>();
  const [customerReference, setCustomerReference] = useState<string | undefined>();
  const [transactionId, setTransactionId] = useState<string | undefined>();
  const [fireConversion, setFireConversion] = useState(false);
  const [customerEmail, setCustomerEmail] = useState<string | undefined>();
  const [customerPhone, setCustomerPhone] = useState<string | undefined>();
  const [contactsHref, setContactsHref] = useState("/My-Airport-Taxi-NI.vcf");

  useEffect(() => {
    setContactsHref(saveToContactsHref());
  }, []);

  useEffect(() => {
    const search = window.location.search;
    const params = new URLSearchParams(search);
    const hasPaymentReturn =
      isPaymentReturnSearch(search) ||
      Boolean(params.get("return_token")) ||
      Boolean(params.get("checkout_id")) ||
      Boolean(params.get("checkoutId"));

    // Clean tracking params from the address bar after first load, keep stable /booking-confirmed/
    if (hasPaymentReturn || params.get("paid") === "1") {
      window.history.replaceState(null, "", "/booking-confirmed/");
    }

    const pending = readPendingPayment();
    if (pending?.booking) {
      setCustomerEmail(pending.booking.customerEmail?.trim() || undefined);
      setCustomerPhone(pending.booking.mobileNumber?.trim() || undefined);
    }

    let cancelled = false;

    void (async () => {
      // Arrival from owner-approved SumUp flow (/booking-payment → here after pay).
      // That path only redirects with paid=1 after server-side confirmation.
      if (params.get("paid") === "1") {
        if (!cancelled) {
          const amount = params.get("amount")?.trim() || undefined;
          const ref = params.get("ref")?.trim() || undefined;
          setAmountPaid(amount);
          setPaymentReference(ref);
          setCustomerReference(undefined);
          setTransactionId(ref);
          setStatus("confirmed");
          setSummary(
            amount
              ? `Payment of ${amount} received. Your booking is confirmed — we’ve emailed your confirmation.`
              : "Thank you — your booking payment is complete. We’ve emailed your confirmation.",
          );
          if (ref) {
            setFireConversion(true);
          }
        }
        return;
      }

      // Direct visits must NOT show a fake booking success. Ads destination
      // goals can still use this URL; the event tag only fires after confirm.
      if (!hasPaymentReturn) {
        if (!cancelled) {
          setStatus("missing");
          setSummary(
            `If you’ve just paid, check your email for confirmation or return via the SumUp “Back to merchant” link. Need help? Email ${SITE.email}.`,
          );
        }
        return;
      }

      const result: FinalizePaidBookingResult = await finalizePaidBookingFromUrl(search);
      if (cancelled) return;

      setSummary(result.summary);
      setAmountPaid(result.amountPaid);
      setPaymentReference(result.paymentReference);
      setCustomerReference(result.customerReference || result.result?.customerReference);
      const orderId =
        result.customerReference?.trim() ||
        result.result?.customerReference?.trim() ||
        result.paymentReference?.trim() ||
        result.checkoutId?.trim();
      setTransactionId(orderId);
      setStatus(result.status === "confirmed" ? "confirmed" : result.status);
      if (result.status === "confirmed" && orderId) {
        setFireConversion(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status !== "confirmed") return;
    const pending = readPendingPayment();
    const booking = pending?.booking;
    void submitQuoteFunnelEvent("paid", {
      pickupLabel: booking?.pickupLabel,
      dropoffLabel: booking?.dropoffLabel,
      returnJourney: booking?.returnJourney,
      estimatedPrice:
        amountPaid ||
        (typeof booking?.estimatedPrice === "string" ? booking.estimatedPrice : undefined) ||
        (pending?.amountLabel ? String(pending.amountLabel) : undefined),
      vehicle: booking?.vehicle,
      passengers: booking?.passengers,
      suitcases: booking?.suitcases,
      isAirportTrip: booking?.isAirportTrip,
      tripLabel: booking?.tripLabel,
    });
  }, [status, amountPaid]);

  const conversionValue = parseAmountValue(amountPaid);

  return (
    <>
      <GoogleAdsConversion
        fire={fireConversion}
        value={conversionValue}
        transactionId={transactionId}
        userData={{
          email: customerEmail,
          phone: customerPhone,
        }}
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
                  : "Checking your payment"}
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
        {customerReference || paymentReference ? (
          <p className="mt-3 text-sm text-white/80">
            <span className="text-white/50">Booking reference: </span>
            <span className="font-semibold tracking-wide text-emerald">
              {(customerReference || paymentReference || "").trim()}
            </span>
          </p>
        ) : null}
        {amountPaid ? (
          <p className="mt-1 text-sm text-white/50">Amount paid: {amountPaid}</p>
        ) : status === "confirmed" ? (
          <p className="mt-1 text-sm text-white/50">
            If you requested a fixed quote, we&apos;ll email your personal price shortly.
          </p>
        ) : null}
        {status === "confirmed" ? (
          <p className="mt-1 text-xs text-white/40">Payment method: Card (SumUp)</p>
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
          {(status === "pending" || status === "error" || status === "missing") && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl border border-emerald/40 px-4 py-2.5 text-sm font-semibold text-emerald transition-colors hover:border-emerald"
            >
              Refresh
            </button>
          )}
        </div>

        {status === "confirmed" ? (
          <div className="mt-8 border-t border-white/10 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Save us for your next journey
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              Keep {SITE.name} in your contacts so we&apos;re easy to find whenever you need another
              airport transfer.
            </p>
            <a
              href={contactsHref}
              className="mt-4 inline-flex rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-emerald/50 hover:text-emerald"
            >
              Save My Airport Taxi NI to Contacts
            </a>
          </div>
        ) : null}
      </div>
    </>
  );
}
