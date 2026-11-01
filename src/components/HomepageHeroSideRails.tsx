import Link from "next/link";
import { BadgeCheck, CalendarX, Clock, MapPin, Plane, PoundSterling, Star } from "lucide-react";
import { SITE } from "@/lib/data";

/**
 * Wide-desktop only (see .homepage-hero-rails in globals.css): fills the empty
 * navy space either side of the centred homepage quote form. Hidden on phones,
 * tablets and laptops, so the quote flow there is unchanged.
 */
const reasons = [
  { icon: Star, text: "5-star rated on Google" },
  { icon: PoundSterling, text: "Fixed price, agreed before you pay" },
  { icon: Plane, text: "Flight monitoring on airport pickups" },
  { icon: Clock, text: "Up to 60 minutes' waiting on airport pickups" },
  { icon: CalendarX, text: "Free cancellation up to 24 hours before pickup" },
  { icon: BadgeCheck, text: "Pre-booked, licensed local NI driver" },
];

const journeys = [
  { href: "/transfers/belfast-to-dublin-airport/", label: "Belfast to Dublin Airport" },
  { href: "/transfers/dublin-airport-to-belfast/", label: "Dublin Airport to Belfast" },
  { href: "/transfers/belfast-to-dublin-city/", label: "Belfast to Dublin City" },
  { href: "/transfers/business-class-dublin-airport/", label: "Business Class to Dublin" },
  { href: "/belfast-grand-central-station-taxi/", label: "Grand Central Station" },
  { href: "/belfast-cruise-terminal-transfers/", label: "Belfast Cruise Terminal" },
  { href: "/tours/", label: "Private day tours" },
];

export default function HomepageHeroSideRails() {
  return (
    <div className="homepage-hero-rails" data-homepage-hero-rails>
      <aside className="homepage-hero-rail homepage-hero-rail-left" aria-label="Why book with us">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Why book with us</p>
        <ul className="mt-4 space-y-3.5">
          {reasons.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm leading-snug text-white/85">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald/15 text-emerald">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </aside>

      <aside className="homepage-hero-rail homepage-hero-rail-right" aria-label="Popular journeys">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald">Popular journeys</p>
        <ul className="mt-4 space-y-1">
          {journeys.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-white/85 transition hover:bg-white/5 hover:text-white"
              >
                <MapPin className="h-4 w-4 shrink-0 text-emerald" aria-hidden />
                <span>{label}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-5 border-t border-white/10 pt-4 text-sm text-white/75">
          <p>Questions before you book?</p>
          <a
            href={`https://wa.me/${SITE.whatsappAssistantLive ? SITE.whatsappAssistant : SITE.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block font-semibold text-emerald hover:underline"
          >
            WhatsApp {SITE.whatsappAssistantDisplay}
          </a>
        </div>
      </aside>
    </div>
  );
}
