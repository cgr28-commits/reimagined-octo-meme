import QuoteNavLink from "./QuoteNavLink";
import {
  RETURN_BOOKING_DISCOUNT_RETIRED,
  RETURN_JOURNEY_DISCOUNT_RATE,
  formatReturnJourneyDiscountPercent,
} from "../../shared/return-journey-discount";

/**
 * Homepage band under the quote tool (owner, 17 Nov 2026): the return-booking discount, in the
 * owner's wording. The discount itself is applied by the quote tool and checked again by the
 * booking system at payment; this band only describes it. Hidden if the discount is switched off.
 */
export default function ReturnDiscountBand() {
  if (RETURN_BOOKING_DISCOUNT_RETIRED || !(RETURN_JOURNEY_DISCOUNT_RATE > 0)) return null;
  const percent = formatReturnJourneyDiscountPercent();
  return (
    <section data-return-discount-band aria-label="Return booking discount" className="border-y border-[#cdeec2] bg-[#f3fcef]">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <p className="text-[#071c38]">
          <strong className="block text-lg font-extrabold sm:text-xl">Save {percent} When You Book a Return Transfer</strong>
          <span className="mt-0.5 block text-sm sm:text-base">
            Book both journeys together and enjoy {percent} off your total fare.
          </span>
        </p>
        <QuoteNavLink className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-emerald px-5 py-2 text-sm font-bold text-navy transition-colors hover:bg-emerald-light">
          Get a Return Quote
        </QuoteNavLink>
      </div>
    </section>
  );
}
