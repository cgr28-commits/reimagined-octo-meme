"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import {
  formatTipGbp,
  isOpaqueTipToken,
  leaveTipButtonLabel,
  parseTipAmountGbp,
  TIP_PAGE_THANKS,
} from "../../../shared/journey-tip";
import {
  TAP_BOOK_HREF,
  TAP_CONTACT_VCARD_HREF,
  TAP_GOOGLE_REVIEW_URL,
  TAP_HEADING,
  TAP_PUBLIC_URL,
  TAP_SUBHEADING,
  TAP_TIP_PRESET_AMOUNTS_GBP,
  TAP_TIP_TOKEN_STORAGE_KEY,
  tapWhatsAppHref,
} from "../../../shared/tap-page";
import { SITE } from "@/lib/data";
import { hasMarketingCookieConsent } from "@/lib/cookie-consent";
import { createTapTipCheckout, fetchTapTipStatus, trackTapEvent } from "@/lib/tap-api";

type Screen = "home" | "tip";
type TipView =
  | { kind: "form"; paymentNotCompleted?: boolean }
  | { kind: "paid"; amountGbp: number }
  | { kind: "error"; message: string };

function readStoredTipToken(): string {
  try {
    return window.sessionStorage.getItem(TAP_TIP_TOKEN_STORAGE_KEY)?.trim().toLowerCase() ?? "";
  } catch {
    return "";
  }
}

function rememberTipToken(token: string) {
  try {
    if (token) window.sessionStorage.setItem(TAP_TIP_TOKEN_STORAGE_KEY, token);
  } catch {
    // Private mode may block storage.
  }
}

function takeTipTokenFromLocation(): string {
  const params = new URLSearchParams(window.location.search);
  const had = params.has("tip");
  const fromUrl = params.get("tip")?.trim().toLowerCase() ?? "";
  if (window.location.search) {
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.hash}`,
    );
  }
  if (had) {
    if (!isOpaqueTipToken(fromUrl)) return "";
    rememberTipToken(fromUrl);
    return fromUrl;
  }
  const stored = readStoredTipToken();
  return isOpaqueTipToken(stored) ? stored : "";
}

function trackConsented(event: Parameters<typeof trackTapEvent>[0]) {
  trackTapEvent(event);
  if (!hasMarketingCookieConsent()) return;
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: `tap_${event}` });
  } catch {
    // Ignore analytics failures.
  }
}

const actionClass =
  "group flex min-h-[3.5rem] w-full items-center gap-3 rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3.5 text-left shadow-[0_10px_40px_rgba(0,0,0,0.25)] transition duration-300 hover:border-emerald/50 hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald active:scale-[0.99]";

export default function TapPageClient() {
  const [screen, setScreen] = useState<Screen>("home");
  const [tipToken, setTipToken] = useState("");
  const [tipView, setTipView] = useState<TipView>({ kind: "form" });
  const [selected, setSelected] = useState<(typeof TAP_TIP_PRESET_AMOUNTS_GBP)[number] | "other" | null>(
    null,
  );
  const [customAmount, setCustomAmount] = useState("");
  const [amountError, setAmountError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmAmount, setConfirmAmount] = useState<number | null>(null);

  useLayoutEffect(() => {
    const token = takeTipTokenFromLocation();
    if (!token) return;
    setTipToken(token);
    setScreen("tip");
    setTipView({ kind: "form" });
    let cancelled = false;
    void fetchTapTipStatus(token).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setTipView({ kind: "error", message: result.error });
        return;
      }
      if (result.state === "paid") {
        setTipView({ kind: "paid", amountGbp: result.amountGbp });
        return;
      }
      setTipView({
        kind: "form",
        paymentNotCompleted: Boolean(result.paymentNotCompleted),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    trackConsented("visit");
  }, []);

  const customParsed = selected === "other" ? parseTipAmountGbp(customAmount) : null;
  const chosenAmount =
    typeof selected === "number"
      ? selected
      : customParsed?.ok
        ? customParsed.amountGbp
        : null;

  async function startPayment(amountGbp: number) {
    if (submitting) return;
    setAmountError("");
    setSubmitting(true);
    try {
      const result = await createTapTipCheckout(amountGbp, tipToken || undefined);
      if (!result.ok) {
        setAmountError(result.error);
        return;
      }
      if (result.tipToken) {
        rememberTipToken(result.tipToken);
        setTipToken(result.tipToken);
      }
      if (result.state === "paid") {
        setTipView({ kind: "paid", amountGbp: result.amountGbp });
        setConfirmAmount(null);
        return;
      }
      if (result.paymentInProgress) {
        setAmountError(
          result.message ||
            "A tip payment is already in progress. Finish that payment before choosing another amount.",
        );
        return;
      }
      if (result.paymentUrl) {
        window.location.assign(result.paymentUrl);
        return;
      }
      setAmountError("Could not start the tip payment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      data-tap-page
      className="relative min-h-screen overflow-hidden bg-[#090B10] text-white"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(47,191,74,0.16),_transparent_55%),radial-gradient(ellipse_at_bottom,_rgba(7,28,56,0.9),_#090B10_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald/50 to-transparent"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-10 pt-8 sm:px-5">
        <header className="tap-fade flex flex-col items-center text-center">
          <Logo wide theme="dark" className="h-10 w-auto sm:h-11" priority />
          <p className="mt-5 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-emerald">
            {SITE.name}
          </p>
        </header>

        {screen === "home" ? (
          <section className="tap-rise mt-8 flex flex-1 flex-col">
            <h1 className="font-display text-center text-[1.85rem] font-semibold leading-[1.15] tracking-tight text-white sm:text-[2.15rem]">
              {TAP_HEADING}
            </h1>
            <p className="mx-auto mt-3 max-w-[22rem] text-center text-[0.95rem] leading-relaxed text-white/70">
              {TAP_SUBHEADING}
            </p>

            <div className="mt-8 space-y-3">
              <a
                href={TAP_GOOGLE_REVIEW_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-tap-action="review"
                className={actionClass}
                onClick={() => trackConsented("review_click")}
              >
                <span aria-hidden className="text-xl">
                  ⭐
                </span>
                <span className="flex-1 text-sm font-bold uppercase tracking-[0.06em]">
                  Leave a Google Review
                </span>
              </a>

              <button
                type="button"
                data-tap-action="tip"
                className={actionClass}
                onClick={() => {
                  trackConsented("tip_open");
                  setScreen("tip");
                  setTipView({ kind: "form" });
                  setConfirmAmount(null);
                  setAmountError("");
                }}
              >
                <span aria-hidden className="text-xl">
                  💚
                </span>
                <span className="flex-1 text-sm font-bold uppercase tracking-[0.06em]">
                  Leave a Tip
                </span>
              </button>

              <a
                href={TAP_CONTACT_VCARD_HREF}
                download="My-Airport-Taxi-NI.vcf"
                data-tap-action="contact"
                className={actionClass}
                onClick={() => trackConsented("contact_click")}
              >
                <span aria-hidden className="text-xl">
                  📱
                </span>
                <span className="flex-1 text-sm font-bold uppercase tracking-[0.06em]">
                  Save Our Contact
                </span>
              </a>
              <p className="px-1 text-center text-[0.7rem] leading-snug text-white/45">
                Opens a contact card — confirm Save on your phone to add us.
              </p>

              <Link
                href={TAP_BOOK_HREF}
                data-tap-action="book"
                className={actionClass}
                onClick={() => trackConsented("book_click")}
              >
                <span aria-hidden className="text-xl">
                  🚘
                </span>
                <span className="flex-1 text-sm font-bold uppercase tracking-[0.06em]">
                  Book Your Next Journey
                </span>
              </Link>

              <a
                href={tapWhatsAppHref()}
                target="_blank"
                rel="noopener noreferrer"
                data-tap-action="whatsapp"
                className={actionClass}
                onClick={() => trackConsented("whatsapp_click")}
              >
                <span aria-hidden className="text-xl">
                  💬
                </span>
                <span className="flex-1 text-sm font-bold uppercase tracking-[0.06em]">
                  WhatsApp Us
                </span>
              </a>
            </div>
          </section>
        ) : null}

        {screen === "tip" ? (
          <section className="tap-rise mt-8 flex flex-1 flex-col">
            <button
              type="button"
              onClick={() => {
                setScreen("home");
                setConfirmAmount(null);
                setAmountError("");
              }}
              className="mb-4 self-start text-sm font-semibold text-white/60 transition hover:text-emerald"
            >
              ← Back
            </button>

            <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.35)] sm:p-6">
              {tipView.kind === "paid" ? (
                <div className="space-y-3 text-center">
                  <h2 className="font-display text-3xl font-semibold text-white">Thank you</h2>
                  <p className="text-lg font-semibold text-emerald">
                    Your {formatTipGbp(tipView.amountGbp)} tip has been received.
                  </p>
                  <p className="text-sm leading-relaxed text-white/75">{TIP_PAGE_THANKS}</p>
                </div>
              ) : null}

              {tipView.kind === "error" ? (
                <div className="space-y-2 text-center">
                  <h2 className="font-display text-2xl font-semibold text-white">Tip</h2>
                  <p className="text-sm text-white/75">{tipView.message}</p>
                </div>
              ) : null}

              {tipView.kind === "form" ? (
                <div className="space-y-5">
                  <div className="space-y-2 text-center">
                    <h2 className="font-display text-3xl font-semibold text-white">Leave a tip</h2>
                    <p className="text-sm leading-relaxed text-white/70">
                      Tips are never expected, but always appreciated. Choose an amount to say thank
                      you.
                    </p>
                  </div>

                  {tipView.paymentNotCompleted ? (
                    <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                      Payment was not completed. You can try again if you still want to leave a tip.
                    </p>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2">
                    {TAP_TIP_PRESET_AMOUNTS_GBP.map((amount) => {
                      const active = selected === amount;
                      return (
                        <button
                          key={amount}
                          type="button"
                          data-tap-tip-amount={amount}
                          onClick={() => {
                            setSelected(amount);
                            setConfirmAmount(null);
                            setAmountError("");
                          }}
                          className={`min-h-12 rounded-xl border text-base font-bold transition ${
                            active
                              ? "border-emerald bg-emerald text-navy"
                              : "border-white/20 bg-white/5 text-white hover:border-white/40"
                          }`}
                        >
                          {formatTipGbp(amount)}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    data-tap-tip-amount="other"
                    onClick={() => {
                      setSelected("other");
                      setConfirmAmount(null);
                      setAmountError("");
                    }}
                    className={`min-h-12 w-full rounded-xl border text-base font-bold transition ${
                      selected === "other"
                        ? "border-emerald bg-emerald text-navy"
                        : "border-white/20 bg-white/5 text-white hover:border-white/40"
                    }`}
                  >
                    Custom amount
                  </button>

                  {selected === "other" ? (
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium text-white/80">Amount in pounds</span>
                      <input
                        inputMode="decimal"
                        autoComplete="off"
                        value={customAmount}
                        onChange={(event) => {
                          setCustomAmount(event.target.value);
                          setConfirmAmount(null);
                          setAmountError("");
                        }}
                        placeholder="e.g. 7.50"
                        className="min-h-12 w-full rounded-xl border border-white/25 bg-white/10 px-4 text-base text-white outline-none placeholder:text-white/40 focus:border-emerald"
                      />
                      {customAmount.trim() && customParsed && !customParsed.ok ? (
                        <span className="block text-sm text-amber-100">{customParsed.error}</span>
                      ) : null}
                    </label>
                  ) : null}

                  {chosenAmount != null ? (
                    <p className="text-center text-sm text-white/80">
                      Selected tip:{" "}
                      <span className="font-bold text-emerald">{formatTipGbp(chosenAmount)}</span>
                    </p>
                  ) : null}

                  {amountError ? <p className="text-sm text-amber-100">{amountError}</p> : null}

                  {chosenAmount != null && confirmAmount !== chosenAmount ? (
                    <button
                      type="button"
                      data-tap-tip-confirm
                      onClick={() => setConfirmAmount(chosenAmount)}
                      className="min-h-12 w-full rounded-xl border border-emerald/60 bg-emerald/15 px-4 py-3 text-base font-bold text-emerald"
                    >
                      Confirm {formatTipGbp(chosenAmount)} tip
                    </button>
                  ) : null}

                  {chosenAmount != null && confirmAmount === chosenAmount ? (
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={submitting}
                        data-tap-tip-pay={chosenAmount}
                        onClick={() => void startPayment(chosenAmount)}
                        className="min-h-12 w-full rounded-xl bg-emerald px-4 py-3 text-base font-bold text-navy disabled:opacity-60"
                      >
                        {submitting
                          ? "Opening secure payment…"
                          : leaveTipButtonLabel(chosenAmount)}
                      </button>
                      <p className="text-center text-xs text-white/55">
                        Secure card payment · Apple Pay &amp; Google Pay where available
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <footer className="tap-fade mt-auto pt-10 text-center">
          <a
            href={SITE.url}
            className="text-xs font-medium text-white/45 transition hover:text-emerald"
          >
            {TAP_PUBLIC_URL.replace(/^https:\/\//, "")}
          </a>
          <p className="mt-2 text-[0.65rem] uppercase tracking-[0.18em] text-white/30">
            My Airport Taxi NI
          </p>
        </footer>
      </div>
    </main>
  );
}
