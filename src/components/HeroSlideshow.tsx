"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { HERO_SLIDES } from "@/lib/data";
import QuoteCard from "./QuoteCard";

export default function HeroSlideshow() {
  const [current, setCurrent] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const goToSlide = useCallback(
    (index: number) => {
      if (index === current) return;
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrent(index);
        setIsTransitioning(false);
      }, 300);
    },
    [current],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      goToSlide((current + 1) % HERO_SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [current, goToSlide]);

  const slide = HERO_SLIDES[current];

  return (
    <section className="relative min-h-screen overflow-hidden pt-16">
      <div className="absolute inset-0">
        {HERO_SLIDES.map((s, i) => (
          <div
            key={s.image}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === current ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image
              src={s.image}
              alt={s.alt}
              fill
              priority={i === 0}
              className={`object-cover ${i === current && !isTransitioning ? "hero-slide" : ""}`}
              sizes="100vw"
            />
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-b from-navy/70 via-navy/50 to-navy" />
        <div className="absolute inset-0 bg-gradient-to-r from-navy/80 via-transparent to-navy/40" />
      </div>

      <div className="relative mx-auto flex max-w-7xl flex-col gap-12 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:gap-16 lg:px-8 lg:py-24">
        <div className="flex-1 lg:max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald/30 bg-emerald/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald" />
            24/7 Premium Transfers
          </div>

          <h1
            className={`text-4xl font-bold leading-tight tracking-tight text-white transition-opacity duration-300 sm:text-5xl lg:text-6xl ${
              isTransitioning ? "opacity-0" : "opacity-100"
            }`}
          >
            {slide.title}
          </h1>

          <p
            className={`mt-5 max-w-lg text-lg leading-relaxed text-white/75 transition-opacity duration-300 sm:text-xl ${
              isTransitioning ? "opacity-0" : "opacity-100"
            }`}
          >
            {slide.subtitle}
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

          <div className="mt-10 flex items-center gap-3">
            {HERO_SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goToSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === current ? "w-8 bg-emerald" : "w-4 bg-white/30 hover:bg-white/50"
                }`}
              />
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-6 text-sm text-white/60">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              From £35
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

        <div className="flex-1 scroll-mt-28 lg:max-w-md" id="quote">
          <QuoteCard />
        </div>
      </div>
    </section>
  );
}
