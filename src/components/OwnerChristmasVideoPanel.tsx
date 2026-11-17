"use client";

/**
 * Owner dashboard → Promo Codes & Email Marketing: Christmas video viewing figures
 * (owner, 17 Nov 2026). Anonymous daily totals — how many saw the welcome video, watched it
 * to the end, skipped or closed it, and what they did next; plus plays of the homepage video.
 */
import { useCallback, useEffect, useState } from "react";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import {
  christmasVideoPercent,
  type ChristmasVideoStats,
} from "../../shared/christmas-video-stats";

const WORKER_BASE = resolveWorkerBaseUrl();

function dayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(d.getTime())
    ? day
    : d.toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/60">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-white/60">{sub}</p> : null}
    </div>
  );
}

export default function OwnerChristmasVideoPanel({ ownerKey }: { ownerKey: string }) {
  const [stats, setStats] = useState<ChristmasVideoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${WORKER_BASE}/owner/christmas-video/stats`, {
        headers: { Accept: "application/json", "X-Owner-Key": ownerKey.trim() },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as (ChristmasVideoStats & { error?: string }) | null;
      if (!response.ok || !payload?.totals) throw new Error(payload?.error || "Could not load the video figures");
      setStats({ totals: payload.totals, days: payload.days ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the video figures");
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const t = stats?.totals;
  const shown = t?.popup_shown ?? 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5" aria-labelledby="owner-xmas-video-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="owner-xmas-video-title" className="text-lg font-semibold text-white">
            Christmas video <span aria-hidden="true">🎄</span>
          </h2>
          <p className="text-sm text-white/60">
            Welcome pop-up and homepage video, since 17 Nov. Anonymous totals — no personal data.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white"
        >
          Refresh
        </button>
      </div>

      {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
      {loading && !stats ? <p className="mt-4 text-sm text-white/60">Loading…</p> : null}

      {t ? (
        <>
          <h3 className="mt-5 text-sm font-semibold text-white">Welcome pop-up</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Saw the video" value={shown} />
            <Stat label="Watched to the end" value={t.popup_watched} sub={`${christmasVideoPercent(t.popup_watched, shown)} of viewers`} />
            <Stat label="Skipped" value={t.popup_skipped} sub={`${christmasVideoPercent(t.popup_skipped, shown)} of viewers`} />
            <Stat label="Closed early" value={t.popup_closed} sub={`${christmasVideoPercent(t.popup_closed, shown)} of viewers`} />
            <Stat label="Turned sound on" value={t.popup_sound_on} />
            <Stat label="Saw the offer" value={t.popup_offer_seen} />
            <Stat label="Claimed code" value={t.popup_code_sent} sub={`${t.popup_claim} pressed Claim`} />
            <Stat label="Pressed Get My Quote" value={t.popup_get_quote} />
          </div>

          <h3 className="mt-5 text-sm font-semibold text-white">Homepage video (under the quote tool)</h3>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Pressed play" value={t.section_play} />
            <Stat label="Watched to the end" value={t.section_watched} sub={`${christmasVideoPercent(t.section_watched, t.section_play)} of plays`} />
          </div>

          {stats && stats.days.length ? (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm text-white/85">
                <caption className="sr-only">Christmas video figures by day</caption>
                <thead className="text-xs uppercase tracking-wide text-white/55">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Day</th>
                    <th className="py-2 pr-3 font-semibold">Saw</th>
                    <th className="py-2 pr-3 font-semibold">Watched</th>
                    <th className="py-2 pr-3 font-semibold">Skipped</th>
                    <th className="py-2 pr-3 font-semibold">Closed</th>
                    <th className="py-2 pr-3 font-semibold">Codes</th>
                    <th className="py-2 pr-3 font-semibold">Homepage plays</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {stats.days.slice(0, 31).map(({ day, counts }) => (
                    <tr key={day}>
                      <td className="py-2 pr-3 text-white">{dayLabel(day)}</td>
                      <td className="py-2 pr-3">{counts.popup_shown}</td>
                      <td className="py-2 pr-3">{counts.popup_watched}</td>
                      <td className="py-2 pr-3">{counts.popup_skipped}</td>
                      <td className="py-2 pr-3">{counts.popup_closed}</td>
                      <td className="py-2 pr-3">{counts.popup_code_sent}</td>
                      <td className="py-2 pr-3">{counts.section_play}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-white/60">No views yet — figures appear here as customers see the video.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
