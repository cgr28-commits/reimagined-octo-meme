"use client";

/**
 * Owner Dashboard → More → Belfast events.
 * Hand-entered Belfast event listings. Nothing is public until the owner
 * publishes it, and publishing needs the "own words" confirmation (no copied
 * descriptions, no images). Uses the existing dashboard owner key (header only).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BELFAST_EVENT_CATEGORIES,
  BELFAST_EVENT_CATEGORY_SINGULAR,
  BELFAST_EVENT_STATUS_LABELS,
  BELFAST_VENUES,
  BELFAST_VENUE_OTHER,
  todayInLondon,
  type BelfastEventRecord,
} from "../../shared/belfast-events";
import { formatUkDate } from "../../shared/uk-time";
import {
  BelfastEventsApiError,
  fetchOwnerBelfastEvents,
  postOwnerBelfastEventAction,
  type BelfastEventOwnerAction,
} from "@/lib/belfast-events-api";

type Props = { ownerKey: string };
type Filter = "upcoming" | "drafts" | "past" | "all";

const fieldClass =
  "box-border mt-1 block min-h-11 w-full min-w-0 max-w-full rounded-xl border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white outline-none focus:border-emerald [color-scheme:dark]";
const labelClass = "block text-sm font-semibold text-white/80";
const primaryButton =
  "min-h-11 w-full min-w-0 rounded-xl bg-emerald px-4 py-2.5 text-sm font-semibold text-navy disabled:opacity-60 sm:w-auto";
const secondaryButton =
  "min-h-11 w-full min-w-0 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto";
const dangerButton =
  "min-h-11 w-full min-w-0 rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-100 disabled:opacity-60 sm:w-auto";
const card = "w-full min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-4";

type Draft = {
  title: string;
  category: string;
  venueId: string;
  venueName: string;
  venueArea: string;
  date: string;
  startTime: string;
  endTime: string;
  summary: string;
  officialUrl: string;
  ownWordsConfirmed: boolean;
  sourceNote: string;
  ownerNotes: string;
};

const EMPTY: Draft = {
  title: "",
  category: "concert",
  venueId: BELFAST_VENUES[0].id,
  venueName: "",
  venueArea: "",
  date: "",
  startTime: "",
  endTime: "",
  summary: "",
  officialUrl: "",
  ownWordsConfirmed: false,
  sourceNote: "",
  ownerNotes: "",
};

function toDraft(r: BelfastEventRecord): Draft {
  return {
    title: r.title,
    category: r.category,
    venueId: r.venueId,
    venueName: r.venueId === BELFAST_VENUE_OTHER ? r.venueName : "",
    venueArea: r.venueId === BELFAST_VENUE_OTHER ? r.venueArea : "",
    date: r.date,
    startTime: r.startTime ?? "",
    endTime: r.endTime ?? "",
    summary: r.summary,
    officialUrl: r.officialUrl ?? "",
    // A fresh confirmation is asked for on every edit.
    ownWordsConfirmed: false,
    sourceNote: r.sourceNote ?? "",
    ownerNotes: r.ownerNotes ?? "",
  };
}

function statusBadge(status: BelfastEventRecord["status"]): string {
  if (status === "published") return "bg-emerald/15 text-emerald";
  if (status === "draft") return "bg-white/10 text-white/80";
  return "bg-amber-400/15 text-amber-200";
}

export default function OwnerBelfastEventsPanel({ ownerKey }: Props) {
  const [events, setEvents] = useState<BelfastEventRecord[]>([]);
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [editing, setEditing] = useState<BelfastEventRecord | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchOwnerBelfastEvents(ownerKey);
      setEvents(data.events);
      setPublicEnabled(data.publicEnabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load events.");
    } finally {
      setLoading(false);
    }
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const today = todayInLondon();
  const visible = useMemo(() => {
    if (filter === "drafts") return events.filter((e) => e.status === "draft");
    if (filter === "past") return events.filter((e) => e.date < today).reverse();
    if (filter === "upcoming") return events.filter((e) => e.date >= today);
    return events;
  }, [events, filter, today]);

  const openNew = () => {
    setEditing("new");
    setDraft(EMPTY);
    setFieldErrors({});
    setNotice("");
  };
  const openEdit = (r: BelfastEventRecord) => {
    setEditing(r);
    setDraft(toDraft(r));
    setFieldErrors({});
    setNotice("");
  };

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function run(action: BelfastEventOwnerAction, withFields: boolean) {
    setBusy(true);
    setError("");
    setNotice("");
    setFieldErrors({});
    try {
      const current = editing && editing !== "new" ? editing : null;
      const { record } = await postOwnerBelfastEventAction(ownerKey, {
        action,
        ...(current ? { id: current.id, expectedVersion: current.version } : {}),
        ...(withFields ? { fields: { ...draft } } : {}),
      });
      setEvents((list) => {
        const rest = list.filter((e) => e.id !== record.id);
        return [...rest, record].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
      });
      setEditing(record);
      setDraft(toDraft(record));
      const messages: Record<BelfastEventOwnerAction, string> = {
        create: "Saved as a draft. It is not public until you publish it.",
        save: "Changes saved.",
        publish: publicEnabled ? "Published. It now shows on the Belfast events page." : "Published. It will show once the public events page is switched on.",
        unpublish: "Unpublished. It is a draft again and hidden from the website.",
        postpone: "Marked as postponed. Customers can no longer request transfers for it.",
        cancel: "Marked as cancelled. Customers can no longer request transfers for it.",
      };
      setNotice(messages[action]);
    } catch (e) {
      if (e instanceof BelfastEventsApiError) {
        setError(e.message);
        if (e.errors) setFieldErrors(e.errors);
        if (e.status === 409 && e.record) {
          const fresh = e.record;
          setEvents((list) => list.map((x) => (x.id === fresh.id ? fresh : x)));
        }
      } else setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const err = (key: string) =>
    fieldErrors[key] ? (
      <p className="mt-1 text-sm text-red-300" id={`bevt-${key}-error`}>
        {fieldErrors[key]}
      </p>
    ) : null;

  if (editing) {
    const record = editing === "new" ? null : editing;
    return (
      <div className="space-y-4">
        <button type="button" className="min-h-11 text-sm font-semibold text-emerald" onClick={() => { setEditing(null); setNotice(""); setError(""); }}>
          ← All events
        </button>
        <div className={card}>
          <div className="flex flex-wrap items-center gap-2">
            {record ? (
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(record.status)}`}>
                {BELFAST_EVENT_STATUS_LABELS[record.status]}
              </span>
            ) : (
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/80">New event</span>
            )}
          </div>
          <h2 className="mt-2 text-lg font-bold text-white">{record ? record.title : "Add a Belfast event"}</h2>
          <p className="mt-1 text-sm text-white/60">
            Write the summary yourself. Do not copy text or use images from ticket sites or venues.
          </p>
        </div>

        {notice ? <p role="status" className="rounded-xl border border-emerald/30 bg-emerald/10 p-3 text-sm text-emerald">{notice}</p> : null}
        {error ? <p role="alert" className="rounded-xl border border-red-300/40 bg-red-500/10 p-3 text-sm text-red-100">{error}</p> : null}

        <form
          className={`${card} space-y-4`}
          onSubmit={(e) => {
            e.preventDefault();
            void run(record ? "save" : "create", true);
          }}
        >
          <label className={labelClass}>
            Event name
            <input className={fieldClass} value={draft.title} maxLength={120} onChange={(e) => set("title", e.target.value)} aria-describedby={fieldErrors.title ? "bevt-title-error" : undefined} required />
            {err("title")}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Category
              <select className={fieldClass} value={draft.category} onChange={(e) => set("category", e.target.value)}>
                {BELFAST_EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{BELFAST_EVENT_CATEGORY_SINGULAR[c]}</option>
                ))}
              </select>
              {err("category")}
            </label>
            <label className={labelClass}>
              Venue (Belfast only)
              <select className={fieldClass} value={draft.venueId} onChange={(e) => set("venueId", e.target.value)}>
                {BELFAST_VENUES.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
                <option value={BELFAST_VENUE_OTHER}>Other Belfast venue…</option>
              </select>
              {err("venueId")}
            </label>
          </div>
          {draft.venueId === BELFAST_VENUE_OTHER ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>
                Venue name
                <input className={fieldClass} value={draft.venueName} maxLength={120} onChange={(e) => set("venueName", e.target.value)} />
                {err("venueName")}
              </label>
              <label className={labelClass}>
                Venue address with Belfast postcode
                <input className={fieldClass} value={draft.venueArea} maxLength={160} placeholder="e.g. Ormeau Road, Belfast BT7" onChange={(e) => set("venueArea", e.target.value)} />
                {err("venueArea")}
              </label>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <label className={labelClass}>
              Date
              <input type="date" className={fieldClass} value={draft.date} onChange={(e) => set("date", e.target.value)} required />
              {err("date")}
            </label>
            <label className={labelClass}>
              Start time (optional)
              <input type="time" className={fieldClass} value={draft.startTime} onChange={(e) => set("startTime", e.target.value)} />
              {err("startTime")}
            </label>
            <label className={labelClass}>
              Approx. finish (optional)
              <input type="time" className={fieldClass} value={draft.endTime} onChange={(e) => set("endTime", e.target.value)} />
              {err("endTime")}
            </label>
          </div>
          <label className={labelClass}>
            Summary for customers (your own words, up to 400 characters)
            <textarea className={`${fieldClass} min-h-28`} value={draft.summary} maxLength={400} onChange={(e) => set("summary", e.target.value)} required />
            <span className="mt-1 block text-xs text-white/50">{draft.summary.length}/400</span>
            {err("summary")}
          </label>
          <label className={labelClass}>
            Official information link (optional, https)
            <input type="url" className={fieldClass} value={draft.officialUrl} maxLength={300} placeholder="https://" onChange={(e) => set("officialUrl", e.target.value)} />
            {err("officialUrl")}
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              Where you found it (private)
              <input className={fieldClass} value={draft.sourceNote} maxLength={1000} onChange={(e) => set("sourceNote", e.target.value)} />
            </label>
            <label className={labelClass}>
              Private notes
              <input className={fieldClass} value={draft.ownerNotes} maxLength={1000} onChange={(e) => set("ownerNotes", e.target.value)} />
            </label>
          </div>
          <label className="flex min-h-11 items-start gap-3 text-sm text-white/85">
            <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-emerald" checked={draft.ownWordsConfirmed} onChange={(e) => set("ownWordsConfirmed", e.target.checked)} />
            <span>I wrote this summary myself. No text or images were copied from ticket sites, venues or promoters.</span>
          </label>
          {err("ownWordsConfirmed")}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button type="submit" className={primaryButton} disabled={busy}>
              {record ? "Save changes" : "Save as draft"}
            </button>
          </div>
        </form>

        {record ? (
          <div className={`${card} space-y-3`}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">Publishing</h3>
            {!publicEnabled ? (
              <p className="text-sm text-amber-200">The public events page is switched off. Published events will appear once it is switched on.</p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {record.status !== "published" ? (
                <button type="button" className={primaryButton} disabled={busy || !record.ownWordsConfirmed} onClick={() => void run("publish", false)}>
                  Approve and publish
                </button>
              ) : null}
              {record.status !== "draft" ? (
                <button type="button" className={secondaryButton} disabled={busy} onClick={() => void run("unpublish", false)}>
                  Unpublish (back to draft)
                </button>
              ) : null}
              {record.status === "published" ? (
                <>
                  <button type="button" className={secondaryButton} disabled={busy} onClick={() => void run("postpone", false)}>
                    Mark postponed
                  </button>
                  <button type="button" className={dangerButton} disabled={busy} onClick={() => { if (window.confirm("Mark this event as cancelled?")) void run("cancel", false); }}>
                    Mark cancelled
                  </button>
                </>
              ) : null}
            </div>
            {record.status !== "published" && !record.ownWordsConfirmed ? (
              <p className="text-sm text-white/60">To publish, tick the own-words box above and save first.</p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-white/10 bg-white/[0.04] p-3 text-sm text-white/75">
        Public Belfast events page is switched <strong className="text-white">{publicEnabled ? "on" : "off"}</strong>. Only events you approve and publish are shown.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {(
            [
              ["upcoming", "Upcoming"],
              ["drafts", "Drafts"],
              ["past", "Past"],
              ["all", "All"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${filter === id ? "border-white/30 bg-white/15 text-white" : "border-white/15 text-white/70"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className={primaryButton} onClick={openNew}>
          Add event
        </button>
      </div>
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      {loading ? <p className="text-sm text-white/60">Loading events…</p> : null}
      {!loading && visible.length === 0 ? <p className="text-sm text-white/60">No events here yet.</p> : null}
      <ul className="space-y-3">
        {visible.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => openEdit(e)} className={`${card} block text-left transition-colors hover:border-white/25`}>
              <span className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadge(e.status)}`}>{BELFAST_EVENT_STATUS_LABELS[e.status]}</span>
                <span className="text-xs text-white/55">{BELFAST_EVENT_CATEGORY_SINGULAR[e.category]}</span>
              </span>
              <span className="mt-2 block text-base font-bold text-white">{e.title}</span>
              <span className="mt-1 block text-sm text-white/65">
                {e.venueName} · {formatUkDate(e.date)}
                {e.startTime ? ` · ${e.startTime}` : ""}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
