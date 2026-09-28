"use client";

import { useEffect, useMemo, useState } from "react";
import { resolveCurrentAvailabilityStatus } from "../../shared/smart-availability";
import { fetchSmartOpsState } from "@/lib/smart-ops-api";
import { fetchBookingSettings } from "@/lib/short-notice-api";
import type { UnavailablePeriodSummary } from "@/lib/short-notice-api";
import type { SmartAvailabilityException, SmartAvailabilityRule } from "../../shared/smart-availability";

type OwnerLiveAvailabilityCardProps = {
  ownerKey: string;
  onOpenAvailability: () => void;
};

export default function OwnerLiveAvailabilityCard({
  ownerKey,
  onOpenAvailability,
}: OwnerLiveAvailabilityCardProps) {
  const [rules, setRules] = useState<SmartAvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<SmartAvailabilityException[]>([]);
  const [periods, setPeriods] = useState<UnavailablePeriodSummary[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchSmartOpsState(ownerKey),
      fetchBookingSettings(ownerKey).catch(() => null),
    ]).then(([smart, settings]) => {
      if (cancelled) return;
      setRules(smart.state.rules || []);
      setExceptions(smart.state.exceptions || []);
      setPeriods(settings?.unavailablePeriods || []);
    }).catch(() => undefined);
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ownerKey]);

  const status = useMemo(
    () =>
      resolveCurrentAvailabilityStatus({
        rules,
        exceptions,
        legacyPeriods: periods,
        now: new Date(nowMs),
      }),
    [rules, exceptions, periods, nowMs],
  );

  const tone =
    status.state === "request_only"
      ? "border-amber-300/40 bg-amber-500/10 text-amber-100"
      : status.state === "unavailable"
        ? "border-red-400/40 bg-red-500/10 text-red-100"
        : "border-emerald/40 bg-emerald/10 text-emerald";
  const icon = status.state === "request_only" ? "🟠" : status.state === "unavailable" ? "🔴" : "🟢";

  return (
    <button
      type="button"
      onClick={onOpenAvailability}
      data-owner-live-availability
      data-availability-state={status.state}
      className={`mb-4 w-full min-w-0 max-w-full rounded-2xl border p-4 text-left ${tone}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-white/55">Booking status</p>
      <p className="mt-1 text-xl font-extrabold tracking-tight">
        {icon} {status.headline}
      </p>
      <p className="mt-1 text-sm text-white/75">{status.detail}</p>
      <p className="mt-2 text-sm font-semibold text-white/80">Open availability</p>
    </button>
  );
}
