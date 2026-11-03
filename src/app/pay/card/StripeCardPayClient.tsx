"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Logo from "@/components/Logo";
import { SITE } from "@/lib/data";
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

  async function confirmPayment() {
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
      const result = await loaded.actions.confirm();
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
          window.location.replace(confirmedUrl(checkoutId));
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
                borderRadius: "12px",
                spacingUnit: "4px",
              },
              rules: {
                ".Input": { border: "1px solid rgba(255, 255, 255, 0.15)", boxShadow: "none" },
                ".Input:focus": { border: "1px solid #2fbf4a", boxShadow: "0 0 0 1px #2fbf4a" },
                ".Tab": { border: "1px solid rgba(255, 255, 255, 0.15)", backgroundColor: "#071c38" },
                ".Tab--selected": { borderColor: "#2fbf4a", backgroundColor: "#0c2a52" },
                ".Label": { color: "#b5c0cd", fontWeight: "600" },
              },
            },
          },
        });
        checkoutRef.current = checkout;

        const express = checkout.createExpressCheckoutElement({
          buttonHeight: 48,
        buttonTheme: { applePay: "white-outline", googlePay: "white" },
          layout: { maxColumns: 1, maxRows: 3 },
        });
        express.on("ready", (event) => {
          const methods = event.availablePaymentMethods as Record<string, boolean> | undefined;
          setWalletsShown(Boolean(methods && Object.values(methods).some(Boolean)));
        });
        express.on("confirm", () => {
          void confirmPayment();
        });
        express.mount("#stripe-express-checkout");

        const payment = checkout.createPaymentElement({ layout: "tabs" });
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
      className="rounded-3xl border border-white/15 bg-white/[0.04] p-6 text-white sm:p-8"
    >
      {showForm ? (
        <>
          <div className="mb-5 flex justify-center">
            <Logo className="h-14" />
          </div>
          <h1 className="text-2xl font-bold">Secure card payment</h1>
          {amountLabel ? (
            <p className="mt-2 text-lg text-white/90">
              {info?.cardHold ? "Amount to authorise" : "Amount to pay"}:{" "}
              <span className="font-semibold text-white">{amountLabel}</span>
            </p>
          ) : null}
          {info?.reference ? (
            <p className="mt-1 text-sm text-white/70">Booking reference: {info.reference}</p>
          ) : null}
          {info?.cardHold ? (
            <p className="mt-4 rounded-2xl border border-emerald/40 bg-emerald/10 p-3 text-sm leading-relaxed text-white/90">
              Your card is authorised now to secure the booking, and charged after your journey.
              If you cancel 24 hours or more before pickup, the hold is released and you pay nothing.
            </p>
          ) : null}

          {view === "loading" ? (
            <p className="mt-6 text-sm text-white/70">Loading secure payment…</p>
          ) : null}

          <div id="stripe-express-checkout" className="mt-6" />
          {walletsShown ? (
            <p className="my-4 text-center text-xs uppercase tracking-wider text-white/50">
              or pay by card
            </p>
          ) : null}
          <div id="stripe-payment-element" className={walletsShown ? "" : "mt-6"} />

          {message ? (
            <p role="alert" className="mt-4 text-sm text-red-300">
              {message}
            </p>
          ) : null}

          {view !== "loading" ? (
            <button
              type="button"
              className="btn-primary mt-6 w-full justify-center"
              disabled={view === "paying"}
              onClick={() => void confirmPayment()}
            >
              {view === "paying"
                ? "Processing…"
                : `${info?.cardHold ? "Authorise" : "Pay"}${amountLabel ? ` ${amountLabel}` : ""}`}
            </button>
          ) : null}
          <p className="mt-4 text-xs text-white/60">
            Payments are processed securely by Stripe. We never see or store your card details.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">
            {view === "expired"
              ? "This payment link has expired"
              : view === "invalid"
                ? "We couldn't open this payment link"
                : "Card payment isn't available right now"}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-white/85">
            {view === "expired"
              ? "Payment links last 24 hours. Please get a new quote on our website, or contact us and we'll send you a fresh link."
              : message || "Please try again in a few minutes, or contact us and we'll help."}
          </p>
          <Link href="/" className="btn-primary mt-6 inline-flex">
            Back to home
          </Link>
        </>
      )}
      <p className="mt-6 text-sm text-white/70">
        Questions? Call or WhatsApp {SITE.landlineDisplay}, or ring {SITE.officeLandlineDisplay}.
      </p>
    </section>
  );
}
