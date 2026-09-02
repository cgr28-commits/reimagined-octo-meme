"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Footer from "@/components/Footer";
import OwnerPortalHeader from "@/components/OwnerPortalHeader";
import {
  fetchAdFraudDashboard,
  fetchAdFraudVisitor,
  updateAdFraudVisitorReview,
  type AdFraudDashboardSummary,
  type AdFraudVisitorRow,
} from "@/lib/ad-fraud-api";
import type { AdFraudReviewStatus, AdFraudRiskLevel, AdFraudVisitorRecord } from "../../../../shared/ad-fraud";

const OWNER_KEY_STORAGE = "matni-owner-key";

const RISK_STYLES: Record<AdFraudRiskLevel, string> = {
  normal: "bg-white/10 text-white/70",
  low: "bg-amber-500/20 text-amber-100",
  medium: "bg-orange-500/25 text-orange-100",
  high: "bg-red-500/30 text-red-100",
};

function formatWhen(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-white/45">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export default function AdFraudPageClient() {
  const [ownerKey, setOwnerKey] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [range, setRange] = useState<"1" | "7" | "30">("7");
  const [risk, setRisk] = useState<"all" | AdFraudRiskLevel>("all");
  const [campaign, setCampaign] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [disclaimer, setDisclaimer] = useState("");
  const [summary, setSummary] = useState<AdFraudDashboardSummary | null>(null);
  const [visitors, setVisitors] = useState<AdFraudVisitorRow[]>([]);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [detail, setDetail] = useState<(AdFraudVisitorRecord & { anonymisedId: string }) | null>(
    null,
  );
  const [reviewStatus, setReviewStatus] = useState<AdFraudReviewStatus>("unreviewed");
  const [notes, setNotes] = useState("");
  const [savingReview, setSavingReview] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem(OWNER_KEY_STORAGE);
    if (stored) setOwnerKey(stored);
  }, []);

  const loadDashboard = useCallback(async (key: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetchAdFraudDashboard({
        ownerKey: key,
        range,
        risk,
        campaign: campaign.trim() || undefined,
      });
      if (!response.ok) {
        setError(response.error || "Could not load Ad Fraud dashboard.");
        setUnlocked(false);
        return;
      }
      setUnlocked(true);
      setDisclaimer(response.disclaimer || "");
      setSummary(response.summary ?? null);
      setVisitors(response.visitors ?? []);
      sessionStorage.setItem(OWNER_KEY_STORAGE, key);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load dashboard.");
      setUnlocked(false);
    } finally {
      setLoading(false);
    }
  }, [campaign, range, risk]);

  async function handleUnlock(event: FormEvent) {
    event.preventDefault();
    await loadDashboard(ownerKey.trim());
  }

  useEffect(() => {
    if (!unlocked || !ownerKey.trim()) return;
    void loadDashboard(ownerKey.trim());
  }, [range, risk, campaign, unlocked, ownerKey, loadDashboard]);

  async function openVisitor(visitorHash: string) {
    setSelectedHash(visitorHash);
    setDetail(null);
    setError("");
    const response = await fetchAdFraudVisitor({
      ownerKey: ownerKey.trim(),
      visitorHash,
    });
    if (!response.ok || !response.visitor) {
      setError(response.error || "Could not load visitor timeline.");
      return;
    }
    setDetail(response.visitor);
    setReviewStatus(response.visitor.reviewStatus || "unreviewed");
    setNotes(response.visitor.notes || "");
  }

  async function saveReview() {
    if (!selectedHash) return;
    setSavingReview(true);
    setError("");
    try {
      const response = await updateAdFraudVisitorReview({
        ownerKey: ownerKey.trim(),
        visitorHash: selectedHash,
        reviewStatus,
        notes,
      });
      if (!response.ok || !response.visitor) {
        setError(response.error || "Could not save review status.");
        return;
      }
      setDetail(response.visitor);
      await loadDashboard(ownerKey.trim());
    } finally {
      setSavingReview(false);
    }
  }

  return (
    <>
      <OwnerPortalHeader variant="admin" title="Ad Fraud" />
      <main className="min-h-screen overflow-x-clip bg-navy pb-16 pt-[calc(4.75rem+env(safe-area-inset-top))] md:pt-[calc(4.5rem+env(safe-area-inset-top))]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <header className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-widest text-amber-300">
              Owner tools · monitoring only
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Ads traffic monitoring</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/70">
              Indicators of suspicious Google Ads / paid traffic patterns for evidence gathering.
              These are <span className="font-semibold text-white/85">not proof</span> that a
              visitor is a competitor. Automatic blocking is disabled. TrafficGuard continues to run
              separately.
            </p>
          </header>

          {!unlocked ? (
            <form
              onSubmit={(event) => void handleUnlock(event)}
              className="max-w-lg space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-white/80">Owner access key</span>
                <input
                  type="password"
                  required
                  value={ownerKey}
                  onChange={(event) => setOwnerKey(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none focus:border-emerald/50"
                />
              </label>
              {error ? (
                <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-emerald px-5 py-3 text-sm font-bold text-navy disabled:opacity-60"
              >
                {loading ? "Loading…" : "Unlock dashboard"}
              </button>
            </form>
          ) : (
            <>
              {disclaimer ? (
                <p className="mb-6 rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
                  {disclaimer}
                </p>
              ) : null}

              <div className="mb-6 flex flex-wrap items-end gap-3">
                <label className="text-sm text-white/70">
                  Range
                  <select
                    value={range}
                    onChange={(event) => setRange(event.target.value as "1" | "7" | "30")}
                    className="mt-1 block rounded-lg border border-white/10 bg-navy-dark px-3 py-2 text-white"
                  >
                    <option value="1">Today</option>
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                  </select>
                </label>
                <label className="text-sm text-white/70">
                  Risk
                  <select
                    value={risk}
                    onChange={(event) =>
                      setRisk(event.target.value as "all" | AdFraudRiskLevel)
                    }
                    className="mt-1 block rounded-lg border border-white/10 bg-navy-dark px-3 py-2 text-white"
                  >
                    <option value="all">All</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label className="min-w-[12rem] flex-1 text-sm text-white/70">
                  Campaign contains
                  <input
                    value={campaign}
                    onChange={(event) => setCampaign(event.target.value)}
                    placeholder="utm_campaign"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-navy-dark px-3 py-2 text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void loadDashboard(ownerKey.trim())}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white/85"
                >
                  Refresh
                </button>
              </div>

              {summary ? (
                <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <SummaryCard label="Paid visits today" value={summary.paidVisitsToday} />
                  <SummaryCard label="Paid visits 7 days" value={summary.paidVisitsLast7Days} />
                  <SummaryCard label="Unique visitors" value={summary.uniqueVisitorHashes} />
                  <SummaryCard label="Suspicious visitors" value={summary.suspiciousVisitors} />
                  <SummaryCard label="High-risk visitors" value={summary.highRiskVisitors} />
                  <SummaryCard label="Completed quotes" value={summary.visitorsWithQuotes} />
                  <SummaryCard label="Completed bookings" value={summary.visitorsWithBookings} />
                </div>
              ) : null}

              {error ? (
                <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </p>
              ) : null}

              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="min-w-full text-left text-sm text-white/80">
                  <thead className="bg-white/[0.04] text-xs uppercase tracking-wider text-white/45">
                    <tr>
                      <th className="px-3 py-3">Risk</th>
                      <th className="px-3 py-3">Visitor</th>
                      <th className="px-3 py-3">First / last</th>
                      <th className="px-3 py-3">Paid today / 7d</th>
                      <th className="px-3 py-3">Campaign</th>
                      <th className="px-3 py-3">Engagement</th>
                      <th className="px-3 py-3">Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitors.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-white/50">
                          No monitored visitors in this range yet.
                        </td>
                      </tr>
                    ) : (
                      visitors.map((row) => (
                        <tr
                          key={row.visitorHash}
                          className="cursor-pointer border-t border-white/8 hover:bg-white/[0.03]"
                          onClick={() => void openVisitor(row.visitorHash)}
                        >
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${RISK_STYLES[row.risk]}`}
                            >
                              {row.risk}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-white/90">
                            {row.anonymisedId}
                          </td>
                          <td className="px-3 py-3 text-xs">
                            {formatWhen(row.firstSeenAt)}
                            <br />
                            {formatWhen(row.lastSeenAt)}
                          </td>
                          <td className="px-3 py-3">
                            {row.paidVisitsToday} / {row.paidVisits7Days}
                          </td>
                          <td className="px-3 py-3 text-xs">
                            {row.campaigns.join(", ") || "—"}
                            <div className="mt-1 text-white/40">
                              {row.landingPaths.slice(0, 2).join(", ") || "—"}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs">
                            {row.engagement}
                            <div className="mt-1 text-white/40">
                              Q {row.quotes} · B {row.bookings} · WA {row.whatsappClicks} · Tel{" "}
                              {row.phoneClicks}
                            </div>
                          </td>
                          <td className="max-w-[16rem] px-3 py-3 text-xs text-white/60">
                            {row.reasons.slice(0, 2).join(" · ")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {detail ? (
                <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-bold text-white">
                        Timeline · {detail.anonymisedId}
                      </h2>
                      <p className="mt-1 text-sm text-white/55">
                        Risk {detail.risk} · score {detail.score} · review {detail.reviewStatus}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedHash(null);
                        setDetail(null);
                      }}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white/70"
                    >
                      Close
                    </button>
                  </div>

                  <ul className="mt-5 space-y-2 border-l border-white/15 pl-4">
                    {detail.events.length === 0 ? (
                      <li className="text-sm text-white/50">No events stored.</li>
                    ) : (
                      detail.events.map((event) => (
                        <li key={event.id} className="text-sm text-white/80">
                          <span className="font-mono text-xs text-white/45">
                            {formatWhen(event.timestamp)}
                          </span>{" "}
                          <span className="font-semibold text-emerald/90">{event.eventType}</span>
                          {event.landingPath ? (
                            <span className="text-white/50"> — {event.landingPath}</span>
                          ) : null}
                        </li>
                      ))
                    )}
                  </ul>

                  {detail.quoteStartedCount === 0 &&
                  detail.bookingStartedCount === 0 &&
                  detail.whatsappClickCount === 0 &&
                  detail.phoneClickCount === 0 &&
                  detail.paymentStartedCount === 0 ? (
                    <p className="mt-4 text-sm text-white/55">
                      No quote, booking or contact interaction recorded for this visitor in the
                      stored window.
                    </p>
                  ) : null}

                  <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
                    <label className="text-sm text-white/70">
                      Internal status
                      <select
                        value={reviewStatus}
                        onChange={(event) =>
                          setReviewStatus(event.target.value as AdFraudReviewStatus)
                        }
                        className="mt-1 block w-full rounded-lg border border-white/10 bg-navy-dark px-3 py-2 text-white"
                      >
                        <option value="unreviewed">Unreviewed</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="false_positive">False positive</option>
                        <option value="suspicious">Suspicious</option>
                        <option value="exclusion_candidate">
                          Candidate for exclusion (future)
                        </option>
                      </select>
                    </label>
                    <label className="text-sm text-white/70">
                      Notes
                      <input
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        maxLength={500}
                        placeholder="Internal only — not shared with Google Ads yet"
                        className="mt-1 w-full rounded-lg border border-white/10 bg-navy-dark px-3 py-2 text-white"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={savingReview}
                      onClick={() => void saveReview()}
                      className="self-end rounded-xl bg-emerald px-4 py-2.5 text-sm font-bold text-navy disabled:opacity-60"
                    >
                      {savingReview ? "Saving…" : "Save status"}
                    </button>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
