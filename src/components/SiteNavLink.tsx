"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import {
  isManagedSiteNavHref,
  navigateSiteNav,
} from "@/lib/site-nav-scroll";

type SiteNavLinkProps = ComponentProps<typeof Link> & {
  /** Called immediately when the link is activated (e.g. close hamburger). */
  onNavigate?: () => void;
};

/**
 * Internal menu / header link that uses the shared measured-header scroll system.
 * Prevents the browser’s native hash jump so landing positions stay consistent.
 */
export default function SiteNavLink({
  href,
  onClick,
  onNavigate,
  children,
  ...rest
}: SiteNavLinkProps) {
  const hrefString = typeof href === "string" ? href : String(href);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (!isManagedSiteNavHref(hrefString)) {
      onNavigate?.();
      return;
    }

    event.preventDefault();
    navigateSiteNav(hrefString, {
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
