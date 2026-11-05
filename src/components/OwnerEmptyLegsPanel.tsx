"use client";

/**
 * Owner-only read-only Empty Legs preview.
 * Illustrative 25% / £185 assumptions — never unlocks live Smart Return pricing.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_LEGS_PREVIEW_ASSUMPTIONS,
  emptyLegsPreviewCsv,
  PRE_PICKUP_STATUS_LABEL,
  type EmptyLegCorridorDirection,
  type EmptyLegOpportunity,
  type EmptyLegsPreviewReport,
} from "../../shared/empty-legs-preview";
import { fetchEmptyLegsPreview } from "@/lib/smart-ops-api";

type OwnerEmptyLegsPanelProps = {
  ownerKey: string;
};

type StatusFilter = "all" | EmptyLegOpportunity["status"];
type TypeFilter = "all" | EmptyLegOpportunity["type"];
type DirectionFilter = "all" | EmptyLegCorridorDirection;

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

function miles(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value} mi`;
}

function typeLabel(type: EmptyLegOpportunity["type"]): string {
  return type === "post_dropoff_return" ? "Post-drop-off" : "Pre-pickup";
}

function statusClass(status: EmptyLegOpportunity["status"]): string {
  if (status === "preview_priced") return "border-emerald/40 bg-emerald/10 text-emerald";
  if (status === "unsupported_unpriced") return "border-amber-200/30 bg-amber-100/10 text-amber-100";
  return "border-white/15 bg-white/5 text-white/70";
}

function windowLabel(item: EmptyLegOpportunity): string {
  if (!item.windowStartLocal && !item.windowEndLocal) return "—";
  const start = item.windowStartLocal?.replace("T", " ") || "—";
  const end = item.windowEndLocal?.replace("T", " ") || "—";
  return `${start} → ${end}`;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
      <p className="text-xs uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export default function OwnerEmptyLegsPanel({ ownerKey }: OwnerEmptyLegsPanelProps) {
  const initialFrom = todayYmdLondon();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(addDaysYmd(initialFrom, 21));
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>("all");
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  const vehicleOptions = useMemo(() => {
    const set = new Set<string>();
    for (const item of report?.opportunities || []) {
      // Vehicle is not on opportunity yet — keep placeholder filter for future driver/vehicle wiring.
      void item;
    }
    return ["all"];
  }, [report]);

  const opportunities = useMemo(() => {
    let list = report?.opportunities || [];
    if (typeFilter !== "all") list = list.filter((item) => item.type === typeFilter);
    if (statusFilter !== "all") list = list.filter((item) => item.status === statusFilter);
    if (directionFilter !== "all") {
      list = list.filter((item) => item.opportunityCorridor === directionFilter);
    }
    void vehicleFilter;
    void vehicleOptions;
    return list;
  }, [report, typeFilter, statusFilter, directionFilter, vehicleFilter, vehicleOptions]);

  const totals = report?.totals;

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
          {EMPTY_LEGS_PREVIEW_ASSUMPTIONS.label}. Simulation only: max discount{" "}
          {EMPTY_LEGS_PREVIEW_ASSUMPTIONS.maxDiscountPercent}%, Belfast–Dublin journey floor £
          {EMPTY_LEGS_PREVIEW_ASSUMPTIONS.minAcceptableFareGbp}. Post-drop-off and pre-pickup are both
          listed; only post-drop-off can be priced. Airport fees, Estate and the 5% return-booking
          discount stay unchanged with no stacking. Live Smart Return stays locked OFF.
        </p>
        <p className="mt-2 text-xs text-white/55">
          Contribution = discounted revenue − incremental costs (detour + passenger airport fees).
          Waiting-time cost is marked unavailable until modelled. Empty miles converted ≠ mileage
          eliminated.
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
            Direction
            <select
              value={directionFilter}
              onChange={(event) => setDirectionFilter(event.target.value as DirectionFilter)}
              className="mt-1 block min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            >
              <option value="all">All directions</option>
              <option value="belfast_to_dublin">Greater Belfast → Dublin</option>
              <option value="dublin_to_belfast">Dublin → Greater Belfast</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="text-xs text-white/50">
            Type
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
              className="mt-1 block min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            >
              <option value="all">Post-drop-off + pre-pickup</option>
              <option value="post_dropoff_return">Post-drop-off only</option>
              <option value="pre_pickup_positioning">Pre-pickup only</option>
            </select>
          </label>
          <label className="text-xs text-white/50">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="mt-1 block min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            >
              <option value="all">All statuses</option>
              <option value="preview_priced">Eligible (preview priced)</option>
              <option value="preview_ineligible">Rejected / ineligible</option>
              <option value="unsupported_unpriced">Unsupported / unpriced</option>
            </select>
          </label>
          <label className="text-xs text-white/50">
            Vehicle / driver
            <select
              value={vehicleFilter}
              onChange={(event) => setVehicleFilter(event.target.value)}
              className="mt-1 block min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
              disabled
              title="Vehicle/driver filtering will use assignment data in a later phase"
            >
              <option value="all">All (not yet wired)</option>
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-empty-legs-summary>
        <SummaryCard
          label="Upcoming potential empty legs"
          value={totals ? String(totals.upcomingPotential) : "—"}
        />
        <SummaryCard
          label="Post-drop-off opportunities"
          value={totals ? String(totals.postDropoffCount) : "—"}
        />
        <SummaryCard
          label="Pre-pickup opportunities"
          value={totals ? String(totals.prePickupCount) : "—"}
        />
        <SummaryCard
          label="Estimated additional revenue potential"
          value={money(totals?.estimatedAdditionalRevenuePotentialGbp)}
        />
        <SummaryCard
          label="Empty miles potentially convertible"
          value={miles(totals?.emptyMilesPotentiallyConvertible)}
        />
        <SummaryCard
          label="Actual mileage potentially eliminated"
          value={miles(totals?.actualMileagePotentiallyEliminated)}
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">
            Live Smart Return flags
          </h3>
          <p className="text-sm font-semibold text-amber-100">
            Pricing {report?.liveSmartReturnPricing ? "ON" : "OFF"} · Corridor{" "}
            {report?.liveReturnCorridorMatching ? "ON" : "OFF"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">
          Shadow diagnostics
        </h3>
        <p className="mt-1 text-xs text-white/45">
          Reuses Smart Return shadow fingerprints ({report?.shadowSampleCount ?? 0} samples). No
          fabricated results — empty list means unavailable or none yet.
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
            <li className="text-white/50">Shadow log unavailable or empty for this environment.</li>
          ) : null}
        </ul>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-navy/70" data-empty-legs-table>
        <div className="border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">
            Opportunity table ({opportunities.length})
          </h3>
          <p className="mt-1 text-xs text-white/45">All fares are estimates. Live customer prices unchanged.</p>
        </div>
        {loading && !report ? (
          <p className="px-4 py-3 text-sm text-white/55">Loading confirmed bookings…</p>
        ) : null}
        {!loading && opportunities.length === 0 ? (
          <p className="px-4 py-3 text-sm text-white/60">
            No long-distance / Dublin corridor parents match these filters.
          </p>
        ) : null}
        {opportunities.length > 0 ? (
          <table className="min-w-full text-left text-sm text-white/80">
            <thead className="bg-white/[0.03] text-xs uppercase tracking-wider text-white/45">
              <tr>
                <th className="px-3 py-3 font-semibold">Date</th>
                <th className="px-3 py-3 font-semibold">Existing journey</th>
                <th className="px-3 py-3 font-semibold">Empty-leg direction</th>
                <th className="px-3 py-3 font-semibold">Type</th>
                <th className="px-3 py-3 font-semibold">Time window</th>
                <th className="px-3 py-3 font-semibold">Normal fare</th>
                <th className="px-3 py-3 font-semibold">Suggested fare</th>
                <th className="px-3 py-3 font-semibold">Incremental contribution</th>
                <th className="px-3 py-3 font-semibold">Convertible empty mi</th>
                <th className="px-3 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((item) => {
                const open = expandedId === item.id;
                return (
                  <Fragment key={item.id}>
                    <tr
                      className="border-t border-white/10 hover:bg-white/[0.03]"
                      data-empty-leg-type={item.type}
                      data-empty-leg-status={item.status}
                    >
                      <td className="px-3 py-3 whitespace-nowrap">
                        <button
                          type="button"
                          className="text-left font-semibold text-white underline-offset-2 hover:underline"
                          onClick={() => setExpandedId(open ? null : item.id)}
                          aria-expanded={open}
                        >
                          {item.parentTripDate}
                        </button>
                        <div className="text-xs text-white/45">{item.parentTripTime}</div>
                      </td>
                      <td className="px-3 py-3">{item.parentDirectionLabel}</td>
                      <td className="px-3 py-3">{item.opportunityDirectionLabel}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{typeLabel(item.type)}</td>
                      <td className="px-3 py-3 text-xs">{windowLabel(item)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {item.type === "pre_pickup_positioning"
                          ? "—"
                          : money(item.normalTotalFareGbp)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {item.type === "pre_pickup_positioning"
                          ? "Unpriced"
                          : money(item.suggestedTotalFareGbp)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {money(item.economics.contributionVsIncrementalGbp)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        {miles(item.economics.emptyMilesConvertedToPaid)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}
                        >
                          {item.type === "pre_pickup_positioning"
                            ? PRE_PICKUP_STATUS_LABEL
                            : item.statusLabel}
                        </span>
                      </td>
                    </tr>
                    {open ? (
                      <tr className="border-t border-white/5 bg-black/20">
                        <td colSpan={10} className="px-4 py-4">
                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm text-white/75">
                            <div>
                              <p className="text-xs text-white/45">Parent booking reference</p>
                              <p className="font-mono text-xs">{item.parentBookingId}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Journey timing</p>
                              <p>
                                {item.parentTripDate} {item.parentTripTime}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Estimated travel duration</p>
                              <p>
                                {item.estimatedDurationMinutes != null
                                  ? `${item.estimatedDurationMinutes} min`
                                  : "—"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Route alignment</p>
                              <p>{item.alignment != null ? item.alignment : "—"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Detour estimate</p>
                              <p>{miles(item.economics.estimatedDetourMiles)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Smart Return / reason</p>
                              <p className="font-mono text-xs">{item.reason}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Normal journey / total (est.)</p>
                              <p>
                                {money(item.normalJourneyFareGbp)} / {money(item.normalTotalFareGbp)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Suggested journey / total (est.)</p>
                              <p>
                                {item.type === "pre_pickup_positioning"
                                  ? "Unpriced"
                                  : `${money(item.suggestedJourneyFareGbp)} / ${money(item.suggestedTotalFareGbp)}`}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Customer saving / effective %</p>
                              <p>
                                {money(item.suggestedSavingGbp)}
                                {item.effectiveDiscountPercent != null
                                  ? ` · ${item.effectiveDiscountPercent}%`
                                  : ""}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Airport fixed (undiscounted)</p>
                              <p>{money(item.airportFixedCostsGbp)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Estate premium (undiscounted)</p>
                              <p>{money(item.estatePremiumGbp)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Live release open</p>
                              <p>{item.liveReleaseOpen ? "Yes" : "No"}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Empty miles → paid</p>
                              <p>{miles(item.economics.emptyMilesConvertedToPaid)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Mileage eliminated</p>
                              <p>{miles(item.economics.actualMileageEliminated)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Costs incurred anyway</p>
                              <p>{money(item.economics.costsIncurredAnywayGbp)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Incremental cost</p>
                              <p>{money(item.economics.incrementalCostGbp)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Waiting-time cost</p>
                              <p>Unavailable (estimate)</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">Contribution vs incremental</p>
                              <p>{money(item.economics.contributionVsIncrementalGbp)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-white/45">
                                Loaded £/hr reference (not decision basis)
                              </p>
                              <p>{money(item.economics.loadedOneWayOpCostReferenceGbp)}</p>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-3">
                              <p className="text-xs text-white/45">Operational notes / risks</p>
                              <p>{item.notes}</p>
                              <p className="mt-1 text-xs text-white/45">
                                {item.economics.economicsNote}
                              </p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <p className="text-sm font-bold text-white">Controls locked — read-only enforcement</p>
        <p className="mt-1 text-sm text-white/55">
          Cannot activate Smart Return, publish fares, approve discounts, change live pricing, create
          bookings, reserve inventory, or send promos. Server save path still hard-locks customer
          Smart Return flags OFF.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled className="btn-secondary min-h-11 px-4 opacity-40">
            Activate Smart Return (locked)
          </button>
          <button type="button" disabled className="btn-secondary min-h-11 px-4 opacity-40">
            Approve discount (locked)
          </button>
          <button type="button" disabled className="btn-secondary min-h-11 px-4 opacity-40">
            Publish fare (locked)
          </button>
          <button type="button" disabled className="btn-secondary min-h-11 px-4 opacity-40">
            Reserve inventory (locked)
          </button>
        </div>
      </div>
    </section>
  );
}
