import Image from "next/image";
import { VEHICLE_FLEET, SITE } from "@/lib/data";
import { withBasePath } from "@/lib/paths";
import SectionHeading from "./SectionHeading";

const HERO_IMAGE = withBasePath("/images/vehicles/flyer-vehicle.jpg");

export default function VehiclesSection() {
  return (
    <section id="vehicles" className="relative py-20 sm:py-28">
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/15 to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Our Fleet"
          title="Spacious vehicles for every journey"
          description="From solo business trips to family holidays — our licensed fleet has room for passengers and luggage, with MPV and minibus options for larger groups."
        />

        <div className="mt-12 grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/30">
            <Image
              src={HERO_IMAGE}
              alt="My Airport Taxi NI MPV with open tailgate and suitcases at Belfast City Airport"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/50 via-transparent to-transparent" />
          </div>

          <div className="space-y-6">
            <p className="text-base leading-relaxed text-white/70">
              Our typical airport transfer vehicle is a modern MPV with generous boot space for
              suitcases, pushchairs, and holiday gear — ideal for families and group travel.
            </p>

            <ul className="grid gap-4 sm:grid-cols-2">
              {VEHICLE_FLEET.map((vehicle) => (
                <li
                  key={vehicle.name}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-emerald/20"
                >
                  <p className="font-semibold text-white">{vehicle.name}</p>
                  <p className="mt-1 text-sm text-emerald">{vehicle.capacity}</p>
                  <p className="mt-2 text-sm leading-relaxed text-white/60">{vehicle.description}</p>
                </li>
              ))}
            </ul>

            <a
              href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent("Hi, I'd like a quote for an airport transfer. Please advise the best vehicle for my group and luggage.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-emerald px-6 py-3 text-sm font-semibold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25"
            >
              Ask about vehicle options
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
