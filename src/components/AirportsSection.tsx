import { AIRPORTS } from "@/lib/data";
import AirportBookNowLink from "./AirportBookNowLink";
import SectionHeading from "./SectionHeading";

export default function AirportsSection() {
  return (
    <section id="airports" className="relative py-20 sm:py-28">
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/30 to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Destinations"
          title="Airports We Serve"
          description="Professional transfers to every major airport — with live flight tracking, meet & greet, and complimentary waiting time included."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {AIRPORTS.map((airport) => (
            <article
              key={airport.code}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-emerald/30 hover:bg-white/[0.06] hover:shadow-xl hover:shadow-emerald/5"
            >
              <div className="flex items-start justify-between">
                <span className="rounded-lg bg-emerald/15 px-3 py-1 text-xs font-bold tracking-wider text-emerald">
                  {airport.code}
                </span>
                <span className="text-lg font-bold text-emerald">{airport.distance}</span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">{airport.name}</h3>
              <p className="mt-1 text-sm text-white/50">{airport.duration}</p>
              <p className="mt-3 text-sm leading-relaxed text-white/65">
                {airport.description}
              </p>
              <AirportBookNowLink airportCode={airport.code} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
