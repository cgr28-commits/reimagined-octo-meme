"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  readCookieConsent,
  writeCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";
import { updateGoogleConsent } from "@/lib/google-ads-client";

const COOKIE_BANNER_OFFSET_VAR = "--matni-cookie-banner-offset";

export default function CookieConsent() {
  const [choice, setChoice] = useState<CookieConsentChoice | null | "loading">("loading");
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChoice(readCookieConsent());
  }, []);

  useEffect(() => {
    if (choice === "loading" || choice !== null) {
      document.documentElement.style.removeProperty(COOKIE_BANNER_OFFSET_VAR);
      return;
    }

    const el = bannerRef.current;
    if (!el) return;

    const syncOffset = () => {
      document.documentElement.style.setProperty(
        COOKIE_BANNER_OFFSET_VAR,
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      );
    };
    syncOffset();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncOffset) : null;
    observer?.observe(el);
    window.addEventListener("resize", syncOffset);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncOffset);
      document.documentElement.style.removeProperty(COOKIE_BANNER_OFFSET_VAR);
    };
  }, [choice]);

  if (choice === "loading" || choice !== null) {
    return null;
  }

  function choose(next: CookieConsentChoice) {
    writeCookieConsent(next);
    updateGoogleConsent(next === "accepted");
    setChoice(next);
  }

  return (
    <div
      ref={bannerRef}
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-white/15 bg-navy-dark/95 p-3 shadow-2xl backdrop-blur-xl sm:p-5"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Cookies &amp; advertising measurement</p>
          <p className="mt-1 text-xs leading-relaxed text-white/70 sm:mt-1.5 sm:text-sm">
            <span className="sm:hidden">
              Optional Google Ads cookies measure quotes and bookings only if you accept. See our{" "}
            </span>
            <span className="hidden sm:inline">
              We use essential storage for booking checkout. Optional Google Ads cookies may measure
              fixed-price quotes, saved booking requests and completed paid bookings — only if you
              accept. Address suggestions use Google Places. See our{" "}
            </span>
            <Link href="/privacy/" className="font-medium text-emerald underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 flex-row gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => choose("rejected")}
            className="min-h-11 flex-1 rounded-full border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/5 sm:flex-none sm:px-5"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="min-h-11 flex-1 rounded-full bg-emerald px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald-light sm:flex-none sm:px-5"
          >
            Accept
            <span className="hidden sm:inline"> measurement cookies</span>
          </button>
        </div>
      </div>
    </div>
  );
}
