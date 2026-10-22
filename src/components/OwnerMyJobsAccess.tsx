"use client";
import { useState } from "react";
import { createPersonalDriverInvite, exchangeDriverPortalAccess } from "@/lib/tracking-api";

export default function OwnerMyJobsAccess({ ownerKey }: { ownerKey: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function openJobs() {
    setBusy(true); setError("");
    try {
      const invite = await createPersonalDriverInvite(ownerKey);
      const session = await exchangeDriverPortalAccess(invite.access);
      if (process.env.NEXT_PUBLIC_DRIVER_COOKIE_AUTH !== "true") window.localStorage.setItem("matni-driver-portal-session", session.sessionToken);
      window.location.assign("/driver/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open My Jobs.");
      setBusy(false);
    }
  }
  return <section className="mb-6 rounded-2xl border border-emerald/30 bg-emerald/5 p-5 text-white">
    <h2 className="font-bold">Your driving jobs</h2>
    <p className="mt-2 text-sm text-white/70">New confirmed journeys are assigned to you. Use My Jobs for journey updates and GPS; manage bookings and drivers here.</p>
    <button disabled={busy} onClick={() => void openJobs()} className="mt-4 rounded-xl bg-emerald px-5 py-3 font-bold text-navy disabled:opacity-60">{busy ? "Opening…" : "Open my driving jobs"}</button>
    {error && <p role="alert" className="mt-3 text-red-200">{error}</p>}
  </section>;
}
