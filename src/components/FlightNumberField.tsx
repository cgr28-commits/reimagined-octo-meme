"use client";

import { useEffect, useRef, useState } from "react";
import {
  isValidFlightNumberFormat,
  lookupFlightForBooking,
  type TripDirection,
  type VerifiedFlight,
} from "@/lib/flight-lookup";

type FlightNumberFieldProps = {
  id: string;
  label: string;
  helperText?: string;
  value: string;
  onChange: (value: string) => void;
  tripDate: string;
  airportCode: string;
  direction: TripDirection;
  enabled: boolean;
  error?: string;
  onVerifiedChange?: (flight: VerifiedFlight | null, configured: boolean) => void;
  onStatusChange?: (status: "idle" | "loading" | "verified" | "error" | "unavailable") => void;
};

export default function FlightNumberField({
  id,
  label,
  helperText,
  value,
  onChange,
  tripDate,
  airportCode,
  direction,
  enabled,
  error,
  onVerifiedChange,
  onStatusChange,
}: FlightNumberFieldProps) {
  const [lookupStatus, setLookupStatus] = useState<
    "idle" | "loading" | "verified" | "error" | "unavailable"
  >("idle");
  const [lookupMessage, setLookupMessage] = useState("");
  const [verifiedFlight, setVerifiedFlight] = useState<VerifiedFlight | null>(null);

  const onVerifiedChangeRef = useRef(onVerifiedChange);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    onVerifiedChangeRef.current = onVerifiedChange;
  }, [onVerifiedChange]);

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const trimmed = value.trim();
    if (!trimmed || !tripDate || !airportCode) {
      setVerifiedFlight(null);
      setLookupStatus("idle");
      setLookupMessage("");
      onStatusChangeRef.current?.("idle");
      onVerifiedChangeRef.current?.(null, true);
      return;
    }

    if (!isValidFlightNumberFormat(trimmed)) {
      setVerifiedFlight(null);
      setLookupStatus("error");
      setLookupMessage("Enter a valid flight number (e.g. BA1234 or EZY456).");
      onStatusChangeRef.current?.("error");
      onVerifiedChangeRef.current?.(null, true);
      return;
    }

    let cancelled = false;
    setLookupStatus("loading");
    setLookupMessage("");
    onStatusChangeRef.current?.("loading");

    const timer = window.setTimeout(async () => {
      const lookupPromise = lookupFlightForBooking({
        flightNumber: trimmed,
        tripDate,
        airportCode,
        direction,
      });
      const timeoutPromise = new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), 15000);
      });
      const result = await Promise.race([lookupPromise, timeoutPromise]);

      if (cancelled) {
        return;
      }

      if (result === null) {
        setVerifiedFlight(null);
        setLookupStatus("error");
        setLookupMessage("Flight lookup timed out. Please try again.");
        onStatusChangeRef.current?.("error");
        onVerifiedChangeRef.current?.(null, true);
        return;
      }

      if (result.ok) {
        setVerifiedFlight(result.flight);
        setLookupStatus("verified");
        setLookupMessage("");
        onStatusChangeRef.current?.("verified");
        onVerifiedChangeRef.current?.(result.flight, result.configured);
        return;
      }

      setVerifiedFlight(null);
      if (!result.configured || result.code === "rate_limited") {
        setLookupStatus("unavailable");
        setLookupMessage(
          result.error ||
            "Flight verification is temporarily unavailable. You can still enter your flight number.",
        );
        onStatusChangeRef.current?.("unavailable");
        onVerifiedChangeRef.current?.(null, false);
        return;
      }

      setLookupStatus("error");
      setLookupMessage(result.error);
      onStatusChangeRef.current?.("error");
      onVerifiedChangeRef.current?.(null, result.configured);
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [airportCode, direction, enabled, tripDate, value]);

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. BA1234"
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm uppercase text-white placeholder:normal-case placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
      />
      {helperText && <p className="mt-1.5 text-xs text-white/40">{helperText}</p>}
      {!tripDate && value.trim() && (
        <p className="mt-1.5 text-xs text-amber-200/90">
          Your trip date is required before we can verify this flight.
        </p>
      )}
      {lookupStatus === "loading" && (
        <p className="mt-1.5 text-xs text-white/60">Checking flight details…</p>
      )}
      {lookupStatus === "verified" && verifiedFlight && (
        <div className="mt-2 rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-3 text-sm text-white/90">
          <p className="font-semibold text-emerald">{verifiedFlight.airline}</p>
          <p className="mt-1">
            {verifiedFlight.flightNumber} ·{" "}
            {new Date(`${verifiedFlight.date}T12:00:00`).toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
          <p className="mt-0.5 text-white/80">
            {verifiedFlight.scheduledTimeLabel} {verifiedFlight.airportName} at{" "}
            {verifiedFlight.scheduledTime}
          </p>
        </div>
      )}
      {lookupStatus === "unavailable" && lookupMessage && (
        <p className="mt-1.5 text-xs text-amber-200/90">{lookupMessage}</p>
      )}
      {lookupStatus === "error" && lookupMessage && (
        <p className="mt-1.5 text-xs text-red-300">{lookupMessage}</p>
      )}
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function formatVerifiedFlightSummary(flight: VerifiedFlight): string {
  return `${flight.airline} ${flight.flightNumber} · ${flight.scheduledTimeLabel.toLowerCase()} ${flight.scheduledTime}`;
}
