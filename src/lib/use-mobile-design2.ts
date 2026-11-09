"use client";

import { useEffect, useState } from "react";

/**
 * Design 2 (approved mobile reference, Nov 2026) is active when the opt-in light mobile
 * preview is switched on (html[data-mobile-light], never on the live domain) and the
 * viewport is below the desktop breakpoint. Client-only: the static HTML always renders
 * the current design first, so desktop and the live site are unaffected.
 */
export const MOBILE_DESIGN2_QUERY = "(max-width: 1199.98px)";

function readDesign2(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  return (
    document.documentElement.hasAttribute("data-mobile-light") &&
    window.matchMedia(MOBILE_DESIGN2_QUERY).matches
  );
}

export function useMobileDesign2(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const update = () => setActive(readDesign2());
    update();
    const media = window.matchMedia(MOBILE_DESIGN2_QUERY);
    media.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mobile-light"],
    });
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  return active;
}
