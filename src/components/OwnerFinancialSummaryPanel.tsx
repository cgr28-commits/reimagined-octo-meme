"use client";

import { useCallback, useEffect, useState } from "react";
import {
  formatGbpAmount,
  type OwnerFinancialBucket,
  type OwnerFinancialPeriodKey,
} from "../../shared/owner-financial-summary";
import { formatDisplayTripDate } from "../../shared/upcoming-jobs";
import {
  fetchOwnerFinancialSummary,
  type OwnerFinancialSummaryResponse,
} from "@/lib/paid-bookings-api";

type OwnerFinancialSummaryPanelProps = {
  ownerKey: string;
  /** Bump to force a reload after refunds / marks. */
  refreshToken?: number;
};

const CARD_ORDER: OwnerFinancialPeriodKey[] = ["week", "month", "year", "refunds"];

function bucketTitle(key: OwnerFinancialPeriodKey): string {
  switch (key) {
    case "week":
      return "This week";
    case "month":
      return "This month";
    case "year":
      return "This year";
    case "refunds":
      return "Refunds";
  }
}

function countText(bucket: OwnerFinancialBucket): string {
  const n = bucket.count;
  if (bucket.key === "refunds") {
    return `${n} refund${n === 1 ? "" : "s"}`;
  }
  return `${n} booking${n === 1 ? "" : "s"}`;
}

export default function OwnerFinancialSummaryPanel({
  ownerKey,
  refreshToken = 0,
}: OwnerFinancialSummaryPanelProps) {
  const [summary, setSummary] = useState<OwnerFinancialSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<OwnerFinancialPeriodKey | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchOwnerFinancialSummary(ownerKey);
      setSummary(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load financial totals");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const buckets: OwnerFinancialBucket[] | null = summary
    ? CARD_ORDER.map((key) => summary[key])
    : null;

  return (
    <section className="mb-6" aria-label="Financial totals">
      {loading && !summary ? (
        <p className="text-sm text-white/50">Loading financial totals…</p>
      ) : null}
      {error ? (
        <p className="mb-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {buckets ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          {buckets.map((bucket) => {
            const isOpen = expanded === bucket.key;
            return (
              <button
                key={bucket.key}
                type="button"
                onClick={() => setExpanded(isOpen ? null : bucket.key)}
                aria-expanded={isOpen}
                className={`rounded-xl border px-3 py-3 text-left transition-colors sm:px-4 ${
                  isOpen
                    ? "border-emerald/40 bg-emerald/10"
                    : "border-white/10 bg-navy/50 hover:border-white/25"
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
                  {bucketTitle(bucket.key)}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-white sm:text-xl">
                  {formatGbpAmount(bucket.total)}
                </p>
                <p className="mt-0.5 text-xs text-white/55">{countText(bucket)}</p>
              </button>
            );
          })}
        </div>
      ) : null}

      {expanded && summary ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-navy/40 p-3 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">
              {bucketTitle(expanded)} breakdown
              <span className="ml-2 text-xs font-normal text-white/45">
                {summary[expanded].fromDay} → {summary[expanded].toDay}
              </span>
            </p>
            <button
              type="button"
              onClick={() => setExpanded(null)}
              className="text-xs font-semibold text-white/60 underline hover:text-white"
            >
              Collapse
            </button>
          </div>
          {summary[expanded].items.length === 0 ? (
            <p className="text-sm text-white/50">No genuine paid bookings in this period.</p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">
              {summary[expanded].items.map((item) => (
                <li
                  key={`${expanded}-${item.paymentReference}`}
                  className="rounded-lg border border-white/8 bg-navy/50 px-3 py-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-white">{item.customerName}</p>
                      <p className="mt-0.5 break-all text-xs text-white/45">
                        {formatDisplayTripDate(item.paymentDay)}
                        {item.tripDate
                          ? ` · trip ${formatDisplayTripDate(item.tripDate)}`
                          : ""}
                        {` · ${item.paymentReference}`}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                      {item.refundStatusLabel}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-xs text-white/65">
                    <div>
                      <dt className="text-white/35">Paid</dt>
                      <dd className="tabular-nums text-white">
                        {formatGbpAmount(item.amountPaid)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-white/35">Refunded</dt>
                      <dd className="tabular-nums text-white">
                        {formatGbpAmount(item.amountRefunded)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-white/35">
                        {expanded === "refunds" ? "Net retained" : "Net"}
                      </dt>
                      <dd className="tabular-nums font-semibold text-emerald">
                        {formatGbpAmount(item.netAmount)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
