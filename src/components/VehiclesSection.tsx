import Image from "next/image";
import { withBasePath } from "@/lib/paths";
import DeviceBookingCta from "./DeviceBookingCta";
import SectionHeading from "./SectionHeading";

const HERO_IMAGE = withBasePath("/images/vehicles/flyer-vehicle.jpg");

export default function VehiclesSection() {
  return (
    <section id="vehicles" className="relative scroll-mt-36 md:scroll-mt-28 py-20 sm:py-28 lg:py-32">
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/15 to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:max-w-[1400px] lg:px-10 xl:px-12">
        <SectionHeading
          eyebrow="Your journey"
          title="Private transfers for up to 4"
          navId="vehicles"
          description="Professional private airport transfer in a Saloon or Estate — the quote tool picks the right car from your passengers and luggage."
        />

        <div className="mt-12 grid items-center gap-10 lg:mt-16 lg:grid-cols-2 lg:gap-16">
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/30">
            <Image
              src={HERO_IMAGE}
              alt="Estate car with open boot and suitcases ready for an airport transfer"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/50 via-transparent to-transparent" />
          </div>

          <div className="space-y-6">
            <div className="border-l-2 border-emerald/60 pl-5">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-emerald">
                Up to 4 passengers
              </p>
              <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-white">
                Saloon &amp; Estate
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/62">
                Instant quote where eligible. Standard or estate car selected automatically from your
                passengers and luggage. Pay securely online where an instant fare is shown.
              </p>
            </div>

            <DeviceBookingCta
              whatsappMessage="Hi, I'd like a quote for an airport transfer."
              mobileLabel="Get a quote on WhatsApp"
              desktopLabel="Get a fixed quote"
              className="btn-primary px-7"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
