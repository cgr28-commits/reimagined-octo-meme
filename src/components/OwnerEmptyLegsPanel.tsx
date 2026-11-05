"use client";

/**
 * Owner-only read-only Empty Legs preview.
 * Illustrative 25% / £185 assumptions — never unlocks live Smart Return pricing.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_LEGS_PREVIEW_ASSUMPTIONS,
  emptyLegsPreviewCsv,
  type EmptyLegOpportunity,
  type EmptyLegsPreviewReport,
} from "../../shared/empty-legs-preview";
import { fetchEmptyLegsPreview } from "@/lib/smart-ops-api";

type OwnerEmptyLegsPanelProps = {
  ownerKey: string;
};

function todayYmdLondon(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(utc);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function money(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `£${value.toFixed(2)}`;
}

function typeLabel(type: EmptyLegOpportunity["type"]): string {
  return type === "post_dropoff_return" ? "Post-drop-off return" : "Pre-pickup positioning";
}

function statusLabel(status: EmptyLegOpportunity["status"]): string {
  if (status === "preview_priced") return "Preview priced";
  if (status === "preview_ineligible") return "Preview ineligible";
  return "Unsupported / unpriced";
}

function statusClass(status: EmptyLegOpportunity["status"]): string {
  if (status === "preview_priced") return "border-emerald/40 bg-emerald/10 text-emerald";
  if (status === "unsupported_unpriced") return "border-amber-200/30 bg-amber-100/10 text-amber-100";
  return "border-white/15 bg-white/5 text-white/70";
}

export default function OwnerEmptyLegsPanel({ ownerKey }: OwnerEmptyLegsPanelProps) {
  const initialFrom = todayYmdLondon();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(addDaysYmd(initialFrom, 21));
  const [typeFilter, setTypeFilter] = useState<"all" | EmptyLegOpportunity["type"]>("all");
  const [report, setReport] = useState<EmptyLegsPreviewReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchEmptyLegsPreview(ownerKey, from, to);
      setReport(result.report);
      setNotice(result.message);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "Could not load Empty Legs preview");
    } finally {
      setLoading(false);
    }
  }, [ownerKey, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const opportunities = useMemo(() => {
    const list = report?.opportunities || [];
    if (typeFilter === "all") return list;
    return list.filter((item) => item.type === typeFilter);
  }, [report, typeFilter]);

  const pricedCount = useMemo(
    () => (report?.opportunities || []).filter((item) => item.status === "preview_priced").length,
    [report],
  );
  const unsupportedCount = useMemo(
    () =>
      (report?.opportunities || []).filter((item) => item.status === "unsupported_unpriced").length,
    [report],
  );

  function downloadCsv() {
    if (!report) return;
    const csv = emptyLegsPreviewCsv(report);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `empty-legs-preview-${report.fromYmd}-to-${report.toYmd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mb-10 w-full min-w-0 max-w-full space-y-4" data-owner-empty-legs>
      <div className="rounded-2xl border border-amber-200/25 bg-amber-100/10 p-4">
        <p className="text-sm font-bold text-amber-100">Read-only preview — discounts not active</p>
        <p className="mt-2 text-sm text-white/75">
          {EMPTY_LEGS_PREVIEW_ASSUMPTIONS.label}. Approved simulation assumptions: max discount{" "}
          {EMPTY_LEGS_PREVIEW_ASSUMPTIONS.maxDiscountPercent}%, Belfast–Dublin journey floor £
          {EMPTY_LEGS_PREVIEW_ASSUMPTIONS.minAcceptableFareGbp}. Both post-drop-off and pre-pickup
          opportunities are listed; only post-drop-off can be priced today. Airport fees and Estate
          stay full. No stacking with the 5% return-booking discount. Live Smart Return stays locked
          OFF.
        </p>
        <p className="mt-2 text-xs text-white/55">
          Empty-leg contribution uses incremental cost (detour + passenger airport fees), not a full
          loaded £{EMPTY_LEGS_PREVIEW_ASSUMPTIONS.loadedHourlyReferenceGbp}/hr one-way cost. Empty
          miles converted ≠ mileage eliminated.
        </p>
        {notice ? <p className="mt-2 text-xs text-white/55">{notice}</p> : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-white/50">
            From
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="mt-1 block min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
          </label>
          <label className="text-xs text-white/50">
            To
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="mt-1 block min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
          </label>
          <label className="text-xs text-white/50">
            Type
            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as "all" | EmptyLegOpportunity["type"])
              }
              className="mt-1 block min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            >
              <option value="all">All opportunities</option>
              <option value="post_dropoff_return">Post-drop-off return</option>
              <option value="pre_pickup_positioning">Pre-pickup positioning</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="btn-secondary min-h-11 px-4"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={!report || loading}
            className="btn-secondary min-h-11 px-4"
            data-empty-legs-csv
          >
            Export CSV
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
          <p className="text-xs uppercase tracking-wider text-white/45">Confirmed parents</p>
          <p className="mt-1 text-2xl font-bold text-white">{report?.parentCount ?? "—"}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
          <p className="text-xs uppercase tracking-wider text-white/45">Preview priced</p>
          <p className="mt-1 text-2xl font-bold text-white">{report ? pricedCount : "—"}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
          <p className="text-xs uppercase tracking-wider text-white/45">Pre-pickup unsupported</p>
          <p className="mt-1 text-2xl font-bold text-white">{report ? unsupportedCount : "—"}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
          <p className="text-xs uppercase tracking-wider text-white/45">Live Smart Return</p>
          <p className="mt-1 text-2xl font-bold text-amber-100">
            {report?.liveSmartReturnPricing ? "ON" : "OFF"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">
          Shadow rejection reasons
        </h3>
        <p className="mt-1 text-xs text-white/45">
          Compact quote fingerprints only ({report?.shadowSampleCount ?? 0} samples). Live customer
          prices are unchanged.
        </p>
        <ul className="mt-3 space-y-2 text-sm text-white/75">
          {(report?.shadowReasonCounts || []).map((row) => (
            <li
              key={row.reason}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2"
            >
              <span className="font-mono text-xs text-white/80">{row.reason}</span>
              <span className="font-semibold text-white">{row.count}</span>
            </li>
          ))}
          {!loading && report && report.shadowReasonCounts.length === 0 ? (
            <li className="text-white/50">No shadow samples yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="space-y-3" data-empty-legs-list>
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">
          Opportunities ({opportunities.length})
        </h3>
        {loading && !report ? (
          <p className="text-sm text-white/55">Loading confirmed bookings…</p>
        ) : null}
        {!loading && opportunities.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-navy/70 px-4 py-3 text-sm text-white/60">
            No long-distance / Dublin corridor parents in this date range.
          </p>
        ) : null}
        {opportunities.map((item) => (
          <article
            key={item.id}
            className="rounded-2xl border border-white/10 bg-navy/70 p-4"
            data-empty-leg-type={item.type}
            data-empty-leg-status={item.status}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}
              >
                {statusLabel(item.status)}
              </span>
              <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/70">
                {typeLabel(item.type)}
              </span>
              {item.type === "pre_pickup_positioning" ? (
                <span className="rounded-full border border-amber-200/30 px-2.5 py-1 text-xs text-amber-100">
                  Matching engine not developed
                </span>
              ) : null}
            </div>
            <h4 className="mt-3 text-base font-bold text-white">{item.opportunityDirectionLabel}</h4>
            <p className="mt-1 text-sm text-white/55">
              Parent {item.parentBookingId} · {item.parentTripDate} {item.parentTripTime} ·{" "}
              {item.parentDirectionLabel}
            </p>
            <dl className="mt-3 grid gap-2 text-sm text-white/75 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-white/45">Feasible window</dt>
                <dd>
                  {item.windowStartLocal || "—"} → {item.windowEndLocal || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/45">Est. empty miles</dt>
                <dd>{item.estimatedEmptyMiles != null ? `${item.estimatedEmptyMiles} mi` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-white/45">Normal journey / total</dt>
                <dd>
                  {money(item.normalJourneyFareGbp)} / {money(item.normalTotalFareGbp)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/45">Suggested journey / total</dt>
                <dd>
                  {item.status === "unsupported_unpriced"
                    ? "Unpriced"
                    : `${money(item.suggestedJourneyFareGbp)} / ${money(item.suggestedTotalFareGbp)}`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-white/45">Suggested saving</dt>
                <dd>{item.suggestedSavingGbp != null ? money(item.suggestedSavingGbp) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-white/45">Airport fixed (undiscounted)</dt>
                <dd>{money(item.airportFixedCostsGbp)}</dd>
              </div>
              <div>
                <dt className="text-xs text-white/45">Reason</dt>
                <dd className="font-mono text-xs">{item.reason}</dd>
              </div>
              <div>
                <dt className="text-xs text-white/45">Live release open</dt>
                <dd>{item.liveReleaseOpen ? "Yes" : "No"}</dd>
              </div>
            </dl>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
                Empty-leg economics
              </p>
              <dl className="mt-2 grid gap-2 text-sm text-white/75 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-white/45">Empty miles → paid</dt>
                  <dd>
                    {item.economics.emptyMilesConvertedToPaid != null
                      ? `${item.economics.emptyMilesConvertedToPaid} mi`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/45">Mileage eliminated</dt>
                  <dd>
                    {item.economics.actualMileageEliminated != null
                      ? `${item.economics.actualMileageEliminated} mi`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/45">Detour vs pure path</dt>
                  <dd>
                    {item.economics.estimatedDetourMiles != null
                      ? `${item.economics.estimatedDetourMiles} mi`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/45">Costs incurred anyway</dt>
                  <dd>{money(item.economics.costsIncurredAnywayGbp)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-white/45">Incremental cost</dt>
                  <dd>{money(item.economics.incrementalCostGbp)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-white/45">Contribution vs incremental</dt>
                  <dd>{money(item.economics.contributionVsIncrementalGbp)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-white/45">
                    Loaded one-way op-cost reference (not decision basis)
                  </dt>
                  <dd>{money(item.economics.loadedOneWayOpCostReferenceGbp)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-white/45">{item.economics.economicsNote}</p>
            </div>
            <p className="mt-3 text-xs text-white/45">{item.notes}</p>
          </article>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <p className="text-sm font-bold text-white">Controls locked</p>
        <p className="mt-1 text-sm text-white/55">
          Approve / kill / override stay disabled until a later phase. This panel does not write
          Smart Ops flags, pricing KV, or booking records.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled className="btn-secondary min-h-11 px-4 opacity-40">
            Approve (locked)
          </button>
          <button type="button" disabled className="btn-secondary min-h-11 px-4 opacity-40">
            Kill offer (locked)
          </button>
          <button type="button" disabled className="btn-secondary min-h-11 px-4 opacity-40">
            Override price (locked)
          </button>
        </div>
      </div>
    </section>
  );
}
