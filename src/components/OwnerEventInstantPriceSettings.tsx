"use client";

/**
 * Owner Dashboard → Event & Business Class → "Instant event prices".
 * One small card: switch instant prices on/off, switch the event uplift on/off,
 * and set the percentage. Affects event transfers only — never airport fares.
 */

import { useEffect, useState } from "react";
import { fetchEventInstantSettings, saveEventInstantSettings } from "@/lib/bespoke-quote-api";
import {
  EVENT_INSTANT_MAX_PASSENGERS,
  EVENT_INSTANT_MAX_UPLIFT_PERCENT,
  EVENT_INSTANT_MINIMUM_FARE_GBP,
  EVENT_INSTANT_MIN_NOTICE_HOURS,
  computeEventInstantPrice,
  type EventInstantQuoteSettings,
} from "../../shared/bespoke-instant-quote";

const EXAMPLE_FARE_GBP = 40;

export default function OwnerEventInstantPriceSettings({ ownerKey }: { ownerKey: string }) {
  const [saved, setSaved] = useState<EventInstantQuoteSettings | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [upliftEnabled, setUpliftEnabled] = useState(true);
  const [percent, setPercent] = useState("20");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchEventInstantSettings(ownerKey)
      .then((s) => {
        if (!alive) return;
        setSaved(s);
        setEnabled(s.enabled);
        setUpliftEnabled(s.upliftEnabled);
        setPercent(String(s.upliftPercent));
      })
      .catch(() => alive && setMessage({ ok: false, text: "Could not load the instant price settings." }));
    return () => {
      alive = false;
    };
  }, [ownerKey]);

  const percentNumber = /^\d{1,3}$/.test(percent.trim()) ? Number(percent.trim()) : NaN;
  const percentValid = Number.isInteger(percentNumber) && percentNumber >= 0 && percentNumber <= EVENT_INSTANT_MAX_UPLIFT_PERCENT;
  const changed = saved !== null && (saved.enabled !== enabled || saved.upliftEnabled !== upliftEnabled || saved.upliftPercent !== percentNumber);
  const example = percentValid ? computeEventInstantPrice(EXAMPLE_FARE_GBP, { enabled, upliftEnabled, upliftPercent: percentNumber }) : null;

  async function save() {
    if (!percentValid) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await saveEventInstantSettings(ownerKey, { enabled, upliftEnabled, upliftPercent: percentNumber });
      setSaved(next);
      setMessage({ ok: true, text: "Saved. New event requests use these settings straight away." });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  const toggle = (on: boolean) =>
    `min-h-11 rounded-full px-4 py-2 text-sm font-semibold ${on ? "bg-emerald text-navy" : "border border-white/15 text-white/75"}`;

  return (
    <section data-event-instant-settings aria-labelledby="event-instant-heading" className="w-full min-w-0 max-w-full rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h3 id="event-instant-heading" className="text-base font-bold text-white">
        Instant event prices
      </h3>
      <p className="mt-1 text-sm text-white/70">
        Event transfers only. The price is your normal fare plus the event uplift, with a £{EVENT_INSTANT_MINIMUM_FARE_GBP} minimum — whichever is
        higher. Airport fares and Business Class requests are not affected.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-white">Give customers an instant price</p>
          <div className="mt-2 flex gap-2" role="group" aria-label="Instant event prices">
            <button type="button" aria-pressed={enabled} onClick={() => setEnabled(true)} className={toggle(enabled)}>
              On
            </button>
            <button type="button" aria-pressed={!enabled} onClick={() => setEnabled(false)} className={toggle(!enabled)}>
              Off — I price every request
            </button>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-white">Event uplift</p>
          <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Event uplift">
            <button type="button" aria-pressed={upliftEnabled} onClick={() => setUpliftEnabled(true)} className={toggle(upliftEnabled)}>
              On
            </button>
            <button type="button" aria-pressed={!upliftEnabled} onClick={() => setUpliftEnabled(false)} className={toggle(!upliftEnabled)}>
              Off
            </button>
            <label htmlFor="event-uplift-percent" className="ml-2 text-sm text-white/80">
              Add
            </label>
            <input
              id="event-uplift-percent"
              inputMode="numeric"
              value={percent}
              disabled={!upliftEnabled}
              onChange={(e) => setPercent(e.target.value)}
              aria-invalid={!percentValid}
              className="min-h-11 w-20 rounded-xl border border-white/20 bg-navy px-3 text-base text-white disabled:opacity-50"
            />
            <span className="text-sm text-white/80">%</span>
          </div>
          {!percentValid ? (
            <p role="alert" className="mt-2 text-sm text-amber-100">
              Enter a whole number from 0 to {EVENT_INSTANT_MAX_UPLIFT_PERCENT}.
            </p>
          ) : null}
        </div>

        {example ? (
          <p className="text-sm text-white/70">
            Example: a £{EXAMPLE_FARE_GBP} normal fare would be offered at <strong className="text-white">£{example.amountGbp}</strong>.
          </p>
        ) : null}

        <p className="text-sm text-white/60">
          Still sent to you to price: {EVENT_INSTANT_MAX_PASSENGERS + 1}–7 passengers (7-seater), extra stops, pickups less than{" "}
          {EVENT_INSTANT_MIN_NOTICE_HOURS} hours away, and anything the fare calculator cannot price.
        </p>

        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !changed || !percentValid}
          className="min-h-11 rounded-xl bg-emerald px-5 text-sm font-bold text-navy disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {message ? (
          <p role="status" className={`text-sm ${message.ok ? "text-emerald" : "text-amber-100"}`}>
            {message.text}
          </p>
        ) : null}
      </div>
    </section>
  );
}
