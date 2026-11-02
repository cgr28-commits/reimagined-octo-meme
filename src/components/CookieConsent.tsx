"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname() ?? "";
  // Visitors must choose before using the site; the Privacy Policy stays readable.
  const requireChoice = !/^\/privacy\/?$/.test(pathname);

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
    if (requireChoice) {
      document.documentElement.style.removeProperty(COOKIE_BANNER_OFFSET_VAR);
      return;
    }

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
  }, [choice, requireChoice]);

  if (choice === "loading" || choice !== null) {
    return null;
  }

  function choose(next: CookieConsentChoice) {
    writeCookieConsent(next);
    updateGoogleConsent(next === "accepted");
    setChoice(next);
  }

  return (
    <>
    {requireChoice ? (
      <div
        className="fixed inset-0 z-[69] bg-navy-dark/75 backdrop-blur-[2px]"
        aria-hidden="true"
        data-cookie-consent-overlay
      />
    ) : null}
    <div
      ref={bannerRef}
      className={
        requireChoice
          ? "cookie-consent-banner cookie-consent-banner--modal fixed z-[70] bg-navy-dark shadow-[0_24px_64px_rgba(2,8,20,0.6)]"
          : "cookie-consent-banner fixed inset-x-0 bottom-0 z-[70] border-t border-white/12 bg-navy-dark/96 shadow-[0_-8px_32px_rgba(2,8,20,0.45)] backdrop-blur-xl"
      }
      role="dialog"
      aria-modal={requireChoice ? true : undefined}
      aria-label="Cookie consent"
    >
      <div className="cookie-consent-inner flex flex-col">
        <div className="min-w-0 flex-1">
          <p className="cookie-consent-copy text-white/70">
            <strong className="font-semibold text-white">
              We&apos;re a small local firm. Can we see which of our Google ads brought you here?
            </strong>{" "}
            It helps us keep our prices down. Booking works either way.{" "}
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
            className="btn-secondary flex-1"
          >
            Reject optional
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="btn-secondary flex-1"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
