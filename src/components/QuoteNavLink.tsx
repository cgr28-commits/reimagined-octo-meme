"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { openQuote, scrollToQuoteForm } from "@/lib/quote-prefill";

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
 * Shared “Get a Quote” CTA: scrolls to the on-page `#quote` tool when present,
 * otherwise navigates to the homepage quote (`/#quote`).
 *
 * Uses openQuote so presets apply and hash-only URLs still re-scroll.
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

    const quoteEl = typeof document !== "undefined" ? document.getElementById("quote") : null;

    if (quoteEl) {
      event.preventDefault();
      onNavigate?.();
      if (airport || direction) {
        openQuote({ airport, direction });
      } else {
        scrollToQuoteForm();
      }
      return;
    }

    // No local quote tool — ensure we land on the homepage quote section.
    const onHome =
      window.location.pathname === "/" || window.location.pathname === "";
    if (onHome) {
      event.preventDefault();
      onNavigate?.();
      if (airport || direction) {
        openQuote({ airport, direction });
      } else {
        window.location.hash = "quote";
        scrollToQuoteForm();
      }
      return;
    }

    event.preventDefault();
    onNavigate?.();
    if (airport) {
      sessionStorage.setItem("my-airport-taxi-ni-prefill-airport", airport);
    }
    if (direction) {
      sessionStorage.setItem("my-airport-taxi-ni-prefill-direction", direction);
    }
    window.location.assign(href.startsWith("/") ? href : "/#quote");
  }

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
