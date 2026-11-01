import Link from "next/link";
import { withBasePath } from "@/lib/paths";

/**
 * Wide-desktop only (see .homepage-hero-rails in globals.css): fills the empty
 * navy space either side of the centred homepage quote form. Hidden on phones,
 * tablets and laptops, so the quote flow there is unchanged.
 *
 * Left: Business Class (offered on Dublin Airport journeys).
 * Right: private day tours.
 */
const cards = [
  {
    side: "left",
    label: "Business Class",
    image: "/images/hero/optimized/business-class-executive-dublin-960.jpg",
    title: "Travel to Dublin Airport in a Mercedes, BMW or Lexus",
    text: "Meet & Greet with a name board on Dublin pickups, and help with your luggage.",
    href: "/transfers/business-class-dublin-airport/",
    cta: "See Business Class",
  },
  {
    side: "right",
    label: "Private day tours",
    image: "/images/hero/optimized/antrim-coast-960.jpg",
    title: "Giant's Causeway, the Antrim Coast and more",
    text: "Your own car and driver for the day. Half day from £195, full day from £395, per car for up to 4.",
    href: "/tours/",
    cta: "See day tours",
  },
] as const;

export default function HomepageHeroSideRails() {
  return (
    <div className="homepage-hero-rails" data-homepage-hero-rails>
      {cards.map((card) => (
        <aside
          key={card.side}
          className={`homepage-hero-rail homepage-hero-rail-${card.side}`}
          aria-label={card.label}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald">{card.label}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={withBasePath(card.image)}
            alt=""
            loading="lazy"
            width={480}
            height={270}
            className="mt-3 h-36 w-full rounded-lg object-cover"
          />
          <p className="mt-3 text-[1.05rem] font-semibold leading-snug text-white">{card.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-white/75">{card.text}</p>
          <Link href={card.href} className="mt-3 inline-block text-sm font-semibold text-emerald hover:underline">
            {card.cta} →
          </Link>
        </aside>
      ))}
    </div>
  );
}
