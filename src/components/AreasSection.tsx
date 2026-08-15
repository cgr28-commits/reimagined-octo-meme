import { AIRPORTS, AREAS } from "@/lib/data";
import SectionHeading from "./SectionHeading";

export default function AreasSection() {
  return (
    <section id="areas" className="relative py-24 sm:py-32">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-start gap-16 lg:grid-cols-2 lg:gap-24">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Coverage"
              title="Areas We Cover"
              description="Based in Belfast, we provide airport transfers across all of Northern Ireland — from city centres to rural towns. Don't see your area? Get in touch; we cover the entire province."
            />

            <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/10 pt-8">
              <div>
                <dt className="text-xs uppercase tracking-wider text-white/45">Towns &amp; cities</dt>
                <dd className="mt-2 text-2xl font-semibold tracking-tight text-white">20+</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-white/45">Major airports</dt>
                <dd className="mt-2 text-2xl font-semibold tracking-tight text-white">{AIRPORTS.length}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wider text-white/45">Availability</dt>
                <dd className="mt-2 text-2xl font-semibold tracking-tight text-white">24/7</dd>
              </div>
            </dl>
          </div>

          <div className="border-t border-white/10 pt-8 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-12">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-3">
              {AREAS.map((area) => (
                <li key={area} className="text-sm text-white/70">
                  {area}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
