"use client";

/**
 * Christmas welcome pop-up (owner brief, 17 Nov 2026).
 *
 * First visit during the campaign: the 8-second Google Flow video plays muted (sound button
 * available), then the Christmas offer is revealed. The offer IS the existing 10% email promo
 * code — same form, same rules (minimum fare, excluded dates, one per customer). Nothing here
 * changes prices or creates a discount.
 *
 * Shown once per browser, only after the cookie choice and once the page has finished loading,
 * never on booking / payment / account / saved-quote pages (same list as the promo pop-up),
 * never while the customer is typing in the quote tool or part-way through booking.
 * Skip / close / Escape at any moment. While it runs, the 20-second promo pop-up stays away.
 *
 * Switches: CHRISTMAS_WELCOME (dates, on/off) in src/lib/seasonal.ts, and the promo
 * "pop-up" switch in the Owner Dashboard (off = this doesn't appear either).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import PromoSignupForm from "@/components/PromoSignupForm";
import QuoteNavLink from "@/components/QuoteNavLink";
import { COOKIE_CONSENT_EVENT, readCookieConsent } from "@/lib/cookie-consent";
import { withBasePath } from "@/lib/paths";
import {
  bookingInProgress,
  fetchPromoConfig,
  markPromoPopupDismissed,
  promoAlreadySignedUp,
  type PublicPromoConfig,
} from "@/lib/promo-api";
import { trackChristmasVideo } from "@/lib/christmas-video-stats";
import { CHRISTMAS_WELCOME, CHRISTMAS_WELCOME_FLAG, isChristmasVideoLive, londonDateKey } from "@/lib/seasonal";
import { promoExcludedPath } from "@/components/PromoPopup";

const VIDEO_DIR = "/seasonal/video";
const SEEN_KEY = `matni-christmas-welcome:${CHRISTMAS_WELCOME.showFrom}`;

type Step = "video" | "offer" | "form" | "quote";

function alreadySeen(): boolean {
  try {
    if (localStorage.getItem(SEEN_KEY)) return true;
  } catch {
    // storage blocked — fall through to the session copy
  }
  try {
    return Boolean(sessionStorage.getItem(SEEN_KEY));
  } catch {
    return false;
  }
}

function markSeen(): void {
  const now = String(Date.now());
  try {
    localStorage.setItem(SEEN_KEY, now);
  } catch {
    // ignore
  }
  try {
    sessionStorage.setItem(SEEN_KEY, now);
  } catch {
    // ignore
  }
}

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The excluded date range that covers Christmas Day this season (from the live promo settings),
 * so the offer can say which journeys it covers. null = no Christmas exclusion.
 */
function christmasExclusion(config: PublicPromoConfig): { from: string; to: string } | null {
  const year = CHRISTMAS_WELCOME.showFrom.slice(0, 4);
  const xmas = `${year}-12-25`;
  const hit = config.blackoutDates.find((r) => r.from <= xmas && r.to >= xmas);
  return hit ? { from: hit.from, to: hit.to } : null;
}

function formatDay(dateKey: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "long" }).format(
    new Date(`${dateKey}T12:00:00Z`),
  );
}

export default function ChristmasWelcome() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("video");
  const [config, setConfig] = useState<PublicPromoConfig | null>(null);
  const [muted, setMuted] = useState(true);
  const [needsTap, setNeedsTap] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const triedRef = useRef(false);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stepRef = useRef<Step>("video");
  stepRef.current = step;
  const excluded = promoExcludedPath(pathname);

  useEffect(() => setMounted(true), []);

  // Decide once per visit whether to show it.
  useEffect(() => {
    if (!mounted || excluded || triedRef.current) return;
    if (!isChristmasVideoLive(new Date(), CHRISTMAS_WELCOME) || alreadySeen()) return;

    let cancelled = false;
    let timer = 0;

    const tryOpen = async () => {
      if (cancelled || triedRef.current) return;
      if (readCookieConsent() === null) return; // cookie choice first; COOKIE_CONSENT_EVENT retries
      if (document.readyState !== "complete") return; // the load listener retries
      // Already booking: never interrupt. Typing in the quote tool / tab hidden: try again shortly.
      if (document.documentElement.dataset.bookingInProgress === "1") {
        triedRef.current = true;
        return;
      }
      if (bookingInProgress() || document.hidden) {
        timer = window.setTimeout(tryOpen, 4000);
        return;
      }
      triedRef.current = true;
      const c = await fetchPromoConfig();
      if (cancelled) return;
      // Owner Dashboard pop-up switch off → no welcome pop-up either.
      if (!c.enabled || !c.popupEnabled) return;
      if (bookingInProgress()) return;
      setConfig(c);
      setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      restoreFocus.current = (document.activeElement as HTMLElement | null) ?? null;
      document.documentElement.dataset[CHRISTMAS_WELCOME_FLAG] = "1";
      markSeen();
      trackChristmasVideo("popup_shown");
      setOpen(true);
    };

    const onLoad = () => {
      timer = window.setTimeout(tryOpen, 600);
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    window.addEventListener(COOKIE_CONSENT_EVENT, onLoad);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("load", onLoad);
      window.removeEventListener(COOKIE_CONSENT_EVENT, onLoad);
    };
  }, [mounted, excluded]);

  const offerId = config?.campaign?.id;
  const today = mounted ? londonDateKey(new Date()) : "";
  const exclusion = config ? christmasExclusion(config) : null;
  // The code can still be used on a journey before the Christmas exclusion starts.
  const offerUsable = Boolean(config?.enabled) && (!exclusion || today < exclusion.from);
  const lastJourneyDay = exclusion ? addDays(exclusion.from, -1) : null;

  const nextAfterVideo = useCallback(() => {
    videoRef.current?.pause();
    if (offerUsable && !promoAlreadySignedUp(offerId)) {
      // The customer has now seen the offer — don't follow up with the 20-second promo pop-up.
      markPromoPopupDismissed(Date.now(), offerId);
      trackChristmasVideo("popup_offer_seen");
      setStep("offer");
    } else {
      setStep("quote");
    }
  }, [offerUsable, offerId]);

  const close = useCallback(() => {
    if (stepRef.current === "video") trackChristmasVideo("popup_closed");
    videoRef.current?.pause();
    setOpen(false);
    window.setTimeout(() => restoreFocus.current?.focus?.({ preventScroll: true }), 0);
  }, []);

  // Start the video muted (allowed on iPhone / Android / desktop). Reduced motion: wait for a tap.
  useEffect(() => {
    if (!open || step !== "video") return;
    const video = videoRef.current;
    if (!video) return;
    if (reducedMotion) {
      setNeedsTap(true);
      return;
    }
    video.muted = true;
    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") attempt.catch(() => setNeedsTap(true));
  }, [open, step, reducedMotion]);

  // Page behind doesn't scroll; Escape closes; Tab stays inside.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([tabindex="-1"]):not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])',
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
    // Focus the first control so keyboard users land inside the dialog.
    window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("[data-cw-focus]")?.focus(), 30);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Move focus to the new step's heading when the step changes (screen readers announce it).
  useEffect(() => {
    if (!open || step === "video") return;
    window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("[data-cw-step-heading]")?.focus(), 30);
  }, [open, step]);

  if (!mounted || !open || !config) return null;

  const percent = config.discountPercentLabel || "10%";
  const minimum = `£${Math.round(config.minimumVehicleFareGbp)}`;
  const toggleSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted) trackChristmasVideo("popup_sound_on");
    if (video.paused) void video.play().catch(() => setNeedsTap(true));
  };
  const tapToPlay = () => {
    const video = videoRef.current;
    if (!video) return;
    setNeedsTap(false);
    void video.play().catch(() => setNeedsTap(true));
  };

  return createPortal(
    <div
      data-christmas-welcome
      className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-6"
      style={{ backgroundColor: "rgba(4, 16, 32, 0.72)" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cw-title"
        className="cw-card relative max-h-[94dvh] w-full max-w-[680px] overflow-y-auto rounded-3xl bg-navy text-white shadow-2xl ring-1 ring-[#E2C275]/35"
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          data-cw-focus={step === "video" ? undefined : true}
          className="absolute right-2.5 top-2.5 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full bg-navy/70 text-2xl leading-none text-white backdrop-blur-sm hover:bg-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E2C275]"
        >
          ×
        </button>

        {step === "video" ? (
          <div>
            <h2 id="cw-title" className="sr-only">
              Coming Home for Christmas? — 8-second video from My Airport Taxi NI
            </h2>
            <div className="relative aspect-video w-full overflow-hidden rounded-t-3xl bg-navy-dark">
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                poster={withBasePath(`${VIDEO_DIR}/christmas-homecoming-poster.jpg`)}
                preload="auto"
                muted
                playsInline
                width={1920}
                height={1080}
                aria-label="Christmas video: a plane lands in winter, a driver opens the car door for a family, and the car drives through festive Belfast."
                onEnded={() => {
                  trackChristmasVideo("popup_watched");
                  nextAfterVideo();
                }}
              >
                <source src={withBasePath(`${VIDEO_DIR}/christmas-homecoming-1080.mp4`)} type="video/mp4" media="(min-width: 768px)" />
                <source src={withBasePath(`${VIDEO_DIR}/christmas-homecoming-720.mp4`)} type="video/mp4" />
              </video>
              {needsTap ? (
                <button
                  type="button"
                  onClick={tapToPlay}
                  aria-label="Play the Christmas video"
                  className="absolute inset-0 flex items-center justify-center bg-navy/25 focus-visible:outline-none"
                >
                  <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald text-white ring-4 ring-white/85 shadow-lg">
                    <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden="true" className="ml-1">
                      <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.6-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14z" />
                    </svg>
                  </span>
                </button>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={toggleSound}
                aria-pressed={!muted}
                className="cw-chip inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-white/25 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E2C275]"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  {muted ? (
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" />
                  ) : (
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />
                  )}
                </svg>
                {muted ? "Sound on" : "Sound off"}
              </button>
              <button
                type="button"
                data-cw-focus
                onClick={() => {
                  trackChristmasVideo("popup_skipped");
                  nextAfterVideo();
                }}
                className="cw-chip inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-semibold hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#E2C275]"
              >
                Skip <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>
        ) : null}

        {step === "offer" ? (
          <div className="cw-reveal px-6 pb-7 pt-9 text-center sm:px-10 sm:pb-9 sm:pt-11">
            <p className="text-sm font-semibold text-[#E2C275]">
              <span aria-hidden="true">🎄 </span>A Little Christmas Gift From Us!
            </p>
            <h2 id="cw-title" data-cw-step-heading tabIndex={-1} className="mt-3 outline-none">
              <span className="block text-[3.4rem] font-extrabold leading-none tracking-tight text-emerald sm:text-[4.2rem]">
                {percent} OFF
              </span>
              <span className="mt-2 block text-xl font-semibold text-white sm:text-2xl">Your Christmas Journey</span>
            </h2>
            <p className="cw-sub mx-auto mt-4 max-w-md text-[0.98rem] leading-relaxed">
              Make your Christmas journey a little more special with My Airport Taxi NI.
            </p>
            <div className="mx-auto mt-6 flex max-w-sm flex-col items-stretch gap-3">
              <button
                type="button"
                onClick={() => {
                  trackChristmasVideo("popup_claim");
                  setStep("form");
                }}
                className="btn-primary cw-primary inline-flex min-h-12 items-center justify-center px-6 text-base font-bold"
              >
                Claim My {percent} Discount
              </button>
              <button
                type="button"
                onClick={close}
                className="cw-link mx-auto min-h-11 px-3 text-sm font-semibold underline underline-offset-4 hover:text-white"
              >
                Continue to Website
              </button>
            </div>
            <p className="cw-small mx-auto mt-5 max-w-md text-xs leading-relaxed">
              {lastJourneyDay ? `For journeys up to ${formatDay(lastJourneyDay)}. ` : ""}
              {percent} off the vehicle fare, minimum vehicle fare {minimum}, airport charges excluded. Your code is emailed to you, valid for {config.validityDays} days, one per customer.
            </p>
          </div>
        ) : null}

        {step === "form" ? (
          <div className="cw-reveal px-6 pb-7 pt-9 sm:px-9">
            <h2 id="cw-title" data-cw-step-heading tabIndex={-1} className="pr-10 text-2xl font-extrabold tracking-tight outline-none">
              Claim your {percent} Christmas discount
            </h2>
            <p className="cw-sub mt-2 text-[0.95rem] leading-relaxed">
              Enter your email and we’ll send your code straight away
              {lastJourneyDay ? ` — use it on journeys up to ${formatDay(lastJourneyDay)}` : ""}.
            </p>
            <div className="mt-5">
              <PromoSignupForm
                source="popup"
                validityDays={config.validityDays}
                percentLabel={percent}
                offerId={offerId}
                autoFocus
                onDone={() => {
                  trackChristmasVideo("popup_code_sent");
                  setClaimed(true);
                }}
              />
            </div>
            {claimed ? (
              <QuoteNavLink onNavigate={() => { trackChristmasVideo("popup_get_quote"); close(); }} className="btn-primary cw-primary mt-5 inline-flex min-h-12 w-full items-center justify-center px-6 text-base font-bold">
                Get My Quote
              </QuoteNavLink>
            ) : (
              <button
                type="button"
                onClick={close}
                className="cw-link mt-4 min-h-11 text-sm font-semibold underline underline-offset-4 hover:text-white"
              >
                Continue to Website
              </button>
            )}
          </div>
        ) : null}

        {step === "quote" ? (
          <div className="cw-reveal px-6 pb-8 pt-10 text-center sm:px-10">
            <h2 id="cw-title" data-cw-step-heading tabIndex={-1} className="text-2xl font-extrabold tracking-tight outline-none sm:text-[1.9rem]">
              Your journey, taken care of.
            </h2>
            <p className="cw-sub mx-auto mt-3 max-w-md text-[0.98rem] leading-relaxed">
              {promoAlreadySignedUp(offerId) && offerUsable
                ? "Your code is on its way — enter it when you book. Get your fixed airport fare now."
                : "Fixed prices, flight monitoring and a pre-booked driver waiting for you."}
            </p>
            <div className="mx-auto mt-6 flex max-w-sm flex-col items-stretch gap-3">
              <QuoteNavLink onNavigate={() => { trackChristmasVideo("popup_get_quote"); close(); }} className="btn-primary cw-primary inline-flex min-h-12 items-center justify-center px-6 text-base font-bold">
                Get My Quote
              </QuoteNavLink>
              <button
                type="button"
                onClick={close}
                className="cw-link mx-auto min-h-11 px-3 text-sm font-semibold underline underline-offset-4 hover:text-white"
              >
                Continue to Website
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
