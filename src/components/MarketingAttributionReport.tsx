"use client";
import { useState } from "react";
import type { MarketingReportRow } from "../../shared/marketing-report";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
type Report = {
  totalRecordedBookings: number;
  unpaidRequests: number;
  days: number;
  rows: MarketingReportRow[];
  possiblyTruncated: boolean;
  scope: string;
};
const money = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    n,
  );
export default function MarketingAttributionReport({
  ownerKey,
}: {
  ownerKey: string;
}) {
  const [data, setData] = useState<Report | null>(null),
    [days, setDays] = useState(30),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `${resolveWorkerBaseUrl()}/owner/marketing-attribution?days=${days}`,
        { headers: { "X-Owner-Key": ownerKey } },
      );
      if (!r.ok) throw Error(`Report unavailable (${r.status})`);
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report unavailable");
    } finally {
      setBusy(false);
    }
  }
  const rows = data?.rows || [];
  const sum = (key: "fare" | "collected" | "refunded") =>
    rows.reduce((n, r) => n + r[key], 0);
  return (
    <details className="mb-6 rounded-xl border border-white/15 bg-white/5 p-4">
      <summary className="cursor-pointer font-semibold text-white">
        Marketing attribution — paid bookings
      </summary>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label>
          Payment date range{" "}
          <select
            className="rounded bg-navy p-2"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </label>
        <button
          className="btn-secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy ? "Loading…" : "Load report"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p className="my-3 text-sm text-white/70">
            Results for the last {data.days} days. {data.scope} This report is separate from Google Ads reported or
            modelled conversions.
          </p>
          {data.possiblyTruncated && (
            <p role="status" className="text-amber-200">
              The 200-record limit was reached. These totals may be incomplete;
              select a shorter date range.
            </p>
          )}
          <p className="my-3">
            Total recorded bookings/requests: {data.totalRecordedBookings} ·
            Unpaid/cancelled requests: {data.unpaidRequests} · Verified paid
            bookings: {rows.length} · Active:{" "}
            {rows.filter((r) => !r.cancelled).length} · Fare value:{" "}
            {money(sum("fare"))} · Confirmed collected:{" "}
            {money(sum("collected"))} · Refunded: {money(sum("refunded"))} ·
            Retained: {money(sum("collected") - sum("refunded"))}
          </p>
          <ul className="my-3 flex flex-wrap gap-4">
            {[...new Set(rows.map((r) => r.source))].map((source) => (
              <li key={source}>
                {source}: {rows.filter((r) => r.source === source).length}
              </li>
            ))}
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {[
                    "Booking",
                    "Source / confidence",
                    "Evidence / campaign",
                    "Value / collected / refunded",
                    "Conversion",
                  ].map((h) => (
                    <th className="p-2" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.paymentReference}
                    className="border-t border-white/10"
                  >
                    <td className="p-2">
                      {r.reference}
                      {r.cancelled ? " (cancelled)" : ""}
                    </td>
                    <td className="p-2">
                      {r.source} · {r.confidence}
                    </td>
                    <td className="p-2">
                      {r.evidence}
                      <br />
                      {r.campaign || "—"}
                      <br />
                      First: {r.firstSource}
                    </td>
                    <td className="p-2">
                      {money(r.fare)} / {money(r.collected)} /{" "}
                      {money(r.refunded)}
                    </td>
                    <td className="p-2">
                      {r.conversionStatus}
                      <br />
                      {r.attempts} attempts
                      {r.lastAttemptAt ? ` · ${r.lastAttemptAt}` : ""}
                      {r.error && <p>{r.error}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </details>
  );
}
