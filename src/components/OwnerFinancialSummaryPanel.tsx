"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatGbpAmount,
  type OwnerFinancialBucket,
  type OwnerFinancialPeriodKey,
} from "../../shared/owner-financial-summary";
import {
  buildOwnerOperationalMetrics,
  formatOwnerOpsMoney,
} from "../../shared/owner-dashboard-ops";
import { formatDisplayTripDate } from "../../shared/upcoming-jobs";
import {
  fetchOwnerFinancialSummary,
  fetchOwnerPaidBookings,
  type OwnerFinancialSummaryResponse,
  type OwnerPaidBookingSummary,
} from "@/lib/paid-bookings-api";

type OwnerFinancialSummaryPanelProps = {
  ownerKey: string;
  /** Bump to force a reload after refunds / marks. */
  refreshToken?: number;
};

const CASH_BOOK_ORDER: OwnerFinancialPeriodKey[] = ["week", "month", "year", "refunds"];

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
  const [paidBookings, setPaidBookings] = useState<OwnerPaidBookingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<OwnerFinancialPeriodKey | null>(null);
  const [cashBookOpen, setCashBookOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextSummary, nextBookings] = await Promise.all([
        fetchOwnerFinancialSummary(ownerKey),
        fetchOwnerPaidBookings(ownerKey, {
          mode: "upcoming",
          pastDays: 120,
          futureDays: 120,
          limit: 400,
        }).catch(() => [] as OwnerPaidBookingSummary[]),
      ]);
      setSummary(nextSummary);
      setPaidBookings(nextBookings);
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

  const ops = useMemo(
    () => buildOwnerOperationalMetrics({ paidBookings }),
    [paidBookings],
  );

  const emptyBuckets: OwnerFinancialBucket[] = CASH_BOOK_ORDER.map((key) => ({
    key,
    label: bucketTitle(key),
    total: 0,
    count: 0,
    countLabel: key === "refunds" ? "refunds" : "bookings",
    fromDay: "",
    toDay: "",
    items: [],
  }));

  const buckets: OwnerFinancialBucket[] = summary
    ? CASH_BOOK_ORDER.map((key) => summary[key])
    : emptyBuckets;

  const periods = [
    {
      key: "today" as const,
      title: "Today",
      scheduledLabel: "Journeys scheduled today",
      scheduled: ops.today.journeysScheduled,
      completed: ops.today.journeysCompleted,
      earned: ops.today.earnedRevenueGbp,
      received: summary?.cashReceived?.today ?? ops.today.paymentsReceivedGbp,
    },
    {
      key: "week" as const,
      title: "This week",
      scheduledLabel: null,
      scheduled: ops.week.journeysScheduled,
      completed: ops.week.journeysCompleted,
      earned: ops.week.earnedRevenueGbp,
      received: summary?.cashReceived?.week ?? ops.week.paymentsReceivedGbp,
    },
    {
      key: "month" as const,
      title: "This month",
      scheduledLabel: null,
      scheduled: ops.month.journeysScheduled,
      completed: ops.month.journeysCompleted,
      earned: ops.month.earnedRevenueGbp,
      received: summary?.cashReceived?.month ?? ops.month.paymentsReceivedGbp,
    },
  ];

  return (
    <section className="mb-3" aria-label="Dashboard summary">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
          Dashboard summary
        </p>
        {loading ? (
          <p className="text-xs text-white/40">Updating…</p>
        ) : error ? (
          <button
            type="button"
            onClick={() => void load()}
            className="min-h-11 text-xs font-semibold text-amber-100 underline"
          >
            Retry
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {periods.map((period) => (
          <article
            key={period.key}
            className="rounded-xl border border-white/10 bg-navy/50 px-3 py-3 sm:px-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
              {period.title}
            </p>
            <dl className="mt-2 space-y-1.5 text-sm">
              {period.scheduledLabel ? (
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-white/50">{period.scheduledLabel}</dt>
                  <dd className="tabular-nums font-semibold text-white">
                    {loading && !summary ? "—" : period.scheduled}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-white/50">Completed journeys</dt>
                <dd className="tabular-nums font-semibold text-white">
                  {loading && !summary ? "—" : period.completed}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-white/50">Earned revenue</dt>
                <dd className="tabular-nums font-semibold text-emerald">
                  {loading && !summary ? "—" : formatOwnerOpsMoney(period.earned)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-white/50">Payments received</dt>
                <dd className="tabular-nums font-semibold text-sky-100">
                  {loading && !summary ? "—" : formatOwnerOpsMoney(period.received)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-white/40">
        Earned revenue is the value of journey legs completed in the period (Europe/London,
        Monday–Sunday week). Payments received is money collected in the period — a payment
        today for a future trip is not this week’s earned income.
      </p>
      {ops.unsplitReturnBookingIds.length > 0 ? (
        <p className="mt-1 text-[11px] text-amber-100/70">
          {ops.unsplitReturnBookingIds.length} historic return booking
          {ops.unsplitReturnBookingIds.length === 1 ? "" : "s"} have no stored outbound/return
          fares. Those totals count as earned only when both legs are completed.
        </p>
      ) : null}

      <div className="mt-3 rounded-xl border border-white/10 bg-navy/40">
        <button
          type="button"
          onClick={() => setCashBookOpen((open) => !open)}
          aria-expanded={cashBookOpen}
          className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="text-sm font-semibold text-white/85">
            Payments &amp; refunds cash book
          </span>
          <span className="text-emerald" aria-hidden>
            {cashBookOpen ? "▲" : "▼"}
          </span>
        </button>
        {cashBookOpen ? (
          <div className="border-t border-white/10 px-3 pb-3 pt-3">
            <p className="mb-3 text-xs text-white/45">
              Net money attributed to the payment date (not journey completion). Use the cards
              above for operational earned revenue.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {buckets.map((bucket) => {
                const isOpen = expanded === bucket.key;
                return (
                  <button
                    key={bucket.key}
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : bucket.key)}
                    aria-expanded={isOpen}
                    disabled={Boolean(error) && !summary}
                    className={`min-h-11 rounded-xl border px-3 py-3 text-left transition-colors sm:px-4 ${
                      isOpen
                        ? "border-emerald/40 bg-emerald/10"
                        : "border-white/10 bg-navy/50 hover:border-white/25"
                    } disabled:opacity-70`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-white/45">
                      {bucketTitle(bucket.key)}
                    </p>
                    <p className="mt-1 text-lg font-bold tabular-nums text-white sm:text-xl">
                      {loading && !summary ? "—" : formatGbpAmount(bucket.total)}
                    </p>
                    <p className="mt-0.5 text-xs text-white/55">
                      {loading && !summary ? "…" : countText(bucket)}
                    </p>
                  </button>
                );
              })}
            </div>

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
                    className="min-h-11 text-xs font-semibold text-white/60 underline hover:text-white"
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
          </div>
        ) : null}
      </div>
    </section>
  );
}
