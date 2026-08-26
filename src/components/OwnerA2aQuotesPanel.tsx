"use client";

import { useCallback, useEffect, useState } from "react";
import {
  A2A_QUOTE_VALIDITY_DEFAULT_MINUTES,
  A2A_QUOTE_VALIDITY_MAX_MINUTES,
  A2A_QUOTE_VALIDITY_MIN_MINUTES,
  A2A_QUOTE_VALIDITY_PRESETS_MINUTES,
  buildA2aPickupValidityWarning,
} from "../../shared/a2a-personalised-quote";
import { parseLondonLocalDateTime } from "../../shared/uk-time";
import {
  approveOwnerA2aQuote,
  fetchOwnerA2aQuotes,
  resendOwnerA2aPaymentEmail,
  type A2aQuoteOwnerFilter,
  type A2aQuoteOwnerSummary,
} from "@/lib/a2a-quote-api";

type OwnerA2aQuotesPanelProps = {
  ownerKey: string;
};

const FILTERS: Array<{ id: A2aQuoteOwnerFilter; label: string }> = [
  { id: "awaiting", label: "Awaiting" },
  { id: "approved", label: "Approved / Waiting Payment" },
  { id: "paid", label: "Paid" },
  { id: "expired", label: "Expired / Cancelled" },
  { id: "history", label: "History" },
  { id: "all", label: "All" },
];

function parseMoney(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function parseMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < A2A_QUOTE_VALIDITY_MIN_MINUTES || n > A2A_QUOTE_VALIDITY_MAX_MINUTES) {
    return null;
  }
  return n;
}

function minutesUntilPickup(tripDate: string, tripTime: string, now = new Date()): number | null {
  const pickup = parseLondonLocalDateTime(tripDate, tripTime);
  if (!pickup) return null;
  return (pickup.getTime() - now.getTime()) / (60 * 1000);
}

function formatExpires(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London" });
  } catch {
    return iso;
  }
}

export default function OwnerA2aQuotesPanel({ ownerKey }: OwnerA2aQuotesPanelProps) {
  const [filter, setFilter] = useState<A2aQuoteOwnerFilter>("awaiting");
  const [quotes, setQuotes] = useState<A2aQuoteOwnerSummary[]>([]);
  const [awaitingCount, setAwaitingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [priceByRef, setPriceByRef] = useState<Record<string, string>>({});
  const [validityByRef, setValidityByRef] = useState<Record<string, string>>({});
  const [approvingRef, setApprovingRef] = useState<string | null>(null);
  const [resendingRef, setResendingRef] = useState<string | null>(null);
  const [emailFailedByRef, setEmailFailedByRef] = useState<Record<string, string>>({});

  const fieldClass =
    "box-border mt-1 block min-h-11 w-full min-w-0 max-w-full rounded-xl border border-white/15 bg-navy/60 px-3 py-2.5 text-base text-white outline-none focus:border-emerald [color-scheme:dark]";

  const load = useCallback(
    async (nextFilter: A2aQuoteOwnerFilter = filter) => {
      setLoading(true);
      setError("");
      try {
        const result = await fetchOwnerA2aQuotes(ownerKey, nextFilter);
        setQuotes(result.quotes);
        setAwaitingCount(result.awaitingCount);
        setValidityByRef((prev) => {
          const next = { ...prev };
          for (const q of result.quotes) {
            if (!next[q.reference]) {
              next[q.reference] = String(A2A_QUOTE_VALIDITY_DEFAULT_MINUTES);
            }
          }
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load quote requests");
      } finally {
        setLoading(false);
      }
    },
    [filter, ownerKey],
  );

  useEffect(() => {
    void load(filter);
  }, [load, filter]);

  async function handleApprove(quote: A2aQuoteOwnerSummary) {
    const quotedPrice = parseMoney(priceByRef[quote.reference] ?? "");
    const validityMinutes = parseMinutes(
      validityByRef[quote.reference] ?? String(A2A_QUOTE_VALIDITY_DEFAULT_MINUTES),
    );
    if (quotedPrice == null || quotedPrice < 1) {
      setError("Enter a Quote Price (£) before approving.");
      return;
    }
    if (validityMinutes == null) {
      setError(
        `Enter validity in whole minutes (${A2A_QUOTE_VALIDITY_MIN_MINUTES}–${A2A_QUOTE_VALIDITY_MAX_MINUTES}). Examples: 5, 10, 15, 30, or 60.`,
      );
      return;
    }

    setApprovingRef(quote.reference);
    setError("");
    setMessage("");
    try {
      const result = await approveOwnerA2aQuote(ownerKey, {
        reference: quote.reference,
        quotedPrice,
        validityMinutes,
      });
      if (result.paymentEmailSent) {
        setEmailFailedByRef((prev) => {
          const next = { ...prev };
          delete next[quote.reference];
          return next;
        });
        setMessage(
          `Approved ${result.record.reference} at ${result.record.quotedPriceLabel} — valid ${result.record.quoteValidityLabel}. Payment email sent.`,
        );
      } else {
        const failText = result.paymentEmailError || "Email provider did not accept the message.";
        setEmailFailedByRef((prev) => ({ ...prev, [quote.reference]: failText }));
        setMessage(
          `Approved ${result.record.reference} at ${result.record.quotedPriceLabel} — quote saved, but payment email failed. Use Resend payment email.`,
        );
        setError(`Email failed — ${failText}`);
      }
      // Approved quotes leave the default awaiting queue.
      if (filter === "awaiting") {
        await load("awaiting");
      } else {
        await load(filter);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve quote");
    } finally {
      setApprovingRef(null);
    }
  }

  async function handleResend(quote: A2aQuoteOwnerSummary) {
    setResendingRef(quote.reference);
    setError("");
    setMessage("");
    try {
      const result = await resendOwnerA2aPaymentEmail(ownerKey, quote.reference);
      setEmailFailedByRef((prev) => {
        const next = { ...prev };
        delete next[quote.reference];
        return next;
      });
      setMessage(`Payment email resent to ${result.record.customerEmail}.`);
      await load(filter);
    } catch (err) {
      const failText = err instanceof Error ? err.message : "Could not resend payment email";
      setEmailFailedByRef((prev) => ({ ...prev, [quote.reference]: failText }));
      setError(`Email failed — ${failText}`);
    } finally {
      setResendingRef(null);
    }
  }

  function showApproveForm(quote: A2aQuoteOwnerSummary): boolean {
    return quote.status === "AWAITING_QUOTE";
  }

  function showPaymentActions(quote: A2aQuoteOwnerSummary): boolean {
    return quote.status === "QUOTE_APPROVED_AWAITING_PAYMENT";
  }

  function emailFailed(quote: A2aQuoteOwnerSummary): boolean {
    if (emailFailedByRef[quote.reference]) return true;
    return (
      showPaymentActions(quote) &&
      !quote.paymentLinkEmailSentAt &&
      Boolean(quote.quotedPrice)
    );
  }

  return (
    <section className="mb-8 w-full min-w-0 max-w-full rounded-2xl border border-white/10 bg-navy/40">
      <div className="w-full min-w-0 max-w-full border-b border-white/10 px-4 py-4 sm:px-5">
        <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-lg font-semibold text-white">
              Personalised Quotes — {awaitingCount} awaiting approval
            </h2>
            <p className="mt-1 break-words text-sm text-white/65">
              Enter Quote Price (£), choose how long the customer has to pay, then Approve Quote.
              Payment email is only marked sent after the email provider accepts it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFilter(filter === "history" ? "awaiting" : "history");
            }}
            className="min-h-10 shrink-0 rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold text-white/85 hover:bg-white/10"
          >
            {filter === "history" || filter === "all" ? "Back to queue" : "History / Approved"}
          </button>
        </div>

        <div className="mt-3 flex w-full min-w-0 max-w-full flex-wrap gap-1.5">
          {FILTERS.map((item) => {
            const selected = filter === item.id || (item.id === "expired" && filter === "cancelled");
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`min-h-9 max-w-full break-words rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                  selected
                    ? "bg-emerald text-navy"
                    : "border border-white/15 bg-navy/50 text-white/80 hover:bg-white/10"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="w-full min-w-0 max-w-full space-y-4 px-4 py-4 sm:px-5">
        {error ? (
          <p className="break-words rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="break-words rounded-xl border border-emerald/30 bg-emerald/10 px-3 py-2 text-sm text-emerald">
            {message}
          </p>
        ) : null}

        {loading ? <p className="text-sm text-white/60">Loading…</p> : null}

        {!loading && quotes.length === 0 ? (
          <p className="text-sm text-white/60">
            {filter === "awaiting"
              ? "No Address-to-Address quotes awaiting approval."
              : "No quotes in this view."}
          </p>
        ) : null}

        {quotes.map((quote) => {
          const validityValue =
            validityByRef[quote.reference] ?? String(A2A_QUOTE_VALIDITY_DEFAULT_MINUTES);
          const selectedValidity = parseMinutes(validityValue);
          const untilPickup = minutesUntilPickup(quote.tripDate, quote.tripTime);
          const pickupWarning = buildA2aPickupValidityWarning({
            minutesUntilPickup: untilPickup,
            selectedValidityMinutes: selectedValidity,
          });
          const failed = emailFailed(quote);
          const failedDetail = emailFailedByRef[quote.reference];

          return (
            <article
              key={quote.reference}
              className={`w-full min-w-0 max-w-full rounded-2xl border p-4 ${
                quote.status === "AWAITING_QUOTE"
                  ? "border-amber-300/25 bg-amber-400/5"
                  : quote.status === "QUOTE_APPROVED_AWAITING_PAYMENT"
                    ? "border-emerald/25 bg-emerald/5"
                    : "border-white/10 bg-white/[0.03]"
              }`}
            >
              <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
                    {quote.statusLabel}
                  </p>
                  <p className="mt-1 break-words text-base font-semibold text-white">
                    {quote.customerName}
                  </p>
                  <p className="break-all text-sm text-white/70">{quote.customerEmail}</p>
                  {quote.customerMobile ? (
                    <p className="break-words text-sm text-white/70">{quote.customerMobile}</p>
                  ) : null}
                </div>
                <p className="max-w-full shrink-0 break-all text-xs text-white/50">
                  {quote.reference}
                </p>
              </div>

              <dl className="mt-3 grid w-full min-w-0 grid-cols-1 gap-2 text-sm text-white/80 sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-xs text-white/45">Pickup</dt>
                  <dd className="break-words">{quote.pickupLabel}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-white/45">Destination</dt>
                  <dd className="break-words">{quote.dropoffLabel}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-white/45">Date / time</dt>
                  <dd className="break-words">
                    {quote.tripDate} · {quote.tripTime}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-white/45">Passengers / luggage</dt>
                  <dd className="break-words">
                    {quote.passengers} pax · {quote.suitcases} cases · {quote.vehicle}
                  </dd>
                </div>
                {(quote.journeyDistance || quote.journeyDuration) && (
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="text-xs text-white/45">Journey</dt>
                    <dd className="break-words">
                      {[quote.journeyDistance, quote.journeyDuration].filter(Boolean).join(" · ")}
                    </dd>
                  </div>
                )}
                {quote.quotedPriceLabel ? (
                  <div className="min-w-0 sm:col-span-2">
                    <dt className="text-xs text-white/45">Quoted price</dt>
                    <dd className="break-words">
                      {quote.quotedPriceLabel}
                      {quote.quoteValidityLabel ? ` · valid ${quote.quoteValidityLabel}` : ""}
                      {quote.quoteExpiresAt ? ` · expires ${formatExpires(quote.quoteExpiresAt)}` : ""}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {failed ? (
                <div className="mt-3 w-full min-w-0 max-w-full space-y-2 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2">
                  <p className="break-words text-sm font-semibold text-red-100">
                    Email failed — resend
                  </p>
                  {failedDetail ? (
                    <p className="break-words text-xs text-red-100/80">{failedDetail}</p>
                  ) : (
                    <p className="break-words text-xs text-red-100/80">
                      Quote is approved, but the payment email was not accepted by the email provider.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={resendingRef === quote.reference}
                    onClick={() => void handleResend(quote)}
                    className="min-h-10 w-full min-w-0 max-w-full rounded-xl border border-red-200/40 bg-red-500/20 px-3 py-2 text-sm font-semibold text-red-50 disabled:opacity-60 sm:w-auto"
                  >
                    {resendingRef === quote.reference ? "Resending…" : "Resend payment email"}
                  </button>
                </div>
              ) : null}

              {showApproveForm(quote) ? (
                <>
                  {pickupWarning ? (
                    <p
                      role="status"
                      className="mt-3 break-words rounded-xl border border-amber-300/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-50"
                    >
                      {pickupWarning}
                    </p>
                  ) : null}

                  <div className="mt-4 grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <label className="block min-w-0 text-sm text-white/80">
                      Quote Price (£)
                      <input
                        type="number"
                        inputMode="decimal"
                        min={1}
                        step="0.01"
                        placeholder="42.00"
                        value={priceByRef[quote.reference] ?? ""}
                        onChange={(e) =>
                          setPriceByRef((prev) => ({
                            ...prev,
                            [quote.reference]: e.target.value,
                          }))
                        }
                        className={fieldClass}
                      />
                    </label>
                    <div className="block min-w-0 text-sm text-white/80">
                      <label htmlFor={`a2a-validity-${quote.reference}`}>Valid for (minutes)</label>
                      <div className="mt-1 flex w-full min-w-0 max-w-full flex-wrap gap-1.5">
                        {A2A_QUOTE_VALIDITY_PRESETS_MINUTES.map((mins) => {
                          const selected = validityValue === String(mins);
                          return (
                            <button
                              key={mins}
                              type="button"
                              onClick={() =>
                                setValidityByRef((prev) => ({
                                  ...prev,
                                  [quote.reference]: String(mins),
                                }))
                              }
                              className={`min-h-9 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                                selected
                                  ? "bg-emerald text-navy"
                                  : "border border-white/15 bg-navy/50 text-white/80 hover:bg-white/10"
                              }`}
                            >
                              {mins}m
                            </button>
                          );
                        })}
                      </div>
                      <input
                        id={`a2a-validity-${quote.reference}`}
                        type="number"
                        inputMode="numeric"
                        min={A2A_QUOTE_VALIDITY_MIN_MINUTES}
                        max={A2A_QUOTE_VALIDITY_MAX_MINUTES}
                        step={1}
                        placeholder="60"
                        value={validityValue}
                        onChange={(e) =>
                          setValidityByRef((prev) => ({
                            ...prev,
                            [quote.reference]: e.target.value,
                          }))
                        }
                        className={fieldClass}
                      />
                      <span className="mt-1 block break-words text-xs text-white/45">
                        Default 60 minutes. Tap a preset or type any whole minutes (max{" "}
                        {A2A_QUOTE_VALIDITY_MAX_MINUTES}).
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={approvingRef === quote.reference}
                      onClick={() => void handleApprove(quote)}
                      className="min-h-11 w-full min-w-0 max-w-full rounded-xl bg-emerald px-4 py-2.5 text-sm font-semibold text-navy disabled:opacity-60 sm:w-auto"
                    >
                      {approvingRef === quote.reference ? "Approving…" : "Approve Quote"}
                    </button>
                  </div>
                </>
              ) : null}

              {showPaymentActions(quote) && !failed ? (
                <div className="mt-3 flex w-full min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {quote.paymentLinkEmailSentAt ? (
                    <p className="break-words text-sm text-emerald">Payment email sent</p>
                  ) : null}
                  {quote.paymentUrl ? (
                    <a
                      href={quote.paymentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-sm font-medium text-emerald underline"
                    >
                      Open payment link
                    </a>
                  ) : null}
                  <button
                    type="button"
                    disabled={resendingRef === quote.reference}
                    onClick={() => void handleResend(quote)}
                    className="min-h-10 w-full min-w-0 max-w-full rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold text-white/85 hover:bg-white/10 disabled:opacity-60 sm:w-auto"
                  >
                    {resendingRef === quote.reference ? "Resending…" : "Resend payment email"}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}

        <button
          type="button"
          onClick={() => void load(filter)}
          className="text-sm text-white/55 underline hover:text-white"
        >
          Refresh
        </button>
      </div>
    </section>
  );
}
