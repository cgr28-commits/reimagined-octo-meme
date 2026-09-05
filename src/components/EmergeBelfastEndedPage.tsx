"use client";

import Link from "next/link";
import {
  EMERGE_BELFAST_CONFIG,
  EMERGE_DISCLAIMER,
} from "@/lib/emerge-belfast";
import { SITE } from "@/lib/data";

/**
 * Shown at /events/emerge-belfast-taxi/ after the campaign expiry date.
 * Soft-ended only — same URL is kept for next year’s campaign (no 301).
 */
export default function EmergeBelfastEndedPage() {
  const year = EMERGE_BELFAST_CONFIG.campaignYear;

  return (
    <div className="emerge-page">
      <section className="emerge-hero relative overflow-hidden pb-16 pt-36 md:pt-32">
        <div className="emerge-hero-beams" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald">
            Event campaign ended
          </p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            EMERGE Belfast {year} transfers have ended
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-white/75">
            Pre-booked taxi and airport-transfer promotions for EMERGE Belfast {year} at{" "}
            {EMERGE_BELFAST_CONFIG.venue} are no longer active. This page is kept for information
            only and is not offered as a current festival booking campaign.
          </p>
          <p className="mt-4 text-base leading-relaxed text-white/65">
            Need an airport, hotel or local transfer instead? Get a fixed quote through our usual
            booking flow — still for up to 4 passengers online.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/#quote"
              className="inline-flex items-center justify-center rounded-full bg-emerald px-7 py-3.5 text-sm font-bold text-navy shadow-lg shadow-emerald/25 transition-all hover:bg-emerald-light"
            >
              Get a Fixed Quote
            </Link>
            <Link
              href="/contact/"
              className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/5 px-7 py-3.5 text-sm font-bold text-white transition-colors hover:border-emerald/50 hover:bg-emerald/10"
            >
              Contact us
            </Link>
          </div>
          <p className="mt-6 text-sm text-white/50">
            WhatsApp @{SITE.whatsappUsername} · {SITE.email}
          </p>
        </div>
      </section>

      <section className="relative pb-24 pt-4">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <p className="text-xs leading-relaxed text-white/45 sm:text-sm">{EMERGE_DISCLAIMER}</p>
        </div>
      </section>
    </div>
  );
}
