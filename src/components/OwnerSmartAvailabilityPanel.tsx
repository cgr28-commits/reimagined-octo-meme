"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ISO_WEEKDAYS } from "../../shared/smart-availability";
import { DEFAULT_SMART_OPS_CONFIG, type SmartOpsConfig } from "../../shared/smart-ops-config";
import { addDaysYmd, londonYmd } from "../../shared/upcoming-jobs";
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

const emptyRuleForm = {
  kind: "one_off" as "one_off" | "recurring" | "full_day",
  date: londonYmd(),
  startLocal: `${londonYmd()}T13:00`,
  endLocal: `${londonYmd()}T17:00`,
  startTime: "13:00",
  endTime: "15:00",
  weekdays: [1] as number[],
  rangeStart: "",
  rangeEnd: "",
  note: "",
};

export default function OwnerSmartAvailabilityPanel({ ownerKey }: OwnerSmartAvailabilityPanelProps) {
  const [state, setState] = useState<SmartOpsState | null>(null);
  const [shadow, setShadow] = useState<SmartShadowRecord[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"day" | "week">("day");
  const [focusDay, setFocusDay] = useState(londonYmd());
  const [calendar, setCalendar] = useState<{
    bookings: Array<{ id: string; tripDate: string; tripTime: string }>;
    unavailable: Array<{ startLocal: string; endLocal: string; recurring: boolean }>;
    opportunities: Array<{ parentId: string; tripDate: string; tripTime: string }>;
  } | null>(null);
  const [form, setForm] = useState(emptyRuleForm);
  const [test, setTest] = useState({
    pickupLabel: "Belfast International Airport",
    dropoffLabel: "Belfast City Centre",
    tripDate: londonYmd(),
    tripTime: "14:00",
    vehicle: "Saloon",
    normalJourneyFareGbp: "45",
  });
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  const config = state?.config || DEFAULT_SMART_OPS_CONFIG;

  const load = useCallback(async () => {
    const result = await fetchSmartOpsState(ownerKey);
    setState(result.state);
    setShadow(result.shadow || []);
  }, [ownerKey]);

  const loadCalendar = useCallback(async () => {
    const from = view === "day" ? focusDay : focusDay;
    const to = view === "day" ? focusDay : addDaysYmd(focusDay, 6);
    const result = (await fetchSmartOpsCalendar(ownerKey, from, to)) as {
      bookings?: Array<{ id: string; tripDate: string; tripTime: string }>;
      unavailable?: Array<{ startLocal: string; endLocal: string; recurring: boolean }>;
      opportunities?: Array<{ parentId: string; tripDate: string; tripTime: string }>;
    };
    setCalendar({
      bookings: result.bookings || [],
      unavailable: result.unavailable || [],
      opportunities: result.opportunities || [],
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
      setMessage("Saved.");
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

  const days = useMemo(() => {
    if (view === "day") return [focusDay];
    return Array.from({ length: 7 }, (_, i) => addDaysYmd(focusDay, i));
  }, [view, focusDay]);

  return (
    <section className="mb-10 space-y-4" data-owner-smart-ops>
      <div className="rounded-2xl border border-amber-400/25 bg-navy/70 p-4 sm:p-5">
        <h2 className="text-lg font-bold text-white">Smart Availability</h2>
        <p className="mt-2 text-sm text-white/70">
          Test and configure availability, alternative times and Smart Return Pricing. Customer
          bookings stay on the current live system until you switch a customer-facing flag on.
        </p>
        {error ? (
          <p className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 text-sm text-emerald-light">{message}</p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Feature flags</h3>
        <div className="mt-3 grid gap-2">
          {(
            [
              ["smartAvailability", "Smart Availability (customer)"],
              ["alternativeTimeSuggestions", "Alternative time suggestions (customer)"],
              ["smartReturnPricing", "Smart Return Pricing (customer)"],
              ["returnCorridorMatching", "Return corridor matching"],
              ["backupDriverCapacity", "Backup driver capacity"],
              ["shadowMode", "Shadow test mode"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center justify-between gap-3 text-sm text-white">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(config.flags[key])}
                onChange={(event) => void saveFlags({ [key]: event.target.checked })}
                className="h-5 w-5 accent-emerald"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-amber-100/90">
          Keep the three customer flags off until testing is signed off.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Quick controls</h3>
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

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Buffers & capacity</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
              className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
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
              className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
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
              className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
          </label>
          <label className="text-xs text-white/50">
            Driver capacity
            <select
              value={config.driverCapacity}
              onChange={(event) =>
                void saveSettings({
                  driverCapacity: event.target.value as SmartOpsConfig["driverCapacity"],
                })
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            >
              <option value="owner_only">Me only</option>
              <option value="owner_plus_backup">Me + backup driver</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Smart Return settings</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-white/50">
            Maximum discount %
            <input
              type="number"
              value={config.smartReturn.maxDiscountPercent}
              onChange={(event) =>
                void saveSettings({
                  smartReturn: {
                    ...config.smartReturn,
                    maxDiscountPercent: Number(event.target.value),
                  },
                })
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
          </label>
          <label className="text-xs text-white/50">
            Minimum acceptable fare £
            <input
              type="number"
              value={config.smartReturn.minAcceptableFareGbp}
              onChange={(event) =>
                void saveSettings({
                  smartReturn: {
                    ...config.smartReturn,
                    minAcceptableFareGbp: Number(event.target.value),
                  },
                })
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
          </label>
          <label className="text-xs text-white/50">
            Return time window (minutes)
            <input
              type="number"
              value={config.smartReturn.returnTimeFlexibilityMinutes}
              onChange={(event) =>
                void saveSettings({
                  smartReturn: {
                    ...config.smartReturn,
                    returnTimeFlexibilityMinutes: Number(event.target.value),
                  },
                })
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
          </label>
          <label className="text-xs text-white/50">
            Max route deviation (miles)
            <input
              type="number"
              value={config.smartReturn.maxDeviationMiles}
              onChange={(event) =>
                void saveSettings({
                  smartReturn: {
                    ...config.smartReturn,
                    maxDeviationMiles: Number(event.target.value),
                  },
                })
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
          </label>
          <label className="text-xs text-white/50 sm:col-span-2">
            Advertise Smart Return
            <select
              value={config.smartReturn.releaseMode}
              onChange={(event) =>
                void saveSettings({
                  smartReturn: {
                    ...config.smartReturn,
                    releaseMode: event.target.value as SmartOpsConfig["smartReturn"]["releaseMode"],
                  },
                })
              }
              className="mt-1 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            >
              <option value="inside_free_cancel_cutoff">Only inside 24-hour non-refundable period</option>
              <option value="immediately">Immediately after parent confirmation</option>
              <option value="hours_before_pickup">Custom hours before pickup</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Add unavailable period</h3>
        <div className="mt-3 grid gap-3">
          <select
            value={form.kind}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, kind: event.target.value as typeof prev.kind }))
            }
            className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
          >
            <option value="one_off">One-off period</option>
            <option value="full_day">Full day</option>
            <option value="recurring">Recurring weekdays</option>
          </select>
          {form.kind === "full_day" ? (
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
              className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
          ) : null}
          {form.kind === "one_off" ? (
            <>
              <input
                type="datetime-local"
                value={form.startLocal}
                onChange={(event) => setForm((prev) => ({ ...prev, startLocal: event.target.value }))}
                className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
              />
              <input
                type="datetime-local"
                value={form.endLocal}
                onChange={(event) => setForm((prev) => ({ ...prev, endLocal: event.target.value }))}
                className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
              />
            </>
          ) : null}
          {form.kind === "recurring" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {ISO_WEEKDAYS.map((day) => (
                  <label key={day.iso} className="flex min-h-11 items-center gap-2 text-sm text-white">
                    <input
                      type="checkbox"
                      checked={form.weekdays.includes(day.iso)}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          weekdays: event.target.checked
                            ? [...prev.weekdays, day.iso]
                            : prev.weekdays.filter((item) => item !== day.iso),
                        }))
                      }
                    />
                    Every {day.label}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
                  className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
                />
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
                  className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
                />
              </div>
              <input
                type="date"
                value={form.rangeStart}
                onChange={(event) => setForm((prev) => ({ ...prev, rangeStart: event.target.value }))}
                className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
              />
              <input
                type="date"
                value={form.rangeEnd}
                onChange={(event) => setForm((prev) => ({ ...prev, rangeEnd: event.target.value }))}
                className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
              />
            </>
          ) : null}
          <input
            value={form.note}
            onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
            placeholder="Private note (Cara, service, holiday)"
            className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run("save_rule", {
                rule: {
                  kind: form.kind,
                  date: form.date,
                  startLocal: form.startLocal,
                  endLocal: form.endLocal,
                  startTime: form.startTime,
                  endTime: form.endTime,
                  weekdays: form.weekdays,
                  rangeStart: form.rangeStart || undefined,
                  rangeEnd: form.rangeEnd || null,
                  note: form.note,
                  enabled: true,
                },
              })
            }
            className="min-h-11 rounded-xl bg-emerald px-4 text-sm font-bold text-navy"
          >
            Add rule
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Rules</h3>
        <ul className="mt-3 space-y-3">
          {(state?.rules || []).map((rule) => (
            <li key={rule.id} className="rounded-xl border border-white/10 p-3">
              <p className="text-sm font-semibold text-white">
                {rule.kind === "recurring"
                  ? `Every ${(rule.weekdays || [])
                      .map((d) => ISO_WEEKDAYS.find((item) => item.iso === d)?.label)
                      .filter(Boolean)
                      .join(", ")} ${rule.startTime}–${rule.endTime}`
                  : rule.kind === "full_day"
                    ? `All day ${rule.date}`
                    : `${rule.startLocal} → ${rule.endLocal}`}
                {rule.enabled ? "" : " · disabled"}
              </p>
              {rule.note ? <p className="mt-1 text-xs text-white/45">Private: {rule.note}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void run("toggle_rule", { id: rule.id })}
                  className="min-h-11 rounded-xl border border-white/15 px-3 text-xs font-semibold text-white"
                >
                  {rule.enabled ? "Disable" : "Re-enable"}
                </button>
                <button
                  type="button"
                  onClick={() => void run("delete_rule", { id: rule.id })}
                  className="min-h-11 rounded-xl border border-red-400/30 px-3 text-xs font-semibold text-red-100"
                >
                  Delete
                </button>
                {rule.kind === "recurring" ? (
                  <button
                    type="button"
                    onClick={() =>
                      void run("save_exception", {
                        exception: { ruleId: rule.id, date: focusDay, kind: "available" },
                      })
                    }
                    className="min-h-11 rounded-xl border border-emerald/40 px-3 text-xs font-semibold text-emerald-light"
                  >
                    Make {focusDay} available
                  </button>
                ) : null}
              </div>
            </li>
          ))}
          {(state?.rules || []).length === 0 ? (
            <li className="text-sm text-white/55">No Smart Availability rules yet.</li>
          ) : null}
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Calendar</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setView("day")}
              className={`min-h-11 rounded-xl px-3 text-xs font-semibold ${view === "day" ? "bg-emerald text-navy" : "border border-white/15 text-white"}`}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setView("week")}
              className={`min-h-11 rounded-xl px-3 text-xs font-semibold ${view === "week" ? "bg-emerald text-navy" : "border border-white/15 text-white"}`}
            >
              Week
            </button>
          </div>
        </div>
        <input
          type="date"
          value={focusDay}
          onChange={(event) => setFocusDay(event.target.value)}
          className="mt-3 min-h-11 w-full rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
        />
        <div className="mt-3 space-y-3">
          {days.map((day) => (
            <div key={day} className="rounded-xl border border-white/10 p-3">
              <p className="text-sm font-semibold text-white">{day}</p>
              <ul className="mt-2 space-y-1 text-xs">
                {(calendar?.bookings || [])
                  .filter((item) => item.tripDate === day)
                  .map((item) => (
                    <li key={item.id} className="rounded-lg bg-sky-500/15 px-2 py-1 text-sky-100">
                      Booked · {item.tripTime}
                    </li>
                  ))}
                {(calendar?.unavailable || [])
                  .filter((item) => item.startLocal.startsWith(day))
                  .map((item) => (
                    <li
                      key={`${item.startLocal}-${item.endLocal}`}
                      className="rounded-lg bg-rose-500/15 px-2 py-1 text-rose-100"
                    >
                      Unavailable · {item.startLocal.slice(11)}–{item.endLocal.slice(11)}
                      {item.recurring ? " · recurring" : ""}
                    </li>
                  ))}
                {(calendar?.opportunities || [])
                  .filter((item) => item.tripDate === day)
                  .map((item) => (
                    <li key={item.parentId} className="rounded-lg bg-emerald/15 px-2 py-1 text-emerald-light">
                      Possible Smart Return · {item.tripTime}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4" data-owner-smart-ops-test>
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Owner test tool</h3>
        <div className="mt-3 grid gap-3">
          <input
            value={test.pickupLabel}
            onChange={(event) => setTest((prev) => ({ ...prev, pickupLabel: event.target.value }))}
            className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            placeholder="Pickup"
          />
          <input
            value={test.dropoffLabel}
            onChange={(event) => setTest((prev) => ({ ...prev, dropoffLabel: event.target.value }))}
            className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            placeholder="Destination"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={test.tripDate}
              onChange={(event) => setTest((prev) => ({ ...prev, tripDate: event.target.value }))}
              className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
            <input
              type="time"
              value={test.tripTime}
              onChange={(event) => setTest((prev) => ({ ...prev, tripTime: event.target.value }))}
              className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            />
          </div>
          <select
            value={test.vehicle}
            onChange={(event) => setTest((prev) => ({ ...prev, vehicle: event.target.value }))}
            className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
          >
            <option>Saloon</option>
            <option>Estate</option>
          </select>
          <input
            value={test.normalJourneyFareGbp}
            onChange={(event) =>
              setTest((prev) => ({ ...prev, normalJourneyFareGbp: event.target.value }))
            }
            className="min-h-11 rounded-xl border border-white/15 bg-navy px-3 text-sm text-white"
            placeholder="Normal fare £"
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
                })) as Record<string, unknown>;
                setTestResult(result);
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
          <pre className="mt-3 overflow-x-auto rounded-xl bg-black/30 p-3 text-[11px] text-white/80">
            {JSON.stringify(testResult, null, 2)}
          </pre>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-navy/70 p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/50">Shadow log</h3>
        <p className="mt-1 text-xs text-white/45">
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
      </div>
    </section>
  );
}
