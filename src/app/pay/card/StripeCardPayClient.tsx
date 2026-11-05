"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import { SITE } from "@/lib/data";
import { clearOpenCheckoutSession } from "@/lib/booking-draft-storage";
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

function confirmedUrl(checkoutId: string): string {
  return `/booking-confirmed/?checkout_id=${encodeURIComponent(checkoutId)}`;
}

export default function StripeCardPayClient() {
  const [view, setView] = useState<View>("loading");
  const [info, setInfo] = useState<StripeSessionInfo | null>(null);
  const [message, setMessage] = useState("");
  const [walletsShown, setWalletsShown] = useState(false);
  const checkoutRef = useRef<StripeCheckout | null>(null);
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

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const checkoutId = new URLSearchParams(window.location.search).get("checkout")?.trim() ?? "";
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(checkoutId)) {
      setView("invalid");
      return;
    }

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
        const checkout = stripe.initCheckoutElementsSdk({
          clientSecret: session.clientSecret,
          elementsOptions: {
            // Site branding (src/app/globals.css): navy + emerald, Manrope.
            fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap" }],
            appearance: {
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
            },
          },
        });
        checkoutRef.current = checkout;

        const express = checkout.createExpressCheckoutElement({
          buttonHeight: 44,
          // Show Apple Pay / Google Pay on desktop too (Chrome, Edge, Firefox):
          // "always" shows the button even before the customer has a saved card,
          // and Apple Pay on non-Safari browsers uses Apple's QR-code flow.
          paymentMethods: { applePay: "always", googlePay: "always" },
          buttonTheme: { applePay: "white-outline", googlePay: "white" },
          layout: { maxColumns: 2, maxRows: 1, overflow: "auto" },
        });
        express.on("ready", (event) => {
          const methods = event.availablePaymentMethods as Record<string, boolean> | undefined;
          setWalletsShown(Boolean(methods && Object.values(methods).some(Boolean)));
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
        payment.mount("#stripe-payment-element");
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
      className="rounded-2xl border border-white/15 bg-white/[0.04] p-4 text-white sm:p-5"
    >
      {/* Compact by design: the whole payment fits on one screen (phone and laptop). */}
      <div className="flex items-center justify-between gap-3">
        <Logo className="h-9 sm:h-10" />
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
              <p className="text-xs text-white/65">
                {info?.cardHold ? "Amount to authorise" : "Amount to pay"}
                {info?.reference ? ` · Ref ${info.reference.replace(/-HOLD$/, "")}` : ""}
              </p>
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

          {view === "loading" ? (
            <p className="mt-3 text-sm text-white/70">Loading secure payment…</p>
          ) : null}

          <div id="stripe-express-checkout" className="mt-3" />
          {walletsShown ? (
            <p className="my-2 text-center text-[11px] uppercase tracking-wider text-white/50">
              or pay by card
            </p>
          ) : null}
          <div id="stripe-payment-element" className={walletsShown ? "" : "mt-3"} />

          {message ? (
            <p role="alert" className="mt-2 text-sm text-red-300">
              {message}
            </p>
          ) : null}

          {view !== "loading" ? (
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
