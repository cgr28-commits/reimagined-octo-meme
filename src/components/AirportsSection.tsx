import { AIRPORTS } from "@/lib/data";

export default function AirportsSection() {
  return (
    <section id="airports" className="relative py-20 sm:py-28">
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/30 to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
            Destinations
          </p>
          <h2 className="section-heading mx-auto mt-2 text-3xl font-bold text-white sm:text-4xl">
            Airports We Serve
          </h2>
          <p className="mt-5 text-base leading-relaxed text-white/60">
            Professional transfers to every major airport — with live flight tracking,
            meet &amp; greet, and complimentary waiting time included.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
              <div className="mt-5 flex items-center gap-1 text-sm font-semibold text-emerald opacity-0 transition-opacity group-hover:opacity-100">
                Book this route
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
