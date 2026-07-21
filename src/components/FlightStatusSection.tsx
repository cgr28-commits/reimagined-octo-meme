import { FLIGHT_AIRPORTS } from "@/lib/data";
import DeviceBookingCta from "./DeviceBookingCta";
import SectionHeading from "./SectionHeading";

export default function FlightStatusSection() {
  return (
    <section id="flight-status" className="relative py-20 sm:py-28">
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-dark/50 to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Plan Your Pickup"
          title="Check Your Flight"
          description="View live arrivals and departures on each airport's official flight board. Share your flight number when you book and we'll monitor it for your pickup."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FLIGHT_AIRPORTS.map((airport) => (
            <article
              key={airport.code}
              className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:border-emerald/30 hover:bg-white/[0.06] hover:shadow-xl hover:shadow-emerald/5"
            >
              <div className="flex items-start justify-between">
                <span className="rounded-lg bg-emerald/15 px-3 py-1 text-xs font-bold tracking-wider text-emerald">
                  {airport.code}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-white">{airport.name}</h3>
              <p className="mt-1 text-sm text-white/50">{airport.subtitle}</p>

              <div className="mt-5 flex flex-wrap gap-2">
                <a
                  href={airport.arrivalsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:border-emerald/30 hover:text-emerald"
                >
                  Arrivals
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
                <a
                  href={airport.departuresUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:border-emerald/30 hover:text-emerald"
                >
                  Departures
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              </div>

              <a
                href={airport.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 text-sm font-semibold text-emerald transition-colors hover:text-emerald-light"
              >
                All flight information →
              </a>

              <DeviceBookingCta
                whatsappMessage={`Hi, I'd like to book an airport transfer. My flight is arriving at ${airport.name} (${airport.code}).`}
                mobileLabel="Book transfer via WhatsApp"
                desktopLabel="Book transfer online"
                className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald px-4 py-2.5 text-sm font-semibold text-navy transition-all hover:bg-emerald-light"
              />
            </article>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-white/40">
          We monitor your flight for pickup times — delays and early arrivals are handled at no extra
          cost.
        </p>
      </div>
    </section>
  );
}
