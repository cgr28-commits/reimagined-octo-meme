"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TrackPageClient from "./TrackPageClient";
import { SERVICE_FLAGS, SITE } from "@/lib/data";

function CustomerTrackPage() {
  const params = useSearchParams();
  const token = params.get("id")?.trim() ?? "";
  if (!/^[a-f0-9]{32}$/i.test(token)) return <main className="min-h-screen bg-navy px-6 py-24 text-center text-white"><h1 className="text-2xl font-bold">Track your driver</h1><p className="mt-4">Open the private tracking link in your booking or journey email.</p><p className="mt-3 text-white/70">The link only becomes live when your driver is on the way and starts sharing their location.</p></main>;
  return <TrackPageClient token={token} />;
}

export default function TrackPage() {
  if (!SERVICE_FLAGS.liveDriverTracking) return <main className="min-h-screen bg-navy px-6 py-24 text-center text-white">
    <h1 className="text-2xl font-bold">Driver location sharing</h1>
    <p className="mx-auto mt-4 max-w-lg text-white/80">Website GPS tracking is temporarily unavailable. Your driver can share Live Location directly in WhatsApp. Location is only shared if your driver starts it there.</p>
    <a className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-emerald px-5 py-3 font-semibold text-navy" href={`https://wa.me/${SITE.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">Contact us on WhatsApp</a>
  </main>;
  return <Suspense fallback={<main className="min-h-screen bg-navy p-10 text-white">Loading tracking…</main>}><CustomerTrackPage /></Suspense>;
}
