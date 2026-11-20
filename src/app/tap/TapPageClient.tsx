"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  CarFront,
  Contact,
  Heart,
  MessageCircle,
  Star,
  type LucideIcon,
} from "lucide-react";
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
  TAP_SUBHEADING_LINES,
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
  "tap-action group flex min-h-12 w-full items-center gap-3 rounded-2xl border border-white/90 bg-white px-4 py-3 text-left shadow-[0_8px_28px_rgba(0,0,0,0.22)] transition duration-300 hover:border-emerald hover:shadow-[0_10px_32px_rgba(47,191,74,0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald active:scale-[0.99]";

function ActionIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      aria-hidden
      className="tap-action-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#071c38]/[0.06]"
    >
      <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.25} />
    </span>
  );
}

function ActionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="tap-action-label flex-1 text-[0.8125rem] font-bold uppercase tracking-[0.055em] sm:text-sm">
      {children}
    </span>
  );
}

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
    <main data-tap-page className="relative min-h-screen overflow-hidden bg-[#071C38] text-white">
      <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-8 pt-6 sm:px-5 sm:pb-10 sm:pt-8">
        <header className="tap-fade flex flex-col items-center text-center">
          <Logo wide theme="dark" className="h-10 w-auto sm:h-11" priority />
        </header>

        {screen === "home" ? (
          <section className="tap-rise mt-5 flex flex-1 flex-col sm:mt-7">
            <h1 className="tap-heading mx-auto max-w-[18.5rem] text-center text-[1.55rem] font-semibold leading-[1.18] sm:max-w-[22rem] sm:text-[1.95rem] sm:leading-[1.14]">
              {TAP_HEADING}
            </h1>
            <p className="tap-subhead mx-auto mt-3 max-w-[20rem] text-center text-[0.98rem] leading-snug sm:mt-3.5 sm:max-w-[22rem] sm:text-[1.02rem]">
              {TAP_SUBHEADING_LINES.map((line) => (
                <span key={line} className="tap-subhead-line">
                  {line}
                </span>
              ))}
            </p>

            <div className="mt-5 space-y-2.5 sm:mt-7 sm:space-y-3">
              <a
                href={TAP_GOOGLE_REVIEW_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-tap-action="review"
                className={actionClass}
                onClick={() => trackConsented("review_click")}
              >
                <ActionIcon icon={Star} />
                <ActionLabel>Leave a Google Review</ActionLabel>
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
                <ActionIcon icon={Heart} />
                <ActionLabel>Leave a Tip</ActionLabel>
              </button>

              <a
                href={TAP_CONTACT_VCARD_HREF}
                download="My-Airport-Taxi-NI.vcf"
                data-tap-action="contact"
                className={actionClass}
                onClick={() => trackConsented("contact_click")}
              >
                <ActionIcon icon={Contact} />
                <ActionLabel>Save Our Contact</ActionLabel>
              </a>

              <Link
                href={TAP_BOOK_HREF}
                data-tap-action="book"
                className={actionClass}
                onClick={() => trackConsented("book_click")}
              >
                <ActionIcon icon={CarFront} />
                <ActionLabel>Book Your Next Journey</ActionLabel>
              </Link>

              <a
                href={tapWhatsAppHref()}
                target="_blank"
                rel="noopener noreferrer"
                data-tap-action="whatsapp"
                className={actionClass}
                onClick={() => trackConsented("whatsapp_click")}
              >
                <ActionIcon icon={MessageCircle} />
                <ActionLabel>WhatsApp Us</ActionLabel>
              </a>
            </div>
          </section>
        ) : null}

        {screen === "tip" ? (
          <section className="tap-rise mt-5 flex flex-1 flex-col sm:mt-7">
            <button
              type="button"
              onClick={() => {
                setScreen("home");
                setConfirmAmount(null);
                setAmountError("");
              }}
              className="tap-back mb-3 self-start text-sm font-semibold transition sm:mb-4"
            >
              ← Back
            </button>

            <div className="tap-tip-card rounded-2xl border p-4 shadow-[0_16px_50px_rgba(0,0,0,0.35)] sm:p-6">
              {tipView.kind === "paid" ? (
                <div className="space-y-3 text-center">
                  <h2 className="font-display text-3xl font-semibold text-white">Thank you</h2>
                  <p className="text-lg font-semibold text-emerald">
                    Your {formatTipGbp(tipView.amountGbp)} tip has been received.
                  </p>
                  <p className="tap-support text-sm leading-relaxed">{TIP_PAGE_THANKS}</p>
                </div>
              ) : null}

              {tipView.kind === "error" ? (
                <div className="space-y-2 text-center">
                  <h2 className="font-display text-2xl font-semibold text-white">Tip</h2>
                  <p className="tap-support text-sm">{tipView.message}</p>
                </div>
              ) : null}

              {tipView.kind === "form" ? (
                <div className="space-y-4 sm:space-y-5">
                  <div className="space-y-2 text-center">
                    <h2 className="font-display text-3xl font-semibold text-white">Leave a tip</h2>
                    <p className="tap-support text-sm leading-relaxed">
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
                          className={`tap-tip-amount min-h-12 rounded-xl border text-base font-bold transition ${
                            active ? "tap-tip-amount-active" : ""
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
                    className={`tap-tip-amount min-h-12 w-full rounded-xl border text-base font-bold transition ${
                      selected === "other" ? "tap-tip-amount-active" : ""
                    }`}
                  >
                    Custom amount
                  </button>

                  {selected === "other" ? (
                    <label className="block space-y-1.5">
                      <span className="tap-support text-sm font-medium">Amount in pounds</span>
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
                        className="tap-tip-input min-h-12 w-full rounded-xl border px-4 text-base outline-none"
                      />
                      {customAmount.trim() && customParsed && !customParsed.ok ? (
                        <span className="block text-sm text-amber-100">{customParsed.error}</span>
                      ) : null}
                    </label>
                  ) : null}

                  {chosenAmount != null ? (
                    <p className="tap-support text-center text-sm">
                      Selected tip:{" "}
                      <span className="tap-tip-selected font-bold">{formatTipGbp(chosenAmount)}</span>
                    </p>
                  ) : null}

                  {amountError ? <p className="text-sm text-amber-100">{amountError}</p> : null}

                  {chosenAmount != null && confirmAmount !== chosenAmount ? (
                    <button
                      type="button"
                      data-tap-tip-confirm
                      onClick={() => setConfirmAmount(chosenAmount)}
                      className="tap-tip-confirm min-h-12 w-full rounded-xl px-4 py-3 text-base font-bold"
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
                        className="tap-tip-pay min-h-12 w-full rounded-xl px-4 py-3 text-base font-bold disabled:opacity-60"
                      >
                        {submitting
                          ? "Opening secure payment…"
                          : leaveTipButtonLabel(chosenAmount)}
                      </button>
                      <p className="tap-support text-center text-xs">
                        Secure card payment · Apple Pay &amp; Google Pay where available
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <footer className="tap-fade mt-auto pt-7 text-center sm:pt-10">
          <a
            href={SITE.url}
            className="tap-footer-link text-xs font-medium transition hover:text-emerald"
          >
            {TAP_PUBLIC_URL.replace(/^https:\/\//, "")}
          </a>
        </footer>
      </div>
    </main>
  );
}
