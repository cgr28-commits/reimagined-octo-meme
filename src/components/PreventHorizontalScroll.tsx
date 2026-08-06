"use client";

import { useEffect } from "react";

/**
 * Keeps the document pinned to scrollX = 0 on mobile.
 * Fixed chat widgets, suggestion portals, and wide elements can otherwise
 * let iOS / Android rubber-band the page sideways.
 */
export default function PreventHorizontalScroll() {
  useEffect(() => {
    const pin = () => {
      if (window.scrollX !== 0) {
        window.scrollTo(0, window.scrollY);
      }
      if (document.documentElement.scrollLeft !== 0) {
        document.documentElement.scrollLeft = 0;
      }
      if (document.body.scrollLeft !== 0) {
        document.body.scrollLeft = 0;
      }
    };

    pin();

    window.addEventListener("scroll", pin, { passive: true });
    window.addEventListener("resize", pin, { passive: true });
    window.visualViewport?.addEventListener("resize", pin);
    window.visualViewport?.addEventListener("scroll", pin);

    return () => {
      window.removeEventListener("scroll", pin);
      window.removeEventListener("resize", pin);
      window.visualViewport?.removeEventListener("resize", pin);
      window.visualViewport?.removeEventListener("scroll", pin);
    };
  }, []);

  return null;
}
