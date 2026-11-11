"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Design 3 pickup-time selector (phones and tablets): a compact sheet with two side-by-side
 * columns — Hour 00–23 and Minute 00–59 — a large preview of the chosen time and one green
 * "Confirm pickup time" button. 24-hour "HH:MM" in and out, exactly the format the native
 * <input type="time"> produces, so booking validation and storage are unchanged.
 *
 * The choice is a draft until Confirm: closing (×, backdrop, Escape) leaves the booking time
 * as it was. Times before `min` (past times under the existing booking rules) are disabled.
 * No text inputs, so the on-screen keyboard never opens.
 */
const pad = (n: number) => String(n).padStart(2, "0");
const toMinutes = (value: string) => {
  const m = /^(\d{2}):(\d{2})/.exec(value || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const MINUTES = Array.from({ length: 60 }, (_, m) => m);

export default function D3TimePicker({
  value,
  label,
  min,
  onChange,
  onDone,
  idBase,
}: {
  value: string;
  label: string;
  min?: string;
  onChange: (value: string) => void;
  onDone?: () => void;
  idBase: string;
}) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const minTotal = min ? toMinutes(min) : null;

  function openSheet() {
    // Start from the booking's current time, else the earliest allowed time, else 12:00.
    const t = toMinutes(value) ?? minTotal ?? 12 * 60;
    setHour(Math.floor(t / 60));
    setMinute(t % 60);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // On opening, bring the selected hour and minute to the middle of their columns.
  useLayoutEffect(() => {
    if (!open) return;
    for (const list of [hourListRef.current, minuteListRef.current]) {
      const chosen = list?.querySelector<HTMLButtonElement>("[aria-pressed='true']");
      if (list && chosen) {
        const offset = chosen.getBoundingClientRect().top - list.getBoundingClientRect().top;
        list.scrollTop += offset - (list.clientHeight - chosen.offsetHeight) / 2;
      }
    }
    (hourListRef.current?.querySelector<HTMLButtonElement>("[aria-pressed='true']") ??
      sheetRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function dismiss() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  function confirm() {
    if (hour == null || minute == null || invalid) return;
    onChange(`${pad(hour)}:${pad(minute)}`);
    setOpen(false);
    triggerRef.current?.focus();
    onDone?.();
  }
  function chooseHour(h: number) {
    setHour(h);
    // Keep the minute if still allowed in the new hour; otherwise move to the first allowed one.
    if (minTotal != null && minute != null && h * 60 + minute < minTotal) setMinute(minTotal - h * 60);
  }

  const hourDisabled = (h: number) => minTotal != null && h * 60 + 59 < minTotal;
  const minuteDisabled = (m: number) => minTotal != null && hour != null && hour * 60 + m < minTotal;
  // "Select pickup time" for pickups. For airport collections the field is the flight's
  // scheduled landing time, so the heading and button say so instead.
  const isReturn = /return/i.test(idBase);
  const isPickup = /pickup/i.test(label);
  const leg = isReturn ? "return " : "";
  const heading = isPickup ? `Select ${leg}pickup time` : `Select ${leg}flight arrival time`;
  const confirmText = isPickup ? `Confirm ${leg}pickup time` : `Confirm ${leg}arrival time`;
  const invalid = hour == null || minute == null || (minTotal != null && hour * 60 + minute < minTotal);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-d3-time-trigger
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}${value ? `: ${value.slice(0, 5)}` : ", not set"}. Choose time`}
        onClick={openSheet}
      >
        <span data-d3-time-value data-empty={!value || undefined}>{value ? value.slice(0, 5) : "Select time"}</span>
      </button>
      {open ? (
        <div data-d3-time-backdrop onClick={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
          <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby={`${idBase}-title`} data-d3-time-sheet data-d3-time-v2>
            <div data-d3-time-head>
              <p id={`${idBase}-title`}>{heading}</p>
              <button type="button" data-d3-time-close onClick={dismiss} aria-label="Close without changing the time">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <output data-d3-time-readout aria-live="polite">
              {hour == null ? "--" : pad(hour)}<span aria-hidden="true">:</span>{minute == null ? "--" : pad(minute)}
            </output>
            <div data-d3-time-columns>
              <div data-d3-time-column>
                <p data-d3-time-sub id={`${idBase}-hour`}>Hour</p>
                <div ref={hourListRef} data-d3-time-list role="group" aria-labelledby={`${idBase}-hour`}>
                  {HOURS.map((h) => (
                    <button key={h} type="button" aria-pressed={hour === h} disabled={hourDisabled(h)} onClick={() => chooseHour(h)}>
                      {pad(h)}
                    </button>
                  ))}
                </div>
              </div>
              <div data-d3-time-column>
                <p data-d3-time-sub id={`${idBase}-minute`}>Minute</p>
                <div ref={minuteListRef} data-d3-time-list role="group" aria-labelledby={`${idBase}-minute`}>
                  {MINUTES.map((m) => (
                    <button key={m} type="button" aria-pressed={minute === m} disabled={minuteDisabled(m)} onClick={() => setMinute(m)}>
                      {pad(m)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button type="button" data-d3-time-done onClick={confirm} disabled={invalid}>
              {confirmText}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
