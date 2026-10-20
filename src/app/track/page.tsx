"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TrackPageClient from "./TrackPageClient";

function CustomerTrackPage() {
  const params = useSearchParams();
  const token = params.get("id")?.trim() ?? "";
  if (!/^[a-f0-9]{32}$/i.test(token)) return <main className="min-h-screen bg-navy px-6 py-24 text-center text-white"><h1 className="text-2xl font-bold">Track your driver</h1><p className="mt-4">Open the private tracking link in your booking or journey email.</p><p className="mt-3 text-white/70">The link only becomes live when your driver is on the way and starts sharing their location.</p></main>;
  return <TrackPageClient token={token} />;
}

export default function TrackPage() {
  return <Suspense fallback={<main className="min-h-screen bg-navy p-10 text-white">Loading tracking…</main>}><CustomerTrackPage /></Suspense>;
}
