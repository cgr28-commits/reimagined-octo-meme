import { Tag, Plane, Clock, CalendarCheck, type LucideIcon } from "lucide-react";
import GoogleReviewsBadge from "./GoogleReviewsBadge";

/**
 * Desktop (1200px+) only: the navy panel beside the homepage quote form.
 * Hidden on phones, tablets and smaller laptops (they keep HeroBenefitsRow).
 * Wording follows the existing published selling points; no new claims.
 */
/** Same four points and symbols as the phone homepage (owner, 13 Nov 2026). */
const BENEFITS: ReadonlyArray<{ title: string; text: string; icon: LucideIcon }> = [
  { title: "Fixed price, no meter", text: "The price you see is the price you pay.", icon: Tag },
  { title: "Flight monitoring", text: "We track your flight and adjust to the actual landing time.", icon: Plane },
  { title: "60 mins free airport waiting", text: "Up to 60 minutes' free waiting on airport pickups.", icon: Clock },
  { title: "Free cancellation up to 24 hrs", text: "Full refund if you cancel at least 24 hours before pickup.", icon: CalendarCheck },
];

export default function DesktopQuoteBenefits() {
  return (
    <aside className="hidden" data-desktop-quote-benefits aria-label="Why travel with My Airport Taxi NI">
      <p data-desktop-benefits-heading>Why travel with us</p>
      <ul data-desktop-benefits-list>
        {BENEFITS.map(({ title, text, icon: Icon }) => (
          <li key={title}>
            <span data-desktop-benefit-icon aria-hidden="true">
              <Icon strokeWidth={2.2} />
            </span>
            <span>
              <strong>{title}</strong>
              <span>{text}</span>
            </span>
          </li>
        ))}
      </ul>
      <div data-desktop-benefits-reviews>
        <GoogleReviewsBadge variant="panel" />
      </div>
    </aside>
  );
}
