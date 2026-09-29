import Link from "next/link";
import { LOCATIONS_BELFAST_ROUTE_LINKS } from "@/lib/locations-content";
import SectionHeading from "./SectionHeading";

/** Four Belfast corridor pages. The homepage remains the Belfast hub. */
export default function PopularBelfastTransfers() {
  return (
    <section
      id="belfast-routes"
      className="relative scroll-mt-36 py-16 sm:py-20 md:scroll-mt-28 lg:py-24"
    >
      <div className="absolute inset-0 bg-navy-dark" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 desktop-shell lg:max-w-[1400px] lg:px-10 xl:px-12">
        <SectionHeading
          eyebrow="From Belfast"
          title="Popular Belfast Airport Transfers"
          description="Pre-booked private transfers for the Belfast journeys customers ask for most often."
        />

        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:mt-12 lg:gap-4">
          {LOCATIONS_BELFAST_ROUTE_LINKS.map((route) => (
            <li key={route.href}>
              <Link
                href={route.href}
                className="flex min-h-14 items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left transition-colors hover:border-emerald/40 hover:bg-white/[0.06]"
              >
                <span className="text-base font-semibold text-white">{route.label}</span>
                <span className="shrink-0 text-sm font-semibold text-emerald" aria-hidden>
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
