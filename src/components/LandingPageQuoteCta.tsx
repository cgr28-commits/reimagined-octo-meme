"use client";

import QuoteNavLink from "@/components/QuoteNavLink";

export const LANDING_QUOTE_CTA_LABEL = "Get Your Fixed Quote";
export const LANDING_QUOTE_HREF = "#quote";
export const LANDING_INLINE_QUOTE_CTA_ATTR = "data-landing-quote-cta";

export const landingQuoteCtaClassName =
  "inline-flex min-h-11 items-center rounded-full bg-emerald px-6 py-3 text-sm font-bold text-navy shadow-lg shadow-emerald/25 transition-all hover:bg-emerald-light";

type InlineProps = {
  label?: string;
  className?: string;
};

/** Hero / section CTA that jumps to the existing in-page `#quote` calculator. */
export function LandingPageQuoteCta({
  label = LANDING_QUOTE_CTA_LABEL,
  className = landingQuoteCtaClassName,
}: InlineProps) {
  return (
    <QuoteNavLink
      href={LANDING_QUOTE_HREF}
      className={className}
      data-landing-quote-cta
    >
      {label}
    </QuoteNavLink>
  );
}

/**
 * Keep the shared mobile shortcut in document flow so it cannot cover content.
 * The exported name is retained for existing landing-page callers.
 */
export function LandingPageStickyQuoteCta() {
  return (
    <div data-landing-mobile-quote className="relative mx-auto mt-6 flex max-w-lg justify-center px-4 md:hidden">
      <QuoteNavLink
        href={LANDING_QUOTE_HREF}
        className="inline-flex min-h-11 w-full max-w-sm items-center justify-center rounded-full bg-emerald px-5 py-2.5 text-sm font-bold text-navy shadow-lg shadow-navy/40"
        aria-label="Get Your Fixed Quote — open the quote calculator"
      >
        {LANDING_QUOTE_CTA_LABEL}
      </QuoteNavLink>
    </div>
  );
}
