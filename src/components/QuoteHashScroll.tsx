"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { scrollToQuoteForm } from "@/lib/quote-prefill";

/**
 * When the URL hash is `#quote`, scroll the quote tool into view under the
 * sticky header (covers full-page loads and client navigations to `/#quote`).
 */
export default function QuoteHashScroll() {
  const pathname = usePathname();

  useEffect(() => {
    function scrollIfQuoteHash() {
      if (window.location.hash !== "#quote") return;
      // Wait a frame so layout / sticky header height settle.
      requestAnimationFrame(() => {
        scrollToQuoteForm();
      });
    }

    scrollIfQuoteHash();
    window.addEventListener("hashchange", scrollIfQuoteHash);
    return () => window.removeEventListener("hashchange", scrollIfQuoteHash);
  }, [pathname]);

  return null;
}
