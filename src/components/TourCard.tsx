import Image from "next/image";
import Link from "next/link";
import type { Tour } from "@/lib/tours";
import TourEnquireButton from "@/components/TourEnquireButton";

type TourCardProps = {
  tour: Tour;
};

export default function TourCard({ tour }: TourCardProps) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-all hover:border-emerald/30 hover:bg-white/[0.06] hover:shadow-xl hover:shadow-emerald/5">
      <Link href={`/tours/${tour.slug}/`} className="relative block aspect-[16/10] overflow-hidden">
        <Image
          src={tour.image}
          alt={tour.imageAlt}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy/80 via-navy/20 to-transparent" />
        <span className="absolute left-4 top-4 rounded-lg bg-emerald/15 px-3 py-1 text-xs font-bold tracking-wider text-emerald backdrop-blur-sm">
          {tour.eyebrow}
        </span>
        <span className="absolute right-4 top-4 rounded-lg bg-navy/70 px-3 py-1 text-sm font-bold text-emerald backdrop-blur-sm">
          {tour.price}
        </span>
      </Link>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="text-lg font-bold text-white">
          <Link href={`/tours/${tour.slug}/`} className="transition-colors hover:text-emerald">
            {tour.title}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-white/50">{tour.duration}</p>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-white/65">{tour.shortDescription}</p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={`/tours/${tour.slug}/`}
            className="inline-flex items-center gap-1 text-sm font-semibold text-emerald transition-colors hover:text-emerald-light"
          >
            View trip details
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <TourEnquireButton tour={tour} />
        </div>
      </div>
    </article>
  );
}
