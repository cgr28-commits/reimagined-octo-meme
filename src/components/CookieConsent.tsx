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
      className="cookie-consent-banner fixed inset-x-0 bottom-0 z-[70] border-t border-white/12 bg-navy-dark/96 shadow-[0_-8px_32px_rgba(2,8,20,0.45)] backdrop-blur-xl"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="cookie-consent-inner mx-auto flex max-w-5xl flex-col sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="cookie-consent-heading font-semibold text-white">Cookies &amp; privacy</p>
          <p className="cookie-consent-copy text-white/70">
            <span className="sm:hidden">
              We use optional cookies to measure advertising performance. See our{" "}
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
        <div className="cookie-consent-actions flex shrink-0 flex-row">
          <button
            type="button"
            onClick={() => choose("rejected")}
            className="btn-secondary flex-1 sm:flex-none"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="btn-primary flex-1 sm:flex-none"
          >
            Accept
            <span className="hidden sm:inline">&nbsp;measurement cookies</span>
          </button>
        </div>
      </div>
    </div>
  );
}
