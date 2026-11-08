"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { withBasePath } from "@/lib/paths";
import { TOURS } from "@/lib/tours";

/**
 * Desktop only (1200px+, see .homepage-hero-rails in globals.css): a row of three
 * equal cards under the homepage quote tool. Hidden on phones, tablets and smaller
 * laptops, so the quote flow there is unchanged.
 *
 * Card 1: Business Class. Card 2: rotates the estate car and the 7-seater.
 * Card 3: rotates the private day tours.
 * The rotating cards change together every few seconds, pause while any card is
 * hovered or focused, and stay still for visitors who prefer reduced motion.
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

const BUSINESS_CLASS_CARDS: readonly RailCard[] = [
  {
    key: "business-class",
    label: "Business Class · On request",
    image: withBasePath("/images/hero/optimized/business-class-executive-dublin-960.jpg"),
    title: "Travel to Dublin Airport in a Mercedes, BMW, Lexus or similar",
    text: "Meet & Greet with a name board on airport pickups. On request: we confirm the price and availability by email.",
    href: "/transfers/business-class-dublin-airport/",
    cta: "See Business Class",
  },
];

const VEHICLE_CARDS: readonly RailCard[] = [
  {
    key: "estate",
    label: "Estate car",
    image: withBasePath("/images/hero/optimized/estate-dublin-960.webp"),
    title: "Plenty of luggage? Book an estate",
    text: "Up to 4 passengers with room for 4 large suitcases and 2 small bags. Choose Estate on your quote.",
    href: "/#quote",
    cta: "Get an estate price",
  },
  {
    key: "seven-seater",
    label: "7-seater · On request",
    image: withBasePath("/images/hero/optimized/seven-seater-dublin-960.webp"),
    title: "Travelling as a group? Up to 7 in one vehicle",
    text: "Families and groups stay together, with room for the luggage. On request: we confirm availability and the price by email.",
    href: "/transfers/belfast-to-dublin-airport-7-seater/",
    cta: "See the 7-seater",
  },
];

const TOUR_CARDS: readonly RailCard[] = TOURS.map((tour) => ({
  key: tour.slug,
  label: "Private day tours",
  image: tour.image.replace(/\.webp$/, "-card.webp"),
  title: tour.title,
  text: `${tour.duration}. ${tour.price} per car, for up to 4.`,
  href: `/tours/${tour.slug}/`,
  cta: "See this tour",
}));

const ROTATE_MS = 10000;

function RotatingRail({
  side,
  label,
  cards,
  active,
  onPick,
  onPause,
}: {
  side: "business" | "vehicles" | "tours";
  label: string;
  cards: readonly RailCard[];
  active: number;
  onPick: (index: number) => void;
  onPause: (paused: boolean) => void;
}) {
  return (
    <aside
      className={`homepage-hero-rail homepage-hero-rail-${side}`}
      aria-label={label}
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
              <p data-rail-title className="mt-3 text-[1.05rem] font-semibold leading-snug text-white">{card.title}</p>
              <p data-rail-text className="mt-2 text-sm leading-relaxed text-white/75">{card.text}</p>
              <Link
                href={card.href}
                data-rail-cta
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
        <div className="mt-4 flex justify-center gap-2" data-rail-dots>
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
  // One shared timer, so the rotating cards change at the same moment.
  const [tick, setTick] = useState(0);
  const [vehiclePick, setVehiclePick] = useState<number | null>(null);
  const [tourPick, setTourPick] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const desktop = window.matchMedia("(min-width: 1200px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!desktop.matches || reducedMotion.matches) return;
    const interval = window.setInterval(() => {
      setTick((t) => t + 1);
      setVehiclePick(null);
      setTourPick(null);
    }, ROTATE_MS);
    return () => window.clearInterval(interval);
  }, [paused]);

  return (
    <div className="homepage-hero-rails" data-homepage-hero-rails>
      <RotatingRail
        side="business"
        label="Business Class"
        cards={BUSINESS_CLASS_CARDS}
        active={0}
        onPick={() => {}}
        onPause={setPaused}
      />
      <RotatingRail
        side="vehicles"
        label="Estate car and 7-seater"
        cards={VEHICLE_CARDS}
        active={vehiclePick ?? tick % VEHICLE_CARDS.length}
        onPick={setVehiclePick}
        onPause={setPaused}
      />
      <RotatingRail
        side="tours"
        label="Private day tours"
        cards={TOUR_CARDS}
        active={tourPick ?? tick % TOUR_CARDS.length}
        onPick={setTourPick}
        onPause={setPaused}
      />
    </div>
  );
}
