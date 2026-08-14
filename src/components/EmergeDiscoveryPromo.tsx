"use client";

import Link from "next/link";
import {
  EMERGE_BELFAST_CONFIG,
  EMERGE_BELFAST_PATH,
  isEmergeBelfastCampaignActive,
} from "@/lib/emerge-belfast";

type Props = {
  /** Optional override body copy (e.g. Dublin-focused transfer page). */
  description?: string;
};

/**
 * Small discovery promo on airport / transfer pages.
 * Soft-hides after EMERGE campaign expiry — source kept for next year.
 */
export default function EmergeDiscoveryPromo({ description }: Props) {
  if (!isEmergeBelfastCampaignActive()) {
    return null;
  }

  return (
    <section className="mt-8 rounded-2xl border border-emerald/25 bg-emerald/5 p-5 sm:p-6">
      <h2 className="text-lg font-bold text-white">Going to EMERGE Belfast?</h2>
      <p className="mt-2 text-sm leading-relaxed text-white/65">
        {description ??
          `Pre-book an airport, hotel or return transfer for ${EMERGE_BELFAST_CONFIG.eventDatesShort} at ${EMERGE_BELFAST_CONFIG.venue}.`}
      </p>
      <Link
        href={EMERGE_BELFAST_PATH}
        className="mt-4 inline-flex text-sm font-semibold text-emerald hover:text-emerald-light"
      >
        View EMERGE Transfers
      </Link>
    </section>
  );
}
