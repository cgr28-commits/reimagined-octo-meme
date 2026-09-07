"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ISO_WEEKDAYS,
  buildUnavailableTimeRule,
  compactUnavailableRuleLabel,
  describeUnavailableDate,
  describeUntilEndLocal,
  resolveCurrentAvailabilityStatus,
  selectActiveUnavailableRules,
  untilShortcutEndLocal,
  unavailableFormFromRule,
  validateUnavailableTimeForm,
  type SmartAvailabilityRule,
  type UnavailableTimeForm,
  type UntilShortcutId,
} from "../../shared/smart-availability";
import { DEFAULT_SMART_OPS_CONFIG, type SmartOpsConfig } from "../../shared/smart-ops-config";
import {
  customerAvailabilityMessage,
  evaluateSmartAvailability,
  occupiedJobsFromPaidBooking,
  type SmartOccupiedJob,
} from "../../shared/smart-conflict";
import { addDaysYmd, londonYmd } from "../../shared/upcoming-jobs";
import { fetchOwnerPaidBookings } from "@/lib/paid-bookings-api";
import {
  evaluateSmartOpsTest,
  fetchSmartOpsCalendar,
  fetchSmartOpsState,
  saveSmartOpsAction,
  type SmartOpsState,
} from "@/lib/smart-ops-api";
import type { SmartShadowRecord } from "../../shared/smart-shadow";

type OwnerSmartAvailabilityPanelProps = {
  ownerKey: string;
};

type CalendarState = {
  bookings: Array<{ id: string; tripDate: string; tripTime: string }>;
  unavailable: Array<{
    ruleId?: string;
    startLocal: string;
    endLocal: string;
    recurring: boolean;
  }>;
};

const fieldClass =
  "box-border mt-1 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-white/15 bg-navy px-3 text-base text-white [color-scheme:dark]";
const labelClass = "block min-w-0 text-sm font-medium text-white/70";

function emptyForm(today = londonYmd()): UnavailableTimeForm {
  const date = addDaysYmd(today, 1);
  return {
    repeat: "one_off",
    date,
    endDate: date,
    startTime: "00:00",
    endTime: "10:00",
    weekdays: [1],
    note: "",
  };
}

const UNTIL_SHORTCUTS: Array<{ id: UntilShortcutId; label: string }> = [
  { id: "tonight_22", label: "Tonight 22:00" },
  { id: "midnight", label: "Midnight" },
  { id: "tomorrow_04", label: "Tomorrow 04:00" },
  { id: "tomorrow_08", label: "Tomorrow 08:00" },
];

function ruleById(rules: SmartAvailabilityRule[] | undefined, id?: string) {
  if (!id) return null;
  return (rules || []).find((rule) => rule.id === id) || null;
}

export default function OwnerSmartAvailabilityPanel({ ownerKey }: OwnerSmartAvailabilityPanelProps) {
  const today = londonYmd();
  const [state, setState] = useState<SmartOpsState | null>(null);
  const [shadow, setShadow] = useState<SmartShadowRecord[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"day" | "week">("day");
  const [focusDay, setFocusDay] = useState(today);
  const [calendar, setCalendar] = useState<CalendarState | null>(null);
  const [form, setForm] = useState<UnavailableTimeForm>(() => emptyForm(today));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [untilOpen, setUntilOpen] = useState(false);
  const [untilCustom, setUntilCustom] = useState({ date: addDaysYmd(today, 1), time: "04:00" });
  const [test, setTest] = useState({
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast City Centre",
    tripDate: today,
    tripTime: "14:00",
    vehicle: "Saloon",
    normalJourneyFareGbp: "45",
    durationMinutes: "30",
  });
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  const config = state?.config || DEFAULT_SMART_OPS_CONFIG;
  const rules = state?.rules || [];
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const currentStatus = useMemo(
    () => resolveCurrentAvailabilityStatus({ rules, exceptions: state?.exceptions, now }),
    [rules, state?.exceptions, now],
  );
  const activeRules = useMemo(
    () =>
      selectActiveUnavailableRules(rules, now).sort((a, b) => {
        const aKey = a.startLocal || a.date || a.startTime || a.id;
        const bKey = b.startLocal || b.date || b.startTime || b.id;
        return aKey.localeCompare(bKey);
      }),
    [rules, now],
  );
  const groupedActiveRules = useMemo(() => {
    const groups: Array<{ key: string; heading: string; items: SmartAvailabilityRule[] }> = [];
    const recurring: SmartAvailabilityRule[] = [];
    for (const rule of activeRules) {
      if (rule.kind === "recurring") {
        recurring.push(rule);
        continue;
      }
      const startDate = (rule.startLocal || rule.date || "").slice(0, 10);
      const heading = startDate ? describeUnavailableDate(startDate, today) : "Upcoming";
      const existing = groups.find((group) => group.key === startDate);
      if (existing) existing.items.push(rule);
      else groups.push({ key: startDate || rule.id, heading, items: [rule] });
    }
    if (recurring.length) {
      groups.push({ key: "recurring", heading: "Every week", items: recurring });
    }
    return groups;
  }, [activeRules, today]);

  const load = useCallback(async () => {
    const result = await fetchSmartOpsState(ownerKey);
    setState(result.state);
    setShadow(result.shadow || []);
  }, [ownerKey]);

  const loadCalendar = useCallback(async () => {
    const from = focusDay;
    const to = view === "day" ? focusDay : addDaysYmd(focusDay, 6);
    const result = (await fetchSmartOpsCalendar(ownerKey, from, to)) as {
      bookings?: CalendarState["bookings"];
      unavailable?: CalendarState["unavailable"];
    };
    setCalendar({
      bookings: result.bookings || [],
      unavailable: result.unavailable || [],
    });
  }, [ownerKey, view, focusDay]);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : "Could not load"));
  }, [load]);

  useEffect(() => {
    if (!state) return;
    void loadCalendar().catch(() => undefined);
  }, [state, loadCalendar]);

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await saveSmartOpsAction(ownerKey, { action, ...extra });
      setState(result.state);
      setMessage(action === "delete_rule" ? "Removed." : "Saved.");
      await loadCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveFlags(next: Partial<SmartOpsConfig["flags"]>) {
    await run("save_config", { config: { ...config, flags: { ...config.flags, ...next } } });
  }

  async function saveSettings(patch: Partial<SmartOpsConfig>) {
    await run("save_config", { config: { ...config, ...patch } });
  }

  function startEdit(rule: SmartAvailabilityRule) {
    setEditingId(rule.id);
    setForm(unavailableFormFromRule(rule, today));
    setScheduleOpen(true);
    setUntilOpen(false);
    setMessage("");
    window.setTimeout(() => {
      document.getElementById("owner-add-unavailable")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function saveUnavailableTime() {
    const problem = validateUnavailableTimeForm(form);
    if (problem) {
      setError(problem);
      return;
    }
    const rule = buildUnavailableTimeRule({
      ...form,
      id: editingId || undefined,
      enabled: true,
    });
    if (!rule) {
      setError(
        "Unavailable until must be after unavailable from. For an overnight block, set the until date to the next day.",
      );
      return;
    }
    await run("save_rule", { rule });
    setEditingId(null);
    setScheduleOpen(false);
    setForm(emptyForm(today));
  }

  async function applyUntil(endLocal: string) {
    await run("quick_block", { kind: "until", endLocal });
    setUntilOpen(false);
  }

  const days = useMemo(() => {
    if (view === "day") return [focusDay];
    return Array.from({ length: 7 }, (_, i) => addDaysYmd(focusDay, i));
  }, [view, focusDay]);

  return (
    <section className="mb-10 w-full min-w-0 max-w-full space-y-4" data-owner-smart-ops>
      <div
        className={`rounded-2xl border p-4 sm:p-5 ${
          currentStatus.available
            ? "border-emerald/40 bg-emerald/10"
            : "border-red-400/40 bg-red-500/10"
        }`}
        data-owner-availability-status
      >
        <h2 className="text-lg font-bold text-white">Availability</h2>
        <p
          className={`mt-3 text-xl font-extrabold tracking-tight sm:text-2xl ${
            currentStatus.available ? "text-emerald" : "text-red-100"
          }`}
        >
          {currentStatus.available ? "🟢 AVAILABLE NOW" : `🔴 ${currentStatus.headline}`}
        </p>
        <p className="mt-1 text-sm text-white/70">{currentStatus.detail}</p>
        {error ? (
          <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        {message ? <p className="mt-3 text-sm text-emerald-light">{message}</p> : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Quick controls</h3>
        <p className="mt-1 text-sm text-white/60">Most changes take one tap.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(
            [
              { label: "1 hour", action: () => run("quick_block", { kind: "hours", hours: 1 }) },
              { label: "2 hours", action: () => run("quick_block", { kind: "hours", hours: 2 }) },
              { label: "4 hours", action: () => run("quick_block", { kind: "hours", hours: 4 }) },
              { label: "Until…", action: () => setUntilOpen((open) => !open) },
              { label: "Rest of today", action: () => run("quick_block", { kind: "rest_of_today" }) },
              {
                label: "Available now",
                action: () => run("available_now"),
                emphasize: currentStatus.available === false,
              },
            ] as const
          ).map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={busy}
              onClick={() => void item.action()}
              className={`min-h-12 rounded-xl px-3 text-sm font-semibold disabled:opacity-60 ${
                "emphasize" in item && item.emphasize
                  ? "bg-emerald text-navy"
                  : "border border-white/15 text-white"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        {untilOpen ? (
          <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-navy/80 p-3" data-owner-until-picker>
            <p className="text-sm font-semibold text-white">Unavailable from now until…</p>
            <p className="text-xs text-white/55">
              Start is now. Choose when you want to be available again — overnight is fine.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {UNTIL_SHORTCUTS.map((item) => {
                const endLocal = untilShortcutEndLocal(item.id, now);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={busy || !endLocal}
                    onClick={() => endLocal && void applyUntil(endLocal)}
                    className="min-h-12 rounded-xl border border-white/15 px-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {item.label}
                    {endLocal ? (
                      <span className="mt-0.5 block text-[11px] font-normal text-white/50">
                        {describeUntilEndLocal(endLocal, today)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="pt-1 text-xs font-semibold uppercase tracking-wider text-white/45">
              Choose date &amp; time
            </p>
            <div className="grid grid-cols-2 gap-2">
              <label className={labelClass}>
                Date
                <input
                  type="date"
                  value={untilCustom.date}
                  onChange={(event) =>
                    setUntilCustom((prev) => ({ ...prev, date: event.target.value }))
                  }
                  className={fieldClass}
                />
              </label>
              <label className={labelClass}>
                Time
                <input
                  type="time"
                  value={untilCustom.time}
                  onChange={(event) =>
                    setUntilCustom((prev) => ({ ...prev, time: event.target.value }))
                  }
                  className={fieldClass}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void applyUntil(`${untilCustom.date}T${untilCustom.time}`)}
              className="min-h-12 w-full rounded-xl bg-emerald px-4 text-sm font-bold text-navy"
            >
              Confirm until {describeUntilEndLocal(`${untilCustom.date}T${untilCustom.time}`, today)}
            </button>
          </div>
        ) : null}
      </div>

      <div
        id="owner-add-unavailable"
        className="w-full min-w-0 max-w-full rounded-2xl border border-white/10 bg-navy/70 p-4"
        data-owner-add-unavailable
      >
        <button
          type="button"
          onClick={() => {
            if (scheduleOpen && !editingId) {
              setScheduleOpen(false);
              return;
            }
            setScheduleOpen(true);
          }}
          className="flex min-h-12 w-full items-center justify-between gap-3 text-left"
        >
          <span className="text-sm font-bold uppercase tracking-wider text-white/70">
            {editingId ? "Edit unavailable time" : "+ Schedule unavailable time"}
          </span>
          <span className="text-emerald" aria-hidden>
            {scheduleOpen || editingId ? "▲" : "▼"}
          </span>
        </button>
        {scheduleOpen || editingId ? (
        <div className="mt-3 grid w-full min-w-0 max-w-full grid-cols-1 gap-3">
          <p className="text-sm text-white/60">
            For planned future unavailability. Overnight needs an until date on the next day.
          </p>
          <label className={labelClass}>
            {form.repeat === "recurring" ? "From date" : "Start date"}
            <input
              type="date"
              value={form.date}
              onChange={(event) => {
                const date = event.target.value;
                setForm((prev) => ({
                  ...prev,
                  date,
                  endDate: !prev.endDate || prev.endDate < date ? date : prev.endDate,
                }));
              }}
              className={fieldClass}
            />
          </label>
          {form.repeat === "one_off" ? (
            <label className={labelClass}>
              Until date
              <input
                type="date"
                value={form.endDate}
                onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
                className={fieldClass}
              />
            </label>
          ) : null}
          <div className="grid w-full min-w-0 max-w-full grid-cols-2 gap-2">
            <label className={labelClass}>
              Unavailable from
              <input
                type="time"
                value={form.startTime}
                onChange={(event) =>
                  setForm((prev) => {
                    const startTime = event.target.value;
                    const next = { ...prev, startTime };
                    if (
                      prev.repeat === "one_off" &&
                      prev.endDate === prev.date &&
                      prev.endTime &&
                      startTime &&
                      prev.endTime <= startTime
                    ) {
                      next.endDate = addDaysYmd(prev.date, 1);
                    }
                    return next;
                  })
                }
                className={fieldClass}
              />
            </label>
            <label className={labelClass}>
              Unavailable until
              <input
                type="time"
                value={form.endTime}
                onChange={(event) =>
                  setForm((prev) => {
                    const endTime = event.target.value;
                    const next = { ...prev, endTime };
                    if (
                      prev.repeat === "one_off" &&
                      prev.endDate === prev.date &&
                      prev.startTime &&
                      endTime &&
                      endTime <= prev.startTime
                    ) {
                      next.endDate = addDaysYmd(prev.date, 1);
                    }
                    return next;
                  })
                }
                className={fieldClass}
              />
            </label>
          </div>
          {form.repeat === "one_off" && form.endDate && form.endDate !== form.date ? (
            <p className="text-xs text-emerald/90">
              Overnight: {form.date} {form.startTime} → {form.endDate} {form.endTime}
            </p>
          ) : null}
          <fieldset className="min-w-0">
            <legend className={labelClass}>Repeat</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  ["one_off", "This date only"],
                  ["recurring", "Every week"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, repeat: value }))}
                  className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${
                    form.repeat === value
                      ? "bg-emerald text-navy"
                      : "border border-white/15 text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
          {form.repeat === "recurring" ? (
            <fieldset className="min-w-0">
              <legend className={labelClass}>Days of the week</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {ISO_WEEKDAYS.map((day) => {
                  const on = form.weekdays.includes(day.iso);
                  return (
                    <button
                      key={day.iso}
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          weekdays: on
                            ? prev.weekdays.filter((item) => item !== day.iso)
                            : [...prev.weekdays, day.iso],
                        }))
                      }
                      className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${
                        on ? "bg-emerald text-navy" : "border border-white/15 text-white"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          <label className={labelClass}>
            Private note <span className="font-normal text-white/45">(optional)</span>
            <input
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              placeholder="Only you can see this"
              className={fieldClass}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {editingId ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setEditingId(null);
                  setScheduleOpen(false);
                  setForm(emptyForm(today));
                }}
                className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-white"
              >
                Cancel
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveUnavailableTime()}
              className="min-h-11 rounded-xl bg-emerald px-4 text-sm font-bold text-navy"
            >
              Save
            </button>
          </div>
        </div>
        ) : null}
      </div>

      <div className="w-full min-w-0 max-w-full rounded-2xl border border-white/10 bg-navy/70 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Your unavailable times</h3>
        <div className="mt-3 space-y-4">
          {groupedActiveRules.map((group) => (
            <div key={group.key}>
              <p className="text-xs font-bold uppercase tracking-wider text-white/45">{group.heading}</p>
              <ul className="mt-1.5 divide-y divide-white/10">
                {group.items.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex min-h-12 w-full min-w-0 items-center gap-2 py-1.5"
                    data-unavailable-rule={rule.id}
                  >
                    <p className="min-w-0 flex-1 break-words text-sm font-semibold text-white">
                      {compactUnavailableRuleLabel(rule, today)}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => startEdit(rule)}
                      className="min-h-11 shrink-0 rounded-xl border border-white/15 px-3 text-sm font-semibold text-white"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label="Delete unavailable time"
                      onClick={() => void run("delete_rule", { id: rule.id })}
                      className="min-h-11 min-w-11 shrink-0 rounded-xl border border-red-400/30 text-lg font-bold leading-none text-red-100"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {groupedActiveRules.length === 0 ? (
            <p className="text-sm text-white/55">None coming up. Use a quick control or schedule a time.</p>
          ) : null}
        </div>
      </div>

      <div className="w-full min-w-0 max-w-full rounded-2xl border border-white/10 bg-navy/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Calendar</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setView("day")}
              className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${view === "day" ? "bg-emerald text-navy" : "border border-white/15 text-white"}`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setView("week")}
              className={`min-h-11 rounded-xl px-3 text-sm font-semibold ${view === "week" ? "bg-emerald text-navy" : "border border-white/15 text-white"}`}
            >
              Week
            </button>
          </div>
        </div>
        <input
          type="date"
          value={focusDay}
          onChange={(event) => setFocusDay(event.target.value)}
          className={fieldClass}
        />
        <div className="mt-3 space-y-3">
          {days.map((day) => (
            <div key={day} className="rounded-xl border border-white/10 p-3">
              <p className="text-sm font-semibold text-white">{describeUnavailableDate(day, today)}</p>
              <ul className="mt-2 space-y-2 text-sm">
                {(calendar?.bookings || [])
                  .filter((item) => item.tripDate === day)
                  .map((item) => (
                    <li key={item.id} className="rounded-lg bg-sky-500/15 px-3 py-2 text-sky-100">
                      Booked · {item.tripTime}
                    </li>
                  ))}
                {(calendar?.unavailable || [])
                  .filter(
                    (item) => item.startLocal.slice(0, 10) <= day && item.endLocal.slice(0, 10) >= day,
                  )
                  .map((item) => {
                    const rule = ruleById(rules, item.ruleId);
                    return (
                      <li
                        key={`${item.ruleId || "x"}-${item.startLocal}-${item.endLocal}`}
                        className="rounded-lg bg-rose-500/15 px-3 py-2 text-rose-100"
                      >
                        <p className="break-words font-semibold">
                          Unavailable · {item.startLocal.slice(11, 16)}–{item.endLocal.slice(11, 16)}
                          {item.recurring ? " · weekly" : ""}
                        </p>
                        {rule ? (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(rule)}
                              className="min-h-11 rounded-xl border border-white/20 px-3 text-sm font-semibold text-white"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void run("delete_rule", { id: rule.id })}
                              className="min-h-11 rounded-xl border border-red-400/30 px-3 text-sm font-semibold text-red-100"
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4" data-owner-smart-ops-test>
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Owner test tool</h3>
        <p className="mt-1 text-sm text-white/60">Try a pickup time against your blocks and bookings.</p>
        <div className="mt-3 grid w-full min-w-0 max-w-full grid-cols-1 gap-3">
          <input
            value={test.pickupLabel}
            onChange={(event) => setTest((prev) => ({ ...prev, pickupLabel: event.target.value }))}
            className={fieldClass}
            placeholder="Pickup"
          />
          <input
            value={test.dropoffLabel}
            onChange={(event) => setTest((prev) => ({ ...prev, dropoffLabel: event.target.value }))}
            className={fieldClass}
            placeholder="Destination"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={test.tripDate}
              onChange={(event) => setTest((prev) => ({ ...prev, tripDate: event.target.value }))}
              className={fieldClass}
            />
            <input
              type="time"
              value={test.tripTime}
              onChange={(event) => setTest((prev) => ({ ...prev, tripTime: event.target.value }))}
              className={fieldClass}
            />
          </div>
          <select
            value={test.vehicle}
            onChange={(event) => setTest((prev) => ({ ...prev, vehicle: event.target.value }))}
            className={fieldClass}
          >
            <option>Saloon</option>
            <option>Estate</option>
          </select>
          <input
            value={test.normalJourneyFareGbp}
            onChange={(event) =>
              setTest((prev) => ({ ...prev, normalJourneyFareGbp: event.target.value }))
            }
            className={fieldClass}
            placeholder="Normal fare £"
          />
          <input
            value={test.durationMinutes}
            onChange={(event) => setTest((prev) => ({ ...prev, durationMinutes: event.target.value }))}
            className={fieldClass}
            placeholder="Journey duration (minutes)"
          />
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                const result = (await evaluateSmartOpsTest(ownerKey, {
                  ...test,
                  normalJourneyFareGbp: Number(test.normalJourneyFareGbp),
                  durationMinutes: Number(test.durationMinutes) || undefined,
                })) as Record<string, unknown>;
                let occupied: SmartOccupiedJob[] = Array.isArray(result.occupiedJobs)
                  ? (result.occupiedJobs as SmartOccupiedJob[])
                  : [];
                if (!occupied.length) {
                  const bookings = await fetchOwnerPaidBookings(ownerKey, {
                    mode: "upcoming",
                    pastDays: 7,
                    futureDays: 21,
                    limit: 250,
                  });
                  occupied = bookings.flatMap((booking) => occupiedJobsFromPaidBooking(booking));
                }
                const local = evaluateSmartAvailability({
                  requested: {
                    pickupLabel: test.pickupLabel,
                    dropoffLabel: test.dropoffLabel,
                    tripDate: test.tripDate,
                    tripTime: test.tripTime,
                    vehicle: test.vehicle,
                    durationMinutes: Number(test.durationMinutes) || undefined,
                  },
                  occupied,
                  rules: state?.rules,
                  exceptions: state?.exceptions,
                  config: (result.config as SmartOpsConfig) || config,
                  now: new Date(),
                });
                const localDiagnostics = {
                  ...(typeof result.diagnostics === "object" && result.diagnostics
                    ? (result.diagnostics as Record<string, unknown>)
                    : {}),
                  ...local.diagnostics,
                  available: local.available,
                  reason: local.reason,
                  alternativeReason: local.alternativeReason,
                  suggestedAlternatives: local.alternatives,
                  engine: "preview-local",
                };
                setTestResult({
                  ...result,
                  availability: local,
                  customerMessage: customerAvailabilityMessage(local, test.tripTime),
                  diagnostics: localDiagnostics,
                  workerAvailability: result.availability,
                });
              } catch (err) {
                setError(err instanceof Error ? err.message : "Test failed");
              } finally {
                setBusy(false);
              }
            }}
            className="min-h-11 rounded-xl bg-emerald px-4 text-sm font-bold text-navy"
          >
            Run test
          </button>
        </div>
        {testResult ? (
          <div className="mt-3 space-y-2">
            {(() => {
              const diag = (testResult.diagnostics || {}) as Record<string, unknown>;
              const available = diag.available === true;
              return (
                <p
                  className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                    available ? "bg-emerald/20 text-emerald" : "bg-red-500/20 text-red-100"
                  }`}
                >
                  {available ? "Available" : "Not available"}
                  {diag.reason ? ` · ${String(diag.reason)}` : ""}
                      {diag.previousBookingPickupLocal ||
                      diag.estimatedCompletionLocal ||
                      diag.estimatedCompletion ? (
                    <span className="mt-1 block text-xs font-normal opacity-90">
                      {diag.previousBookingPickupLocal ? (
                        <>
                          Previous {String(diag.previousBookingPickupLocal)} finishes at{" "}
                          {String(diag.previousBookingDestination || "unknown destination")} at{" "}
                          {String(diag.previousBookingCompletionLocal || "unknown")}
                          {typeof diag.previousBookingDurationMinutes === "number"
                            ? ` (${diag.previousBookingDurationMinutes} min journey)`
                            : ""}
                          {diag.previousBookingOperationalEndLocal
                            ? `; operational window ends ${String(diag.previousBookingOperationalEndLocal)}`
                            : ""}
                          {typeof diag.previousPositioningMinutes === "number"
                            ? `. Then ${diag.previousPositioningMinutes} min drive to this pickup + ${String(diag.minTurnaround ?? 10)} min turnaround`
                            : ""}
                          {typeof diag.previousPositioningNeededMinutes === "number"
                            ? ` (${diag.previousPositioningNeededMinutes} min needed)`
                            : ""}
                          {diag.earliestReadyAfterPreviousLocal
                            ? `, driver ready at this location ${String(diag.earliestReadyAfterPreviousLocal)} from journey completion`
                            : ""}
                          {typeof diag.proposedAirportBufferMinutes === "number" &&
                          Number(diag.proposedAirportBufferMinutes) > 0
                            ? `, then ${diag.proposedAirportBufferMinutes} min airport on-site buffer`
                            : ""}
                          {diag.earliestBookablePassengerLocal
                            ? `, earliest passenger pickup ${String(diag.earliestBookablePassengerLocal)}`
                            : ""}
                          {diag.proposedOnSiteDeadlineLocal
                            ? ` vs this test on-site deadline ${String(diag.proposedOnSiteDeadlineLocal)}`
                            : ""}
                          {diag.conflictKind ? ` · ${String(diag.conflictKind)}` : ""}
                          {diag.conflictSummary ? ` — ${String(diag.conflictSummary)}` : ""}.
                        </>
                      ) : null}
                      {diag.nextBookingResolvedLocal &&
                      diag.sameCalendarDayAsNext === true &&
                      diag.conflictKind !== "overlap" &&
                      diag.conflictKind !== "previous_positioning" ? (
                        <>
                          {diag.previousBookingPickupLocal ? " " : ""}
                          Proposed finishes {String(diag.estimatedCompletionLocal || diag.estimatedCompletion)},
                          needs {String(diag.positioningNeededMinutes)} min
                          {typeof diag.nextPositioningMinutes === "number"
                            ? ` (${diag.nextPositioningMinutes} min drive + ${String(diag.minTurnaround ?? 10)} min turnaround)`
                            : ""}
                          {diag.earliestReadyLocal && !diag.previousBookingPickupLocal
                            ? `, earliest ready ${String(diag.earliestReadyLocal)}`
                            : ""}
                          {` before same-day next pickup ${String(diag.nextBookingResolvedLocal)}`}
                        </>
                      ) : null}
                    </span>
                  ) : null}
                </p>
              );
            })()}
            {testResult.diagnostics ? (
              <dl className="grid gap-1 rounded-xl bg-black/30 p-3 text-[11px] text-white/80">
                {Object.entries(testResult.diagnostics as Record<string, unknown>).map(([key, value]) => (
                  <div key={key} className="grid grid-cols-[11rem_1fr] gap-2">
                    <dt className="text-white/45">{key}</dt>
                    <dd className="break-all">
                      {typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                        ? String(value)
                        : JSON.stringify(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {typeof testResult.customerMessage === "string" && testResult.customerMessage ? (
              <p className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/80">
                {String(testResult.customerMessage)}
              </p>
            ) : null}
            <pre className="overflow-x-auto rounded-xl bg-black/30 p-3 text-[11px] text-white/80">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>

      <details className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <summary className="min-h-11 cursor-pointer text-sm font-bold uppercase tracking-wider text-white/50">
          Advanced settings — keep off
        </summary>
        <div className="mt-3 grid gap-2">
          {(
            [
              ["smartAvailability", "Smart Availability (customer)", true],
              ["alternativeTimeSuggestions", "Alternative time suggestions (customer)", true],
              ["smartReturnPricing", "Smart Return Pricing (customer)", true],
              ["returnCorridorMatching", "Return corridor matching", true],
              ["backupDriverCapacity", "Backup driver capacity", true],
              ["shadowMode", "Shadow test mode", true],
            ] as const
          ).map(([key, label, locked]) => (
            <label key={key} className="flex min-h-11 items-center justify-between gap-3 text-sm text-white">
              <span>
                {label}
                {locked ? <span className="ml-2 text-xs text-amber-100/80">locked</span> : null}
              </span>
              <input
                type="checkbox"
                checked={Boolean(config.flags[key])}
                disabled={locked || busy}
                onChange={(event) => void saveFlags({ [key]: event.target.checked })}
                className="h-5 w-5 accent-emerald disabled:opacity-60"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-amber-100/90">
          Customer Smart Availability, Alternative Times, Smart Return, corridor matching and backup
          capacity stay OFF. Shadow test mode stays ON. Live quotes are unchanged.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-white/50">
            Short journey buffer
            <select
              value={config.buffers.shortJourneyBufferMinutes}
              onChange={(event) =>
                void saveSettings({
                  buffers: {
                    ...config.buffers,
                    shortJourneyBufferMinutes: Number(event.target.value) as 15 | 30 | 45,
                  },
                })
              }
              className={fieldClass}
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
            </select>
          </label>
          <label className="text-xs text-white/50">
            Long-distance buffer
            <select
              value={config.buffers.longDistanceBufferMinutes}
              onChange={(event) =>
                void saveSettings({
                  buffers: {
                    ...config.buffers,
                    longDistanceBufferMinutes: Number(event.target.value) as 30 | 45 | 60,
                  },
                })
              }
              className={fieldClass}
            >
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
          </label>
          <label className="text-xs text-white/50">
            Airport pickup buffer (minutes)
            <input
              type="number"
              value={config.buffers.airportPickupBufferMinutes}
              onChange={(event) =>
                void saveSettings({
                  buffers: {
                    ...config.buffers,
                    airportPickupBufferMinutes: Number(event.target.value),
                  },
                })
              }
              className={fieldClass}
            />
          </label>
          <label className="text-xs text-white/50">
            Minimum turnaround
            <select
              value={config.buffers.minTurnaroundMinutes}
              onChange={(event) =>
                void saveSettings({
                  buffers: {
                    ...config.buffers,
                    minTurnaroundMinutes: Number(event.target.value) as 5 | 10 | 15 | 20,
                  },
                })
              }
              className={fieldClass}
            >
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={20}>20 minutes</option>
            </select>
          </label>
        </div>
      </details>

      <details className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <summary className="min-h-11 cursor-pointer text-sm font-bold uppercase tracking-wider text-white/50">
          Shadow log
        </summary>
        <p className="mt-2 text-xs text-white/45">
          Route fingerprints only — no customer names, phones or addresses beyond the quote labels
          already used for the journey.
        </p>
        <ul className="mt-3 space-y-2 text-xs text-white/70">
          {shadow.slice(0, 12).map((item) => (
            <li key={`${item.at}-${item.fingerprint}`} className="rounded-lg border border-white/10 px-3 py-2">
              {item.at.slice(0, 16)} · live {item.liveQuoted ? "quoted" : "no"} ·{" "}
              {item.availability.reason} · return {item.smartReturn.reason}
            </li>
          ))}
          {shadow.length === 0 ? <li>No shadow samples yet.</li> : null}
        </ul>
      </details>
    </section>
  );
}
