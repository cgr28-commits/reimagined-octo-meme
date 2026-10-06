"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDisplayTripDate } from "../../shared/upcoming-jobs";
import type { DriverPayMethod } from "../../shared/driver-pay-ledger";
import {
  fetchOwnerDriverPayments,
  recordDriverAsPaid,
  type DriverPayOutstandingItem,
  type DriverPayPeriod,
  type OwnerDriverPaySummary,
} from "@/lib/driver-pay-api";

type OwnerDriverPaymentsPanelProps = {
  ownerKey: string;
};

const PERIODS: DriverPayPeriod[] = ["week", "month", "year"];

function legLabel(leg: "outbound" | "return" | undefined): string {
  if (leg === "return") return "Return";
  if (leg === "outbound") return "Outbound";
  return "";
}

function OutstandingPaymentRow({
  item,
  ownerKey,
  onRecorded,
}: {
  item: DriverPayOutstandingItem;
  ownerKey: string;
  onRecorded: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<DriverPayMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const leg = legLabel(item.journeyLeg);

  async function confirmRecord() {
    setBusy(true);
    setError("");
    try {
      await recordDriverAsPaid(ownerKey, {
        token: item.token,
        method,
        reference,
      });
      setOpen(false);
      setReference("");
      await onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-white/10 bg-navy/50 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white">
            {formatDisplayTripDate(item.tripDate)}
            {leg ? ` · ${leg}` : ""} · {item.driverName}
          </p>
          <p className="mt-0.5 text-white/60">
            {item.pickupLabel} → {item.dropoffLabel}
          </p>
          {item.bookingReference ? (
            <p className="mt-0.5 text-xs text-white/40">{item.bookingReference}</p>
          ) : null}
        </div>
        <p className="font-bold tabular-nums text-white">{item.amountLabel}</p>
      </div>
      {error ? <p className="mt-2 text-sm text-red-100">{error}</p> : null}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="mt-2 min-h-10 rounded-lg border border-emerald/40 px-3 py-1.5 text-xs font-bold text-emerald"
      >
        Record driver as paid
      </button>
      {open ? (
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
              onClick={() => setOpen(false)}
              className="min-h-10 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default function OwnerDriverPaymentsPanel({ ownerKey }: OwnerDriverPaymentsPanelProps) {
  const [period, setPeriod] = useState<DriverPayPeriod>("month");
  const [summary, setSummary] = useState<OwnerDriverPaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSummary(await fetchOwnerDriverPayments(ownerKey, period));
    } catch (err) {
      setSummary(null);
      setError(err instanceof Error ? err.message : "Could not load driver payments");
    } finally {
      setLoading(false);
    }
  }, [ownerKey, period]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mb-3 rounded-xl border border-white/10 bg-navy/40 p-4" aria-label="Driver payments">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">Driver payments</h2>
        <div className="flex gap-1">
          {PERIODS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriod(key)}
              className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${
                period === key ? "bg-emerald text-navy" : "border border-white/15 text-white/70"
              }`}
            >
              {key === "week" ? "Week" : key === "month" ? "Month" : "Year"}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/45">
        Outstanding is completed journeys that are still unpaid. Paid is what you have recorded in{" "}
        {summary?.periodLabel.toLowerCase() ?? "this period"}. These are driver pay records, not
        customer revenue or profit.
      </p>
      {error ? (
        <p className="mt-3 text-sm text-amber-100">
          {error}{" "}
          <button type="button" onClick={() => void load()} className="underline">
            Retry
          </button>
        </p>
      ) : null}
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-navy/50 px-3 py-3">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
            Outstanding driver pay
          </dt>
          <dd className="mt-1 text-xl font-bold tabular-nums text-white">
            {loading && !summary ? "—" : summary?.outstandingLabel ?? "£0.00"}
          </dd>
        </div>
        <div className="rounded-xl border border-white/10 bg-navy/50 px-3 py-3">
          <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
            Driver pay recorded as paid
          </dt>
          <dd className="mt-1 text-xl font-bold tabular-nums text-emerald">
            {loading && !summary ? "—" : summary?.paidLabel ?? "£0.00"}
          </dd>
          <p className="mt-1 text-xs text-white/40">{summary?.periodLabel ?? "This month"}</p>
        </div>
      </dl>
      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-white/45">
        Outstanding payments
      </h3>
      {loading && !summary ? (
        <p className="mt-2 text-sm text-white/45">Loading…</p>
      ) : summary && summary.outstanding.length === 0 ? (
        <p className="mt-2 text-sm text-white/50">No completed journeys are currently unpaid.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {summary?.outstanding.map((item) => (
            <OutstandingPaymentRow
              key={item.token}
              item={item}
              ownerKey={ownerKey}
              onRecorded={load}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
