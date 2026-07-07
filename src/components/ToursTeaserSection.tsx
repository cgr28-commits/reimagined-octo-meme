import Image from "next/image";
import Link from "next/link";
import { TOURS } from "@/lib/tours";
import SectionHeading from "./SectionHeading";

const FEATURED_TOUR = TOURS[0];

export default function ToursTeaserSection() {
  return (
    <section id="tours" className="relative py-20 sm:py-28">
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-light/20 to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Private Tours"
          title="Explore Northern Ireland"
          description="Beyond airport transfers, we offer private day tours with a dedicated driver — from the Causeway Coast to Belfast, the Mournes, and beyond."
        />

        <div className="mt-12 grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
          <Link
            href={`/tours/${FEATURED_TOUR.slug}/`}
            className="group relative block aspect-[16/10] overflow-hidden rounded-2xl border border-white/10"
          >
            <Image
              src={FEATURED_TOUR.image}
              alt={FEATURED_TOUR.imageAlt}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/30 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald">{FEATURED_TOUR.eyebrow}</p>
              <p className="mt-1 text-xl font-bold text-white">{FEATURED_TOUR.title}</p>
              <p className="mt-2 text-sm text-white/65">{FEATURED_TOUR.shortDescription}</p>
            </div>
          </Link>

          <div className="flex flex-col items-center gap-6 sm:items-start">
            <Link
              href="/tours/"
              className="inline-flex items-center gap-2 rounded-full bg-emerald px-8 py-3.5 text-sm font-semibold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25"
            >
              View all tours
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <p className="max-w-md text-center text-sm text-white/50 sm:text-left">
              Giant&apos;s Causeway, Game of Thrones locations, Belfast city highlights, and more — all with door-to-door service.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
