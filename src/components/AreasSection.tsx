import { AIRPORTS, AREAS } from "@/lib/data";

export default function AreasSection() {
  return (
    <section id="areas" className="relative py-20 sm:py-28">
      <div className="absolute inset-0 bg-navy-dark" />
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[radial-gradient(ellipse_at_center,_var(--color-emerald)_0%,_transparent_70%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
              Coverage
            </p>
            <h2 className="section-heading mt-2 text-3xl font-bold text-white sm:text-4xl">
              Areas We Cover
            </h2>
            <p className="mt-5 text-base leading-relaxed text-white/60">
              Based in Belfast, we provide airport transfers across all of Northern
              Ireland — from city centres to rural towns. Don&apos;t see your area?
              Get in touch; we cover the entire province.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
                <p className="text-2xl font-bold text-emerald">20+</p>
                <p className="text-sm text-white/50">Towns &amp; Cities</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
                <p className="text-2xl font-bold text-emerald">{AIRPORTS.length}</p>
                <p className="text-sm text-white/50">Major Airports</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-4">
                <p className="text-2xl font-bold text-emerald">24/7</p>
                <p className="text-sm text-white/50">Availability</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              {AREAS.map((area) => (
                <div
                  key={area}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-white/75 transition-colors hover:bg-emerald/10 hover:text-white"
                >
                  <svg
                    className="h-4 w-4 shrink-0 text-emerald"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {area}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
