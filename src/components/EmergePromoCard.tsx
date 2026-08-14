import Link from "next/link";
import { EMERGE_BELFAST_PATH } from "@/lib/emerge-belfast";

/** Homepage promotional card — not a main-nav item. */
export default function EmergePromoCard() {
  return (
    <section className="relative py-12 sm:py-16" aria-label="EMERGE Belfast transfers">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="emerge-page overflow-hidden rounded-3xl border border-emerald/25 bg-gradient-to-br from-navy-light/80 via-navy to-navy-dark p-6 shadow-xl shadow-black/30 sm:p-8">
          <div className="emerge-hero-beams emerge-promo-beams" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald">
                29–30 August 2026
              </p>
              <h2 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
                Going to EMERGE Belfast?
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-white/65 sm:text-base">
                Pre-book an airport, hotel or return transfer for 29–30 August 2026.
              </p>
            </div>
            <Link
              href={EMERGE_BELFAST_PATH}
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-emerald px-6 py-3 text-sm font-bold text-navy transition-colors hover:bg-emerald-light"
            >
              View EMERGE Transfers
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
