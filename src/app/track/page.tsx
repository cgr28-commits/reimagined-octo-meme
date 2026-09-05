"use client";

import { Suspense } from "react";
import { SITE } from "@/lib/data";

/**
 * Customer website live-tracking map is retired.
 * Travel-day updates use Driver on the way email + optional WhatsApp live location.
 */
function TrackRetiredNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-4 py-16 text-center">
      <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-navy-dark/60 px-6 py-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
          {SITE.name}
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Driver updates by email &amp; WhatsApp</h1>
        <p className="mt-4 text-sm leading-relaxed text-white/70">
          We no longer use a website live-tracking page. On travel day we email you when your
          driver is on the way. Your driver may share their live location with you via WhatsApp
          when appropriate.
        </p>
        <a
          href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent("Hi, I have a question about my booking.")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald px-5 py-3 text-sm font-bold text-navy"
        >
          Message us on WhatsApp
        </a>
        <p className="mt-4 text-xs text-white/45">
          Need help? Contact us via WhatsApp or email.
        </p>
      </div>
    </main>
  );
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-navy text-white/60">
          Loading…
        </main>
      }
    >
      <TrackRetiredNotice />
    </Suspense>
  );
}
