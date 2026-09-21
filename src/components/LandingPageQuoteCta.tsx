"use client";

import { useEffect, useState } from "react";
import QuoteNavLink from "@/components/QuoteNavLink";

export const LANDING_QUOTE_CTA_LABEL = "Get a Live Quote";
export const LANDING_QUOTE_HREF = "#quote";

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
    <QuoteNavLink href={LANDING_QUOTE_HREF} className={className}>
      {label}
    </QuoteNavLink>
  );
}

/**
 * Mobile-only sticky jump to the existing `#quote` calculator.
 * Hidden on desktop and while the calculator is already on screen.
 */
export function LandingPageStickyQuoteCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const quote = document.getElementById("quote");
    if (!quote) {
      setShow(true);
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShow(!entry?.isIntersecting);
      },
      { threshold: 0.12, rootMargin: "-12% 0px -8% 0px" },
    );
    observer.observe(quote);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <span data-landing-sticky-quote hidden />
      {show ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-[65] md:hidden"
          style={{
            bottom:
              "calc(var(--matni-cookie-banner-offset, 0px) + max(0.75rem, env(safe-area-inset-bottom)))",
          }}
        >
          <div className="pointer-events-auto mx-auto flex max-w-lg justify-center px-4">
            <QuoteNavLink
              href={LANDING_QUOTE_HREF}
              className="inline-flex min-h-11 w-full max-w-sm items-center justify-center rounded-full bg-emerald px-5 py-2.5 text-sm font-bold text-navy shadow-lg shadow-navy/40"
              aria-label="Get a Live Quote — open the quote calculator"
            >
              {LANDING_QUOTE_CTA_LABEL}
            </QuoteNavLink>
          </div>
        </div>
      ) : null}
    </>
  );
}
