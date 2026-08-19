"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchOwnerPricingIntelligence,
  type PricingIntelligenceDashboard,
} from "@/lib/pricing-intelligence-api";

type OwnerPricingIntelligencePanelProps = {
  ownerKey: string;
};

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}£${value.toFixed(2)}`;
}

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

export default function OwnerPricingIntelligencePanel({
  ownerKey,
}: OwnerPricingIntelligencePanelProps) {
  const [data, setData] = useState<PricingIntelligenceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchOwnerPricingIntelligence(ownerKey);
      setData(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load pricing intelligence");
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = data?.today;
  const avg7 =
    data && data.last7.length > 0
      ? Math.round(
          (data.last7.reduce((sum, r) => sum + r.averageMatniGbp, 0) / data.last7.length) * 100,
        ) / 100
      : null;
  const avg30 =
    data && data.last30.length > 0
      ? Math.round(
          (data.last30.reduce((sum, r) => sum + r.averageMatniGbp, 0) / data.last30.length) *
            100,
        ) / 100
      : null;

  return (
    <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Pricing Intelligence</h2>
          <p className="mt-1 max-w-2xl text-sm text-white/65">
            Read-only daily quote vs competitor analysis. Live prices are never changed from this
            panel — review flags and decide any fare updates deliberately.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:bg-white/5"
        >
          Refresh
        </button>
      </div>

      {loading ? <p className="mt-4 text-sm text-white/55">Loading…</p> : null}
      {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

      {!loading && !error && data ? (
        <div className="mt-5 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wide text-white/45">Today</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {today?.quoteCount ?? 0} quotes
              </p>
              <p className="mt-1 text-sm text-white/60">
                Conversion {today?.conversionPct ?? 0}% · HIGH {today?.highCount ?? 0}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wide text-white/45">Last 7 days</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {data.quoteCount7d} quotes
              </p>
              <p className="mt-1 text-sm text-white/60">
                Paid {data.paid7d} · Conversion {data.conversionPct7d}%
                {avg7 != null ? ` · Avg £${avg7.toFixed(2)}` : ""}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wide text-white/45">Last 30 days</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {data.last30.reduce((s, r) => s + r.quoteCount, 0)} quotes
              </p>
              <p className="mt-1 text-sm text-white/60">
                Reports stored {data.last30.length}
                {avg30 != null ? ` · Avg £${avg30.toFixed(2)}` : ""}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-wide text-white/45">Competitor gap (today)</p>
              <p className="mt-1 text-2xl font-semibold text-white">
                {money(today?.averageDifferenceGbp)}
              </p>
              <p className="mt-1 text-sm text-white/60">
                Avg {pct(today?.averageDifferencePct)} vs cheapest competitor
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-white/85">Biggest overpricing gaps</h3>
              <ul className="mt-2 space-y-2 text-sm text-white/70">
                {(data.biggestOverpricing.length ? data.biggestOverpricing : []).map((row) => (
                  <li key={`${row.day}-${row.journey}`} className="border-b border-white/5 pb-2">
                    <span className="text-white/90">{row.journey}</span>
                    <span className="mt-0.5 block text-xs text-white/45">
                      {row.day} · {money(row.differenceGbp)} ({pct(row.differencePct)})
                    </span>
                  </li>
                ))}
                {data.biggestOverpricing.length === 0 ? (
                  <li className="text-white/45">No competitor comparisons yet.</li>
                ) : null}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium text-white/85">Biggest underpricing gaps</h3>
              <ul className="mt-2 space-y-2 text-sm text-white/70">
                {(data.biggestUnderpricing.length ? data.biggestUnderpricing : []).map((row) => (
                  <li key={`${row.day}-${row.journey}`} className="border-b border-white/5 pb-2">
                    <span className="text-white/90">{row.journey}</span>
                    <span className="mt-0.5 block text-xs text-white/45">
                      {row.day} · {money(row.differenceGbp)} ({pct(row.differencePct)})
                    </span>
                  </li>
                ))}
                {data.biggestUnderpricing.length === 0 ? (
                  <li className="text-white/45">No underpricing gaps recorded yet.</li>
                ) : null}
              </ul>
            </div>
          </div>

          {today && today.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <h3 className="mb-2 text-sm font-medium text-white/85">Today’s comparisons</h3>
              <table className="min-w-full text-left text-xs text-white/70">
                <thead className="text-white/45">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Journey</th>
                    <th className="py-2 pr-3 font-medium">MATNI</th>
                    <th className="py-2 pr-3 font-medium">FonaCAB</th>
                    <th className="py-2 pr-3 font-medium">OTS</th>
                    <th className="py-2 pr-3 font-medium">Diff</th>
                    <th className="py-2 pr-3 font-medium">Flag</th>
                    <th className="py-2 font-medium">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {today.rows.slice(0, 25).map((row) => (
                    <tr key={row.fingerprint} className="border-t border-white/5">
                      <td className="py-2 pr-3 text-white/85">{row.journey}</td>
                      <td className="py-2 pr-3">£{row.matniGbp.toFixed(2)}</td>
                      <td className="py-2 pr-3">
                        {row.fonacabGbp == null ? "—" : `£${row.fonacabGbp.toFixed(2)}`}
                      </td>
                      <td className="py-2 pr-3">
                        {row.otsGbp == null ? "—" : `£${row.otsGbp.toFixed(2)}`}
                      </td>
                      <td className="py-2 pr-3">
                        {money(row.differenceGbp)} ({pct(row.differencePct)})
                      </td>
                      <td className="py-2 pr-3">{row.flag}</td>
                      <td className="py-2">{row.outcome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
