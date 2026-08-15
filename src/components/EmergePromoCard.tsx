"use client";

import Link from "next/link";
import {
  EMERGE_BELFAST_CONFIG,
  EMERGE_BELFAST_PATH,
  isEmergeBelfastCampaignActive,
} from "@/lib/emerge-belfast";

/** Homepage promotional card — hidden after campaign expiry (UK date). */
export default function EmergePromoCard() {
  if (!isEmergeBelfastCampaignActive()) {
    return null;
  }

  return (
    <section className="relative py-12 sm:py-16" aria-label="EMERGE Belfast transfers">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden border border-white/10 bg-navy-light px-6 py-8 sm:px-8 sm:py-10">
          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald">
                {EMERGE_BELFAST_CONFIG.eventDatesShort}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Going to EMERGE Belfast?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/65 sm:text-base">
                Pre-book an airport, hotel or return transfer for{" "}
                {EMERGE_BELFAST_CONFIG.eventDatesShort}.
              </p>
            </div>
            <Link
              href={EMERGE_BELFAST_PATH}
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-emerald px-6 py-3 text-sm font-semibold text-navy transition-colors hover:bg-emerald-light"
            >
              View EMERGE Transfers
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
