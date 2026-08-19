"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SITE } from "@/lib/data";
import { whatsAppChatUrl } from "@/lib/contact-card";
import {
  amendBookingSchedule,
  lookupBookingForAmendment,
  startAmendmentTopUpPayment,
  type ManageBookingSummary,
} from "@/lib/booking-amendment-api";
import { FREE_AMENDMENT_HINT } from "../../../shared/booking-amendment";
import { confirmPaidBooking } from "@/lib/create-payment";

const fieldClass =
  "quote-text-input min-h-12 w-full rounded-xl border border-white/15 bg-navy px-3 text-base text-white placeholder:text-white/35";

type PaymentRequiredState = {
  fareNewLabel: string;
  farePaidLabel: string;
  amountDueLabel: string;
  payCtaLabel: string;
  paymentUrl: string;
  note: string;
};

export default function ManageBookingClient() {
  const [paymentReference, setPaymentReference] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [booking, setBooking] = useState<ManageBookingSummary | null>(null);
  const [tripDate, setTripDate] = useState("");
  const [tripTime, setTripTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [paymentRequired, setPaymentRequired] = useState<PaymentRequiredState | null>(null);
  const [contactGate, setContactGate] = useState<{
    headline: string;
    body: string;
  } | null>(null);

  const whatsappUrl = whatsAppChatUrl(
    `Hi, I need to change booking ${paymentReference || "(reference)"}.`,
  );

  // After SumUp return: finalize top-up then refresh booking.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("amendment") !== "return") return;
    const checkoutId =
      params.get("checkout_id") ||
      params.get("id") ||
      params.get("checkoutId") ||
      "";
    const ref = params.get("ref") || paymentReference;
    if (!checkoutId) return;

    let cancelled = false;
    (async () => {
      setSaving(true);
      setError("");
      try {
        await confirmPaidBooking(checkoutId);
        if (cancelled) return;
        setSuccess(
          `Your booking has been updated.${
            customerEmail.trim()
              ? ` We’ve emailed your updated confirmation to ${customerEmail.trim()}.`
              : ""
          }`,
        );
        setPaymentRequired(null);
        if (ref && customerEmail.trim()) {
          const found = await lookupBookingForAmendment({
            paymentReference: ref,
            customerEmail: customerEmail.trim(),
          });
          if (!cancelled) {
            setBooking(found);
            setTripDate(found.tripDate);
            setTripTime(found.tripTime);
            setPaymentReference(found.paymentReference);
          }
        }
        const url = new URL(window.location.href);
        url.searchParams.delete("amendment");
        url.searchParams.delete("checkout_id");
        url.searchParams.delete("id");
        url.searchParams.delete("checkoutId");
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Payment return could not be confirmed yet. If you were charged, your booking will update shortly.",
          );
        }
      } finally {
        if (!cancelled) setSaving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setContactGate(null);
    setPaymentRequired(null);
    setLoading(true);
    try {
      const found = await lookupBookingForAmendment({
        paymentReference: paymentReference.trim(),
        customerEmail: customerEmail.trim(),
      });
      setBooking(found);
      setTripDate(found.tripDate);
      setTripTime(found.tripTime);
      if (found.within24HoursOfPickup) {
        setContactGate({
          headline: found.within24hHeadline,
          body: found.within24hBody,
        });
      } else if (
        found.pendingAmendment &&
        found.pendingAmendment.status === "awaiting_payment"
      ) {
        const due = found.pendingAmendment.additionalPaymentAmount;
        setPaymentRequired({
          fareNewLabel: `£${found.pendingAmendment.newFare.toFixed(2)}`,
          farePaidLabel: `£${found.pendingAmendment.previousFare.toFixed(2)}`,
          amountDueLabel: `£${due.toFixed(2)}`,
          payCtaLabel: `Pay £${due.toFixed(2)} & Confirm Change`,
          paymentUrl: found.pendingAmendment.paymentUrl || "",
          note: "Your existing booking will remain unchanged until the additional payment is completed.",
        });
      }
    } catch (err) {
      setBooking(null);
      setError(err instanceof Error ? err.message : "Could not find that booking.");
    } finally {
      setLoading(false);
    }
  }

  async function saveAmendment(event: React.FormEvent) {
    event.preventDefault();
    if (!booking) return;
    setError("");
    setSuccess("");
    setPaymentRequired(null);
    setSaving(true);
    try {
      const result = await amendBookingSchedule({
        paymentReference: booking.paymentReference,
        customerEmail: customerEmail.trim(),
        tripDate,
        tripTime,
      });
      if (result.kind === "payment_required") {
        setBooking(result.booking);
        setPaymentRequired({
          fareNewLabel:
            result.fare.newFareLabel || `£${Number(result.fare.newFare).toFixed(2)}`,
          farePaidLabel:
            result.fare.previousFareLabel ||
            `£${Number(result.fare.previousFare).toFixed(2)}`,
          amountDueLabel: result.amountDueLabel,
          payCtaLabel: result.payCtaLabel,
          paymentUrl: result.paymentUrl,
          note: result.note,
        });
        return;
      }
      setBooking(result.booking);
      setTripDate(result.booking.tripDate);
      setTripTime(result.booking.tripTime);
      if (result.emailUi) {
        setSuccess(`${result.emailUi.headline} ${result.emailUi.body}`);
      } else {
        setSuccess(
          `Your booking has been updated.${
            result.fareLabel ? ` ${result.fareLabel}.` : ""
          } We’ve emailed your updated confirmation to ${customerEmail.trim()}.`,
        );
      }
      setContactGate(null);
    } catch (err) {
      const e = err as Error & {
        contactRequired?: boolean;
        headline?: string;
        body?: string;
        booking?: ManageBookingSummary;
      };
      if (e.booking) setBooking(e.booking);
      if (e.contactRequired && e.headline && e.body) {
        setContactGate({ headline: e.headline, body: e.body });
      }
      setError(e.message || "Could not update this booking.");
    } finally {
      setSaving(false);
    }
  }

  async function payDifference() {
    if (!booking) return;
    setPaying(true);
    setError("");
    try {
      let url = paymentRequired?.paymentUrl || "";
      if (!url) {
        const started = await startAmendmentTopUpPayment({
          paymentReference: booking.paymentReference,
          customerEmail: customerEmail.trim(),
          amendmentId: booking.pendingAmendment?.amendmentId,
        });
        url = started.paymentUrl;
        setPaymentRequired((current) =>
          current
            ? {
                ...current,
                paymentUrl: started.paymentUrl,
                amountDueLabel: started.amountDueLabel || current.amountDueLabel,
                payCtaLabel: started.payCtaLabel || current.payCtaLabel,
                note: started.note || current.note,
              }
            : current,
        );
      }
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment.");
      setPaying(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <form
        onSubmit={lookup}
        className="space-y-3 rounded-2xl border border-white/10 bg-navy-dark/70 p-5"
      >
        <p className="text-sm text-white/70">
          Enter your payment / booking reference and the email used at checkout.
        </p>
        <p className="text-xs text-white/45">
          Online self-service currently supports date and time changes only. Pickup,
          destination, passengers and luggage changes need My Airport Taxi NI.
        </p>
        <div>
          <label className="mb-1.5 block text-xs text-white/60">Booking / payment reference</label>
          <input
            className={fieldClass}
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            required
            autoComplete="off"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-white/60">Email on the booking</label>
          <input
            type="email"
            className={fieldClass}
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy disabled:opacity-70"
        >
          {loading ? "Looking up…" : "Find booking"}
        </button>
      </form>

      {error ? (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-100" role="status">
          {success}
        </p>
      ) : null}

      {booking ? (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-navy-dark/70 p-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/45">Current booking</p>
            <p className="mt-1 text-lg font-semibold text-white">{booking.customerName}</p>
            <p className="mt-2 text-sm text-white/75">
              {booking.pickupLabel} → {booking.dropoffLabel}
            </p>
            <p className="mt-1 text-sm text-white/75">
              {booking.tripDate} at {booking.tripTime}
            </p>
            <p className="mt-1 text-sm text-emerald">{booking.amountPaidLabel}</p>
          </div>

          {contactGate ? (
            <div className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
              <h2 className="text-base font-semibold text-amber-50">{contactGate.headline}</h2>
              <p className="text-sm text-amber-100/90">{contactGate.body}</p>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy"
              >
                Contact Us on WhatsApp
              </a>
              <a
                href={`mailto:${SITE.email}`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/20 py-3 text-sm font-semibold text-white"
              >
                Email {SITE.email}
              </a>
            </div>
          ) : paymentRequired ? (
            <div className="space-y-3 rounded-xl border border-emerald/30 bg-emerald/10 p-4">
              <h2 className="text-lg font-semibold text-white">
                Your updated journey costs {paymentRequired.fareNewLabel}
              </h2>
              <dl className="space-y-2 text-sm text-white/80">
                <div className="flex justify-between gap-3">
                  <dt>Already paid</dt>
                  <dd className="font-semibold text-white">{paymentRequired.farePaidLabel}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Amount to pay now</dt>
                  <dd className="font-semibold text-emerald">{paymentRequired.amountDueLabel}</dd>
                </div>
              </dl>
              <p className="text-xs text-white/60">{paymentRequired.note}</p>
              <button
                type="button"
                disabled={paying || saving}
                onClick={() => void payDifference()}
                className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy disabled:opacity-70"
              >
                {paying ? "Opening secure payment…" : paymentRequired.payCtaLabel}
              </button>
            </div>
          ) : (
            <form onSubmit={saveAmendment} className="space-y-3">
              <h2 className="text-lg font-semibold text-white">Change Date or Time</h2>
              <p className="text-xs text-white/55">
                {booking.freeAmendmentAvailable
                  ? FREE_AMENDMENT_HINT
                  : "Your free online change has already been used. Further changes need our approval."}
              </p>
              {!booking.freeAmendmentAvailable ? (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy"
                >
                  Contact Us to Change This Booking
                </a>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs text-white/60">New date</label>
                      <input
                        type="date"
                        className={fieldClass}
                        value={tripDate}
                        onChange={(e) => setTripDate(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-white/60">New time</label>
                      <input
                        type="time"
                        className={fieldClass}
                        value={tripTime}
                        onChange={(e) => setTripTime(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy disabled:opacity-70"
                  >
                    {saving ? "Saving…" : "Save new date & time"}
                  </button>
                </>
              )}
            </form>
          )}

          {booking.dateTimeAmendmentHistory?.length ? (
            <div className="border-t border-white/10 pt-3">
              <p className="text-xs uppercase tracking-wider text-white/45">Change history</p>
              <ul className="mt-2 space-y-1 text-xs text-white/60">
                {booking.dateTimeAmendmentHistory.map((entry) => (
                  <li key={`${entry.changedAt}-${entry.newTripDate}-${entry.newTripTime}`}>
                    {entry.previousTripDate} {entry.previousTripTime} → {entry.newTripDate}{" "}
                    {entry.newTripTime} ({entry.changedBy}
                    {entry.farePreserved === false
                      ? ", fare recalculated"
                      : entry.farePreserved
                        ? ", fare preserved"
                        : ""}
                    )
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Link href="/#quote" className="block text-center text-sm text-emerald underline">
            Get a new quote
          </Link>
        </div>
      ) : null}
    </div>
  );
}
