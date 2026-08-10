"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  readCookieConsent,
  writeCookieConsent,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";
import { updateGoogleConsent } from "@/lib/google-ads-client";

export default function CookieConsent() {
  const [choice, setChoice] = useState<CookieConsentChoice | null | "loading">("loading");

  useEffect(() => {
    setChoice(readCookieConsent());
  }, []);

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
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-white/15 bg-navy-dark/95 p-4 shadow-2xl backdrop-blur-xl sm:p-5"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Cookies &amp; advertising measurement</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">
            We use essential storage for booking checkout. Optional Google Ads cookies help us
            measure quote requests and confirmed bookings — only if you accept. See our{" "}
            <Link href="/privacy/" className="font-medium text-emerald underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => choose("rejected")}
            className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/5"
          >
            Essential only
          </button>
          <button
            type="button"
            onClick={() => choose("accepted")}
            className="rounded-full bg-emerald px-5 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-emerald-light"
          >
            Accept measurement cookies
          </button>
        </div>
      </div>
    </div>
  );
}
