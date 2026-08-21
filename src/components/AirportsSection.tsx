import Link from "next/link";
import { AIRPORTS } from "@/lib/data";
import { AIRPORT_PAGES } from "@/lib/location-pages";
import AirportBookNowLink from "./AirportBookNowLink";
import SectionHeading from "./SectionHeading";

function airportPageHref(code: string): string | null {
  const page = AIRPORT_PAGES.find((item) => item.code === code);
  return page ? `/airports/${page.slug}/` : null;
}

export default function AirportsSection() {
  return (
    <section id="airports" className="relative scroll-mt-36 py-20 sm:py-28 lg:py-32 xl:scroll-mt-28">
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/30 to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:max-w-[1400px] lg:px-10 xl:px-12">
        <SectionHeading
          eyebrow="Destinations"
          title="Airports We Serve"
          description="Transfers to Belfast International, Belfast City, City of Derry, and Dublin — with flight monitoring and complimentary waiting where it applies."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 xl:grid-cols-4 lg:mt-16 lg:gap-7">
          {AIRPORTS.map((airport) => {
            const href = airportPageHref(airport.code);
            return (
              <article
                key={airport.code}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-emerald/30 hover:bg-white/[0.06] hover:shadow-xl hover:shadow-emerald/5"
              >
                <div className="flex items-start justify-between">
                  <span className="rounded-lg bg-emerald/15 px-3 py-1 text-xs font-bold tracking-wider text-emerald">
                    {airport.code}
                  </span>
                  <span className="text-sm font-semibold text-emerald">
                    {airport.distance}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">
                  {href ? (
                    <Link href={href} className="transition-colors hover:text-emerald">
                      {airport.name}
                    </Link>
                  ) : (
                    airport.name
                  )}
                </h3>
                <p className="mt-1 text-sm text-white/50">{airport.duration}</p>
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
