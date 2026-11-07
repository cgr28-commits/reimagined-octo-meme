import Link from "next/link";
import GoogleReviewsBadge from "./GoogleReviewsBadge";

/**
 * Desktop (1200px+) only: the navy panel beside the homepage quote form.
 * Hidden on phones, tablets and smaller laptops (they keep HeroBenefitsRow).
 * Wording follows the existing published selling points; no new claims.
 */
const BENEFITS = [
  {
    title: "Fixed price",
    text: "The price you see is the price you pay, confirmed before you pay.",
    icon: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  },
  {
    title: "Flight monitoring",
    text: "Up to 60 minutes’ complimentary waiting on airport pickups, from your flight’s actual landing time.",
    icon: <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />,
  },
  {
    title: "Free cancellation",
    text: "Cancel up to 24 hours before pickup for a full refund.",
    icon: (
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
        <path d="M3 3v5h5" />
      </>
    ),
  },
  {
    title: "Pre-booked driver",
    text: "Licensed and insured, with booking updates by email.",
    icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  },
] as const;

const POPULAR = [
  { href: "/transfers/belfast-to-dublin-airport/", label: "Belfast ↔ Dublin Airport" },
  { href: "/airports/belfast-international/", label: "Belfast International Airport" },
  { href: "/airports/belfast-city/", label: "Belfast City Airport" },
] as const;

export default function DesktopQuoteBenefits() {
  return (
    <aside className="hidden" data-desktop-quote-benefits aria-label="Why travel with My Airport Taxi NI">
      <p data-desktop-benefits-heading>Why travel with us</p>
      <ul data-desktop-benefits-list>
        {BENEFITS.map((benefit) => (
          <li key={benefit.title}>
            <span data-desktop-benefit-icon aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                {benefit.icon}
              </svg>
            </span>
            <span>
              <strong>{benefit.title}</strong>
              <span>{benefit.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <div data-desktop-benefits-reviews>
        <GoogleReviewsBadge />
      </div>
      <nav data-desktop-benefits-popular aria-label="Popular journeys">
        <p data-desktop-benefits-heading>Popular journeys</p>
        {POPULAR.map((item) => (
          <Link key={item.href} href={item.href}>
            <span>{item.label}</span>
            <span aria-hidden="true">→</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
