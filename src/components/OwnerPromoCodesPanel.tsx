"use client";

/**
 * Owner Dashboard → Promo Codes & Email Marketing.
 * Codes issued / active / redeemed / expired, promo bookings, discount and revenue totals,
 * conversion from code requests to bookings, search + filter, on/off and terms, deactivate a
 * code, CSV exports (codes; customers with valid marketing permission only).
 */
import { useCallback, useEffect, useState } from "react";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import OwnerPromoCustomerSend from "@/components/OwnerPromoCustomerSend";
import {
  formatBlackoutRange,
  formatPromoPercent,
  type PromoBlackoutRange,
  type PromoCodeRow,
  type PromoSettings,
} from "../../shared/promo-code";

const WORKER_BASE = resolveWorkerBaseUrl();

type Stats = {
  requests: number;
  uniqueRequesters: number;
  issued: number;
  active: number;
  redeemed: number;
  expired: number;
  deactivated: number;
  conflicts: number;
  discountTotalGbp: number;
  revenueTotalGbp: number;
  conversionRate: number;
  marketingOptIns: number;
};

type Overview = {
  settings: PromoSettings;
  stats: Stats;
  codes: PromoCodeRow[];
  requestOutcomes: Record<string, number>;
  marketing: { subscribed: number; unsubscribed: number } | null;
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  reserved: "In checkout",
  redeemed: "Redeemed",
  expired: "Expired",
  deactivated: "Deactivated",
};

// Solid chips: readable on the light and the navy dashboard themes alike.
const STATUS_STYLE: Record<string, string> = {
  active: "bg-[#2fbf4a] !text-[#071c38]",
  reserved: "bg-[#fcd34d] !text-[#071c38]",
  redeemed: "bg-[#7dd3fc] !text-[#071c38]",
  expired: "bg-[#cbd5e1] !text-[#071c38]",
  deactivated: "bg-[#fca5a5] !text-[#071c38]",
};

const money = (gbp: number | undefined) =>
  gbp == null ? "—" : `£${(Math.round(gbp * 100) / 100).toLocaleString("en-GB", { minimumFractionDigits: gbp % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function when(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });
}

async function ownerFetch<T>(ownerKey: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${WORKER_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !payload) throw new Error(payload?.error || "Something went wrong");
  return payload;
}

async function ownerDownload(ownerKey: string, path: string, filename: string): Promise<void> {
  const response = await fetch(`${WORKER_BASE}${path}`, { headers: { "X-Owner-Key": ownerKey.trim() } });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || "Download failed");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-white">{value}</p>
      {hint ? <p className="text-[11px] text-white/50">{hint}</p> : null}
    </div>
  );
}

export default function OwnerPromoCodesPanel({ ownerKey }: { ownerKey: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ enabled: true, popupEnabled: true, discountPercent: "10", minimumVehicleFareGbp: "100", validityDays: "30", popupDelaySeconds: "20" });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [busyCode, setBusyCode] = useState("");
  const [blackouts, setBlackouts] = useState<PromoBlackoutRange[]>([]);
  const [newRange, setNewRange] = useState({ from: "", to: "", label: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (status) params.set("status", status);
      const result = await ownerFetch<Overview>(ownerKey, `/owner/promo${params.size ? `?${params}` : ""}`);
      setData(result);
      setForm({
        enabled: result.settings.enabled,
        popupEnabled: result.settings.popupEnabled,
        discountPercent: String(Math.round(result.settings.discountRate * 1000) / 10),
        minimumVehicleFareGbp: String(result.settings.minimumVehicleFareGbp),
        validityDays: String(result.settings.validityDays),
        popupDelaySeconds: String(result.settings.popupDelaySeconds),
      });
      setBlackouts(result.settings.blackoutDates ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load promo codes");
    } finally {
      setLoading(false);
    }
  }, [ownerKey, query, status]);

  useEffect(() => {
    void load();
    // Search runs on submit / filter change, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, status]);

  async function saveSettings() {
    setSaving(true);
    setNotice("");
    setError("");
    try {
      await ownerFetch(ownerKey, "/owner/promo/settings", {
        enabled: form.enabled,
        popupEnabled: form.popupEnabled,
        discountPercent: Number(form.discountPercent),
        minimumVehicleFareGbp: Number(form.minimumVehicleFareGbp),
        validityDays: Number(form.validityDays),
        popupDelaySeconds: Number(form.popupDelaySeconds),
        blackoutDates: blackouts,
      });
      setNotice("Saved. New codes use these terms; codes already sent keep the terms they were sent with.");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(code: string) {
    if (!window.confirm(`Deactivate ${code}? The customer will no longer be able to use it.`)) return;
    setBusyCode(code);
    try {
      await ownerFetch(ownerKey, "/owner/promo/deactivate", { code, reason: "Deactivated by owner" });
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not deactivate");
    } finally {
      setBusyCode("");
    }
  }

  async function download(list: "codes" | "marketing") {
    setError("");
    try {
      const date = new Date().toISOString().slice(0, 10);
      await ownerDownload(
        ownerKey,
        `/owner/promo/export.csv?list=${list}`,
        list === "codes" ? `promo-codes-${date}.csv` : `marketing-permission-${date}.csv`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  const stats = data?.stats;
  const inputClass =
    "mt-1 block w-full rounded-lg border border-white/15 bg-white px-3 py-2 text-sm font-semibold text-[#071c38] focus:outline-none focus:ring-2 focus:ring-emerald";

  return (
    <div className="space-y-6" data-owner-promo-panel>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Promo Codes &amp; Email Marketing</h2>
            <p className="text-sm text-white/60">
              {data
                ? `${data.settings.enabled ? "Promotion ON" : "Promotion OFF"} · ${formatPromoPercent(data.settings.discountRate)} off vehicle fares of £${data.settings.minimumVehicleFareGbp}+ · codes valid ${data.settings.validityDays} days${data.settings.blackoutDates?.length ? ` · not valid ${data.settings.blackoutDates.map(formatBlackoutRange).join(", ")}` : ""}`
                : loading
                  ? "Loading…"
                  : ""}
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
        {error ? <p className="mt-3 text-sm text-red-300" role="alert">{error}</p> : null}
        {stats ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Code requests" value={String(stats.requests)} hint={`${stats.uniqueRequesters} different emails`} />
            <Tile label="Codes issued" value={String(stats.issued)} />
            <Tile label="Active" value={String(stats.active)} />
            <Tile label="Redeemed" value={String(stats.redeemed)} hint={stats.conflicts ? `${stats.conflicts} need checking` : undefined} />
            <Tile label="Expired" value={String(stats.expired)} hint={stats.deactivated ? `${stats.deactivated} deactivated` : undefined} />
            <Tile label="Conversion" value={`${Math.round(stats.conversionRate * 1000) / 10}%`} hint="codes → paid bookings" />
            <Tile label="Discounts given" value={money(stats.discountTotalGbp)} />
            <Tile label="Promo booking revenue" value={money(stats.revenueTotalGbp)} hint="amount paid on those bookings" />
            <Tile
              label="Marketing opt-ins"
              value={String(stats.marketingOptIns)}
              hint={data?.marketing ? `${data.marketing.subscribed} on mailing list` : undefined}
            />
          </div>
        ) : null}
      </section>

      <OwnerPromoCustomerSend ownerKey={ownerKey} onSent={() => void load()} />

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-white">
              Customers who asked for 10%{data ? ` (${data.codes.length}${data.codes.length >= 500 ? "+" : ""})` : ""}
            </h3>
            <p className="text-xs text-white/55">Newest first. Each customer, when they asked, their code and whether they&apos;ve used it.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void download("codes")} className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white">
              Export codes (CSV)
            </button>
            <button type="button" onClick={() => void download("marketing")} className="min-h-11 rounded-xl border border-emerald/60 px-4 text-sm font-semibold text-white">
              Export marketing permission (CSV)
            </button>
          </div>
        </div>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email, code or booking"
            aria-label="Search promo codes"
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/15 bg-white px-3 text-sm text-[#071c38]"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
            className="min-h-11 rounded-xl border border-white/15 bg-white px-3 text-sm text-[#071c38]"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="redeemed">Redeemed</option>
            <option value="expired">Expired</option>
            <option value="deactivated">Deactivated</option>
          </select>
          <button type="submit" className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white">
            Search
          </button>
        </form>
        {!loading && data && !data.codes.length ? (
          <p className="mt-4 text-sm text-white/60">No codes match.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {(data?.codes ?? []).map((c) => (
              <li key={c.code} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm" data-promo-row>
                <div className="min-w-0">
                  <p className="break-all text-base font-semibold text-white">{c.email || "(email erased after retention period)"}</p>
                  <p className="text-white/70">
                    Asked {when(c.issuedAt)} · marketing emails {c.marketingOptIn ? "✓ yes" : "no"}
                  </p>
                  <p className="font-mono text-sm tracking-wide text-white/85">
                    {c.code}{" "}
                    <span className={`ml-1 rounded-full px-2 py-0.5 font-sans text-xs font-semibold ${STATUS_STYLE[c.displayStatus] ?? ""}`}>
                      {STATUS_LABEL[c.displayStatus] ?? c.displayStatus}
                    </span>
                    {c.conflict ? <span className="ml-1 rounded-full bg-[#b42318] px-2 py-0.5 font-sans text-xs !text-white">Used twice — check</span> : null}
                  </p>
                  <p className="text-white/50">
                    {formatPromoPercent(c.discountRate)} off · expires {when(c.expiresAt)}
                  </p>
                  {c.bookingReference ? (
                    <p className="text-white/70">
                      Booking {c.bookingReference} · saved {money(c.discountGbp)} on {money(c.vehicleFareGbp)} · paid {money(c.bookingTotalGbp)} · {when(c.redeemedAt)}
                    </p>
                  ) : null}
                  {c.deactivatedReason ? <p className="text-white/50">{c.deactivatedReason}</p> : null}
                </div>
                {c.displayStatus === "active" || c.displayStatus === "reserved" ? (
                  <button
                    type="button"
                    onClick={() => void deactivate(c.code)}
                    disabled={busyCode === c.code}
                    className="min-h-11 rounded-xl bg-[#b42318] px-3 text-xs font-semibold !text-white disabled:opacity-50"
                  >
                    {busyCode === c.code ? "…" : "Deactivate"}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
        <h3 className="text-base font-semibold text-white">Settings</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-white">
            <input type="checkbox" className="h-5 w-5 accent-[#2fbf4a]" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Promotion on (code requests, banners and the checkout code field)
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-white">
            <input type="checkbox" className="h-5 w-5 accent-[#2fbf4a]" checked={form.popupEnabled} onChange={(e) => setForm({ ...form, popupEnabled: e.target.checked })} />
            Desktop pop-up on (timed / exit intent)
          </label>
          <label className="text-sm text-white/80">
            Discount (%)
            <input inputMode="decimal" className={inputClass} value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} />
          </label>
          <label className="text-sm text-white/80">
            Minimum vehicle fare (£)
            <input inputMode="decimal" className={inputClass} value={form.minimumVehicleFareGbp} onChange={(e) => setForm({ ...form, minimumVehicleFareGbp: e.target.value })} />
          </label>
          <label className="text-sm text-white/80">
            Code valid for (days)
            <input inputMode="numeric" className={inputClass} value={form.validityDays} onChange={(e) => setForm({ ...form, validityDays: e.target.value })} />
          </label>
          <label className="text-sm text-white/80">
            Desktop pop-up delay (seconds)
            <input inputMode="numeric" className={inputClass} value={form.popupDelaySeconds} onChange={(e) => setForm({ ...form, popupDelaySeconds: e.target.value })} />
          </label>
        </div>
        <div className="mt-5" data-promo-blackouts>
          <h4 className="text-sm font-semibold text-white">Excluded travel dates</h4>
          <p className="mt-0.5 text-xs text-white/55">
            Codes can&apos;t be used if the outward or return journey falls on these dates. Customers see the dates when
            they enter a code.
          </p>
          {blackouts.length ? (
            <ul className="mt-2 space-y-1.5">
              {blackouts.map((range, index) => (
                <li key={`${range.from}-${range.to}-${index}`} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm text-white">
                  <span>{formatBlackoutRange(range)}</span>
                  <button
                    type="button"
                    onClick={() => setBlackouts(blackouts.filter((_, i) => i !== index))}
                    className="min-h-11 rounded-lg bg-[#b42318] px-3 text-xs font-semibold !text-white"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-white/60">No excluded dates — codes work on any date.</p>
          )}
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
            <label className="text-xs text-white/70">
              From
              <input type="date" className={inputClass} value={newRange.from} onChange={(e) => setNewRange({ ...newRange, from: e.target.value })} />
            </label>
            <label className="text-xs text-white/70">
              To (same day for one date)
              <input type="date" className={inputClass} value={newRange.to} onChange={(e) => setNewRange({ ...newRange, to: e.target.value })} />
            </label>
            <label className="text-xs text-white/70">
              Name (optional)
              <input className={inputClass} maxLength={60} placeholder="e.g. Christmas" value={newRange.label} onChange={(e) => setNewRange({ ...newRange, label: e.target.value })} />
            </label>
            <button
              type="button"
              disabled={!newRange.from}
              onClick={() => {
                const to = newRange.to || newRange.from;
                if (to < newRange.from) {
                  setError("The end date is before the start date.");
                  return;
                }
                setError("");
                setBlackouts([...blackouts, { from: newRange.from, to, ...(newRange.label.trim() ? { label: newRange.label.trim() } : {}) }]);
                setNewRange({ from: "", to: "", label: "" });
              }}
              className="btn-primary min-h-11 self-end rounded-xl px-4 text-sm disabled:opacity-40"
            >
              Add dates
            </button>
          </div>
          <p className="mt-1.5 text-xs text-white/50">Press “Save settings” to apply changes.</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void saveSettings()} disabled={saving} className="btn-primary min-h-11 rounded-xl px-5 text-sm">
            {saving ? "Saving…" : "Save settings"}
          </button>
          {notice ? <p className="text-sm text-emerald" role="status">{notice}</p> : null}
        </div>
      </section>

    </div>
  );
}
