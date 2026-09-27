"use client";

import { useLayoutEffect, useState } from "react";
import {
  formatTipGbp,
  isOpaqueTipToken,
  leaveTipButtonLabel,
  parseTipAmountGbp,
  TIP_LINK_INVALID_MESSAGE,
  TIP_PAGE_THANKS,
  TIP_PRESET_AMOUNTS_GBP,
  TIP_TOKEN_STORAGE_KEY,
} from "../../../shared/journey-tip";
import { createTipCheckout, fetchTipStatus } from "@/lib/journey-tip-api";

type View =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "error"; message: string }
  | { kind: "open"; paymentNotCompleted: boolean }
  | { kind: "paid"; amountGbp: number };

function readStoredToken(): string {
  try {
    return window.sessionStorage.getItem(TIP_TOKEN_STORAGE_KEY)?.trim().toLowerCase() ?? "";
  } catch {
    return "";
  }
}

function rememberToken(token: string) {
  try {
    if (token) window.sessionStorage.setItem(TIP_TOKEN_STORAGE_KEY, token);
  } catch {
    // Private mode can block storage. The in-memory token still works for this view.
  }
}

/** Take ?t= off the URL so analytics and referrers do not keep the token. */
function takeTipTokenFromLocation(): string {
  const params = new URLSearchParams(window.location.search);
  const hadTokenParam = params.has("t");
  const fromUrl = params.get("t")?.trim().toLowerCase() ?? "";
  if (window.location.search) {
    const clean = `${window.location.pathname}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", clean);
  }
  if (hadTokenParam) {
    if (!isOpaqueTipToken(fromUrl)) return "";
    rememberToken(fromUrl);
    return fromUrl;
  }
  const stored = readStoredToken();
  return isOpaqueTipToken(stored) ? stored : "";
}

export default function TipPageClient() {
  const [token, setToken] = useState("");
  const [view, setView] = useState<View>({ kind: "loading" });
  const [selected, setSelected] = useState<(typeof TIP_PRESET_AMOUNTS_GBP)[number] | "other" | null>(
    null,
  );
  const [customAmount, setCustomAmount] = useState("");
  const [amountError, setAmountError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useLayoutEffect(() => {
    const nextToken = takeTipTokenFromLocation();
    setToken(nextToken);
    if (!nextToken) {
      setView({ kind: "invalid" });
      return;
    }
    let cancelled = false;
    void fetchTipStatus(nextToken).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setView(
          result.error === TIP_LINK_INVALID_MESSAGE
            ? { kind: "invalid" }
            : { kind: "error", message: result.error },
        );
        return;
      }
      if (result.state === "paid") {
        setView({ kind: "paid", amountGbp: result.amountGbp });
        return;
      }
      setView({ kind: "open", paymentNotCompleted: Boolean(result.paymentNotCompleted) });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const customParsed = selected === "other" ? parseTipAmountGbp(customAmount) : null;
  const chosenAmount =
    typeof selected === "number"
      ? selected
      : customParsed?.ok
        ? customParsed.amountGbp
        : null;

  async function startPayment() {
    if (!token || chosenAmount == null || submitting) return;
    setAmountError("");
    setSubmitting(true);
    try {
      const result = await createTipCheckout(token, chosenAmount);
      if (!result.ok) {
        if (result.error === TIP_LINK_INVALID_MESSAGE) {
          setView({ kind: "invalid" });
        } else {
          setAmountError(result.error);
        }
        return;
      }
      if (result.state === "paid") {
        setView({ kind: "paid", amountGbp: result.amountGbp });
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
    <main className="min-h-screen bg-navy text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-8 sm:py-12">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-emerald">
          My Airport Taxi NI
        </p>
        <div className="mt-6 rounded-2xl border border-white/15 bg-white/[0.06] p-5 shadow-soft sm:p-6">
          {view.kind === "loading" ? (
            <p className="text-center text-sm text-white/70">Loading…</p>
          ) : null}

          {view.kind === "invalid" ? (
            <div className="space-y-2 text-center">
              <h1 className="font-display text-3xl font-semibold text-white">Tip link</h1>
              <p className="text-sm leading-relaxed text-white/75">{TIP_LINK_INVALID_MESSAGE}</p>
            </div>
          ) : null}

          {view.kind === "error" ? (
            <div className="space-y-2 text-center">
              <h1 className="font-display text-3xl font-semibold text-white">Tip link</h1>
              <p className="text-sm leading-relaxed text-white/75">{view.message}</p>
            </div>
          ) : null}

          {view.kind === "paid" ? (
            <div className="space-y-3 text-center">
              <h1 className="font-display text-4xl font-semibold text-white">Thank you</h1>
              <p className="text-lg font-semibold text-emerald">
                Your {formatTipGbp(view.amountGbp)} tip has been received.
              </p>
              <p className="text-sm leading-relaxed text-white/75">{TIP_PAGE_THANKS}</p>
              <p className="text-sm text-white/60">This tip has already been received.</p>
            </div>
          ) : null}

          {view.kind === "open" ? (
            <div className="space-y-5">
              <div className="space-y-2 text-center">
                <h1 className="font-display text-3xl font-semibold leading-tight text-white">
                  Thank you for travelling with us
                </h1>
                <p className="text-base font-medium text-white/90">
                  Would you like to leave your driver a tip?
                </p>
                <p className="text-sm leading-relaxed text-white/65">
                  Tips are completely optional and greatly appreciated.
                </p>
              </div>

              {view.paymentNotCompleted ? (
                <p className="rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm leading-relaxed text-amber-100">
                  Payment was not completed. You can try again if you still want to leave an optional tip.
                </p>
              ) : null}

              <div className="grid grid-cols-3 gap-2">
                {TIP_PRESET_AMOUNTS_GBP.map((amount) => {
                  const active = selected === amount;
                  return (
                    <button
                      key={amount}
                      type="button"
                      data-tip-amount={amount}
                      onClick={() => {
                        setSelected(amount);
                        setAmountError("");
                      }}
                      className={`min-h-12 rounded-xl border text-base font-bold transition-colors ${
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
                data-tip-amount="other"
                onClick={() => {
                  setSelected("other");
                  setAmountError("");
                }}
                className={`min-h-12 w-full rounded-xl border text-base font-bold transition-colors ${
                  selected === "other"
                    ? "border-emerald bg-emerald text-navy"
                    : "border-white/20 bg-white/5 text-white hover:border-white/40"
                }`}
              >
                Other amount
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

              {amountError ? <p className="text-sm text-amber-100">{amountError}</p> : null}

              {chosenAmount != null ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={submitting}
                    data-tip-pay={chosenAmount}
                    onClick={() => void startPayment()}
                    className="min-h-12 w-full rounded-xl bg-emerald px-4 py-3 text-base font-bold text-navy disabled:opacity-60"
                  >
                    {submitting ? "Opening secure payment…" : leaveTipButtonLabel(chosenAmount)}
                  </button>
                  <p className="text-center text-xs text-white/55">Secure payment powered by SumUp</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
