"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  normalizePathname,
  readPendingSiteNav,
  scheduleSiteNavHeadingScroll,
  writePendingSiteNav,
} from "@/lib/site-nav-scroll";

/**
 * Handles:
 * - Pending cross-page menu navigations (session stash)
 * - Direct hash URL loads / refresh
 * - Browser Back / Forward (hashchange + popstate)
 *
 * Replaces hash-only quote scrolling so every homepage section lands consistently.
 */
export default function SiteHashScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Prevent the browser restoring a stale mid-page offset under our measured scroll.
    try {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch {
      // ignore
    }

    let cancelPending: (() => void) | undefined;

    function scrollForCurrentLocation() {
      cancelPending?.();
      const hash = window.location.hash.replace(/^#/, "") || null;
      if (!hash) return;
      cancelPending = scheduleSiteNavHeadingScroll({
        pathname: normalizePathname(window.location.pathname),
        hash,
        afterMenuClose: false,
        focusHeading: true,
      });
    }

    const pending = readPendingSiteNav();
    if (pending) {
      const here = normalizePathname(pathname || window.location.pathname);
      if (here === pending.pathname) {
        if (pending.hash) {
          const next = `${pending.pathname}${window.location.search}#${pending.hash}`;
          if (window.location.hash !== `#${pending.hash}`) {
            window.history.replaceState(null, "", next);
          }
        } else if (window.location.hash) {
          window.history.replaceState(
            null,
            "",
            `${pending.pathname}${window.location.search}`,
          );
        }
        cancelPending = scheduleSiteNavHeadingScroll({
          pathname: pending.pathname,
          hash: pending.hash,
          afterMenuClose: false,
          focusHeading: true,
        });
      } else {
        writePendingSiteNav(pending);
      }
    } else if (window.location.hash) {
      scrollForCurrentLocation();
    }

    function onHashChange() {
      scrollForCurrentLocation();
    }

    function onPopState() {
      const hash = window.location.hash.replace(/^#/, "") || null;
      cancelPending?.();
      cancelPending = scheduleSiteNavHeadingScroll({
        pathname: normalizePathname(window.location.pathname),
        hash,
        focusHeading: true,
      });
    }

    window.addEventListener("hashchange", onHashChange);
    window.addEventListener("popstate", onPopState);
    return () => {
      cancelPending?.();
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onPopState);
    };
  }, [pathname]);

  return null;
}
