"use client";

import { AIRPORTS, HERO_IMAGE } from "@/lib/data";
import { withBasePath } from "@/lib/paths";
import QuoteCard from "./QuoteCard";

const HERO_WIDTHS = [960, 1920] as const;

function heroSrcSet(ext: "avif" | "webp" | "jpg"): string {
  return HERO_WIDTHS.map(
    (width) => `${withBasePath(`/images/hero/optimized/antrim-coast-${width}.${ext}`)} ${width}w`,
  ).join(", ");
}

export default function HeroSlideshow() {
  const fromPrice = AIRPORTS.find((airport) => airport.code === "BFS")?.distance ?? "From £45";

  return (
    <section className="relative min-h-screen max-w-full overflow-x-clip overflow-y-hidden pt-44 md:pt-28">
      <div className="absolute inset-0 overflow-hidden">
        <picture>
          <source type="image/avif" srcSet={heroSrcSet("avif")} sizes="100vw" />
          <source type="image/webp" srcSet={heroSrcSet("webp")} sizes="100vw" />
          <img
            src={withBasePath("/images/hero/optimized/antrim-coast-1920.jpg")}
            srcSet={heroSrcSet("jpg")}
            sizes="100vw"
            width={1920}
            height={1280}
            alt={HERO_IMAGE.alt}
            fetchPriority="high"
            decoding="async"
            className={[
              "absolute inset-0 h-full w-full object-cover",
              HERO_IMAGE.imageClass,
              "hero-slide",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        </picture>
        <div className="absolute inset-0 bg-gradient-to-b from-navy/50 via-navy/35 to-navy/85 max-md:from-navy/55 max-md:via-navy/40 max-md:to-navy/90" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy/55 via-navy/10 to-navy/35 max-md:from-navy/60 max-md:via-navy/15 max-md:to-navy/40" />
      </div>

      <div className="relative mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-12 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:gap-16 lg:px-8 lg:py-24">
        <div className="min-w-0 flex-1 lg:max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald/30 bg-emerald/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald" />
            24/7 Premium Transfers
          </div>

          <h1 className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
            Airport Transfers Across Northern Ireland
          </h1>

          <p className="mt-5 max-w-lg text-lg leading-relaxed text-white/75 sm:text-xl">
            Fixed prices to Belfast International, Dublin, and City of Derry airports — with flight
            tracking, meet &amp; greet, and complimentary waiting time.
          </p>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-white/65 sm:text-base">
            Get a live quote, then Request to book. Once we confirm your job, we email a SumUp
            payment link — your booking is confirmed after payment.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#quote"
              className="rounded-full bg-emerald px-8 py-3.5 text-sm font-bold text-navy shadow-lg shadow-emerald/25 transition-all hover:bg-emerald-light hover:shadow-emerald/40"
            >
              Get a Quote
            </a>
            <a
              href="#airports"
              className="rounded-full border border-white/20 px-8 py-3.5 text-sm font-semibold text-white transition-all hover:border-emerald/50 hover:bg-white/5"
            >
              View Airports
            </a>
          </div>

          <div className="mt-10 flex flex-wrap gap-6 text-sm text-white/60">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{fromPrice}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Flight Tracking
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Meet &amp; Greet
            </div>
          </div>
        </div>

        <div className="min-w-0 w-full flex-1 scroll-mt-28 lg:max-w-md" id="quote">
          <QuoteCard />
        </div>
      </div>
    </section>
  );
}
