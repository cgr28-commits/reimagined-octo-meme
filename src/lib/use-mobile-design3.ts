"use client";

import { useEffect, useState } from "react";
import { MOBILE_DESIGN2_QUERY } from "@/lib/use-mobile-design2";

/** Design 3 mobile preview (?mobile=d3 sets html[data-mobile-d3]); below 1200px only. */
export function readMobileDesign3(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  return document.documentElement.hasAttribute("data-mobile-d3") && window.matchMedia(MOBILE_DESIGN2_QUERY).matches;
}

export function useMobileDesign3(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const update = () => setActive(readMobileDesign3());
    update();
    const media = window.matchMedia(MOBILE_DESIGN2_QUERY);
    media.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mobile-d3"] });
    return () => {
      media.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);
  return active;
}
