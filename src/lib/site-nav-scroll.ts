/**
 * Shared site menu / header navigation scrolling.
 * Measures the live fixed header (including mobile quick-links) and aligns
 * destination headings ~16px below it — never relies on native hash scroll alone.
 */

import {
  cancelCompetingScrollJobs,
  getScrollJobGeneration,
  isScrollJobGenerationCurrent,
  trackScrollJob,
} from "@/lib/scroll-jobs";
import {
  HEADER_CLEARANCE_PX,
  computeScrollTopBelowHeader,
  getFixedHeaderElement,
  getHeaderBottomPx,
  prefersReducedMotion,
} from "@/lib/quote-step-nav-scroll";

export const SITE_NAV_PENDING_KEY = "matni-site-nav-pending-v1";
export const SITE_NAV_CLEARANCE_PX = HEADER_CLEARANCE_PX;
const CORRECTION_MS = 150;
const CORRECTION_TOLERANCE_PX = 4;
const MENU_SETTLE_MS = 40;

export type SiteNavDestination = {
  label: string;
  href: string;
  /** Homepage section id without #, or null for a standalone page. */
  hash: string | null;
  /** Exact heading text used for resolution / reporting. */
  heading: string;
  /** Prefer matching this data-site-nav-heading attribute. */
  navId: string;
};

/** Canonical public destinations (acceptance matrix). */
export const SITE_NAV_DESTINATIONS: readonly SiteNavDestination[] = [
  {
    label: "Airports",
    href: "/#airports",
    hash: "airports",
    heading: "Airports We Serve",
    navId: "airports",
  },
  {
    label: "Long-Distance Transfers",
    href: "/long-distance-transfers/",
    hash: null,
    heading: "Private Long-Distance Transfers from Anywhere in Greater Belfast",
    navId: "long-distance",
  },
  {
    label: "Locations",
    href: "/locations/",
    hash: null,
    heading: "Where we travel",
    navId: "locations",
  },
  {
    label: "Vehicles",
    href: "/#vehicles",
    hash: "vehicles",
    heading: "Private transfers for up to 4",
    navId: "vehicles",
  },
  {
    label: "Check Flights",
    href: "/#flight-status",
    hash: "flight-status",
    heading: "Check Your Flight",
    navId: "flight-status",
  },
  {
    label: "Areas We Cover",
    href: "/#areas",
    hash: "areas",
    heading: "Areas We Cover",
    navId: "areas",
  },
  {
    label: "Why Us",
    href: "/#why-us",
    hash: "why-us",
    heading: "Why Choose Us",
    navId: "why-us",
  },
  {
    label: "FAQ",
    href: "/#faq",
    hash: "faq",
    heading: "Frequently Asked Questions",
    navId: "faq",
  },
  {
    label: "Manage Your Booking",
    href: "/manage-booking/",
    hash: null,
    heading: "Manage Your Booking",
    navId: "manage-booking",
  },
  {
    label: "Get a Quote",
    href: "/#quote",
    hash: "quote",
    heading: "Get a Live Quote",
    navId: "quote",
  },
] as const;

/** Extra homepage hashes present in the menu but outside the acceptance list. */
const EXTRA_HASH_HEADINGS: Record<string, { heading: string; navId: string }> = {
  chauffeur: { heading: "Chauffeur & private hire", navId: "chauffeur" },
  "driver-tracking": { heading: "Live driver tracking", navId: "driver-tracking" },
};

export type ParsedSiteNavHref = {
  pathname: string;
  hash: string | null;
  href: string;
};

export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "") return "/";
  if (pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

export function parseSiteNavHref(href: string): ParsedSiteNavHref {
  const trimmed = href.trim() || "/";
  try {
    const url = new URL(trimmed, "https://example.invalid");
    const hash = url.hash ? url.hash.replace(/^#/, "") : null;
    return {
      pathname: normalizePathname(url.pathname || "/"),
      hash: hash || null,
      href: trimmed.startsWith("/") ? trimmed : `/${trimmed}`,
    };
  } catch {
    const [pathPart, hashPart] = trimmed.split("#");
    return {
      pathname: normalizePathname(pathPart || "/"),
      hash: hashPart || null,
      href: trimmed,
    };
  }
}

export function findSiteNavDestination(
  hrefOrHash: string,
): SiteNavDestination | null {
  const parsed = hrefOrHash.startsWith("#")
    ? { pathname: "/", hash: hrefOrHash.slice(1), href: `/#${hrefOrHash.slice(1)}` }
    : parseSiteNavHref(hrefOrHash);

  return (
    SITE_NAV_DESTINATIONS.find((dest) => {
      if (dest.hash) {
        return dest.hash === parsed.hash && normalizePathname(parseSiteNavHref(dest.href).pathname) === parsed.pathname;
      }
      return !parsed.hash && normalizePathname(parseSiteNavHref(dest.href).pathname) === parsed.pathname;
    }) ?? null
  );
}

function normalizeHeadingText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Resolve the destination heading element (not merely the section wrapper).
 */
export function resolveSiteNavHeading(
  pathname: string,
  hash: string | null,
): HTMLElement | null {
  if (typeof document === "undefined") return null;

  const dest = findSiteNavDestination(
    hash ? `${normalizePathname(pathname)}#${hash}` : normalizePathname(pathname),
  );
  const navId = dest?.navId ?? (hash ? EXTRA_HASH_HEADINGS[hash]?.navId : null);
  const expectedHeading =
    dest?.heading ?? (hash ? EXTRA_HASH_HEADINGS[hash]?.heading : null);

  if (navId) {
    const byAttr = document.querySelector<HTMLElement>(
      `[data-site-nav-heading="${navId}"]`,
    );
    if (byAttr) return byAttr;
  }

  if (hash) {
    const section = document.getElementById(hash);
    if (section) {
      const marked = section.querySelector<HTMLElement>("[data-site-nav-heading]");
      if (marked) return marked;
      const heading = section.querySelector<HTMLElement>("h1, h2");
      if (heading) return heading;
    }
  }

  if (expectedHeading) {
    const headings = Array.from(document.querySelectorAll<HTMLElement>("h1, h2"));
    const match = headings.find(
      (el) => normalizeHeadingText(el.textContent || "") === normalizeHeadingText(expectedHeading),
    );
    if (match) return match;
  }

  // Standalone pages: primary H1.
  if (!hash) {
    return document.querySelector<HTMLElement>("h1");
  }

  return null;
}

function focusHeading(element: HTMLElement): void {
  if (!element.hasAttribute("tabindex")) {
    element.tabIndex = -1;
  }
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

function applyMeasuredHeadingScroll(heading: HTMLElement): void {
  const nextTop = computeScrollTopBelowHeader(heading, SITE_NAV_CLEARANCE_PX);
  window.scrollTo({ top: nextTop, behavior: "auto" });
}

/**
 * After menu close / page mount: 2× rAF, measure header, scroll heading,
 * one ~150ms correction. Cancels competing quote scrolls first.
 */
export function scheduleSiteNavHeadingScroll(options: {
  pathname?: string;
  hash?: string | null;
  /** Extra delay after hamburger close so body unlock + header settle. */
  afterMenuClose?: boolean;
  focusHeading?: boolean;
}): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  cancelCompetingScrollJobs();
  const generation = getScrollJobGeneration();

  let cancelled = false;
  let settleTimer = 0;
  let raf1 = 0;
  let raf2 = 0;
  let correctionTimer = 0;

  const run = () => {
    if (cancelled || !isScrollJobGenerationCurrent(generation)) return;

    const pathname = normalizePathname(
      options.pathname ?? window.location.pathname ?? "/",
    );
    const hash =
      options.hash === undefined
        ? window.location.hash.replace(/^#/, "") || null
        : options.hash;

    // Force a layout read of the full fixed header (logo row + quick links).
    getFixedHeaderElement()?.getBoundingClientRect();
    getHeaderBottomPx();

    const heading = resolveSiteNavHeading(pathname, hash);
    if (!heading) {
      if (!hash) {
        window.scrollTo({ top: 0, behavior: "auto" });
      }
      return;
    }

    applyMeasuredHeadingScroll(heading);
    if (options.focusHeading !== false) {
      focusHeading(heading);
    }

    correctionTimer = window.setTimeout(() => {
      if (cancelled || !isScrollJobGenerationCurrent(generation)) return;
      const again = resolveSiteNavHeading(pathname, hash);
      if (!again) return;
      const desired = computeScrollTopBelowHeader(again, SITE_NAV_CLEARANCE_PX);
      if (Math.abs(window.scrollY - desired) > CORRECTION_TOLERANCE_PX) {
        window.scrollTo({ top: desired, behavior: "auto" });
      }
    }, CORRECTION_MS);
  };

  const startRafs = () => {
    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        run();
      });
    });
  };

  if (options.afterMenuClose) {
    settleTimer = window.setTimeout(startRafs, MENU_SETTLE_MS);
  } else {
    startRafs();
  }

  const cancel = () => {
    cancelled = true;
    if (settleTimer) window.clearTimeout(settleTimer);
    window.cancelAnimationFrame(raf1);
    if (raf2) window.cancelAnimationFrame(raf2);
    if (correctionTimer) window.clearTimeout(correctionTimer);
  };

  return trackScrollJob(cancel);
}

export type PendingSiteNav = {
  pathname: string;
  hash: string | null;
  href: string;
};

export function writePendingSiteNav(pending: PendingSiteNav): void {
  try {
    sessionStorage.setItem(SITE_NAV_PENDING_KEY, JSON.stringify(pending));
  } catch {
    // ignore
  }
}

export function readPendingSiteNav(): PendingSiteNav | null {
  try {
    const raw = sessionStorage.getItem(SITE_NAV_PENDING_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SITE_NAV_PENDING_KEY);
    const parsed = JSON.parse(raw) as PendingSiteNav;
    if (!parsed || typeof parsed.pathname !== "string") return null;
    return {
      pathname: normalizePathname(parsed.pathname),
      hash: parsed.hash ?? null,
      href: parsed.href,
    };
  } catch {
    return null;
  }
}

/**
 * Update the URL hash without triggering the browser’s native jump.
 */
export function setLocationHashQuietly(hash: string | null, pathname?: string): void {
  if (typeof window === "undefined") return;
  const path = normalizePathname(pathname ?? window.location.pathname);
  const search = window.location.search || "";
  const next = hash ? `${path}${search}#${hash}` : `${path}${search}`;
  window.history.pushState(null, "", next);
}

/**
 * Programmatic site navigation used by header / hamburger links.
 * Prevents native hash scrolling; closes callers’ menus via onBeforeNavigate.
 */
export function navigateSiteNav(
  href: string,
  options?: {
    onBeforeNavigate?: () => void;
  },
): void {
  if (typeof window === "undefined") return;

  const parsed = parseSiteNavHref(href);
  options?.onBeforeNavigate?.();

  const currentPath = normalizePathname(window.location.pathname);
  const samePage = currentPath === parsed.pathname;

  if (samePage) {
    if (parsed.hash) {
      setLocationHashQuietly(parsed.hash, parsed.pathname);
      scheduleSiteNavHeadingScroll({
        pathname: parsed.pathname,
        hash: parsed.hash,
        afterMenuClose: true,
      });
      return;
    }

    // Already on a standalone page — reset to top / H1.
    setLocationHashQuietly(null, parsed.pathname);
    scheduleSiteNavHeadingScroll({
      pathname: parsed.pathname,
      hash: null,
      afterMenuClose: true,
    });
    return;
  }

  // Cross-page: stash intent, navigate without a hash so the browser cannot
  // native-jump before our measured scroll runs on the destination.
  writePendingSiteNav({
    pathname: parsed.pathname,
    hash: parsed.hash,
    href: parsed.href,
  });

  window.location.assign(parsed.pathname);
}

/** Whether this href should use the shared site-nav scroll handler. */
export function isManagedSiteNavHref(href: string): boolean {
  const parsed = parseSiteNavHref(href);
  if (findSiteNavDestination(href)) return true;
  if (parsed.hash && parsed.hash in EXTRA_HASH_HEADINGS) return true;
  if (parsed.hash) return true;
  if (
    parsed.pathname === "/long-distance-transfers/" ||
    parsed.pathname === "/locations/" ||
    parsed.pathname === "/manage-booking/" ||
    parsed.pathname === "/tours/" ||
    parsed.pathname === "/contact/"
  ) {
    return true;
  }
  return false;
}

export function prefersAutoScrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "auto";
}
