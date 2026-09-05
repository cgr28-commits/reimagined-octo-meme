"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ISO_WEEKDAYS,
  buildUnavailableTimeRule,
  describeUnavailableDate,
  describeUnavailableRule,
  isQuickBlockRule,
  unavailableFormFromRule,
  type SmartAvailabilityRule,
  type UnavailableTimeForm,
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
  return {
    repeat: "one_off",
    date: addDaysYmd(today, 1),
    startTime: "00:00",
    endTime: "10:00",
    weekdays: [1],
    note: "",
  };
}

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
    setMessage("");
    document.getElementById("owner-add-unavailable")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveUnavailableTime() {
    const rule = buildUnavailableTimeRule({
      ...form,
      id: editingId || undefined,
      enabled: true,
    });
    if (!rule) {
      setError("Check the date and times, then tap Save again.");
      return;
    }
    await run("save_rule", { rule });
    setEditingId(null);
    setForm(emptyForm(today));
  }

  const days = useMemo(() => {
    if (view === "day") return [focusDay];
    return Array.from({ length: 7 }, (_, i) => addDaysYmd(focusDay, i));
  }, [view, focusDay]);

  const sortedRules = useMemo(
    () =>
      [...rules].sort((a, b) => {
        const aKey = a.startLocal || a.date || a.startTime || a.id;
        const bKey = b.startLocal || b.date || b.startTime || b.id;
        return aKey.localeCompare(bKey);
      }),
    [rules],
  );

  return (
    <section className="mb-10 w-full min-w-0 max-w-full space-y-4" data-owner-smart-ops>
      <div className="rounded-2xl border border-amber-400/25 bg-navy/70 p-4 sm:p-5">
        <h2 className="text-lg font-bold text-white">Availability</h2>
        <p className="mt-2 text-sm text-white/70">
          Mark when you cannot take bookings. Customers still use the live website until this is
          switched on.
        </p>
        {error ? (
          <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        {message ? <p className="mt-3 text-sm text-emerald-light">{message}</p> : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Quick controls</h3>
        <p className="mt-1 text-sm text-white/60">For something that has just come up.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(
            [
              { label: "1 hour", action: () => run("quick_block", { kind: "hours", hours: 1 }) },
              { label: "2 hours", action: () => run("quick_block", { kind: "hours", hours: 2 }) },
              { label: "4 hours", action: () => run("quick_block", { kind: "hours", hours: 4 }) },
              { label: "Rest of today", action: () => run("quick_block", { kind: "rest_of_today" }) },
              { label: "Whole day", action: () => run("quick_block", { kind: "whole_day" }) },
              { label: "Available now", action: () => run("available_now") },
            ] as const
          ).map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={busy}
              onClick={() => void item.action()}
              className="min-h-11 rounded-xl border border-white/15 px-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        id="owner-add-unavailable"
        className="w-full min-w-0 max-w-full rounded-2xl border border-white/10 bg-navy/70 p-4"
        data-owner-add-unavailable
      >
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">
          {editingId ? "Edit unavailable time" : "Add unavailable time"}
        </h3>
        <p className="mt-1 text-sm text-white/60">
          Example: tomorrow, 00:00 to 10:00, this date only — you are free from 10:00.
        </p>
        <div className="mt-3 grid w-full min-w-0 max-w-full grid-cols-1 gap-3">
          <label className={labelClass}>
            Date
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              className={fieldClass}
            />
          </label>
          <div className="grid w-full min-w-0 max-w-full grid-cols-2 gap-2">
            <label className={labelClass}>
              Unavailable from
              <input
                type="time"
                value={form.startTime}
                onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
                className={fieldClass}
              />
            </label>
            <label className={labelClass}>
              Unavailable until
              <input
                type="time"
                value={form.endTime}
                onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
                className={fieldClass}
              />
            </label>
          </div>
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
      </div>

      <div className="w-full min-w-0 max-w-full rounded-2xl border border-white/10 bg-navy/70 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Your unavailable times</h3>
        <ul className="mt-3 space-y-3">
          {sortedRules.map((rule) => (
            <li
              key={rule.id}
              className="w-full min-w-0 rounded-xl border border-white/10 p-3"
              data-unavailable-rule={rule.id}
            >
              <p className="break-words text-sm font-bold text-white">
                {describeUnavailableRule(rule, today)}
                {rule.enabled ? "" : " · off"}
                {isQuickBlockRule(rule) ? " · quick block" : ""}
              </p>
              {rule.note && !isQuickBlockRule(rule) ? (
                <p className="mt-1 break-words text-xs text-white/45">{rule.note}</p>
              ) : null}
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => startEdit(rule)}
                  className="min-h-11 flex-1 rounded-xl border border-white/15 px-3 text-sm font-semibold text-white"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void run("delete_rule", { id: rule.id })}
                  className="min-h-11 flex-1 rounded-xl border border-red-400/30 px-3 text-sm font-semibold text-red-100"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {sortedRules.length === 0 ? (
            <li className="text-sm text-white/55">None yet. Add a time above or use a quick control.</li>
          ) : null}
        </ul>
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
                  {(diag.estimatedCompletionLocal || diag.estimatedCompletion) &&
                  diag.positioningNeededMinutes != null ? (
                    <span className="mt-1 block text-xs font-normal opacity-90">
                      Finishes{" "}
                      {String(diag.estimatedCompletionLocal || diag.estimatedCompletion).slice(11, 16)},
                      needs{" "}
                      {String(diag.positioningNeededMinutes)} min positioning
                      {diag.earliestReadyLocal
                        ? `, earliest ready ${String(diag.earliestReadyLocal).slice(11, 16)}`
                        : ""}
                      {diag.nextPickupLocal
                        ? `, next pickup ${String(diag.nextPickupLocal).slice(11, 16)}`
                        : ""}
                      {typeof diag.positioningGapMinutes === "number"
                        ? ` (gap ${diag.positioningGapMinutes} min)`
                        : ""}
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
