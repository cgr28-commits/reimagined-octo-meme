"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchOwnerPaidBookings,
  type OwnerPaidBookingSummary,
} from "@/lib/paid-bookings-api";
import {
  fetchDriverJobs,
  type DriverJob,
} from "@/lib/tracking-api";
import {
  CALENDAR_STATUS_STYLES,
  defaultMobileCalendarView,
  entriesForDate,
  formatCalendarDayHeading,
  formatCalendarMonthHeading,
  isToday,
  mergeCalendarEntries,
  monthGridDates,
  rangeForView,
  shiftMonth,
  weekDates,
  type CalendarViewMode,
  type OwnerCalendarEntry,
} from "@/lib/owner-booking-calendar";
import { addDaysYmd, londonYmd } from "../../shared/upcoming-jobs";

type OwnerBookingCalendarProps = {
  ownerKey: string;
  /** Called when a leg with a tracking token is selected — parent opens existing controls. */
  onSelectJob?: (job: DriverJob, entry: OwnerCalendarEntry) => void;
  /** Called for synthetic legs without a token — parent can focus paid booking by ref. */
  onSelectPaymentRef?: (paymentReference: string, entry: OwnerCalendarEntry) => void;
};

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

function EntryCard({
  entry,
  selected,
  dense,
  onSelect,
}: {
  entry: OwnerCalendarEntry;
  selected: boolean;
  dense?: boolean;
  onSelect: () => void;
}) {
  const style = CALENDAR_STATUS_STYLES[entry.calendarStatus];
  const legTag =
    entry.journeyLeg === "return"
      ? "Return"
      : entry.journeyLeg === "outbound"
        ? "Outbound"
        : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border text-left transition-colors ${
        selected
          ? "border-emerald/60 bg-emerald/15"
          : "border-white/10 bg-navy/50 hover:border-white/25"
      } ${dense ? "p-2.5" : "p-3.5"}`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-8 w-1 shrink-0 rounded-full ${style.bar}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-bold tabular-nums text-white">{entry.tripTime}</span>
            {legTag ? (
              <span className="rounded-md border border-white/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/60">
                {legTag}
              </span>
            ) : null}
            <span
              className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.chip}`}
            >
              {style.label}
            </span>
          </div>
          <p className={`font-semibold text-white ${dense ? "mt-1 text-sm" : "mt-1.5 text-sm"}`}>
            {entry.customerName}
          </p>
          <p className="mt-1 break-words text-xs leading-snug text-white/70">
            {entry.pickupLabel} → {entry.dropoffLabel}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/55">
            <span className="rounded-md border border-white/10 px-1.5 py-0.5">
              {entry.serviceLabel}
            </span>
            {entry.flightNumber ? (
              <span className="rounded-md border border-emerald/30 px-1.5 py-0.5 text-emerald">
                {entry.flightNumber}
                {entry.airportCode ? ` · ${entry.airportCode}` : ""}
              </span>
            ) : entry.airportCode ? (
              <span className="rounded-md border border-emerald/30 px-1.5 py-0.5 text-emerald">
                {entry.airportCode}
              </span>
            ) : null}
            <span className="rounded-md border border-white/10 px-1.5 py-0.5">
              {entry.paymentStatus === "refunded" ? "Refunded" : "Paid"}
            </span>
            <span className="rounded-md border border-white/10 px-1.5 py-0.5 normal-case tracking-normal text-white/65">
              {entry.assignedDriver}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

export default function OwnerBookingCalendar({
  ownerKey,
  onSelectJob,
  onSelectPaymentRef,
}: OwnerBookingCalendarProps) {
  const narrow = useIsNarrow();
  const today = londonYmd();
  const [view, setView] = useState<CalendarViewMode>("day");
  const [anchor, setAnchor] = useState(today);
  const [jobs, setJobs] = useState<DriverJob[]>([]);
  const [bookings, setBookings] = useState<OwnerPaidBookingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDefaultApplied, setMobileDefaultApplied] = useState(false);

  useEffect(() => {
    if (mobileDefaultApplied) return;
    setView(narrow ? defaultMobileCalendarView() : "week");
    setMobileDefaultApplied(true);
  }, [narrow, mobileDefaultApplied]);

  const { from, to } = useMemo(() => rangeForView(view, anchor), [view, anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [jobsResponse, paid] = await Promise.all([
        fetchDriverJobs(ownerKey, { scope: "range", from, to }),
        fetchOwnerPaidBookings(ownerKey, {
          mode: "upcoming",
          pastDays: 90,
          futureDays: 90,
          limit: 200,
        }),
      ]);
      setJobs(jobsResponse.jobs);
      setBookings(paid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load booking calendar");
    } finally {
      setLoading(false);
    }
  }, [ownerKey, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = useMemo(
    () => mergeCalendarEntries(jobs, bookings),
    [jobs, bookings],
  );

  const jobByToken = useMemo(() => {
    const map = new Map<string, DriverJob>();
    for (const job of jobs) {
      map.set(job.token, job);
    }
    return map;
  }, [jobs]);

  const selectEntry = (entry: OwnerCalendarEntry) => {
    setSelectedId(entry.id);
    setAnchor(entry.tripDate);
    if (entry.token) {
      const job = jobByToken.get(entry.token);
      if (job) {
        onSelectJob?.(job, entry);
        return;
      }
    }
    if (entry.paymentReference) {
      onSelectPaymentRef?.(entry.paymentReference, entry);
    }
  };

  const goToday = () => {
    setAnchor(today);
    if (narrow) setView("day");
  };

  const goPrev = () => {
    if (view === "day") setAnchor(addDaysYmd(anchor, -1));
    else if (view === "week") setAnchor(addDaysYmd(anchor, -7));
    else setAnchor(shiftMonth(anchor, -1));
  };

  const goNext = () => {
    if (view === "day") setAnchor(addDaysYmd(anchor, 1));
    else if (view === "week") setAnchor(addDaysYmd(anchor, 7));
    else setAnchor(shiftMonth(anchor, 1));
  };

  const heading =
    view === "month"
      ? formatCalendarMonthHeading(anchor)
      : view === "week"
        ? `Week of ${formatCalendarDayHeading(weekDates(anchor)[0]!)}`
        : formatCalendarDayHeading(anchor);

  const dayEntries = entriesForDate(entries, anchor);

  return (
    <section className="mb-10 w-full min-w-0 max-w-full rounded-2xl border border-sky-400/25 bg-sky-500/5 p-4 sm:p-6">
      <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-200">
            Operational calendar
          </p>
          <h2 className="mt-1 text-xl font-bold text-white">Booking Calendar</h2>
          <p className="mt-2 max-w-2xl break-words text-sm text-white/65">
            Confirmed and paid journeys from website booking data — one entry per outbound or
            return leg. Tap a booking to open journey controls below.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="min-h-11 w-full shrink-0 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/30 sm:w-auto"
        >
          Refresh
        </button>
      </div>

      <div className="mt-5 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap gap-2">
          {(["day", "week", "month"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={`min-h-11 min-w-[4.5rem] rounded-xl px-4 py-2 text-sm font-bold capitalize transition-colors ${
                view === mode
                  ? "bg-emerald text-navy"
                  : "border border-white/15 text-white/75 hover:border-white/30"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="min-h-11 min-w-11 rounded-xl border border-white/15 px-3 text-lg font-bold text-white hover:border-white/30"
            aria-label="Previous"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={goToday}
            className="min-h-11 rounded-xl border border-emerald/40 bg-emerald/15 px-4 text-sm font-bold text-emerald hover:bg-emerald/25"
          >
            Today
          </button>
          <button
            type="button"
            onClick={goNext}
            className="min-h-11 min-w-11 rounded-xl border border-white/15 px-3 text-lg font-bold text-white hover:border-white/30"
            aria-label="Next"
          >
            ›
          </button>
          <label className="flex min-h-11 w-full min-w-0 max-w-full items-center gap-2 rounded-xl border border-white/15 px-3 text-sm text-white/70 sm:ml-auto sm:w-auto">
            <span className="sr-only">Pick date</span>
            <input
              type="date"
              value={anchor}
              onChange={(event) => {
                const next = event.target.value;
                if (/^\d{4}-\d{2}-\d{2}$/.test(next)) {
                  setAnchor(next);
                  if (narrow) setView("day");
                }
              }}
              className="box-border min-h-9 w-full min-w-0 max-w-full bg-transparent text-sm font-semibold text-white outline-none [color-scheme:dark]"
            />
          </label>
        </div>

        <p className="min-w-0 break-words text-base font-semibold text-white">{heading}</p>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-white/60">Loading calendar…</p>
      ) : view === "day" ? (
        <div className="mt-4 space-y-3">
          {dayEntries.length === 0 ? (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-6 text-sm text-white/55">
              No confirmed journeys on this day.
            </p>
          ) : (
            dayEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                selected={selectedId === entry.id}
                onSelect={() => selectEntry(entry)}
              />
            ))
          )}
        </div>
      ) : view === "week" ? (
        <div className="mt-4 space-y-4">
          {weekDates(anchor).map((date) => {
            const dayList = entriesForDate(entries, date);
            return (
              <div key={date} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <button
                  type="button"
                  onClick={() => {
                    setAnchor(date);
                    setView("day");
                  }}
                  className={`mb-2 flex w-full items-center justify-between text-left ${
                    isToday(date) ? "text-emerald" : "text-white/80"
                  }`}
                >
                  <span className="text-sm font-bold">{formatCalendarDayHeading(date)}</span>
                  <span className="text-xs text-white/45">
                    {dayList.length} job{dayList.length === 1 ? "" : "s"}
                  </span>
                </button>
                {dayList.length === 0 ? (
                  <p className="text-xs text-white/40">—</p>
                ) : (
                  <div className="space-y-2">
                    {dayList.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        dense
                        selected={selectedId === entry.id}
                        onSelect={() => selectEntry(entry)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4">
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-white/45">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthGridDates(anchor).map((date) => {
              const dayList = entriesForDate(entries, date);
              const inMonth = date.slice(0, 7) === anchor.slice(0, 7);
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => {
                    setAnchor(date);
                    setView("day");
                  }}
                  className={`min-h-[4.25rem] rounded-lg border p-1 text-left transition-colors sm:min-h-[5rem] ${
                    isToday(date)
                      ? "border-emerald/50 bg-emerald/10"
                      : selectedId && dayList.some((e) => e.id === selectedId)
                        ? "border-sky-400/40 bg-sky-500/10"
                        : "border-white/10 bg-white/[0.02] hover:border-white/25"
                  } ${inMonth ? "" : "opacity-40"}`}
                >
                  <span
                    className={`text-xs font-bold ${isToday(date) ? "text-emerald" : "text-white/80"}`}
                  >
                    {Number(date.slice(8, 10))}
                  </span>
                  <div className="mt-1 space-y-0.5">
                    {dayList.slice(0, 3).map((entry) => {
                      const style = CALENDAR_STATUS_STYLES[entry.calendarStatus];
                      return (
                        <div
                          key={entry.id}
                          className={`truncate rounded px-0.5 text-[9px] font-semibold leading-tight text-navy ${style.bar}`}
                          title={`${entry.tripTime} ${entry.customerName}`}
                        >
                          {entry.tripTime} {entry.customerName.split(" ")[0]}
                        </div>
                      );
                    })}
                    {dayList.length > 3 ? (
                      <p className="text-[9px] text-white/50">+{dayList.length - 3}</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-white/45">
            Tap a day for the full list and journey controls. Colours match journey status.
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {(Object.keys(CALENDAR_STATUS_STYLES) as Array<keyof typeof CALENDAR_STATUS_STYLES>).map(
          (key) => (
            <span
              key={key}
              className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${CALENDAR_STATUS_STYLES[key].chip}`}
            >
              {CALENDAR_STATUS_STYLES[key].label}
            </span>
          ),
        )}
      </div>
    </section>
  );
}
