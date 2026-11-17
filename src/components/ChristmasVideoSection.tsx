"use client";

import { useEffect, useRef, useState } from "react";
import QuoteNavLink from "@/components/QuoteNavLink";
import { withBasePath } from "@/lib/paths";
import { isChristmasVideoLive } from "@/lib/seasonal";

/**
 * "Coming Home for Christmas?" promotional video (owner, 17 Nov 2026).
 *
 * Sits directly below the homepage quote calculator. Self-hosted MP4 (no third-party player or
 * tracking), nothing downloads until the customer presses play (preload="none" + poster), no
 * autoplay, sound only after the customer presses play. The 16:9 box is reserved up front so the
 * page never jumps. Visibility dates live in CHRISTMAS_VIDEO (src/lib/seasonal.ts).
 */
const VIDEO_DIR = "/seasonal/video";
const POSTER = `${VIDEO_DIR}/christmas-homecoming-poster.jpg`;
const SRC_1080 = `${VIDEO_DIR}/christmas-homecoming-1080.mp4`;
const SRC_720 = `${VIDEO_DIR}/christmas-homecoming-720.mp4`;

export default function ChristmasVideoSection({ initiallyLive }: { initiallyLive: boolean }) {
  const [live, setLive] = useState(initiallyLive);
  const [started, setStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // The site is a static export, so re-check the Europe/London date in the browser: the section
  // hides itself after the end date even if the site hasn't been rebuilt since.
  useEffect(() => {
    setLive(isChristmasVideoLive(new Date()));
  }, []);

  if (!live) return null;

  function play() {
    const video = videoRef.current;
    if (!video) return;
    setStarted(true);
    video.controls = true;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        // Playback refused (rare) — native controls are now showing, so the customer can retry.
      });
    }
    video.focus({ preventScroll: true });
  }

  return (
    // A <div role="region">, not a <section>: the light-design stylesheet repaints and recolours
    // every `main > section` in alternating bands, and adding a section would shift that pattern
    // for every section below. Colours here are pinned in seasonal-christmas.css.
    <div
      data-christmas-video
      role="region"
      aria-labelledby="christmas-video-heading"
      className="relative bg-navy px-4 py-10 sm:px-6 md:py-14 lg:py-16"
    >
      <div className="mx-auto w-full max-w-3xl text-center">
        <p data-cv-eyebrow className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[#E2C275]">
          Christmas 2026
        </p>
        <h2
          id="christmas-video-heading"
          data-cv-heading
          className="mt-2 text-balance font-sans text-[1.6rem] font-semibold leading-tight tracking-tight text-white md:text-[2.2rem]"
        >
          Coming Home for Christmas? <span aria-hidden="true">🎄</span>
        </h2>
        <p data-cv-sub className="mx-auto mt-2 max-w-xl text-pretty text-[0.95rem] leading-snug md:mt-3 md:text-lg">
          From airport arrivals to Christmas homecomings, let us take care of your journey.
        </p>

        <div className="relative mx-auto mt-6 w-full overflow-hidden rounded-2xl bg-navy-dark shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] ring-1 ring-[#E2C275]/40 md:mt-8 md:rounded-3xl">
          <div className="relative aspect-video w-full">
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              poster={withBasePath(POSTER)}
              preload="none"
              playsInline
              controls={started}
              controlsList="nodownload"
              width={1920}
              height={1080}
              aria-label="My Airport Taxi NI Christmas video: a plane lands in winter, a driver opens the car door for a family, and the car drives through festive Belfast. Ends with: Your journey, taken care of."
              onEnded={(e) => {
                e.currentTarget.currentTime = 0;
              }}
            >
              <source src={withBasePath(SRC_1080)} type="video/mp4" media="(min-width: 768px)" />
              <source src={withBasePath(SRC_720)} type="video/mp4" />
            </video>

            {!started ? (
              <button
                type="button"
                onClick={play}
                className="group absolute inset-0 flex items-center justify-center bg-gradient-to-t from-navy/55 via-navy/10 to-transparent focus-visible:outline-none"
                aria-label="Play the Christmas video (with sound)"
              >
                <span className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-emerald text-white shadow-[0_10px_30px_-6px_rgba(47,191,74,0.7)] ring-4 ring-white/85 transition-transform duration-200 group-hover:scale-105 group-focus-visible:ring-[#E2C275] motion-reduce:transition-none md:h-24 md:w-24">
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full ring-2 ring-[#E2C275]/70 motion-safe:animate-ping motion-safe:[animation-duration:2.4s]"
                  />
                  <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true" className="ml-1">
                    <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.6-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14z" />
                  </svg>
                </span>
                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-navy/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm md:bottom-5 md:text-sm">
                  Watch · 8 sec
                </span>
              </button>
            ) : null}
          </div>
        </div>

        <p data-cv-tagline className="mt-6 font-sans text-xl font-semibold tracking-tight text-white md:mt-8 md:text-2xl">
          Your journey, taken care of.
        </p>
        <QuoteNavLink className="btn-primary mt-4 inline-flex min-h-11 items-center justify-center px-6 text-[0.95rem] font-bold md:mt-5">
          Get Your Fixed Airport Fare
        </QuoteNavLink>
      </div>
    </div>
  );
}
