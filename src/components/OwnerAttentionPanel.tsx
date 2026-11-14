"use client";

/**
 * Owner Dashboard front screen → "Needs your attention".
 * One list of every request that is waiting on the owner, whatever its type:
 *   - short-notice bookings to approve or decline
 *   - address-to-address quotes that need a price
 *   - Event Transfer / Business Class requests that need a price or a payment decision
 * Read-only: it only lists and links. Each row opens the existing tool at that
 * request, where the usual buttons do the work. No pricing or payment logic here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchOwnerA2aQuotes, type A2aQuoteOwnerSummary } from "@/lib/a2a-quote-api";
import { fetchOwnerBespokeRequests } from "@/lib/bespoke-quote-api";
import { fetchShortNoticeBookings, type ShortNoticeBookingSummary } from "@/lib/short-notice-api";
import { BUSINESS_CLASS_REQUEST_SERVICE_LABELS, type BespokeQuoteOwnerSummary } from "../../shared/bespoke-quote";
import { formatUkDate } from "../../shared/uk-time";

export type OwnerAttentionKind = "short_notice" | "a2a" | "bespoke";

export type OwnerAttentionItem = {
  key: string;
  kind: OwnerAttentionKind;
  reference: string;
  /** Short type label, e.g. "Short notice". */
  typeLabel: string;
  /** What the owner has to do. */
  action: string;
  title: string;
  detail: string;
  /** Shown in place of the detail's urgency, e.g. "Reply by 14:30". */
  deadlineLabel?: string;
  urgent: boolean;
  /** Lower sorts first. */
  rank: number;
};

type ShortNoticeRow = ShortNoticeBookingSummary & {
  removedFromDashboardAt?: string;
  booking?: { customerName?: string; tripDate?: string; tripTime?: string; pickupLabel?: string; dropoffLabel?: string };
};

function when(date?: string, time?: string): string {
  if (!date) return "";
  return `${formatUkDate(date)}${time ? ` at ${time.slice(0, 5)}` : ""}`;
}

function journeyRank(date?: string, time?: string): number {
  const t = Date.parse(`${date ?? ""}T${(time ?? "00:00").slice(0, 5)}:00Z`);
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

function londonClock(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

/** Pure: which short-notice bookings still need an approve/decline. */
export function shortNoticeAttention(rows: ShortNoticeRow[], now = Date.now()): OwnerAttentionItem[] {
  const items: OwnerAttentionItem[] = [];
  for (const row of rows) {
    if (row.status !== "SHORT_NOTICE_AWAITING_APPROVAL" || row.removedFromDashboardAt) continue;
    const deadline = row.shortNoticeExpiresAt ? Date.parse(row.shortNoticeExpiresAt) : NaN;
    if (Number.isFinite(deadline) && deadline <= now) continue; // response window already closed
    const b = row.booking ?? {};
    items.push({
      key: `sn:${row.reference}`,
      kind: "short_notice",
      reference: row.reference,
      typeLabel: "Short notice",
      action: "Approve or decline",
      title: b.customerName || "Customer",
      detail: [when(b.tripDate, b.tripTime), [b.pickupLabel, b.dropoffLabel].filter(Boolean).join(" → "), row.amountLabel].filter(Boolean).join(" · "),
      ...(Number.isFinite(deadline) ? { deadlineLabel: `Reply by ${londonClock(row.shortNoticeExpiresAt as string)}` } : {}),
      urgent: true,
      // Soonest reply deadline first; these always sit above everything else.
      rank: Number.isFinite(deadline) ? deadline - 4e15 : journeyRank(b.tripDate, b.tripTime) - 3e15,
    });
  }
  return items;
}

/** Pure: address-to-address quotes waiting for the owner's price. */
export function a2aAttention(quotes: A2aQuoteOwnerSummary[]): OwnerAttentionItem[] {
  return quotes
    .filter((q) => q.status === "AWAITING_QUOTE")
    .map((q) => ({
      key: `a2a:${q.reference}`,
      kind: "a2a" as const,
      reference: q.reference,
      typeLabel: q.isCounterOffer ? "Address quote (changed)" : "Address quote",
      action: "Needs a price",
      title: q.customerName || "Customer",
      detail: [when(q.tripDate, q.tripTime), q.tripLabel || [q.pickupLabel, q.dropoffLabel].filter(Boolean).join(" → "), q.vehicle].filter(Boolean).join(" · "),
      urgent: false,
      rank: journeyRank(q.tripDate, q.tripTime),
    }));
}

/** Pure: Event / Business Class requests waiting on the owner (not on the customer). */
export function bespokeAttention(items: BespokeQuoteOwnerSummary[]): OwnerAttentionItem[] {
  const out: OwnerAttentionItem[] = [];
  for (const r of items) {
    let action = "";
    let urgent = false;
    if (r.status === "REFUND_REQUIRED") {
      action = "Refund needed";
      urgent = true;
    } else if (r.status === "PAYMENT_REVIEW" || r.reviewOpen) {
      action = "Payment needs your decision";
      urgent = true;
    } else if (r.status === "NEW" || r.status === "REVIEWING") {
      action = "Needs a price";
    } else continue; // quoted / paying / confirmed / closed: nothing for the owner to do
    const isEvent = r.category === "event";
    const isDayTrip = r.category === "day_trip";
    out.push({
      key: `bq:${r.reference}`,
      kind: "bespoke",
      reference: r.reference,
      typeLabel: isEvent ? "Event transfer" : isDayTrip ? "Day trip" : "Business Class",
      action,
      title: isEvent ? r.eventTitle || "Event transfer" : isDayTrip ? r.dayTripTitle || "Private day trip" : r.serviceType ? BUSINESS_CLASS_REQUEST_SERVICE_LABELS[r.serviceType] : "Business Class",
      detail: [r.customerLabel, when(r.date, r.time), `${r.passengers} passenger${r.passengers === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
      urgent,
      rank: urgent ? journeyRank(r.date, r.time) - 2e15 : journeyRank(r.date, r.time),
    });
  }
  return out;
}

export function sortAttention(items: OwnerAttentionItem[]): OwnerAttentionItem[] {
  return [...items].sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
}

type Props = {
  ownerKey: string;
  onOpen: (item: OwnerAttentionItem) => void;
};

const REFRESH_MS = 60_000;

export default function OwnerAttentionPanel({ ownerKey, onOpen }: Props) {
  const [items, setItems] = useState<OwnerAttentionItem[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    const failed: string[] = [];
    const [shortNotice, a2a, bespoke] = await Promise.all([
      fetchShortNoticeBookings(ownerKey).catch(() => {
        failed.push("short-notice requests");
        return [] as ShortNoticeBookingSummary[];
      }),
      fetchOwnerA2aQuotes(ownerKey, "awaiting").catch(() => {
        failed.push("address quotes");
        return { quotes: [] as A2aQuoteOwnerSummary[], awaitingCount: 0 };
      }),
      fetchOwnerBespokeRequests(ownerKey).catch(() => {
        failed.push("Event & Business Class requests");
        return { items: [] as BespokeQuoteOwnerSummary[], publicEnabled: false };
      }),
    ]);
    if (!alive.current) return;
    setItems(sortAttention([...shortNoticeAttention(shortNotice as ShortNoticeRow[]), ...a2aAttention(a2a.quotes), ...bespokeAttention(bespoke.items)]));
    setProblems(failed);
    setLoading(false);
  }, [ownerKey]);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const count = items?.length ?? 0;

  return (
    <section aria-labelledby="owner-attention-heading" data-owner-attention data-bespoke-owner-panel className={`mb-5 rounded-2xl border border-white/10 bg-white/[0.03] ${count > 0 ? "p-4" : "px-4 py-2"}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="owner-attention-heading" className="flex items-center gap-2 text-base font-bold text-white">
          Needs your attention
          {count > 0 ? (
            <span className="inline-flex min-w-7 items-center justify-center rounded-full bg-emerald px-2 py-0.5 text-sm font-bold text-navy" aria-label={`${count} waiting`}>
              {count}
            </span>
          ) : null}
        </h2>
        <button type="button" onClick={() => void load()} disabled={loading} className="min-h-11 rounded-xl border border-white/20 px-3 text-sm font-semibold text-white disabled:opacity-60">
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {items === null ? (
        <p className="mt-2 text-sm text-white/60">Checking for requests…</p>
      ) : count === 0 ? (
        <p className="pb-1 text-sm text-white/70">Nothing is waiting on you right now.</p>
      ) : (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                data-attention-kind={item.kind}
                className={`block w-full rounded-xl border p-3 text-left transition-colors hover:border-emerald/60 ${item.urgent ? "border-amber-300/50 bg-amber-500/10" : "border-white/15 bg-white/[0.04]"}`}
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-white">{item.typeLabel}</span>
                  <span className={`text-sm font-bold ${item.urgent ? "text-amber-100" : "text-emerald"}`}>{item.action}</span>
                  {item.deadlineLabel ? <span className="text-sm font-semibold text-amber-100">· {item.deadlineLabel}</span> : null}
                </span>
                <span className="mt-1.5 block text-base font-bold text-white">{item.title}</span>
                {item.detail ? <span className="mt-0.5 block text-sm text-white/70">{item.detail}</span> : null}
                <span className="mt-1 block text-xs text-white/50">{item.reference} · Tap to open</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {problems.length > 0 ? (
        <p role="status" className="mt-3 text-sm text-amber-100">
          Couldn&apos;t check {problems.join(" or ")} just now. Tap Refresh, or open them from More.
        </p>
      ) : null}
    </section>
  );
}
