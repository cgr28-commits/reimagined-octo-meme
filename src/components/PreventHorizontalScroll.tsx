"use client";

import { useEffect } from "react";

/**
 * Soft pin against sideways page drift on mobile.
 * Avoids listening to visualViewport scroll/resize — those fire constantly on
 * iOS (URL bar / keyboard) and made the page feel jerky.
 */
export default function PreventHorizontalScroll() {
  useEffect(() => {
    const pin = () => {
      if (window.scrollX !== 0) {
        window.scrollTo(0, window.scrollY);
      }
    };

    pin();

    // Only correct after a real document scroll or orientation change — not every
    // visualViewport tick (that was snapping the page sideways and felt jerky).
    window.addEventListener("scroll", pin, { passive: true });
    window.addEventListener("orientationchange", pin);

    return () => {
      window.removeEventListener("scroll", pin);
      window.removeEventListener("orientationchange", pin);
    };
  }, []);

  return null;
}
