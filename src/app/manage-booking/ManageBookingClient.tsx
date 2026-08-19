"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SITE } from "@/lib/data";
import { whatsAppChatUrl } from "@/lib/contact-card";
import AddressInput from "@/components/AddressInput";
import {
  abandonPendingAmendment,
  amendBookingSchedule,
  loadBookingAfterAmendmentReturn,
  lookupBookingForAmendment,
  previewBookingAmendment,
  startAmendmentTopUpPayment,
  type AmendmentReview,
  type AmendPayload,
  type ManageBookingSummary,
} from "@/lib/booking-amendment-api";
import { FREE_AMENDMENT_HINT } from "../../../shared/booking-amendment";
import { INSTANT_QUOTE_MAX_PASSENGERS } from "../../../shared/passenger-limits";
import { confirmPaidBooking } from "@/lib/create-payment";

const fieldClass =
  "quote-text-input min-h-12 w-full rounded-xl border border-white/15 bg-navy px-3 text-base text-white placeholder:text-white/35";

const AMEND_RETURN_STORAGE_KEY = "matni.amendReturn";

type PaymentRequiredState = {
  fareNewLabel: string;
  farePaidLabel: string;
  amountDueLabel: string;
  payCtaLabel: string;
  paymentUrl: string;
  note: string;
};

type FormState = {
  tripDate: string;
  tripTime: string;
  pickupLabel: string;
  dropoffLabel: string;
  passengers: number;
  suitcases: number;
  childSeats: number;
  childSeatNotes: string;
  flightNumber: string;
  mobileNumber: string;
};

function formFromBooking(found: ManageBookingSummary): FormState {
  return {
    tripDate: found.tripDate || "",
    tripTime: found.tripTime || "",
    pickupLabel: found.pickupLabel || "",
    dropoffLabel: found.dropoffLabel || "",
    passengers: found.passengers ?? 1,
    suitcases: found.suitcases ?? 0,
    childSeats: found.childSeats ?? 0,
    childSeatNotes: found.childSeatNotes || "",
    flightNumber: found.flightNumber || "",
    mobileNumber: found.mobileNumber || "",
  };
}

export default function ManageBookingClient() {
  const [paymentReference, setPaymentReference] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [manageToken, setManageToken] = useState("");
  const [booking, setBooking] = useState<ManageBookingSummary | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [review, setReview] = useState<AmendmentReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [autoLoading, setAutoLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [paymentRequired, setPaymentRequired] = useState<PaymentRequiredState | null>(null);
  const [contactGate, setContactGate] = useState<{
    headline: string;
    body: string;
  } | null>(null);
  const [pickupSelected, setPickupSelected] = useState(true);
  const [dropoffSelected, setDropoffSelected] = useState(true);

  const displayRef =
    booking?.customerReference || paymentReference || booking?.paymentReference || "(reference)";
  const whatsappUrl = whatsAppChatUrl(`Hi, I need to change booking ${displayRef}.`);

  const maxPassengers = booking?.maxOnlinePassengers || INSTANT_QUOTE_MAX_PASSENGERS;
  const showFlight =
    Boolean(booking?.isAirportTrip) ||
    Boolean(booking?.flightNumber) ||
    /airport/i.test(`${booking?.pickupLabel || ""} ${booking?.dropoffLabel || ""}`);

  function applyBooking(found: ManageBookingSummary) {
    setBooking(found);
    setForm(formFromBooking(found));
    setPickupSelected(true);
    setDropoffSelected(true);
    setReview(null);
    setPaymentReference(found.customerReference || found.paymentReference);
    if (found.customerEmail) setCustomerEmail(found.customerEmail);
    setContactGate(null);
    setPaymentRequired(null);

    if (found.within24HoursOfPickup) {
      setContactGate({
        headline: found.within24hHeadline,
        body: found.within24hBody,
      });
    } else if (found.pendingAmendment && found.pendingAmendment.status === "awaiting_payment") {
      const due = found.pendingAmendment.additionalPaymentAmount;
      setPaymentRequired({
        fareNewLabel: `£${found.pendingAmendment.newFare.toFixed(2)}`,
        farePaidLabel: `£${found.pendingAmendment.previousFare.toFixed(2)}`,
        amountDueLabel: `£${due.toFixed(2)}`,
        payCtaLabel: `Pay £${due.toFixed(2)} & Confirm Change`,
        paymentUrl: found.pendingAmendment.paymentUrl || "",
        note: "Your existing booking will remain unchanged until the additional payment is completed. You can cancel this incomplete payment request below without using your free change.",
      });
    }
  }

  function buildPayload(): AmendPayload | null {
    if (!booking || !form) return null;
    return {
      paymentReference: booking.paymentReference,
      customerEmail: (booking.customerEmail || customerEmail).trim(),
      token: manageToken || undefined,
      tripDate: form.tripDate,
      tripTime: form.tripTime,
      pickupLabel: form.pickupLabel.trim(),
      dropoffLabel: form.dropoffLabel.trim(),
      passengers: form.passengers,
      suitcases: form.suitcases,
      childSeats: form.childSeats,
      childSeatNotes: form.childSeatNotes,
      flightNumber: form.flightNumber,
      mobileNumber: form.mobileNumber.trim(),
    };
  }

  // Auto-load via secure email token.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("amendment") === "return") return;
    const token = (params.get("token") || "").trim();
    if (!token) return;

    let cancelled = false;
    (async () => {
      setAutoLoading(true);
      setError("");
      setSuccess("");
      try {
        setManageToken(token);
        const found = await lookupBookingForAmendment({ token });
        if (cancelled) return;
        applyBooking(found);
        const url = new URL(window.location.href);
        url.searchParams.delete("token");
        window.history.replaceState({}, "", url.pathname + (url.search || ""));
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "This manage booking link is invalid or has expired.",
          );
        }
      } finally {
        if (!cancelled) setAutoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After SumUp return: finalize top-up then reload booking.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("amendment") !== "return") return;
    const checkoutId =
      params.get("checkout_id") ||
      params.get("id") ||
      params.get("checkoutId") ||
      "";
    if (!checkoutId) return;

    let cancelled = false;
    (async () => {
      setSaving(true);
      setError("");
      try {
        const confirmed = await confirmPaidBooking(checkoutId);
        if (cancelled) return;

        let found: ManageBookingSummary | null = null;
        let emailed = Boolean(confirmed.customerEmailSent);

        try {
          const returned = await loadBookingAfterAmendmentReturn({ checkoutId });
          if (!cancelled) {
            found = returned.booking;
            emailed = emailed || returned.customerEmailSent;
          }
        } catch {
          // Confirm may have already committed; fall back to session lookup.
        }

        if (!found) {
          let storedRef = "";
          let storedEmail = "";
          let storedToken = "";
          try {
            const raw = sessionStorage.getItem(AMEND_RETURN_STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as {
                paymentReference?: string;
                customerEmail?: string;
                token?: string;
              };
              storedRef = String(parsed.paymentReference || "").trim();
              storedEmail = String(parsed.customerEmail || "").trim();
              storedToken = String(parsed.token || "").trim();
            }
          } catch {
            // ignore
          }
          if (storedToken) {
            found = await lookupBookingForAmendment({ token: storedToken });
          } else {
            const ref =
              confirmed.bookingPaymentReference ||
              confirmed.paymentReference ||
              storedRef ||
              params.get("ref") ||
              "";
            if (ref && storedEmail) {
              found = await lookupBookingForAmendment({
                paymentReference: ref,
                customerEmail: storedEmail,
              });
            }
          }
        }

        if (cancelled) return;

        if (found) {
          applyBooking(found);
          setSuccess(
            emailed || found.lastUpdatedConfirmationSentAt
              ? `Your booking has been updated. We’ve emailed your updated confirmation to ${
                  found.customerEmail || "your email address"
                }.`
              : "Your booking has been updated. If you do not receive the confirmation email shortly, contact My Airport Taxi NI.",
          );
        } else {
          setSuccess(
            "Your additional payment was received and your booking is being updated. Find your booking below with your reference and email if details do not appear automatically.",
          );
        }

        setPaymentRequired(null);
        try {
          sessionStorage.removeItem(AMEND_RETURN_STORAGE_KEY);
        } catch {
          // ignore
        }
        const url = new URL(window.location.href);
        url.searchParams.delete("amendment");
        url.searchParams.delete("checkout_id");
        url.searchParams.delete("id");
        url.searchParams.delete("checkoutId");
        url.searchParams.delete("ref");
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
    setReview(null);
    setLoading(true);
    try {
      const found = await lookupBookingForAmendment({
        paymentReference: paymentReference.trim(),
        customerEmail: customerEmail.trim(),
      });
      applyBooking(found);
    } catch (err) {
      setBooking(null);
      setForm(null);
      setError(err instanceof Error ? err.message : "Could not find that booking.");
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(event: React.FormEvent) {
    event.preventDefault();
    const payload = buildPayload();
    if (!payload) return;
    if (!pickupSelected || !dropoffSelected) {
      setError("Please select pickup and destination from the address suggestions.");
      return;
    }
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const result = await previewBookingAmendment(payload);
      if (result.kind === "preview") {
        if (result.contactRequired && result.headline && result.body) {
          setContactGate({ headline: result.headline, body: result.body });
          setReview(result.review);
          return;
        }
        setReview(result.review);
        setBooking(result.booking);
        return;
      }
      setError("Unexpected preview response. Please try again.");
    } catch (err) {
      const e = err as Error & {
        contactRequired?: boolean;
        headline?: string;
        body?: string;
        booking?: ManageBookingSummary;
      };
      if (e.booking) applyBooking(e.booking);
      if (e.contactRequired && e.headline && e.body) {
        setContactGate({ headline: e.headline, body: e.body });
      }
      setError(
        e.message ||
          "We couldn’t update your booking. Your existing booking has not been changed. Please try again or contact us.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    const payload = buildPayload();
    if (!payload) return;
    setError("");
    setSuccess("");
    setSaving(true);
    try {
      const result = await amendBookingSchedule(payload);
      if (result.kind === "payment_required") {
        setBooking(result.booking);
        if (result.review) setReview(result.review);
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
      if (result.kind === "updated") {
        applyBooking(result.booking);
        setReview(null);
        if (result.emailUi) {
          setSuccess(`${result.emailUi.headline} ${result.emailUi.body}`);
        } else {
          setSuccess(
            `Your booking has been updated.${
              result.fareLabel ? ` ${result.fareLabel}.` : ""
            } We’ve emailed your updated confirmation to ${
              result.booking.customerEmail || customerEmail.trim()
            }.`,
          );
        }
        return;
      }
      if (result.kind === "preview" && result.contactRequired) {
        setContactGate({
          headline: result.headline || "Please contact us",
          body: result.body || "Please contact My Airport Taxi NI to complete this change.",
        });
        setReview(result.review);
      }
    } catch (err) {
      const e = err as Error & {
        contactRequired?: boolean;
        headline?: string;
        body?: string;
        booking?: ManageBookingSummary;
      };
      if (e.booking) applyBooking(e.booking);
      if (e.contactRequired && e.headline && e.body) {
        setContactGate({ headline: e.headline, body: e.body });
      }
      setError(
        e.message ||
          "We couldn’t update your booking. Your existing booking has not been changed. Please try again or contact us.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function cancelPendingPayment() {
    if (!booking) return;
    setSaving(true);
    setError("");
    try {
      const updated = await abandonPendingAmendment({
        paymentReference: booking.paymentReference,
        customerEmail: (booking.customerEmail || customerEmail).trim(),
        token: manageToken || undefined,
      });
      applyBooking(updated);
      setSuccess(
        "The incomplete payment request was cancelled. Your original booking is unchanged.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the pending payment.");
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
          customerEmail: (booking.customerEmail || customerEmail).trim(),
          amendmentId: booking.pendingAmendment?.amendmentId,
          token: manageToken || undefined,
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
      try {
        sessionStorage.setItem(
          AMEND_RETURN_STORAGE_KEY,
          JSON.stringify({
            paymentReference: booking.paymentReference,
            customerEmail: (booking.customerEmail || customerEmail).trim(),
            token: manageToken || undefined,
          }),
        );
      } catch {
        // sessionStorage may be unavailable
      }
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start payment.");
      setPaying(false);
    }
  }

  const canEdit =
    Boolean(booking && form) &&
    !contactGate &&
    !paymentRequired &&
    Boolean(booking?.freeAmendmentAvailable || (form && booking));

  // Allow non-material edits even after free quota used? Spec says one free date/time
  // change for material; non-material should still work. Server enforces.
  const formLocked = Boolean(contactGate) || Boolean(paymentRequired);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 pb-28 sm:pb-8">
      {!booking ? (
        <form
          onSubmit={lookup}
          className="space-y-3 rounded-2xl border border-white/10 bg-navy-dark/70 p-5"
        >
          <p className="text-sm text-white/70">
            Enter the booking reference shown on your confirmation, along with the email address
            used when booking.
          </p>
          {autoLoading ? (
            <p className="text-sm text-emerald">Opening your booking…</p>
          ) : null}
          <div>
            <label className="mb-1.5 block text-xs text-white/60">Booking reference</label>
            <input
              className={fieldClass}
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              required
              autoComplete="off"
              placeholder="MAT-4827"
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
            disabled={loading || autoLoading}
            className="manage-booking-cta w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy disabled:opacity-70"
          >
            {loading ? "Looking up…" : "Find booking"}
          </button>
        </form>
      ) : null}

      {error ? (
        <p
          className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-100"
          role="status"
        >
          {success}
        </p>
      ) : null}

      {booking && form ? (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-navy-dark/70 p-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/45">Current booking</p>
            <p className="mt-1 text-lg font-semibold text-white">{booking.customerName}</p>
            <p className="mt-2 text-sm text-emerald">
              Booking reference:{" "}
              <span className="font-semibold tracking-wide">
                {booking.customerReference || booking.paymentReference}
              </span>
            </p>
            <p className="mt-1 text-sm text-white/60">{booking.customerEmail}</p>
            <p className="mt-1 text-sm text-emerald">{booking.amountPaidLabel} paid</p>
            {typeof booking.journeyFare === "number" ? (
              <p className="mt-1 text-xs text-white/55">
                Current journey fare:{" "}
                {booking.journeyFareLabel || `£${booking.journeyFare.toFixed(2)}`}
              </p>
            ) : null}
          </div>

          {contactGate ? (
            <div className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
              <h2 className="text-base font-semibold text-amber-50">{contactGate.headline}</h2>
              <p className="text-sm text-amber-100/90">{contactGate.body}</p>
              {review?.diffs?.length ? (
                <ul className="space-y-1 text-xs text-amber-100/80">
                  {review.diffs.map((d) => (
                    <li key={d.field}>
                      <span className="font-semibold">{d.label}:</span> {d.oldValue} → {d.newValue}
                    </li>
                  ))}
                </ul>
              ) : null}
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="manage-booking-cta inline-flex w-full items-center justify-center rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy"
              >
                Contact Us on WhatsApp
              </a>
              <a
                href={`mailto:${SITE.email}`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/20 py-3 text-sm font-semibold text-white"
              >
                Email {SITE.email}
              </a>
              <button
                type="button"
                className="w-full text-sm text-white/60 underline"
                onClick={() => {
                  setContactGate(null);
                  setReview(null);
                }}
              >
                Back to booking details
              </button>
            </div>
          ) : paymentRequired ? (
            <div className="space-y-3 rounded-xl border border-emerald/30 bg-emerald/10 p-4">
              <h2 className="text-lg font-semibold text-white">Additional payment required</h2>
              <dl className="space-y-2 text-sm text-white/80">
                <div className="flex justify-between gap-3">
                  <dt>Original fare</dt>
                  <dd className="font-semibold text-white">{paymentRequired.farePaidLabel}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Updated fare</dt>
                  <dd className="font-semibold text-white">{paymentRequired.fareNewLabel}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Additional payment required</dt>
                  <dd className="font-semibold text-emerald">{paymentRequired.amountDueLabel}</dd>
                </div>
              </dl>
              <p className="text-xs text-white/60">{paymentRequired.note}</p>
              <button
                type="button"
                disabled={paying || saving}
                onClick={() => void payDifference()}
                className="manage-booking-cta w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy disabled:opacity-70"
              >
                {paying ? "Opening secure payment…" : "Continue to Secure Payment"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void cancelPendingPayment()}
                className="w-full rounded-xl border border-white/20 py-3 text-sm font-semibold text-white disabled:opacity-70"
              >
                Cancel incomplete payment request
              </button>
            </div>
          ) : review ? (
            <div className="space-y-3 rounded-xl border border-white/15 bg-navy/40 p-4">
              <h2 className="text-lg font-semibold text-white">Review Changes</h2>
              <ul className="space-y-3 text-sm text-white/80">
                {review.diffs.map((d) => (
                  <li key={d.field} className="border-b border-white/10 pb-2">
                    <p className="text-xs uppercase tracking-wider text-white/45">{d.label}</p>
                    <p className="mt-1 text-white/55">Old: {d.oldValue}</p>
                    <p className="text-white">New: {d.newValue}</p>
                  </li>
                ))}
              </ul>
              <div className="rounded-xl border border-emerald/20 bg-emerald/10 p-3 text-sm">
                <p>Original fare: {review.fare.previousFareLabel}</p>
                <p>Updated fare: {review.fare.newFareLabel}</p>
                {review.fare.kind === "additional_payment" ? (
                  <p className="mt-1 font-semibold text-emerald">
                    Additional payment required: {review.fare.differenceLabel}
                  </p>
                ) : (
                  <p className="mt-1 font-semibold text-emerald">No additional payment required.</p>
                )}
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleConfirm()}
                className="manage-booking-cta w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy disabled:opacity-70"
              >
                {saving
                  ? "Confirming…"
                  : review.fare.kind === "additional_payment"
                    ? "Continue to Secure Payment"
                    : "Confirm Changes"}
              </button>
              <button
                type="button"
                className="w-full text-sm text-white/60 underline"
                onClick={() => setReview(null)}
              >
                Edit details
              </button>
            </div>
          ) : (
            <form onSubmit={handleReview} className="space-y-3">
              <h2 className="text-lg font-semibold text-white">Amend your booking</h2>
              <p className="text-xs text-white/55">
                {booking.freeAmendmentAvailable
                  ? FREE_AMENDMENT_HINT
                  : booking.dateTimeAmendmentCount >= 1
                    ? "Your free online date/time or journey change has already been used. Further journey changes need our approval. Contact details and flight number can still be updated where available."
                    : FREE_AMENDMENT_HINT}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-white/60">Pickup date</label>
                  <input
                    type="date"
                    className={fieldClass}
                    value={form.tripDate}
                    onChange={(e) => setForm({ ...form, tripDate: e.target.value })}
                    required
                    disabled={formLocked}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-white/60">Pickup time</label>
                  <input
                    type="time"
                    className={fieldClass}
                    value={form.tripTime}
                    onChange={(e) => setForm({ ...form, tripTime: e.target.value })}
                    required
                    disabled={formLocked}
                  />
                </div>
              </div>

              <AddressInput
                id="manage-pickup"
                name="pickup"
                label="Pickup address"
                value={form.pickupLabel}
                onChange={(value) => {
                  setForm({ ...form, pickupLabel: value });
                  setPickupSelected(false);
                }}
                onSelectAddress={(address) => {
                  setForm((current) =>
                    current ? { ...current, pickupLabel: address } : current,
                  );
                  setPickupSelected(true);
                }}
                requireSuggestion
                airportCode={booking.airportCode || ""}
                disableAutoScroll
                className="manage-address-field"
              />

              <AddressInput
                id="manage-dropoff"
                name="dropoff"
                label="Destination"
                value={form.dropoffLabel}
                onChange={(value) => {
                  setForm({ ...form, dropoffLabel: value });
                  setDropoffSelected(false);
                }}
                onSelectAddress={(address) => {
                  setForm((current) =>
                    current ? { ...current, dropoffLabel: address } : current,
                  );
                  setDropoffSelected(true);
                }}
                requireSuggestion
                airportCode={booking.airportCode || ""}
                disableAutoScroll
                className="manage-address-field"
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs text-white/60">Passengers</label>
                  <select
                    className={fieldClass}
                    value={form.passengers}
                    onChange={(e) =>
                      setForm({ ...form, passengers: Number(e.target.value) || 1 })
                    }
                    disabled={formLocked}
                  >
                    {Array.from({ length: maxPassengers }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs text-white/60">Suitcases</label>
                  <select
                    className={fieldClass}
                    value={form.suitcases}
                    onChange={(e) =>
                      setForm({ ...form, suitcases: Number(e.target.value) || 0 })
                    }
                    disabled={formLocked}
                  >
                    {Array.from({ length: 9 }, (_, i) => i).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-white/60">Child seats</label>
                <select
                  className={fieldClass}
                  value={form.childSeats}
                  onChange={(e) =>
                    setForm({ ...form, childSeats: Number(e.target.value) || 0 })
                  }
                  disabled={formLocked}
                >
                  <option value={0}>None</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                </select>
              </div>
              {form.childSeats > 0 ? (
                <div>
                  <label className="mb-1.5 block text-xs text-white/60">Child seat notes</label>
                  <input
                    className={fieldClass}
                    value={form.childSeatNotes}
                    onChange={(e) => setForm({ ...form, childSeatNotes: e.target.value })}
                    placeholder="e.g. 1 infant seat, 1 booster"
                    disabled={formLocked}
                  />
                </div>
              ) : null}

              {showFlight ? (
                <div>
                  <label className="mb-1.5 block text-xs text-white/60">Flight number</label>
                  <input
                    className={fieldClass}
                    value={form.flightNumber}
                    onChange={(e) => setForm({ ...form, flightNumber: e.target.value })}
                    placeholder="e.g. EZY1234"
                    disabled={formLocked}
                  />
                </div>
              ) : null}

              <div>
                <label className="mb-1.5 block text-xs text-white/60">Mobile number</label>
                <input
                  className={fieldClass}
                  value={form.mobileNumber}
                  onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })}
                  required
                  disabled={formLocked}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-white/60">Email</label>
                <input
                  type="email"
                  className={`${fieldClass} opacity-80`}
                  value={booking.customerEmail || customerEmail}
                  readOnly
                  aria-readonly="true"
                />
                <p className="mt-1 text-xs text-white/45">
                  Booking email cannot be changed online. Contact us if you need this updated.
                </p>
              </div>

              <button
                type="submit"
                disabled={saving || !canEdit}
                className="manage-booking-cta w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy disabled:opacity-70"
              >
                {saving ? "Reviewing…" : "Review Changes"}
              </button>
            </form>
          )}

          <button
            type="button"
            className="w-full text-sm text-white/50 underline"
            onClick={() => {
              setBooking(null);
              setForm(null);
              setReview(null);
              setManageToken("");
              setPaymentRequired(null);
              setContactGate(null);
              setSuccess("");
              setError("");
            }}
          >
            Look up a different booking
          </button>

          <Link href="/#quote" className="block text-center text-sm text-emerald underline">
            Get a new quote
          </Link>
        </div>
      ) : null}
    </div>
  );
}
