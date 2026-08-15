import Link from "next/link";
import { AIRPORTS } from "@/lib/data";
import { AIRPORT_PAGES } from "@/lib/location-pages";
import {
  arePublicLivePricesEnabled,
  getPublicUnapprovedPriceLabel,
} from "@/lib/pricing-config";
import AirportBookNowLink from "./AirportBookNowLink";
import SectionHeading from "./SectionHeading";

function airportPageHref(code: string): string | null {
  const page = AIRPORT_PAGES.find((item) => item.code === code);
  return page ? `/airports/${page.slug}/` : null;
}

export default function AirportsSection() {
  const showLiveFromPrices = arePublicLivePricesEnabled();
  const confirmationLabel = getPublicUnapprovedPriceLabel();

  return (
    <section id="airports" className="relative py-24 sm:py-32">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Destinations"
          title="Airports We Serve"
          description="Professional transfers to every major airport — with live flight tracking, meet & greet, and complimentary waiting time included."
        />

        <div className="mt-16 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
          {AIRPORTS.map((airport) => {
            const href = airportPageHref(airport.code);
            return (
              <article
                key={airport.code}
                className="group border-t border-white/10 pt-6 transition-colors hover:border-emerald/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-semibold tracking-[0.14em] text-emerald">
                    {airport.code}
                  </span>
                  <span className="text-sm font-semibold text-white/70">
                    {showLiveFromPrices ? airport.distance : confirmationLabel}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold tracking-tight text-white">
                  {href ? (
                    <Link href={href} className="transition-colors hover:text-emerald">
                      {airport.name}
                    </Link>
                  ) : (
                    airport.name
                  )}
                </h3>
                <p className="mt-1 text-sm text-white/45">{airport.duration}</p>
                <p className="mt-3 text-sm leading-relaxed text-white/65">
                  {airport.description}
                </p>
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <AirportBookNowLink
                    airportCode={airport.code}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-emerald transition-colors hover:text-emerald-light"
                  />
                  {href ? (
                    <Link
                      href={href}
                      className="text-sm font-semibold text-white/55 transition-colors hover:text-emerald"
                    >
                      Transfer guide →
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
