"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUkInstant } from "../../shared/uk-time";
import {
  fetchOwnerPaidBookings,
  fetchOwnerPendingCheckouts,
  finalizePaidCheckoutRecovery,
  resendPaidBookingConfirmation,
  type OwnerPaidBookingSummary,
  type OwnerPendingCheckoutSummary,
} from "@/lib/paid-bookings-api";

type OwnerPaidBookingsPanelProps = {
  ownerKey: string;
};

export default function OwnerPaidBookingsPanel({ ownerKey }: OwnerPaidBookingsPanelProps) {
  const [bookings, setBookings] = useState<OwnerPaidBookingSummary[]>([]);
  const [pending, setPending] = useState<OwnerPendingCheckoutSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyRef, setBusyRef] = useState("");
  const [recovering, setRecovering] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextBookings, nextPending] = await Promise.all([
        fetchOwnerPaidBookings(ownerKey, { days: 30, limit: 50 }),
        fetchOwnerPendingCheckouts(ownerKey, { limit: 40 }).catch(() => [] as OwnerPendingCheckoutSummary[]),
      ]);
      setBookings(nextBookings);
      setPending(nextPending);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load paid bookings");
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleResend(booking: OwnerPaidBookingSummary) {
    setBusyRef(booking.paymentReference);
    setError("");
    setMessage("");
    try {
      const result = await resendPaidBookingConfirmation(ownerKey, booking.paymentReference);
      if (!result.customerEmailSent) {
        throw new Error(result.customerEmailError || "Booking confirmation could not be sent");
      }
      setMessage(
        `Booking confirmation resent to ${result.customerEmail}${
          result.ownerEmailSent ? " (owner copy sent too)" : ""
        }.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend booking confirmation");
    } finally {
      setBusyRef("");
    }
  }

  async function handleRecover(checkoutId?: string) {
    setRecovering(true);
    setError("");
    setMessage("");
    try {
      const result = await finalizePaidCheckoutRecovery(ownerKey, {
        checkoutId,
        preferTestOnePound: true,
      });
      const primary = result.primary ?? result;
      if (!result.ok && !primary.ok) {
        throw new Error(primary.error || result.message || "Recovery did not complete");
      }
      setMessage(
        [
          result.message || `Recovery ${primary.action ?? "done"}`,
          primary.paymentReference ? `ref ${primary.paymentReference}` : "",
          primary.customerEmailSent ? "customer email ok" : "customer email not sent",
          primary.ownerEmailSent ? "bookings@ ok" : "bookings@ not sent",
          primary.calendarLogged ? "calendar ok" : "calendar not logged",
        ]
          .filter(Boolean)
          .join(" · "),
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not recover paid checkout");
    } finally {
      setRecovering(false);
    }
  }

  const latestPaid = bookings.find((booking) => booking.status !== "refunded") ?? null;
  const needsFinalize = pending.filter((item) => item.needsFinalize);

  return (
    <section className="mb-10 rounded-2xl border border-sky-400/25 bg-sky-500/5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-200">
            Website card payments
          </p>
          <h2 className="mt-1 text-xl font-bold text-white">Paid bookings (SumUp)</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/65">
            Customers who pay on the website appear here automatically. Use Resend booking
            confirmation if they did not get the invoice email. Recover finalizes a SumUp PAID
            checkout that never completed email/calendar (no new charge).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/30"
        >
          Refresh
        </button>
      </div>

      {needsFinalize.length > 0 ? (
        <div className="mt-5 rounded-xl border border-amber-400/35 bg-amber-500/10 p-4">
          <p className="text-sm text-white/85">
            {needsFinalize.length} SumUp PAID checkout
            {needsFinalize.length === 1 ? "" : "s"} waiting to finalize (email/calendar).
          </p>
          <ul className="mt-3 space-y-2 text-sm text-white/70">
            {needsFinalize.slice(0, 5).map((item) => (
              <li key={item.checkoutId}>
                £{item.amount.toFixed(2)} · {item.customerName} · {item.customerEmail}
                <button
                  type="button"
                  disabled={recovering}
                  onClick={() => void handleRecover(item.checkoutId)}
                  className="ml-2 text-emerald underline disabled:opacity-60"
                >
                  Finalize
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={recovering}
            onClick={() => void handleRecover()}
            className="mt-3 w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-amber-200 disabled:opacity-60 sm:w-auto"
          >
            {recovering ? "Recovering…" : "Recover PAID checkouts (no new charge)"}
          </button>
        </div>
      ) : null}

      {latestPaid ? (
        <div className="mt-5 rounded-xl border border-emerald/35 bg-emerald/10 p-4">
          <p className="text-sm text-white/80">
            Latest paid booking:{" "}
            <span className="font-semibold text-white">{latestPaid.customerName}</span>
            {latestPaid.amountPaid ? ` · ${latestPaid.amountPaid}` : ""} · {latestPaid.customerEmail}
          </p>
          <button
            type="button"
            disabled={busyRef === latestPaid.paymentReference}
            onClick={() => void handleResend(latestPaid)}
            className="mt-3 w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-emerald-light disabled:opacity-60 sm:w-auto"
          >
            {busyRef === latestPaid.paymentReference
              ? "Sending booking confirmation…"
              : "Resend booking confirmation"}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-emerald-light">
          {message}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-white/60">Loading paid bookings…</p>
      ) : bookings.length === 0 ? (
        <p className="mt-6 text-sm text-white/60">
          No website card payments found in the last 30 days. If a customer just paid, tap Refresh
          or use Recover if SumUp shows PAID.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {bookings.map((booking) => (
            <li
              key={booking.paymentReference}
              className="rounded-2xl border border-white/10 bg-navy/60 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-white">{booking.customerName}</p>
                  <p className="mt-1 text-sm text-white/65">
                    {booking.tripDate} · pick up {booking.tripTime}
                    {booking.amountPaid ? ` · ${booking.amountPaid}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-white/80">
                    {booking.pickupLabel} → {booking.dropoffLabel}
                  </p>
                  <p className="mt-2 text-xs text-white/45">
                    Ref {booking.paymentReference}
                    {booking.createdAt ? ` · paid ${formatUkInstant(booking.createdAt)}` : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                    booking.status === "refunded"
                      ? "border-red-400/30 bg-red-500/10 text-red-100"
                      : "border-emerald/40 bg-emerald/15 text-emerald"
                  }`}
                >
                  {booking.status === "refunded" ? "Refunded" : "Paid"}
                </span>
              </div>

              <dl className="mt-4 grid gap-2 text-sm text-white/70 sm:grid-cols-2">
                <div>
                  <dt className="text-white/40">Mobile</dt>
                  <dd>{booking.mobileNumber || "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/40">Email</dt>
                  <dd className="break-all">{booking.customerEmail || "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/40">Trip</dt>
                  <dd>{booking.tripLabel || "—"}</dd>
                </div>
                <div>
                  <dt className="text-white/40">Return</dt>
                  <dd>
                    {booking.returnJourney
                      ? `${booking.returnDate || "—"} · ${booking.returnTime || "—"}`
                      : "No"}
                  </dd>
                </div>
              </dl>

              {booking.status !== "refunded" ? (
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={busyRef === booking.paymentReference}
                    onClick={() => void handleResend(booking)}
                    className="w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy transition-colors hover:bg-emerald-light disabled:opacity-60 sm:w-auto"
                  >
                    {busyRef === booking.paymentReference
                      ? "Sending…"
                      : "Resend booking confirmation"}
                  </button>
                  {booking.customerEmail ? (
                    <a
                      href={`mailto:${encodeURIComponent(booking.customerEmail)}`}
                      className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
                    >
                      Email customer
                    </a>
                  ) : null}
                  {booking.mobileNumber ? (
                    <a
                      href={`https://wa.me/${booking.mobileNumber.replace(/\D/g, "").replace(/^0/, "44")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30"
                    >
                      WhatsApp
                    </a>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
