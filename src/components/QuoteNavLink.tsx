"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { scrollToQuoteForm } from "@/lib/quote-prefill";

type QuoteNavLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  /** Fallback when the current page has no `#quote` section. */
  href?: string;
  /** Called after a successful in-page scroll or before leaving for the fallback. */
  onNavigate?: () => void;
};

/**
 * Shared “Get a Quote” CTA: scrolls to the on-page `#quote` tool when present,
 * otherwise navigates to the homepage quote (`/#quote`).
 *
 * Next.js `<Link href="/#quote">` often skips hash scrolling on client navigations,
 * which made the header / mobile quick-link CTAs appear broken on airport pages.
 */
export default function QuoteNavLink({
  href = "/#quote",
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
      scrollToQuoteForm();
      return;
    }

    // No local quote tool — ensure we land on the homepage quote section.
    const onHome =
      window.location.pathname === "/" || window.location.pathname === "";
    if (onHome) {
      event.preventDefault();
      onNavigate?.();
      window.location.hash = "quote";
      return;
    }

    event.preventDefault();
    onNavigate?.();
    window.location.assign(href.startsWith("/") ? href : "/#quote");
  }

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
