"use client";

import { useState } from "react";
import Link from "next/link";
import { SITE } from "@/lib/data";
import { whatsAppChatUrl } from "@/lib/contact-card";
import {
  amendBookingSchedule,
  lookupBookingForAmendment,
  type ManageBookingSummary,
} from "@/lib/booking-amendment-api";
import { FREE_AMENDMENT_HINT } from "../../../shared/booking-amendment";

const fieldClass =
  "quote-text-input min-h-12 w-full rounded-xl border border-white/15 bg-navy px-3 text-base text-white placeholder:text-white/35";

export default function ManageBookingClient() {
  const [paymentReference, setPaymentReference] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [booking, setBooking] = useState<ManageBookingSummary | null>(null);
  const [tripDate, setTripDate] = useState("");
  const [tripTime, setTripTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [contactGate, setContactGate] = useState<{
    headline: string;
    body: string;
  } | null>(null);

  const whatsappUrl = whatsAppChatUrl(
    `Hi, I need to change booking ${paymentReference || "(reference)"}.`,
  );

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setContactGate(null);
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
    setSaving(true);
    try {
      const result = await amendBookingSchedule({
        paymentReference: booking.paymentReference,
        customerEmail: customerEmail.trim(),
        tripDate,
        tripTime,
      });
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

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <form
        onSubmit={lookup}
        className="space-y-3 rounded-2xl border border-white/10 bg-navy-dark/70 p-5"
      >
        <p className="text-sm text-white/70">
          Enter your payment / booking reference and the email used at checkout.
        </p>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/60">
            Booking reference
          </label>
          <input
            className={fieldClass}
            value={paymentReference}
            onChange={(e) => setPaymentReference(e.target.value)}
            required
            autoComplete="off"
            placeholder="Payment reference"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/60">Email</label>
          <input
            className={fieldClass}
            type="email"
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
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald">
          {success}
        </p>
      ) : null}

      {booking ? (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-navy-dark/70 p-5 text-sm text-white/80">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/45">Journey</p>
            <p className="mt-1 break-words">{booking.pickupLabel}</p>
            <p className="break-words text-white/55">to {booking.dropoffLabel}</p>
            <p className="mt-2 font-semibold text-white">
              {booking.tripDate} at {booking.tripTime}
            </p>
            <p className="mt-1 text-white/55">Paid: {booking.amountPaidLabel}</p>
          </div>

          {contactGate || booking.within24HoursOfPickup ? (
            <div className="space-y-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
              <h2 className="text-lg font-semibold text-white">
                {contactGate?.headline || booking.within24hHeadline}
              </h2>
              <p className="text-white/80">{contactGate?.body || booking.within24hBody}</p>
              <p className="text-xs text-white/55">
                Contact Us to Change This Booking — your pickup is within 24 hours, so changes need
                to be agreed with us directly.
              </p>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy"
              >
                WhatsApp My Airport Taxi NI
              </a>
              <a
                href={`tel:${SITE.landline}`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/20 py-3 text-sm font-semibold text-white"
              >
                Call {SITE.landlineDisplay}
              </a>
              <a
                href={`mailto:${SITE.email}`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/20 py-3 text-sm font-semibold text-white"
              >
                Email {SITE.email}
              </a>
            </div>
          ) : (
            <form onSubmit={saveAmendment} className="space-y-3">
              <h2 className="text-lg font-semibold text-white">Change Date or Time</h2>
              <p className="text-xs text-white/55">
                {booking.freeAmendmentAvailable
                  ? FREE_AMENDMENT_HINT
                  : "Your free date/time change has already been used. Further changes need our approval."}
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

          {(booking.dateTimeAmendmentHistory?.length ?? 0) > 0 ? (
            <div>
              <p className="text-xs uppercase tracking-wider text-white/45">Amendment history</p>
              <ul className="mt-2 space-y-2 text-xs text-white/60">
                {booking.dateTimeAmendmentHistory.map((entry) => (
                  <li key={`${entry.changedAt}-${entry.newTripDate}-${entry.newTripTime}`}>
                    {entry.previousTripDate} {entry.previousTripTime} → {entry.newTripDate}{" "}
                    {entry.newTripTime} ({entry.changedBy}
                    {entry.farePreserved === false ? ", fare recalculated" : entry.farePreserved ? ", fare preserved" : ""})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-center text-xs text-white/40">
        <Link href="/terms/" className="underline underline-offset-2">
          Terms &amp; Conditions
        </Link>{" "}
        · cancellation and amendment rules apply
      </p>
    </div>
  );
}
