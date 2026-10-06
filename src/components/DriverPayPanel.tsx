"use client";

import { useState } from "react";
import {
  driverPayMethodLabel,
  driverPayStatusText,
  formatDriverPayPaidAt,
  type DriverPayMethod,
} from "../../shared/driver-pay-ledger";
import { correctDriverPayToUnpaid, recordDriverAsPaid } from "@/lib/driver-pay-api";
import type { DriverJob } from "@/lib/tracking-api";

type DriverPayPanelProps = {
  job: DriverJob;
  isOwner: boolean;
  ownerKey: string;
  onUpdated: (job: DriverJob) => void;
};

export default function DriverPayPanel({ job, isOwner, ownerKey, onUpdated }: DriverPayPanelProps) {
  const amount = job.driverPayAmount?.trim();
  const status = job.driverPayStatus;
  const statusText = driverPayStatusText(status);
  const [recordOpen, setRecordOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [method, setMethod] = useState<DriverPayMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!amount) return null;

  const paidLine =
    status === "paid" && job.driverPayPaidAt
      ? `Paid ${formatDriverPayPaidAt(job.driverPayPaidAt)}`
      : "";
  const methodLine = isOwner ? driverPayMethodLabel(job.driverPayMethod) : undefined;
  const canRecord = isOwner && status === "unpaid" && job.journeyStatus === "completed";
  const canCorrect = isOwner && status === "paid";

  async function confirmRecord() {
    setBusy(true);
    setError("");
    try {
      const result = await recordDriverAsPaid(ownerKey, {
        token: job.token,
        method,
        reference,
      });
      if (result.job) onUpdated(result.job);
      setRecordOpen(false);
      setReference("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCorrect() {
    setBusy(true);
    setError("");
    try {
      const result = await correctDriverPayToUnpaid(ownerKey, job.token);
      onUpdated(result.job);
      setCorrectOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the payment record");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      {isOwner ? (
        <p className="text-sm text-white/70">
          Driver pay: {amount}
          {statusText ? ` · ${statusText}` : ""}
        </p>
      ) : (
        <>
          <p className="text-base font-bold text-emerald">Your pay: {amount}</p>
          {statusText ? (
            <p className="mt-1 text-sm text-white/70">Payment status: {statusText === "UNPAID" ? "Unpaid" : statusText === "PAID" ? "Paid" : statusText}</p>
          ) : null}
        </>
      )}
      {paidLine ? <p className="mt-1 text-sm text-white/60">{paidLine}</p> : null}
      {methodLine ? <p className="mt-1 text-sm text-white/50">{methodLine}</p> : null}
      {isOwner && job.driverPayProviderReference ? (
        <p className="mt-1 text-xs text-white/40">Reference {job.driverPayProviderReference}</p>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-100">{error}</p> : null}
      {canRecord ? (
        <button
          type="button"
          onClick={() => {
            setCorrectOpen(false);
            setRecordOpen((open) => !open);
          }}
          className="mt-2 min-h-10 rounded-lg border border-emerald/40 px-3 py-1.5 text-xs font-bold text-emerald"
        >
          Record driver as paid
        </button>
      ) : null}
      {recordOpen ? (
        <div className="mt-3 rounded-xl border border-white/15 bg-navy/60 p-3">
          <p className="text-sm text-white/80">
            This records a payment you have already made. It does not send money to the driver.
          </p>
          <label className="mt-3 block text-xs text-white/50">
            Payment method
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value as DriverPayMethod)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-navy px-3 py-2 text-sm text-white"
            >
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash">Cash</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="mt-3 block text-xs text-white/50">
            Payment reference (optional)
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-navy px-3 py-2 text-sm text-white"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmRecord()}
              className="min-h-10 rounded-lg bg-emerald px-3 py-1.5 text-xs font-bold text-navy disabled:opacity-60"
            >
              {busy ? "Saving…" : "Confirm payment record"}
            </button>
            <button
              type="button"
              onClick={() => setRecordOpen(false)}
              className="min-h-10 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {canCorrect ? (
        <button
          type="button"
          onClick={() => {
            setRecordOpen(false);
            setCorrectOpen((open) => !open);
          }}
          className="mt-2 min-h-10 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70"
        >
          Mark as unpaid
        </button>
      ) : null}
      {correctOpen ? (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
          <p className="text-sm text-amber-50">
            Use this only to correct a payment record entered by mistake. This does not reverse or recover a real payment.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirmCorrect()}
              className="min-h-10 rounded-lg bg-amber-200 px-3 py-1.5 text-xs font-bold text-navy disabled:opacity-60"
            >
              {busy ? "Saving…" : "Confirm mark as unpaid"}
            </button>
            <button
              type="button"
              onClick={() => setCorrectOpen(false)}
              className="min-h-10 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
