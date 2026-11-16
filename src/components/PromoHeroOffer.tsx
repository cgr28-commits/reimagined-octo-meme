"use client";

/**
 * Owner (16 Nov 2026): "Make the 10% offer more prominent."
 *
 * A bright offer button just above the quote card on the homepage and the landing pages that use
 * the hero (every screen size). Tapping it opens the same sign-up form as the pop-up
 * (PROMO_OPEN_EVENT). Same rules as the rest of the promotion: nothing loads before the cookie
 * choice, hidden once this browser has signed up for the current offer, and hidden while the
 * customer is part-way through booking.
 */
import { useEffect, useState } from "react";
import { COOKIE_CONSENT_EVENT, readCookieConsent } from "@/lib/cookie-consent";
import {
  PROMO_OPEN_EVENT,
  PROMO_SIGNED_UP_EVENT,
  bookingInProgress,
  fetchPromoConfig,
  promoAlreadySignedUp,
  type PublicPromoConfig,
} from "@/lib/promo-api";

export default function PromoHeroOffer() {
  const [config, setConfig] = useState<PublicPromoConfig | null>(null);
  const [consentDone, setConsentDone] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const update = () => setConsentDone(readCookieConsent() !== null);
    update();
    window.addEventListener(COOKIE_CONSENT_EVENT, update);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, update);
  }, []);

  useEffect(() => {
    if (!consentDone) return;
    let live = true;
    fetchPromoConfig().then((c) => {
      if (live) setConfig(c);
    });
    return () => {
      live = false;
    };
  }, [consentDone]);

  const offerId = config?.campaign?.id;

  useEffect(() => {
    if (!config?.enabled) return;
    const update = () => setHidden(promoAlreadySignedUp(offerId) || bookingInProgress());
    update();
    window.addEventListener(PROMO_SIGNED_UP_EVENT, update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-booking-in-progress"] });
    return () => {
      window.removeEventListener(PROMO_SIGNED_UP_EVENT, update);
      observer.disconnect();
    };
  }, [config, offerId]);

  if (!config?.enabled || hidden) return null;
  const pct = config.discountPercentLabel || "10%";
  const offer = config.campaign?.name;

  return (
    <div data-promo-hero-offer className="mb-6 flex justify-center">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(PROMO_OPEN_EVENT))}
        className="group flex w-full max-w-xl items-center gap-3 rounded-2xl bg-emerald px-3 py-2.5 sm:px-4 sm:py-3 text-left text-[#071c38] shadow-[0_10px_28px_rgba(47,191,74,0.35)] ring-2 ring-white/70 transition hover:brightness-105 active:scale-[0.99]"
      >
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-extrabold sm:h-11 sm:w-11"
          style={{ backgroundColor: "#071c38", color: "#2fbf4a", WebkitTextFillColor: "#2fbf4a" }}
        >
          %
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-base font-extrabold sm:text-lg" style={{ color: "#071c38", WebkitTextFillColor: "#071c38" }}>
            {offer ? `${offer}: ` : ""}Get {pct} off your transfer
          </span>
          <span className="hidden text-sm font-semibold sm:block" style={{ color: "rgba(7,28,56,0.8)", WebkitTextFillColor: "rgba(7,28,56,0.8)" }}>
            Enter your email for your discount code
          </span>
        </span>
        <span
          className="shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold"
          style={{ backgroundColor: "#071c38", color: "#ffffff", WebkitTextFillColor: "#ffffff" }}
        >
          Get my code
        </span>
      </button>
    </div>
  );
}
