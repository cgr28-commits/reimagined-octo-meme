"use client";

import { useMemo, useState } from "react";
import { formatDisplayTripDate } from "../../shared/upcoming-jobs";
import {
  editOwnerPaidBooking,
  type OwnerEditBookingInput,
  type OwnerPaidBookingSummary,
} from "@/lib/paid-bookings-api";

type EditFormState = {
  tripDate: string;
  tripTime: string;
  pickupLabel: string;
  dropoffLabel: string;
  customerName: string;
  customerEmail: string;
  mobileNumber: string;
  flightNumber: string;
  returnFlightNumber: string;
  passengers: string;
  suitcases: string;
  childSeats: string;
  childSeatNotes: string;
  notes: string;
  returnJourney: boolean;
  returnDate: string;
  returnTime: string;
};

type DiffRow = { label: string; from: string; to: string };

function formFromBooking(booking: OwnerPaidBookingSummary): EditFormState {
  return {
    tripDate: booking.tripDate || "",
    tripTime: booking.tripTime || "",
    pickupLabel: booking.pickupLabel || "",
    dropoffLabel: booking.dropoffLabel || "",
    customerName: booking.customerName || "",
    customerEmail: booking.customerEmail || "",
    mobileNumber: booking.mobileNumber || "",
    flightNumber: booking.flightNumber || "",
    returnFlightNumber: booking.returnFlightNumber || "",
    passengers: String(booking.passengers ?? 1),
    suitcases: String(booking.suitcases ?? 0),
    childSeats: String(booking.childSeats ?? 0),
    childSeatNotes: booking.childSeatNotes || "",
    notes: booking.notes || "",
    returnJourney: Boolean(booking.returnJourney),
    returnDate: booking.returnDate || "",
    returnTime: booking.returnTime || "",
  };
}

function buildDiffs(original: EditFormState, next: EditFormState): DiffRow[] {
  const rows: DiffRow[] = [];
  const push = (label: string, from: string, to: string) => {
    if (from.trim() === to.trim()) return;
    rows.push({ label, from: from || "—", to: to || "—" });
  };
  push("Pickup date", formatDisplayTripDate(original.tripDate), formatDisplayTripDate(next.tripDate));
  push("Pickup time", original.tripTime, next.tripTime);
  push("Pickup", original.pickupLabel, next.pickupLabel);
  push("Destination", original.dropoffLabel, next.dropoffLabel);
  push("Customer name", original.customerName, next.customerName);
  push("Customer email", original.customerEmail, next.customerEmail);
  push("Customer mobile", original.mobileNumber, next.mobileNumber);
  push("Flight number", original.flightNumber, next.flightNumber);
  push("Passengers", original.passengers, next.passengers);
  push("Luggage", original.suitcases, next.suitcases);
  push("Child seats", original.childSeats, next.childSeats);
  push("Child-seat notes", original.childSeatNotes, next.childSeatNotes);
  push("Notes", original.notes, next.notes);
  push(
    "Return journey",
    original.returnJourney ? "Yes" : "No",
    next.returnJourney ? "Yes" : "No",
  );
  if (next.returnJourney || original.returnJourney) {
    push("Return date", formatDisplayTripDate(original.returnDate), formatDisplayTripDate(next.returnDate));
    push("Return time", original.returnTime, next.returnTime);
    push("Return flight", original.returnFlightNumber, next.returnFlightNumber);
  }
  return rows;
}

function fieldClass(): string {
  return "mt-1 w-full rounded-xl border border-white/15 bg-navy/80 px-3 py-3 text-base text-white outline-none focus:border-emerald/50";
}

type OwnerEditBookingModalProps = {
  ownerKey: string;
  booking: OwnerPaidBookingSummary;
  onClose: () => void;
  onSaved: (updated: OwnerPaidBookingSummary, extras: {
    fareMayNeedManualAdjustment?: boolean;
    fareAdjustmentMessage?: string;
    offerUpdatedConfirmation?: boolean;
  }) => void;
  onError: (message: string) => void;
};

export default function OwnerEditBookingModal({
  ownerKey,
  booking,
  onClose,
  onSaved,
  onError,
}: OwnerEditBookingModalProps) {
  const original = useMemo(() => formFromBooking(booking), [booking]);
  const [form, setForm] = useState<EditFormState>(original);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [keepAgreedFare, setKeepAgreedFare] = useState(false);

  const diffs = useMemo(() => buildDiffs(original, form), [original, form]);
  const fareSensitive = diffs.some((row) =>
    [
      "Pickup date",
      "Pickup time",
      "Pickup",
      "Destination",
      "Passengers",
      "Luggage",
      "Child seats",
      "Return journey",
      "Return date",
      "Return time",
    ].includes(row.label),
  );
  const currentAgreedFareLabel = booking.amountPaid || "";
  const currentAgreedFareNumber = (() => {
    const n = Number(String(booking.amountPaid || "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  })();

  function update<K extends keyof EditFormState>(key: K, value: EditFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(sendUpdatedConfirmation: boolean) {
    setBusy(true);
    onError("");
    try {
      const payload: OwnerEditBookingInput = {
        paymentReference: booking.paymentReference,
        tripDate: form.tripDate.trim(),
        tripTime: form.tripTime.trim(),
        pickupLabel: form.pickupLabel.trim(),
        dropoffLabel: form.dropoffLabel.trim(),
        customerName: form.customerName.trim(),
        customerEmail: form.customerEmail.trim(),
        mobileNumber: form.mobileNumber.trim(),
        flightNumber: form.flightNumber.trim(),
        returnFlightNumber: form.returnFlightNumber.trim(),
        passengers: Number(form.passengers) || 1,
        suitcases: Number(form.suitcases) || 0,
        childSeats: Number(form.childSeats) || 0,
        childSeatNotes: form.childSeatNotes.trim(),
        notes: form.notes.trim(),
        returnJourney: form.returnJourney,
        returnDate: form.returnDate.trim(),
        returnTime: form.returnTime.trim(),
        keepAgreedFare: fareSensitive ? keepAgreedFare : false,
        agreedFare: currentAgreedFareNumber,
        sendUpdatedConfirmation,
      };
      const result = await editOwnerPaidBooking(ownerKey, payload);
      if (!result.ok || !result.booking) {
        throw new Error(result.error || "Could not save booking changes");
      }
      onSaved(
        {
          ...booking,
          ...result.booking,
          amountPaid: result.booking.amountPaid || booking.amountPaid,
          trackingToken: booking.trackingToken,
          trackUrl: booking.trackUrl,
          journeyStatus: booking.journeyStatus,
          sharingActive: booking.sharingActive,
          assignedDriverLabel: booking.assignedDriverLabel,
        },
        {
          fareMayNeedManualAdjustment: result.fareMayNeedManualAdjustment,
          fareAdjustmentMessage: result.fareAdjustmentMessage,
          offerUpdatedConfirmation: !sendUpdatedConfirmation,
        },
      );
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save booking changes");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit booking"
        className="max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-navy p-4 shadow-2xl sm:rounded-2xl sm:p-5"
      >
        {!confirmOpen ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
                  Edit Booking
                </p>
                <h3 className="mt-1 text-lg font-bold text-white">{booking.customerName}</h3>
                <p className="mt-1 break-all text-xs text-white/45">
                  Ref {booking.paymentReference} · payment preserved
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="text-sm text-white/70">
                Pickup date
                <input
                  type="date"
                  value={form.tripDate}
                  onChange={(e) => update("tripDate", e.target.value)}
                  className={fieldClass()}
                />
              </label>
              <label className="text-sm text-white/70">
                Pickup time
                <input
                  type="time"
                  value={form.tripTime}
                  onChange={(e) => update("tripTime", e.target.value)}
                  className={fieldClass()}
                />
              </label>
              <label className="text-sm text-white/70">
                Pickup address
                <textarea
                  rows={2}
                  value={form.pickupLabel}
                  onChange={(e) => update("pickupLabel", e.target.value)}
                  className={fieldClass()}
                />
              </label>
              <label className="text-sm text-white/70">
                Destination
                <textarea
                  rows={2}
                  value={form.dropoffLabel}
                  onChange={(e) => update("dropoffLabel", e.target.value)}
                  className={fieldClass()}
                />
              </label>
              <label className="text-sm text-white/70">
                Customer name
                <input
                  value={form.customerName}
                  onChange={(e) => update("customerName", e.target.value)}
                  className={fieldClass()}
                />
              </label>
              <label className="text-sm text-white/70">
                Customer email
                <input
                  type="email"
                  value={form.customerEmail}
                  onChange={(e) => update("customerEmail", e.target.value)}
                  className={fieldClass()}
                />
              </label>
              <label className="text-sm text-white/70">
                Customer mobile
                <input
                  type="tel"
                  value={form.mobileNumber}
                  onChange={(e) => update("mobileNumber", e.target.value)}
                  className={fieldClass()}
                />
              </label>
              <label className="text-sm text-white/70">
                Flight number
                <input
                  value={form.flightNumber}
                  onChange={(e) => update("flightNumber", e.target.value)}
                  className={fieldClass()}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-white/70">
                  Passengers
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={form.passengers}
                    onChange={(e) => update("passengers", e.target.value)}
                    className={fieldClass()}
                  />
                </label>
                <label className="text-sm text-white/70">
                  Luggage
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={form.suitcases}
                    onChange={(e) => update("suitcases", e.target.value)}
                    className={fieldClass()}
                  />
                </label>
              </div>
              <label className="text-sm text-white/70">
                Child seats
                <input
                  type="number"
                  min={0}
                  max={8}
                  value={form.childSeats}
                  onChange={(e) => update("childSeats", e.target.value)}
                  className={fieldClass()}
                />
              </label>
              <label className="text-sm text-white/70">
                Child-seat requirements
                <input
                  value={form.childSeatNotes}
                  onChange={(e) => update("childSeatNotes", e.target.value)}
                  className={fieldClass()}
                />
              </label>
              <label className="text-sm text-white/70">
                Booking / journey notes
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  className={fieldClass()}
                />
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={form.returnJourney}
                  onChange={(e) => update("returnJourney", e.target.checked)}
                  className="h-5 w-5"
                />
                Return journey
              </label>
              {form.returnJourney ? (
                <>
                  <label className="text-sm text-white/70">
                    Return date
                    <input
                      type="date"
                      value={form.returnDate}
                      onChange={(e) => update("returnDate", e.target.value)}
                      className={fieldClass()}
                    />
                  </label>
                  <label className="text-sm text-white/70">
                    Return time
                    <input
                      type="time"
                      value={form.returnTime}
                      onChange={(e) => update("returnTime", e.target.value)}
                      className={fieldClass()}
                    />
                  </label>
                  <label className="text-sm text-white/70">
                    Return flight
                    <input
                      value={form.returnFlightNumber}
                      onChange={(e) => update("returnFlightNumber", e.target.value)}
                      className={fieldClass()}
                    />
                  </label>
                </>
              ) : null}
            </div>

            {fareSensitive ? (
              <div className="mt-4 space-y-3 rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
                <p>
                  Material journey changes are re-priced on the server. Current agreed fare:{" "}
                  <span className="font-semibold text-white">
                    {currentAgreedFareLabel || "see booking"}
                  </span>
                  .
                </p>
                <p className="text-amber-100/85">
                  By default the booking fare is updated to the server-calculated amount. No
                  automatic SumUp charge or refund runs from this screen.
                </p>
                <label className="flex items-start gap-2 text-amber-50">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={keepAgreedFare}
                    onChange={(e) => setKeepAgreedFare(e.target.checked)}
                  />
                  <span>
                    Keep current agreed fare
                    {currentAgreedFareLabel ? ` (${currentAgreedFareLabel})` : ""} — record
                    server-calculated fare in amendment history only
                  </span>
                </label>
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                disabled={busy || diffs.length === 0}
                onClick={() => setConfirmOpen(true)}
                className="min-h-12 w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy disabled:opacity-50 sm:flex-1"
              >
                Review changes
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-12 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white sm:w-auto"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
              Confirm Booking Changes
            </p>
            <h3 className="mt-1 text-lg font-bold text-white">Review before saving</h3>
            <ul className="mt-4 space-y-3">
              {diffs.map((row) => (
                <li key={row.label} className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-xs uppercase tracking-wider text-white/40">{row.label}</p>
                  <p className="mt-1 break-words text-sm text-white/70">
                    {row.from} → <span className="font-semibold text-white">{row.to}</span>
                  </p>
                </li>
              ))}
            </ul>
            {fareSensitive ? (
              <div className="mt-4 space-y-2 text-sm text-amber-100">
                <p>
                  Server will calculate the authoritative amended fare. Current agreed fare:{" "}
                  <span className="font-semibold text-white">
                    {currentAgreedFareLabel || "unchanged"}
                  </span>
                  .
                </p>
                <p>
                  {keepAgreedFare
                    ? "Agreed fare will be kept; calculated fare is recorded for audit."
                    : "Booking fare will be updated to the server-calculated amount (no automatic payment)."}
                </p>
              </div>
            ) : null}
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void save(false)}
                className="min-h-12 w-full rounded-xl bg-emerald px-4 py-3 text-sm font-bold text-navy disabled:opacity-60"
              >
                {busy ? "Saving…" : "Confirm Changes (email customer)"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmOpen(false)}
                className="min-h-12 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
