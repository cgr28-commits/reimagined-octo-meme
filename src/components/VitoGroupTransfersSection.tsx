import Link from "next/link";
import QuoteNavLink from "@/components/QuoteNavLink";
import SectionHeading from "@/components/SectionHeading";
import VitoVehiclePlaceholder from "@/components/VitoVehiclePlaceholder";
import { VITO_GROUP_PAGES } from "@/lib/vito-group-content";

const HOME_LINKS = [
  VITO_GROUP_PAGES[0],
  VITO_GROUP_PAGES[1],
  VITO_GROUP_PAGES[2],
  VITO_GROUP_PAGES[3],
  VITO_GROUP_PAGES[4],
] as const;

export default function VitoGroupTransfersSection() {
  return (
    <section
      id="vito-group-transfers"
      className="relative scroll-mt-36 py-16 sm:py-20 md:scroll-mt-28 lg:py-24"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-navy-dark via-navy to-navy-dark" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 desktop-shell lg:max-w-[1400px] lg:px-10 xl:px-12">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-14">
          <div>
            <SectionHeading
              eyebrow="Group travel"
              title="Mercedes-Benz Vito 7-Passenger Group Transfers"
              description="A private Mercedes-Benz Vito for up to seven passengers plus the driver. Door-to-door airport, hen, stag and group journeys, with the fixed fare shown before you book."
              align="left"
              navId="vito-group-transfers"
            />
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {HOME_LINKS.map((page) => (
                <li key={page.path}>
                  <Link
                    href={page.path}
                    className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:border-emerald/40 hover:bg-white/[0.06]"
                  >
                    <span className="text-sm font-semibold text-white sm:text-base">{page.h1}</span>
                    <span className="shrink-0 text-sm font-semibold text-emerald" aria-hidden>
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <QuoteNavLink
              href="/#quote"
              className="mt-6 inline-flex min-h-11 items-center rounded-full bg-emerald px-6 py-3 text-sm font-bold text-navy shadow-lg shadow-emerald/25 transition-all hover:bg-emerald-light"
            >
              Get an Instant Quote
            </QuoteNavLink>
          </div>
          <VitoVehiclePlaceholder />
        </div>
      </div>
    </section>
  );
}
