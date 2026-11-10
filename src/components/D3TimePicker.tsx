"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Design 3 time selector: big hour and minute buttons in a bottom sheet instead of the
 * iPhone scrolling wheels. 24-hour "HH:MM" in and out, exactly the format the native
 * <input type="time"> produced, so booking validation and storage are unchanged.
 * Minutes come in 5-minute steps with −1 / +1 to reach any minute (e.g. a 10:43 landing).
 */
const pad = (n: number) => String(n).padStart(2, "0");
const toMinutes = (value: string) => {
  const m = /^(\d{2}):(\d{2})/.exec(value || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

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
  const current = toMinutes(value);
  const [hour, setHour] = useState<number | null>(current == null ? null : Math.floor(current / 60));
  const [minute, setMinute] = useState<number | null>(current == null ? null : current % 60);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const minTotal = min ? toMinutes(min) : null;

  useEffect(() => {
    if (!open) return;
    const t = toMinutes(value);
    setHour(t == null ? null : Math.floor(t / 60));
    setMinute(t == null ? null : t % 60);
    const focusTarget = sheetRef.current?.querySelector<HTMLButtonElement>("[aria-pressed='true']") ??
      sheetRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    focusTarget?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function emit(h: number | null, m: number | null) {
    if (h == null || m == null) return;
    onChange(`${pad(h)}:${pad(m)}`);
  }
  function chooseHour(h: number) {
    setHour(h);
    const m = minute ?? 0;
    setMinute(m);
    emit(h, m);
  }
  function chooseMinute(m: number) {
    const h = hour ?? 12;
    setHour(h);
    setMinute(m);
    emit(h, m);
  }
  function nudge(delta: number) {
    const total = (((hour ?? 12) * 60 + (minute ?? 0) + delta) % 1440 + 1440) % 1440;
    setHour(Math.floor(total / 60));
    setMinute(total % 60);
    emit(Math.floor(total / 60), total % 60);
  }
  function close() {
    setOpen(false);
    triggerRef.current?.focus();
    onDone?.();
  }
  const hourDisabled = (h: number) => minTotal != null && h * 60 + 59 < minTotal;
  const minuteDisabled = (m: number) => minTotal != null && hour != null && hour * 60 + m < minTotal;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-d3-time-trigger
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}${value ? `: ${value.slice(0, 5)}` : ", not set"}. Choose time`}
        onClick={() => setOpen(true)}
      >
        <span data-d3-time-value data-empty={!value || undefined}>{value ? value.slice(0, 5) : "Select time"}</span>
      </button>
      {open ? (
        <div data-d3-time-backdrop onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby={`${idBase}-title`} data-d3-time-sheet>
            <div data-d3-time-head>
              <p id={`${idBase}-title`}>{label}</p>
              <output data-d3-time-readout aria-live="polite">
                {hour == null ? "--" : pad(hour)}:{minute == null ? "--" : pad(minute)}
              </output>
            </div>
            <p data-d3-time-sub>Hour</p>
            <div data-d3-time-grid="hours" role="group" aria-label="Hour">
              {Array.from({ length: 24 }, (_, h) => (
                <button key={h} type="button" aria-pressed={hour === h} disabled={hourDisabled(h)} onClick={() => chooseHour(h)}>
                  {pad(h)}
                </button>
              ))}
            </div>
            <p data-d3-time-sub>Minutes</p>
            <div data-d3-time-grid="minutes" role="group" aria-label="Minutes">
              {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                <button key={m} type="button" aria-pressed={minute === m} disabled={minuteDisabled(m)} onClick={() => chooseMinute(m)}>
                  :{pad(m)}
                </button>
              ))}
            </div>
            <div data-d3-time-fine>
              <button type="button" onClick={() => nudge(-1)} aria-label="One minute earlier">−1 min</button>
              <button type="button" onClick={() => nudge(1)} aria-label="One minute later">+1 min</button>
            </div>
            <button type="button" data-d3-time-done onClick={close} disabled={hour == null || minute == null}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
