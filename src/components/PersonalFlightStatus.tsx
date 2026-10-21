"use client";
import { useEffect, useState } from "react";
import { fetchDriverFlight, type DriverJob } from "@/lib/tracking-api";
type FlightResult = Awaited<ReturnType<typeof fetchDriverFlight>>;
export default function PersonalFlightStatus({ session, job }: { session: string; job: DriverJob }) {
  const [result, setResult] = useState<FlightResult | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function refresh() {
      if (document.hidden) return;
      setBusy(true);
      try { const next = await fetchDriverFlight(session, job.token); if (!cancelled) { setResult(next); setError(""); } }
      catch { if (!cancelled) setError("Flight update unavailable. Check the airport arrivals board."); }
      finally { if (!cancelled) setBusy(false); }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 300000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [session, job.token, open]);
  if (!job.isAirportPickup || !job.flightNumber) return null;
  const flight = result?.flight;
  const warning = /delay|cancel|divert/i.test(flight?.status ?? "") || (flight?.delayMinutes ?? 0) > 0;
  const arrived = /^(arrived|landed)$/i.test(flight?.status ?? "");
  const progress = /enroute|departed|approaching/i.test(flight?.status ?? "") ? "In flight" : arrived ? "Landed" : flight?.status === "Expected" ? "Scheduled" : null;
  return <section className="mt-4 rounded-xl border border-white/15 p-4 text-white">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Flight {job.flightNumber}</h3><button aria-expanded={open} className="rounded-lg border border-white/30 px-3 py-2 text-sm" onClick={() => setOpen(!open)}>{open ? "Hide flight updates" : "Show flight updates"}</button></div>
    {open && <div aria-live="polite" className="mt-3 space-y-2 text-sm">
      {busy && <p>Checking flight…</p>}
      {error && <p className="text-amber-200">{error} Previous information may be out of date.</p>}
      {result?.message && <p className="text-white/70">{result.message}</p>}
      {flight && <><p>{flight.departureAirport} → {flight.arrivalAirport}</p><p className={warning ? "font-bold text-amber-200" : "font-bold text-emerald"}>{flight.status || "Status not supplied"}</p><p>Scheduled arrival: {flight.scheduledTime} · {flight.date}</p>{progress && <p>Progress: {progress}</p>}{flight.revisedTime && <p>{arrived ? "Reported arrival" : "Updated arrival estimate"}: {new Date(flight.revisedTime).toLocaleString("en-GB", { timeZone: "Europe/London" })}</p>}{arrived && flight.runwayTime && <p>Landing: {new Date(flight.runwayTime).toLocaleString("en-GB", { timeZone: "Europe/London" })}</p>}{(flight.delayMinutes ?? 0) > 0 && <p className="font-bold text-amber-200">Arrival {flight.delayMinutes} minutes later than scheduled</p>}{warning && <p>Review the pickup arrangements. This does not cancel the booking.</p>}</>}
      {result?.lastCheckedAt && <p className="text-white/60">Last checked: {new Date(result.lastCheckedAt).toLocaleString("en-GB")}{result.stale ? " · Previous update" : ""}</p>}
      <p className="text-white/50">Checks every five minutes while this panel is open and visible.</p>
    </div>}
  </section>;
}
