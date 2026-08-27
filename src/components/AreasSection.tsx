import { AIRPORTS, AREAS } from "@/lib/data";
import SectionHeading from "./SectionHeading";

export default function AreasSection() {
  return (
    <section id="areas" className="relative scroll-mt-36 py-20 sm:py-28 lg:py-32 xl:scroll-mt-28">
      <div className="absolute inset-0 bg-navy-dark" />
      <div className="absolute inset-0 opacity-25">
        <div className="h-full w-full bg-[radial-gradient(ellipse_at_30%_20%,rgba(12,42,82,0.9),transparent_55%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:max-w-[1400px] lg:px-10 xl:px-12">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20 xl:gap-24">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Coverage"
              title="Areas We Cover"
              navId="areas"
              description="Based in Belfast, we provide airport transfers across all of Northern Ireland — from city centres to rural towns. Don't see your area? Get in touch; we cover the entire province."
            />

            <div className="mt-8 flex flex-wrap gap-6 lg:mt-10">
              <div>
                <p className="font-display text-3xl font-semibold text-white">20+</p>
                <p className="mt-1 text-sm text-white/50">Towns &amp; cities</p>
              </div>
              <div>
                <p className="font-display text-3xl font-semibold text-white">{AIRPORTS.length}</p>
                <p className="mt-1 text-sm text-white/50">Major airports</p>
              </div>
              <div>
                <p className="font-display text-3xl font-semibold text-white">24/7</p>
                <p className="mt-1 text-sm text-white/50">Availability</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:p-8 lg:p-8">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 lg:gap-2.5">
              {AREAS.map((area) => (
                <div
                  key={area}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                  <span className="h-px w-2.5 shrink-0 bg-emerald/70" aria-hidden />
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
