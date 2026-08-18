"use client";

import { useMemo, useState } from "react";
import {
  REFUND_REASON_CATEGORIES,
  REFUND_REASON_LABELS,
  generateRefundOpId,
  isWithin24HoursOfPickup,
  ownerNotesRequired,
  parseMoneyLabelToNumber,
  remainingRefundableBalance,
  roundGbp,
  type RefundActionKind,
  type RefundReasonCategory,
} from "../../shared/refund-ops";
import { formatDisplayTripDate } from "../../shared/upcoming-jobs";
import {
  processBookingRefundOrCancel,
  type RefundIssueResponse,
} from "@/lib/refund-api";
import type { OwnerPaidBookingSummary } from "@/lib/paid-bookings-api";

export type CancelRefundActionChoice =
  | "cancel_full_refund"
  | "cancel_partial_refund"
  | "cancel_no_refund"
  | "partial_refund_keep_active"
  | "full_refund_choice";

type OwnerCancelRefundModalProps = {
  ownerKey: string;
  booking: OwnerPaidBookingSummary;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onSuccess: (result: RefundIssueResponse, booking: OwnerPaidBookingSummary) => void;
  onError: (message: string) => void;
};

const ACTION_OPTIONS: {
  id: CancelRefundActionChoice;
  label: string;
  hint: string;
}[] = [
  {
    id: "cancel_full_refund",
    label: "Cancel booking + full refund",
    hint: "Cancels calendar/tracking and refunds the remaining balance via SumUp.",
  },
  {
    id: "cancel_partial_refund",
    label: "Cancel booking + partial refund",
    hint: "Cancels the booking and refunds a chosen GBP amount (up to the remaining balance).",
  },
  {
    id: "cancel_no_refund",
    label: "Cancel booking without refund",
    hint: "Cancels operationally. Does not call SumUp.",
  },
  {
    id: "partial_refund_keep_active",
    label: "Partial refund only — booking stays active",
    hint: "Refunds money only. Calendar and tracking stay active.",
  },
  {
    id: "full_refund_choice",
    label: "Full refund only",
    hint: "Refunds the remaining balance. You must choose whether to also cancel the booking.",
  },
];

function amountPaidNumber(booking: OwnerPaidBookingSummary): number {
  return parseMoneyLabelToNumber(booking.amountPaid) ?? 0;
}

function amountRefundedNumber(booking: OwnerPaidBookingSummary): number {
  if (typeof booking.amountRefunded === "number") return roundGbp(booking.amountRefunded);
  if (booking.status === "refunded") return amountPaidNumber(booking);
  return 0;
}

export default function OwnerCancelRefundModal({
  ownerKey,
  booking,
  busy,
  onBusyChange,
  onClose,
  onSuccess,
  onError,
}: OwnerCancelRefundModalProps) {
  const paid = amountPaidNumber(booking);
  const refunded = amountRefundedNumber(booking);
  const remaining = remainingRefundableBalance(paid, refunded);
  const within24h = isWithin24HoursOfPickup(booking.tripDate, booking.tripTime);

  const [actionChoice, setActionChoice] = useState<CancelRefundActionChoice>("cancel_full_refund");
  const [fullRefundAlsoCancel, setFullRefundAlsoCancel] = useState(true);
  const [partialAmount, setPartialAmount] = useState("");
  const [reasonCategory, setReasonCategory] =
    useState<RefundReasonCategory>("customer_cancelled_over_24h");
  const [ownerNotes, setOwnerNotes] = useState("");
  const [customerFacingReason, setCustomerFacingReason] = useState("");
  const [confirmOwnerKey, setConfirmOwnerKey] = useState("");
  const [finalConfirm, setFinalConfirm] = useState(false);
  const [idempotencyKey] = useState(() => `ui-${generateRefundOpId()}`);

  const resolved = useMemo(() => {
    const cancelBooking =
      actionChoice === "cancel_full_refund" ||
      actionChoice === "cancel_partial_refund" ||
      actionChoice === "cancel_no_refund" ||
      (actionChoice === "full_refund_choice" && fullRefundAlsoCancel);

    let actionKind: RefundActionKind;
    let refundFullRemaining = false;
    let amount: number | null = null;

    if (actionChoice === "cancel_full_refund") {
      actionKind = "cancel_full_refund";
      refundFullRemaining = true;
    } else if (actionChoice === "cancel_no_refund") {
      actionKind = "cancel_no_refund";
    } else if (actionChoice === "cancel_partial_refund") {
      actionKind = "cancel_partial_refund";
      amount = Number(partialAmount);
    } else if (actionChoice === "partial_refund_keep_active") {
      actionKind = "partial_refund_keep_active";
      amount = Number(partialAmount);
    } else if (fullRefundAlsoCancel) {
      actionKind = "full_refund_and_cancel";
      refundFullRemaining = true;
    } else {
      actionKind = "full_refund_keep_active";
      refundFullRemaining = true;
    }

    const refundAmount =
      actionChoice === "cancel_no_refund"
        ? 0
        : refundFullRemaining
          ? remaining
          : Number.isFinite(amount) && (amount as number) > 0
            ? roundGbp(amount as number)
            : 0;

    return { cancelBooking, actionKind, refundFullRemaining, amount, refundAmount };
  }, [actionChoice, fullRefundAlsoCancel, partialAmount, remaining]);

  const notesNeeded = ownerNotesRequired({
    reasonCategory,
    refundAmount: resolved.refundAmount,
    refundFullRemaining: resolved.refundFullRemaining,
    within24h,
  });

  const needsPartialAmount =
    actionChoice === "cancel_partial_refund" || actionChoice === "partial_refund_keep_active";

  const confirmPhrase =
    resolved.refundAmount > 0
      ? `Refund £${resolved.refundAmount.toFixed(2)} to the original payment method for booking ${booking.paymentReference}?`
      : `Cancel booking ${booking.paymentReference} without a SumUp refund?`;

  async function submit() {
    if (busy) return;
    if (!confirmOwnerKey.trim()) {
      onError("Re-enter OWNER_ACCESS_KEY to confirm this action.");
      return;
    }
    if (!finalConfirm) {
      onError("Tick the final confirmation box before continuing.");
      return;
    }
    if (needsPartialAmount) {
      const n = Number(partialAmount);
      if (!Number.isFinite(n) || n <= 0) {
        onError("Partial refund amount must be greater than £0.");
        return;
      }
      if (n > remaining + 0.001) {
        onError(`Amount cannot exceed the remaining refundable balance of £${remaining.toFixed(2)}.`);
        return;
      }
    }
    if (notesNeeded && !ownerNotes.trim()) {
      onError("Owner notes are required for this refund/cancellation.");
      return;
    }
    if (actionChoice === "full_refund_choice" && resolved.refundAmount <= 0) {
      onError("Nothing left to refund on this booking.");
      return;
    }

    onBusyChange(true);
    try {
      const result = await processBookingRefundOrCancel({
        ownerKey,
        confirmOwnerKey,
        paymentReference: booking.paymentReference,
        trackingToken: booking.trackingToken,
        actionKind: resolved.actionKind,
        cancelBooking: resolved.cancelBooking,
        refundFullRemaining: resolved.refundFullRemaining,
        amount: resolved.amount,
        reasonCategory,
        ownerNotes,
        customerFacingReason,
        idempotencyKey,
      });
      if (!result.ok && !result.alreadyProcessed && !result.alreadyRefunded) {
        throw new Error(result.error || "Refund / cancellation failed");
      }
      onSuccess(result, booking);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not process refund / cancellation");
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-red-100">Cancel / Refund</p>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="text-xs font-semibold text-red-100/70 underline disabled:opacity-60"
        >
          Close
        </button>
      </div>

      <dl className="mt-3 grid gap-2 text-sm text-red-100/90 sm:grid-cols-2">
        <div>
          <dt className="text-red-100/55">Booking reference</dt>
          <dd className="break-all font-semibold">{booking.paymentReference}</dd>
        </div>
        <div>
          <dt className="text-red-100/55">Customer</dt>
          <dd>{booking.customerName}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-red-100/55">Journey</dt>
          <dd>
            {booking.pickupLabel} → {booking.dropoffLabel}
          </dd>
        </div>
        <div>
          <dt className="text-red-100/55">Pickup</dt>
          <dd>
            {formatDisplayTripDate(booking.tripDate)} · {booking.tripTime || "—"}
            {within24h ? (
              <span className="ml-2 text-xs text-amber-200">(within 24 hours)</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-red-100/55">Status</dt>
          <dd className="uppercase tracking-wider">{booking.status}</dd>
        </div>
        <div>
          <dt className="text-red-100/55">Original paid</dt>
          <dd>{booking.amountPaid || `£${paid.toFixed(2)}`}</dd>
        </div>
        <div>
          <dt className="text-red-100/55">Already refunded</dt>
          <dd>£{refunded.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="text-red-100/55">Remaining refundable</dt>
          <dd className="font-semibold">£{remaining.toFixed(2)}</dd>
        </div>
      </dl>

      <fieldset className="mt-4 space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wider text-red-100/55">
          Action
        </legend>
        {ACTION_OPTIONS.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-red-400/20 bg-navy/40 px-3 py-2"
          >
            <input
              type="radio"
              name={`refund-action-${booking.paymentReference}`}
              checked={actionChoice === option.id}
              disabled={busy}
              onChange={() => setActionChoice(option.id)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-semibold text-red-50">{option.label}</span>
              <span className="block text-xs text-red-100/60">{option.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {actionChoice === "full_refund_choice" ? (
        <fieldset className="mt-3 space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wider text-red-100/55">
            Also cancel booking?
          </legend>
          <label className="flex items-center gap-2 text-sm text-red-50">
            <input
              type="radio"
              checked={fullRefundAlsoCancel}
              disabled={busy}
              onChange={() => setFullRefundAlsoCancel(true)}
            />
            Yes — cancel booking (calendar + tracking)
          </label>
          <label className="flex items-center gap-2 text-sm text-red-50">
            <input
              type="radio"
              checked={!fullRefundAlsoCancel}
              disabled={busy}
              onChange={() => setFullRefundAlsoCancel(false)}
            />
            No — refund money only; keep booking active
          </label>
        </fieldset>
      ) : null}

      {needsPartialAmount ? (
        <label className="mt-3 block text-sm text-red-50">
          Partial refund amount (GBP)
          <input
            type="number"
            min="0.01"
            step="0.01"
            max={remaining}
            value={partialAmount}
            disabled={busy}
            onChange={(event) => setPartialAmount(event.target.value)}
            className="mt-1 w-full rounded-lg border border-white/15 bg-navy px-3 py-2 text-white"
            placeholder={`Max £${remaining.toFixed(2)}`}
          />
        </label>
      ) : null}

      <label className="mt-3 block text-sm text-red-50">
        Reason
        <select
          value={reasonCategory}
          disabled={busy}
          onChange={(event) =>
            setReasonCategory(event.target.value as RefundReasonCategory)
          }
          className="mt-1 w-full rounded-lg border border-white/15 bg-navy px-3 py-2 text-white"
        >
          {REFUND_REASON_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {REFUND_REASON_LABELS[category]}
            </option>
          ))}
        </select>
      </label>

      <label className="mt-3 block text-sm text-red-50">
        Owner notes{notesNeeded ? " (required)" : " (optional)"}
        <textarea
          value={ownerNotes}
          disabled={busy}
          onChange={(event) => setOwnerNotes(event.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-white/15 bg-navy px-3 py-2 text-white"
          placeholder="Internal only — not shown to the customer unless you mark a customer-facing reason below."
        />
      </label>

      <label className="mt-3 block text-sm text-red-50">
        Customer-facing reason (optional)
        <input
          type="text"
          value={customerFacingReason}
          disabled={busy}
          onChange={(event) => setCustomerFacingReason(event.target.value)}
          className="mt-1 w-full rounded-lg border border-white/15 bg-navy px-3 py-2 text-white"
          placeholder="Shown in customer email if provided"
        />
      </label>

      <label className="mt-3 block text-sm text-red-50">
        Re-enter OWNER_ACCESS_KEY
        <input
          type="password"
          autoComplete="off"
          value={confirmOwnerKey}
          disabled={busy}
          onChange={(event) => setConfirmOwnerKey(event.target.value)}
          className="mt-1 w-full rounded-lg border border-white/15 bg-navy px-3 py-2 text-white"
          placeholder="Required for every refund / cancellation"
        />
      </label>

      <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3">
        <p className="text-sm font-semibold text-amber-100">{confirmPhrase}</p>
        <label className="mt-2 flex items-start gap-2 text-sm text-amber-50">
          <input
            type="checkbox"
            checked={finalConfirm}
            disabled={busy}
            onChange={(event) => setFinalConfirm(event.target.checked)}
            className="mt-1"
          />
          <span>I confirm this action. Money moves only after SumUp accepts a refund.</span>
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="min-h-11 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 disabled:opacity-60"
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy || !finalConfirm || !confirmOwnerKey.trim()}
          onClick={() => void submit()}
          className="min-h-11 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-60"
        >
          {busy ? "Processing…" : "Confirm action"}
        </button>
      </div>
    </div>
  );
}
