"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchOwnerAbandonedBookings,
  type AbandonedBookingOwnerView,
} from "@/lib/abandoned-bookings-api";

type OwnerAbandonedBookingsPanelProps = {
  ownerKey: string;
};

function statusClass(status: string): string {
  switch (status) {
    case "awaiting_reminder":
      return "border-amber-400/30 bg-amber-500/10 text-amber-100";
    case "reminder_sent":
      return "border-sky-400/30 bg-sky-500/10 text-sky-100";
    case "recovered":
      return "border-emerald/30 bg-emerald/10 text-emerald";
    case "opted_out":
      return "border-white/15 bg-white/5 text-white/60";
    default:
      return "border-white/15 bg-white/5 text-white/70";
  }
}

function formatWhen(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

export default function OwnerAbandonedBookingsPanel({
  ownerKey,
}: OwnerAbandonedBookingsPanelProps) {
  const [bookings, setBookings] = useState<AbandonedBookingOwnerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchOwnerAbandonedBookings(ownerKey, { limit: 40 });
      setBookings(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load abandoned bookings");
      setBookings([]);
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const awaiting = bookings.filter((b) => b.status === "awaiting_reminder").length;
  const reminded = bookings.filter((b) => b.status === "reminder_sent").length;
  const recovered = bookings.filter((b) => b.status === "recovered").length;

  return (
    <section
      className="mb-6 overflow-x-clip rounded-2xl border border-white/10 bg-navy-dark/40 p-4 sm:p-5"
      data-matni-abandoned-bookings-panel
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-white/70">
            Abandoned bookings
          </h2>
          <p className="mt-1 text-xs text-white/50">
            Incomplete bookings with a valid email — one recovery reminder after 1 hour if unpaid.
            These do not appear in Upcoming Jobs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/5"
        >
          Refresh
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full border px-2.5 py-1 ${statusClass("awaiting_reminder")}`}>
          Awaiting reminder · {awaiting}
        </span>
        <span className={`rounded-full border px-2.5 py-1 ${statusClass("reminder_sent")}`}>
          Reminder sent · {reminded}
        </span>
        <span className={`rounded-full border px-2.5 py-1 ${statusClass("recovered")}`}>
          Recovered · {recovered}
        </span>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-white/50">Loading…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-red-200">{error}</p>
      ) : bookings.length === 0 ? (
        <p className="mt-4 text-sm text-white/45">No abandoned bookings right now.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {bookings.map((booking) => (
            <li
              key={booking.token}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-white">
                  {booking.customerName || "Customer"}{" "}
                  <span className="font-normal text-white/55">· {booking.customerEmail}</span>
                </p>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(booking.status)}`}
                >
                  {booking.statusLabel}
                </span>
              </div>
              <p className="mt-1 text-xs text-white/65">
                {booking.pickupLabel} → {booking.dropoffLabel}
              </p>
              <p className="mt-1 text-xs text-white/50">
                {booking.tripDate || "Date TBD"}
                {booking.tripTime ? ` · ${booking.tripTime}` : ""}
                {booking.quotedAmountLabel ? ` · ${booking.quotedAmountLabel}` : ""}
              </p>
              <p className="mt-1 text-[11px] text-white/40">
                Captured {formatWhen(booking.createdAt)}
                {booking.reminderSentAt
                  ? ` · Reminder ${formatWhen(booking.reminderSentAt)}`
                  : ` · Due ${formatWhen(booking.reminderDueAt)}`}
                {booking.recoveredAt ? ` · Recovered ${formatWhen(booking.recoveredAt)}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
