"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { withBasePath } from "@/lib/paths";
import { TOURS } from "@/lib/tours";

/**
 * Wide-desktop only (see .homepage-hero-rails in globals.css): fills the empty
 * navy space either side of the centred homepage quote form. Hidden on phones,
 * tablets and laptops, so the quote flow there is unchanged.
 *
 * Left: rotates Business Class and the 7-seater.
 * Right: rotates the private day tours.
 * Both boxes change together every few seconds, pause while either is hovered
 * or focused, and stay still for visitors who prefer reduced motion.
 */
type RailCard = {
  key: string;
  label: string;
  image: string;
  title: string;
  text: string;
  href: string;
  cta: string;
};

const LEFT_CARDS: readonly RailCard[] = [
  {
    key: "business-class",
    label: "Business Class",
    image: withBasePath("/images/hero/optimized/business-class-executive-dublin-960.jpg"),
    title: "Travel to Dublin Airport in a Mercedes, BMW or Lexus",
    text: "Meet & Greet with a name board on Dublin pickups, and help with your luggage.",
    href: "/transfers/business-class-dublin-airport/",
    cta: "See Business Class",
  },
  {
    key: "seven-seater",
    label: "7-seater",
    image: withBasePath("/images/hero/optimized/seven-seater-dublin-960.webp"),
    title: "Travelling as a group? Up to 7 in one vehicle",
    text: "Families and groups stay together, with room for the luggage. Belfast to Dublin Airport and across Ireland.",
    href: "/transfers/belfast-to-dublin-airport-7-seater/",
    cta: "See the 7-seater",
  },
];

const RIGHT_CARDS: readonly RailCard[] = TOURS.map((tour) => ({
  key: tour.slug,
  label: "Private day tours",
  image: tour.image.replace(/\.webp$/, "-card.webp"),
  title: tour.title,
  text: `${tour.duration}. ${tour.price} per car, for up to 4.`,
  href: `/tours/${tour.slug}/`,
  cta: "See this tour",
}));

const ROTATE_MS = 7000;

function RotatingRail({
  side,
  cards,
  active,
  onPick,
  onPause,
}: {
  side: "left" | "right";
  cards: readonly RailCard[];
  active: number;
  onPick: (index: number) => void;
  onPause: (paused: boolean) => void;
}) {
  return (
    <aside
      className={`homepage-hero-rail homepage-hero-rail-${side}`}
      aria-label={side === "left" ? "Business Class and 7-seater" : "Private day tours"}
      onMouseEnter={() => onPause(true)}
      onMouseLeave={() => onPause(false)}
      onFocus={() => onPause(true)}
      onBlur={() => onPause(false)}
    >
      <div className="homepage-hero-rail-slides">
        {cards.map((card, index) => {
          const shown = index === active;
          return (
            <div
              key={card.key}
              className={`homepage-hero-rail-slide${shown ? " is-active" : ""}`}
              aria-hidden={!shown}
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald">{card.label}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.image}
                alt=""
                loading="lazy"
                width={480}
                height={270}
                className="mt-3 h-36 w-full rounded-lg object-cover"
              />
              <p className="mt-3 text-[1.05rem] font-semibold leading-snug text-white">{card.title}</p>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{card.text}</p>
              <Link
                href={card.href}
                tabIndex={shown ? 0 : -1}
                className="mt-3 inline-block text-sm font-semibold text-emerald hover:underline"
              >
                {card.cta} →
              </Link>
            </div>
          );
        })}
      </div>
      {cards.length > 1 ? (
        <div className="mt-4 flex justify-center gap-2">
          {cards.map((card, index) => (
            <button
              key={card.key}
              type="button"
              onClick={() => onPick(index)}
              aria-label={`Show ${card.title}`}
              aria-current={index === active}
              className={`h-2 rounded-full transition-all ${
                index === active ? "w-5 bg-emerald" : "w-2 bg-white/30 hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      ) : null}
    </aside>
  );
}

export default function HomepageHeroSideRails() {
  // One shared timer, so both boxes change at the same moment.
  const [tick, setTick] = useState(0);
  const [leftPick, setLeftPick] = useState<number | null>(null);
  const [rightPick, setRightPick] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const desktop = window.matchMedia("(min-width: 1360px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!desktop.matches || reducedMotion.matches) return;
    const interval = window.setInterval(() => {
      setTick((t) => t + 1);
      setLeftPick(null);
      setRightPick(null);
    }, ROTATE_MS);
    return () => window.clearInterval(interval);
  }, [paused]);

  return (
    <div className="homepage-hero-rails" data-homepage-hero-rails>
      <RotatingRail
        side="left"
        cards={LEFT_CARDS}
        active={leftPick ?? tick % LEFT_CARDS.length}
        onPick={setLeftPick}
        onPause={setPaused}
      />
      <RotatingRail
        side="right"
        cards={RIGHT_CARDS}
        active={rightPick ?? tick % RIGHT_CARDS.length}
        onPick={setRightPick}
        onPause={setPaused}
      />
    </div>
  );
}
