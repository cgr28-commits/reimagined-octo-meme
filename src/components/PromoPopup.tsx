"use client";

/**
 * 10% email discount promotion (owner brief, 16 Nov 2026).
 *
 * Desktop (1200px+, the site's desktop breakpoint): a pop-up after the configured delay
 * (default 20 s) or on exit intent, whichever comes first.
 * Phones and tablets: never an automatic full-screen pop-up — a slim dismissible banner;
 * tapping it opens the sign-up sheet.
 *
 * Never shown: before the cookie choice is made, on booking / payment / account pages, while
 * the customer is part-way through booking (quote step 2+, or typing in a form), for 30 days
 * after it was closed, or ever again after a successful sign-up on this browser.
 * Nothing loads until the cookie choice is made, and the config is one small cached request.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { COOKIE_CONSENT_EVENT, readCookieConsent } from "@/lib/cookie-consent";
import { shouldHidePublicSalesWidgets } from "@/lib/owner-portal";
import {
  PROMO_OPEN_EVENT,
  bookingInProgress,
  fetchPromoConfig,
  markPromoPopupDismissed,
  promoPopupAllowed,
  type PublicPromoConfig,
} from "@/lib/promo-api";
import PromoSignupForm from "@/components/PromoSignupForm";
import { PROMO_POPUP_HEADLINE } from "../../shared/promo-code";

/** Booking, payment, account and staff pages: the promotion never appears there. */
const EXCLUDED_PREFIXES = [
  "/book",
  "/book-quote",
  "/pay",
  "/booking-confirmed",
  "/balance-paid",
  "/manage-booking",
  "/my-bookings",
  "/accept-alternative-time",
  "/personal-quote",
  "/quick-quote",
  "/quotation",
  "/quote",
  "/test-booking",
  "/tip",
  "/track",
  "/unsubscribe",
  "/business-class-request",
  "/driver",
  "/driver-accept",
  "/driver-portal",
  "/owner",
  "/admin",
];

export function promoExcludedPath(pathname: string | null | undefined): boolean {
  const path = String(pathname ?? "/").replace(/\/+$/, "") || "/";
  if (shouldHidePublicSalesWidgets(path)) return true;
  return EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

type Mode = "none" | "dialog" | "banner" | "sheet";

/** The site's desktop layout starts at 1200px; touch-only tablets get the banner instead. */
const PROMO_DESKTOP_QUERY = "(min-width: 1200px) and (hover: hover) and (pointer: fine)";

export default function PromoPopup() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<PublicPromoConfig | null>(null);
  const [consentDone, setConsentDone] = useState(false);
  const [desktop, setDesktop] = useState<boolean | null>(null);
  const [mode, setMode] = useState<Mode>("none");
  const [signedUp, setSignedUp] = useState(false);
  const shownRef = useRef(false);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const excluded = promoExcludedPath(pathname);

  useEffect(() => setMounted(true), []);

  // Cookie choice first: the consent pop-up must never be stacked with this one.
  useEffect(() => {
    if (!mounted) return;
    const update = () => setConsentDone(readCookieConsent() !== null);
    update();
    window.addEventListener(COOKIE_CONSENT_EVENT, update);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, update);
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const mq = window.matchMedia(PROMO_DESKTOP_QUERY);
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, [mounted]);

  useEffect(() => {
    if (!consentDone || excluded) return;
    let live = true;
    fetchPromoConfig().then((c) => {
      if (live) setConfig(c);
    });
    return () => {
      live = false;
    };
  }, [consentDone, excluded]);

  const eligible = Boolean(config?.enabled) && consentDone && !excluded && promoPopupAllowedSafe();

  const open = useCallback((next: Mode) => {
    if (shownRef.current && next === "dialog") return;
    if (next === "dialog") shownRef.current = true;
    restoreFocus.current = (document.activeElement as HTMLElement | null) ?? null;
    setMode(next);
  }, []);

  // Desktop: timer + exit intent (once per page view).
  useEffect(() => {
    if (!eligible || desktop !== true || !config?.popupEnabled) return;
    const tryOpen = () => {
      if (shownRef.current || !promoPopupAllowed() || bookingInProgress() || document.hidden) return;
      open("dialog");
    };
    const timer = window.setTimeout(tryOpen, Math.max(5, config.popupDelaySeconds) * 1000);
    const onLeave = (event: MouseEvent) => {
      if (event.relatedTarget === null && event.clientY <= 0) tryOpen();
    };
    document.addEventListener("mouseout", onLeave);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [eligible, desktop, config, open]);

  // Phones / tablets: a small banner, never an automatic overlay.
  useEffect(() => {
    if (!eligible || desktop !== false) return;
    const timer = window.setTimeout(() => {
      if (!bookingInProgress()) setMode((m) => (m === "none" ? "banner" : m));
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [eligible, desktop]);

  // Hide the banner as soon as the customer moves into booking.
  useEffect(() => {
    if (mode !== "banner") return;
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      if (root.dataset.bookingInProgress === "1") setMode("none");
    });
    observer.observe(root, { attributes: true, attributeFilter: ["data-booking-in-progress"] });
    return () => observer.disconnect();
  }, [mode]);

  // "Get your code" from the quote-results banner can open the form on any device.
  useEffect(() => {
    const onOpen = () => {
      if (!config?.enabled) return;
      open(desktop ? "dialog" : "sheet");
    };
    window.addEventListener(PROMO_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(PROMO_OPEN_EVENT, onOpen);
  }, [config, desktop, open]);

  const close = useCallback(
    (remember: boolean) => {
      if (remember && !signedUp) markPromoPopupDismissed();
      setMode("none");
      window.setTimeout(() => restoreFocus.current?.focus?.(), 0);
    },
    [signedUp],
  );

  // Dialog / sheet: Escape closes, Tab stays inside.
  useEffect(() => {
    if (mode !== "dialog" && mode !== "sheet") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([tabindex="-1"]):not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, close]);

  if (!mounted || !config?.enabled || mode === "none") return null;
  const percent = config.discountPercentLabel || "10%";
  const headline = percent === "10%" ? PROMO_POPUP_HEADLINE : `GET ${percent} OFF YOUR AIRPORT TRANSFER`;
  const description = `Enter your email address and we’ll send you an exclusive ${percent} discount code, valid for ${config.validityDays} days.`;

  if (mode === "banner") {
    return createPortal(
      <div
        data-promo-banner
        role="region"
        aria-label={`${percent} discount offer`}
        className="fixed inset-x-0 z-[58] px-3"
        style={{ bottom: "calc(max(10px, env(safe-area-inset-bottom, 0px)) + var(--matni-cookie-banner-offset, 0px))" }}
      >
        <div className="mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-navy py-2 pl-4 pr-2 text-white shadow-[0_10px_30px_rgba(7,28,56,0.35)] ring-1 ring-white/10">
          <button
            type="button"
            onClick={() => open("sheet")}
            className="flex min-h-11 flex-1 items-center gap-2 text-left text-sm font-semibold"
          >
            <span aria-hidden className="rounded-md bg-emerald px-1.5 py-0.5 text-xs font-extrabold text-navy">{percent}</span>
            <span>
              Get {percent} off your transfer <span className="text-emerald underline underline-offset-2">Get my code</span>
            </span>
          </button>
          <button
            type="button"
            aria-label="Close offer"
            onClick={() => close(true)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl leading-none text-white/80 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  const isSheet = mode === "sheet";
  return createPortal(
    <div
      data-promo-overlay
      className={`fixed inset-0 z-[90] flex ${isSheet ? "items-end" : "items-center"} justify-center p-0 sm:p-4`}
      style={{ backgroundColor: "rgba(4, 16, 32, 0.62)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close(true);
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-dialog-title"
        aria-describedby="promo-dialog-desc"
        data-promo-dialog
        className={`relative w-full overflow-hidden bg-navy text-white shadow-2xl ring-1 ring-white/10 ${
          isSheet ? "max-h-[92vh] overflow-y-auto rounded-t-3xl pb-[max(20px,env(safe-area-inset-bottom))]" : "max-w-[460px] rounded-3xl"
        }`}
      >
        <div aria-hidden className="h-1.5 w-full bg-emerald" />
        <button
          type="button"
          onClick={() => close(true)}
          aria-label="Close"
          className="absolute right-3 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald"
        >
          ×
        </button>
        <div className="px-6 pb-6 pt-7 sm:px-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald">My Airport Taxi NI</p>
          <h2 id="promo-dialog-title" className="mt-2 pr-10 text-[1.6rem] font-extrabold leading-[1.15] tracking-tight">
            {headline}
          </h2>
          <p id="promo-dialog-desc" className="mt-3 text-[0.95rem] leading-relaxed text-white/85">
            {description}
          </p>
          <div className="mt-5">
            <PromoSignupForm
              source={isSheet ? "mobile-banner" : "popup"}
              validityDays={config.validityDays}
              percentLabel={percent}
              autoFocus={!isSheet}
              onDone={() => setSignedUp(true)}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function promoPopupAllowedSafe(): boolean {
  try {
    return promoPopupAllowed();
  } catch {
    return false;
  }
}
