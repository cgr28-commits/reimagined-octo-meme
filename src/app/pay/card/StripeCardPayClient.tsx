"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import { SITE } from "@/lib/data";
import { clearOpenCheckoutSession } from "@/lib/booking-draft-storage";
import { readPendingPayment } from "@/lib/pending-payment";
import { vehicleShortLabel } from "@/lib/vehicle-selection";
import {
  fetchStripeSession,
  loadStripeJs,
  type StripeCheckout,
  type StripeSessionInfo,
} from "@/lib/stripe-pay";

type View = "loading" | "ready" | "paying" | "expired" | "invalid" | "error";

function formatGbp(amount: number | null): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
}

/**
 * Back to the quote to change details. The booking form is saved in the
 * browser, so going back restores it; clearing the open-checkout marker shows
 * the editable form instead of the "payment ready" panel.
 */
function backToBooking(): void {
  clearOpenCheckoutSession();
  let sameSite = false;
  try {
    sameSite = Boolean(document.referrer) && new URL(document.referrer).origin === window.location.origin;
  } catch {
    sameSite = false;
  }
  if (sameSite && window.history.length > 1) {
    window.history.back();
    return;
  }
  window.location.assign("/");
}

/** First part of an address ("Belfast City Hall, Donegall Square N, ..." -> "Belfast City Hall"). */
function shortPlace(label: string | undefined | null): string {
  const text = String(label ?? "").trim();
  if (!text) return "";
  return text.split(",")[0]?.trim() || text;
}

function formatTripWhen(date: string | undefined, time: string | undefined): string {
  if (!date) return time ?? "";
  const parsed = new Date(`${date}T12:00:00`);
  const day = Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return time ? `${day}, ${time}` : day;
}

type JourneySummary = { route: string; details: string };

/**
 * Journey summary for the payment card, from the booking saved in this browser
 * when the customer pressed Pay. Only used when it belongs to this checkout, so
 * a payment link opened from an email never shows someone else's journey.
 */
function readJourneySummary(checkoutId: string): JourneySummary | null {
  try {
    const pending = readPendingPayment();
    if (!pending || pending.checkoutId !== checkoutId) return null;
    const b = pending.booking;
    const from = shortPlace(b.pickupLabel);
    const to = shortPlace(b.dropoffLabel);
    if (!from || !to) return null;
    const details = [
      formatTripWhen(b.tripDate, b.tripTime),
      b.returnJourney ? "Return" : "",
      b.vehicle ? vehicleShortLabel(b.vehicle) : "",
      b.passengers ? `${b.passengers} passenger${b.passengers === 1 ? "" : "s"}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return { route: `${from} → ${to}`, details };
  } catch {
    return null;
  }
}

function confirmedUrl(checkoutId: string): string {
  return `/booking-confirmed/?checkout_id=${encodeURIComponent(checkoutId)}`;
}

export default function StripeCardPayClient() {
  const [view, setView] = useState<View>("loading");
  const [info, setInfo] = useState<StripeSessionInfo | null>(null);
  const [message, setMessage] = useState("");
  const [walletsShown, setWalletsShown] = useState(false);
  // Stripe's payment options take a few seconds to draw; keep the loading
  // placeholder up until they're actually on screen.
  const [elementsReady, setElementsReady] = useState(false);
  const [journey, setJourney] = useState<JourneySummary | null>(null);
  const checkoutRef = useRef<StripeCheckout | null>(null);
  const expressStateRef = useRef<{ ready: boolean; wallets: boolean }>({ ready: false, wallets: false });
  const startedRef = useRef(false);

  // Apple Pay / Google Pay / Link must pass their confirm event to Stripe.
  async function confirmPayment(expressEvent?: Record<string, unknown>) {
    const checkout = checkoutRef.current;
    if (!checkout) return;
    setMessage("");
    setView("paying");
    try {
      const loaded = await checkout.loadActions();
      if (loaded.type !== "success") {
        throw new Error(loaded.error?.message || "Payment could not start. Please try again.");
      }
      // On success Stripe redirects to /booking-confirmed/ (return_url).
      const result = await loaded.actions.confirm(
        expressEvent ? { expressCheckoutConfirmEvent: expressEvent } : undefined,
      );
      if (result.type === "error") {
        throw new Error(result.error?.message || "Your payment didn't go through. Please try again.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your payment didn't go through.");
      setView("ready");
    }
  }

  /**
   * Stripe fires its "ready" events before the options are painted (the frames
   * start ~2px tall). Keep the placeholder until the payment list frame has real
   * height. The Apple Pay / Google Pay button only draws once it's visible, so
   * we just wait for it to report in and keep its space reserved (no jump).
   */
  function waitUntilDrawn() {
    const started = Date.now();
    const frameHeight = (id: string) =>
      Math.max(
        0,
        ...Array.from(document.querySelectorAll<HTMLIFrameElement>(`#${id} iframe`)).map(
          (frame) => frame.getBoundingClientRect().height,
        ),
      );
    const timer = window.setInterval(() => {
      const express = expressStateRef.current;
      const paymentDrawn = frameHeight("stripe-payment-element") >= 48;
      // Never leave the customer stuck on the placeholder.
      if ((paymentDrawn && express.ready) || Date.now() - started > 12000) {
        window.clearInterval(timer);
        setElementsReady(true);
      }
    }, 150);
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const checkoutId = new URLSearchParams(window.location.search).get("checkout")?.trim() ?? "";
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(checkoutId)) {
      setView("invalid");
      return;
    }
    setJourney(readJourneySummary(checkoutId));

    void (async () => {
      try {
        const session = await fetchStripeSession(checkoutId);
        setInfo(session);
        if (session.status === "complete") {
          window.location.replace(
            session.holdKind === "short_notice"
              ? `/pay/hold-received/?ref=${encodeURIComponent(session.reference.replace(/-HOLD$/, ""))}`
              : confirmedUrl(checkoutId),
          );
          return;
        }
        if (session.status !== "open" || !session.clientSecret || !session.publishableKey) {
          setView("expired");
          return;
        }

        const Stripe = await loadStripeJs();
        const stripe = Stripe(session.publishableKey);
        // Desktop (1200px+): white payment card, so Stripe's fields use a light theme to match.
        // Mobile and tablet keep the original dark theme. Appearance only — same session and methods.
        const desktopCard = window.matchMedia("(min-width: 1200px)").matches;
        const darkAppearance = {
          theme: "night",
          variables: {
            colorPrimary: "#2fbf4a",
            colorBackground: "#0c2a52",
            colorText: "#e8edf5",
            colorTextSecondary: "#b5c0cd",
            colorTextPlaceholder: "rgba(232, 237, 245, 0.5)",
            colorDanger: "#fca5a5",
            fontFamily: "Manrope, system-ui, sans-serif",
            borderRadius: "10px",
            spacingUnit: "3px",
            fontSizeBase: "15px",
          },
          rules: {
            ".Input": { border: "1px solid rgba(255, 255, 255, 0.15)", boxShadow: "none" },
            ".Input:focus": { border: "1px solid #2fbf4a", boxShadow: "0 0 0 1px #2fbf4a" },
            // Payment options list: our colours for the frame only. Revolut Pay,
            // Revolut Pay, card brands etc. keep their own logo colours.
            ".AccordionItem": { border: "1px solid rgba(255, 255, 255, 0.15)", backgroundColor: "#0c2a52", boxShadow: "none" },
            ".AccordionItem--selected": { borderColor: "#2fbf4a" },
            ".Label": { color: "#b5c0cd", fontWeight: "600" },
          },
        };
        const lightAppearance = {
          theme: "stripe",
          variables: {
            colorPrimary: "#15803d",
            colorBackground: "#ffffff",
            colorText: "#071c38",
            colorTextSecondary: "#4a5a70",
            colorTextPlaceholder: "#6b7a8f",
            colorDanger: "#b91c1c",
            fontFamily: "Manrope, system-ui, sans-serif",
            borderRadius: "10px",
            spacingUnit: "3px",
            fontSizeBase: "15px",
          },
          rules: {
            ".Input": { border: "1.5px solid #7d8ea4", boxShadow: "none" },
            ".Input:focus": { border: "1.5px solid #071c38", boxShadow: "0 0 0 3px rgba(47, 191, 74, 0.35)" },
            ".Input--invalid": { border: "1.5px solid #b91c1c", boxShadow: "none" },
            ".AccordionItem": { border: "1px solid #d5dde8", backgroundColor: "#ffffff", boxShadow: "none" },
            ".AccordionItem--selected": { borderColor: "#15803d", boxShadow: "0 0 0 1px #15803d" },
            ".Label": { color: "#071c38", fontWeight: "600" },
            ".Error": { color: "#b91c1c" },
          },
        };
        const checkout = stripe.initCheckoutElementsSdk({
          clientSecret: session.clientSecret,
          elementsOptions: {
            // Site branding (src/app/globals.css): navy + emerald, Manrope.
            fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap" }],
            appearance: desktopCard ? lightAppearance : darkAppearance,
          },
        });
        checkoutRef.current = checkout;

        const express = checkout.createExpressCheckoutElement({
          buttonHeight: 44,
          // Show Apple Pay / Google Pay on desktop too (Chrome, Edge, Firefox):
          // "always" shows the button even before the customer has a saved card,
          // and Apple Pay on non-Safari browsers uses Apple's QR-code flow.
          paymentMethods: { applePay: "always", googlePay: "always" },
          buttonTheme: desktopCard ? { applePay: "black", googlePay: "black" } : { applePay: "white-outline", googlePay: "white" },
          layout: { maxColumns: 2, maxRows: 1, overflow: "auto" },
        });
        express.on("ready", (event) => {
          const methods = event.availablePaymentMethods as Record<string, boolean> | undefined;
          const wallets = Boolean(methods && Object.values(methods).some(Boolean));
          expressStateRef.current = { ready: true, wallets };
          setWalletsShown(wallets);
        });
        express.on("confirm", (event) => {
          void confirmPayment(event);
        });
        express.mount("#stripe-express-checkout");

        // Accordion list shows each payment option with its own brand logo
        // (tabs would tint the logos in our theme colour).
        const payment = checkout.createPaymentElement({
          layout: { type: "accordion", spacedAccordionItems: true },
        });
        payment.on("loaderror", () => {
          setMessage("The secure payment form couldn't load. Please refresh the page or contact us.");
          setElementsReady(true);
        });
        payment.mount("#stripe-payment-element");
        waitUntilDrawn();
        setView("ready");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "We couldn't open this payment link.");
        setView("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amountLabel = formatGbp(info?.amount ?? null);
  const showForm = view === "loading" || view === "ready" || view === "paying";

  return (
    <section
      data-stripe-pay={view}
      className="relative rounded-2xl border border-white/15 bg-white/[0.04] p-4 text-white sm:p-5"
    >
      {/* Compact by design: the whole payment fits on one screen (phone and laptop). */}
      <div className="flex items-center justify-between gap-3">
        <span data-pay-logo-dark className="contents">
          <Logo className="h-9 sm:h-10" />
        </span>
        {/* Desktop (1200px+) white card: the light logo variant (hidden below 1200px). */}
        <span data-pay-logo-light className="hidden">
          <Logo theme="light" className="h-10" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald">
          Secure card payment
        </span>
      </div>
      {view !== "paying" ? (
        <button
          type="button"
          onClick={backToBooking}
          className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-white/80 underline-offset-2 hover:text-white hover:underline"
          data-pay-back-to-booking
        >
          <span aria-hidden>←</span> Back to booking (change details)
        </button>
      ) : null}
      {showForm ? (
        <>
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-white/10 pt-3">
            <div className="min-w-0">
              {journey ? (
                <>
                  <p className="text-sm font-semibold leading-snug text-white" data-pay-journey>
                    {journey.route}
                  </p>
                  {journey.details ? (
                    <p className="mt-0.5 text-xs leading-snug text-white/65">{journey.details}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm font-semibold text-white">
                  {info?.cardHold ? "Amount to authorise" : "Amount to pay"}
                </p>
              )}
            </div>
            {amountLabel ? (
              <p className="shrink-0 text-xl font-bold text-white">{amountLabel}</p>
            ) : null}
          </div>
          {info?.holdKind === "short_notice" ? (
            <p className="mt-2 rounded-xl border border-emerald/40 bg-emerald/10 px-3 py-2 text-xs leading-snug text-white/90">
              Held on your card while we confirm your driver. Only charged once we confirm; otherwise
              released and you pay nothing.
            </p>
          ) : info?.cardHold ? (
            <p className="mt-2 rounded-xl border border-emerald/40 bg-emerald/10 px-3 py-2 text-xs leading-snug text-white/90">
              Held now, charged 24 hours before pickup. Cancel before then and the hold is released
              — you pay nothing.
            </p>
          ) : null}

          {/*
            Stripe only paints its buttons while they're on screen, so its area
            stays in place underneath and the placeholder covers it until drawn.
          */}
          <div className={elementsReady ? "relative" : "relative min-h-[250px]"}>
            <div id="stripe-express-checkout" className={walletsShown ? "mt-3 min-h-[44px]" : "mt-3"} />
            {walletsShown ? (
              <p className="my-2 text-center text-[11px] uppercase tracking-wider text-white/50">
                or pay by card
              </p>
            ) : null}
            <div id="stripe-payment-element" className={walletsShown ? "" : "mt-3"} />

            {!elementsReady && view !== "paying" ? (
              <div
                className="absolute inset-0 z-10 bg-[#11253f] pt-3"
                role="status"
                aria-live="polite"
                data-pay-loading
              >
                <div className="flex items-center justify-center gap-2 py-1 text-sm text-white/75">
                  <span
                    aria-hidden
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-emerald"
                  />
                  Loading secure payment…
                </div>
                <div aria-hidden className="mt-3 space-y-2">
                  <div className="h-11 animate-pulse rounded-[10px] bg-white/10" />
                  <div className="h-12 animate-pulse rounded-[10px] bg-white/[0.07]" />
                  <div className="h-12 animate-pulse rounded-[10px] bg-white/[0.07]" />
                  <div className="h-12 animate-pulse rounded-[10px] bg-white/[0.07]" />
                </div>
              </div>
            ) : null}
          </div>

          {message ? (
            <p role="alert" className="mt-2 text-sm text-red-300">
              {message}
            </p>
          ) : null}

          {view !== "loading" && elementsReady ? (
            <button
              type="button"
              className="btn-primary mt-3 w-full justify-center"
              disabled={view === "paying"}
              onClick={() => void confirmPayment()}
            >
              {view === "paying"
                ? "Processing…"
                : `${info?.cardHold ? "Authorise" : "Pay"}${amountLabel ? ` ${amountLabel}` : ""}`}
            </button>
          ) : null}
          <p className="mt-2 text-center text-[11px] leading-snug text-white/55">
            Secured by Stripe — we never see your card details. Questions? Call{" "}
            {SITE.officeLandlineDisplay} or WhatsApp {SITE.landlineDisplay}.
          </p>
          {info?.reference ? (
            <p className="mt-1 text-center text-[10px] text-white/40" data-pay-reference>
              Payment ref {info.reference.replace(/-HOLD$/, "")}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <h1 className="mt-3 text-xl font-bold">
            {view === "expired"
              ? "This payment link has expired"
              : view === "invalid"
                ? "We couldn't open this payment link"
                : "Card payment isn't available right now"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/85">
            {view === "expired"
              ? "Payment links last 24 hours. Please get a new quote on our website, or contact us and we'll send you a fresh link."
              : message || "Please try again in a few minutes, or contact us and we'll help."}
          </p>
          <Link href="/" className="btn-primary mt-4 inline-flex min-h-11 items-center px-6">
            Back to home
          </Link>
          <p className="mt-4 text-sm text-white/70">
            Questions? Call {SITE.officeLandlineDisplay} or WhatsApp {SITE.landlineDisplay}.
          </p>
        </>
      )}
    </section>
  );
}
