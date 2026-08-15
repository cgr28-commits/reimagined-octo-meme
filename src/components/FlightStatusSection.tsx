import { FLIGHT_AIRPORTS } from "@/lib/data";
import AirportBookNowLink from "./AirportBookNowLink";
import SectionHeading from "./SectionHeading";

export default function FlightStatusSection() {
  return (
    <section id="flight-status" className="relative py-24 sm:py-32">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Plan Your Pickup"
          title="Check Your Flight"
          description="View live arrivals and departures on each airport's official flight board. Share your flight number when you book and we'll monitor it for your pickup."
        />

        <div className="mt-16 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
          {FLIGHT_AIRPORTS.map((airport) => (
            <article
              key={airport.code}
              className="flex flex-col border-t border-white/10 pt-6"
            >
              <span className="text-xs font-semibold tracking-[0.14em] text-emerald">
                {airport.code}
              </span>
              <h3 className="mt-4 text-lg font-semibold tracking-tight text-white">{airport.name}</h3>
              <p className="mt-1 text-sm text-white/45">{airport.subtitle}</p>

              <div className="mt-5 flex flex-wrap gap-3">
                <a
                  href={airport.arrivalsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-white/70 transition-colors hover:text-emerald"
                >
                  Arrivals →
                </a>
                <a
                  href={airport.departuresUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-white/70 transition-colors hover:text-emerald"
                >
                  Departures →
                </a>
              </div>

              <div className="mt-auto pt-6">
                <AirportBookNowLink
                  airportCode={airport.code}
                  className="text-sm font-semibold text-emerald transition-colors hover:text-emerald-light"
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
