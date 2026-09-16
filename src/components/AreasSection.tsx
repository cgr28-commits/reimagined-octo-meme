import Link from "next/link";
import { AIRPORTS, AREAS } from "@/lib/data";
import { getTownHubByAreaName } from "@/lib/location-pages";
import SectionHeading from "./SectionHeading";

export default function AreasSection() {
  return (
    <section id="areas" className="relative scroll-mt-36 md:scroll-mt-28 py-20 sm:py-28 lg:py-32">
      <div className="absolute inset-0 bg-navy-dark" />
      <div className="absolute inset-0 opacity-20">
        <div className="h-full w-full bg-[radial-gradient(ellipse_at_center,_var(--color-emerald)_0%,_transparent_70%)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:max-w-[1400px] lg:px-10 xl:px-12">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20 xl:gap-24">
          <div>
            <SectionHeading
              align="left"
              eyebrow="Coverage"
              title="Areas We Cover"
              navId="areas"
              description="Based in the Greater Belfast area, we provide pre-booked airport transfers across Northern Ireland — from city centres to rural towns. Don't see your area? Get in touch; we cover the entire province."
            />

            <div className="mt-8 flex flex-wrap gap-4 lg:mt-10">
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
                <p className="text-sm text-white/50">Book online</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 lg:p-8">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {AREAS.map((area) => {
                const hub = getTownHubByAreaName(area);
                const chipClass =
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-white/75 transition-colors hover:bg-emerald/10 hover:text-white";
                const pin = (
                  <svg
                    className="h-4 w-4 shrink-0 text-emerald"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                      clipRule="evenodd"
                    />
                  </svg>
                );
                return hub ? (
                  <Link
                    key={area}
                    href={`/locations/${hub.slug}/`}
                    className={chipClass}
                  >
                    {pin}
                    {area}
                  </Link>
                ) : (
                  <div key={area} className={chipClass}>
                    {pin}
                    {area}
                  </div>
                );
              })}
            </div>
            <p className="mt-5 text-sm text-white/55">
              <Link href="/locations/" className="text-emerald hover:text-emerald-light">
                View airport taxi towns
              </Link>
              {" · "}
              <Link
                href="/belfast-cruise-terminal-transfers/"
                className="text-emerald hover:text-emerald-light"
              >
                Belfast cruise terminal transfers
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
