"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import {
  AIRPORT_PREFILL_KEY,
  QUOTE_DIRECTION_PREFILL_KEY,
} from "@/lib/quote-prefill";
import { navigateSiteNav } from "@/lib/site-nav-scroll";

type QuoteNavLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  /** Fallback when the current page has no `#quote` section. */
  href?: string;
  /** Optional airport / direction preset for the shared openQuote handler. */
  airport?: string;
  direction?: "to-airport" | "from-airport";
  /** Called after a successful in-page scroll or before leaving for the fallback. */
  onNavigate?: () => void;
};

/**
 * Shared “Get a Quote” CTA: uses the site-nav measured-header scroll to
 * “Get a Live Quote”, or navigates to `/#quote` when the tool is absent.
 */
export default function QuoteNavLink({
  href = "/#quote",
  airport,
  direction,
  onClick,
  onNavigate,
  children = "Get a Quote",
  ...rest
}: QuoteNavLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;

    event.preventDefault();

    if (airport) {
      sessionStorage.setItem(AIRPORT_PREFILL_KEY, airport);
      window.dispatchEvent(
        new CustomEvent("quote-prefill-airport", { detail: airport }),
      );
    }
    if (direction) {
      sessionStorage.setItem(QUOTE_DIRECTION_PREFILL_KEY, direction);
      window.dispatchEvent(
        new CustomEvent("quote-prefill-direction", { detail: direction }),
      );
    }

    navigateSiteNav(href.startsWith("/") ? href : "/#quote", {
      onBeforeNavigate: () => {
        onNavigate?.();
      },
    });
  }

  return (
    <Link href={href} scroll={false} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
