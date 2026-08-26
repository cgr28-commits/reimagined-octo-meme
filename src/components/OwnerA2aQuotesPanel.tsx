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
  type A2aQuoteOwnerSummary,
} from "@/lib/a2a-quote-api";

type OwnerA2aQuotesPanelProps = {
  ownerKey: string;
};

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

export default function OwnerA2aQuotesPanel({ ownerKey }: OwnerA2aQuotesPanelProps) {
  const [quotes, setQuotes] = useState<A2aQuoteOwnerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [priceByRef, setPriceByRef] = useState<Record<string, string>>({});
  const [validityByRef, setValidityByRef] = useState<Record<string, string>>({});
  const [approvingRef, setApprovingRef] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await fetchOwnerA2aQuotes(ownerKey);
      setQuotes(list);
      setValidityByRef((prev) => {
        const next = { ...prev };
        for (const q of list) {
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
  }, [ownerKey]);

  useEffect(() => {
    void load();
  }, [load]);

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
      setMessage(
        result.paymentEmailSent
          ? `Approved ${result.record.reference} at ${result.record.quotedPriceLabel} — valid ${result.record.quoteValidityLabel}. Payment email sent.`
          : `Approved ${result.record.reference} at ${result.record.quotedPriceLabel}. Payment link ready${result.paymentEmailError ? ` (email: ${result.paymentEmailError})` : ""}.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve quote");
    } finally {
      setApprovingRef(null);
    }
  }

  const awaiting = quotes.filter((q) => q.status === "AWAITING_QUOTE");
  const awaitingPayment = quotes.filter((q) => q.status === "QUOTE_APPROVED_AWAITING_PAYMENT");

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-white/10 bg-navy/40">
      <div className="border-b border-white/10 px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold text-white">Address-to-Address quotes</h2>
        <p className="mt-1 text-sm text-white/65">
          Enter Quote Price (£), choose how long the customer has to pay (default 60 minutes — change
          to 5, 10, 15, 30, etc.), then Approve Quote.
        </p>
      </div>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        {error ? (
          <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-xl border border-emerald/30 bg-emerald/10 px-3 py-2 text-sm text-emerald">
            {message}
          </p>
        ) : null}

        {loading ? <p className="text-sm text-white/60">Loading…</p> : null}

        {!loading && awaiting.length === 0 && awaitingPayment.length === 0 ? (
          <p className="text-sm text-white/60">No open Address-to-Address quote requests.</p>
        ) : null}

        {awaiting.map((quote) => {
          const validityValue =
            validityByRef[quote.reference] ?? String(A2A_QUOTE_VALIDITY_DEFAULT_MINUTES);
          const selectedValidity = parseMinutes(validityValue);
          const untilPickup = minutesUntilPickup(quote.tripDate, quote.tripTime);
          const pickupWarning = buildA2aPickupValidityWarning({
            minutesUntilPickup: untilPickup,
            selectedValidityMinutes: selectedValidity,
          });

          return (
            <article
              key={quote.reference}
              className="rounded-2xl border border-amber-300/25 bg-amber-400/5 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-200">
                    {quote.statusLabel}
                  </p>
                  <p className="mt-1 text-base font-semibold text-white">{quote.customerName}</p>
                  <p className="text-sm text-white/70">{quote.customerEmail}</p>
                  {quote.customerMobile ? (
                    <p className="text-sm text-white/70">{quote.customerMobile}</p>
                  ) : null}
                </div>
                <p className="text-xs text-white/50">{quote.reference}</p>
              </div>

              <dl className="mt-3 grid gap-2 text-sm text-white/80 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-white/45">Pickup</dt>
                  <dd>{quote.pickupLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-white/45">Destination</dt>
                  <dd>{quote.dropoffLabel}</dd>
                </div>
                <div>
                  <dt className="text-xs text-white/45">Date / time</dt>
                  <dd>
                    {quote.tripDate} · {quote.tripTime}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-white/45">Passengers / luggage</dt>
                  <dd>
                    {quote.passengers} pax · {quote.suitcases} cases · {quote.vehicle}
                  </dd>
                </div>
                {(quote.journeyDistance || quote.journeyDuration) && (
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-white/45">Journey</dt>
                    <dd>
                      {[quote.journeyDistance, quote.journeyDuration].filter(Boolean).join(" · ")}
                    </dd>
                  </div>
                )}
              </dl>

              {pickupWarning ? (
                <p
                  role="status"
                  className="mt-3 rounded-xl border border-amber-300/40 bg-amber-500/15 px-3 py-2 text-sm text-amber-50"
                >
                  {pickupWarning}
                </p>
              ) : null}

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                <label className="block text-sm text-white/80">
                  Quote Price (£)
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step="0.01"
                    placeholder="42.00"
                    value={priceByRef[quote.reference] ?? ""}
                    onChange={(e) =>
                      setPriceByRef((prev) => ({ ...prev, [quote.reference]: e.target.value }))
                    }
                    className="mt-1 w-full rounded-xl border border-white/15 bg-navy/60 px-3 py-2.5 text-white outline-none focus:border-emerald"
                  />
                </label>
                <div className="block text-sm text-white/80">
                  <label htmlFor={`a2a-validity-${quote.reference}`}>Valid for (minutes)</label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
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
                    className="mt-2 w-full rounded-xl border border-white/15 bg-navy/60 px-3 py-2.5 text-white outline-none focus:border-emerald"
                  />
                  <span className="mt-1 block text-xs text-white/45">
                    Default 60 minutes. Tap a preset or type any whole minutes (max{" "}
                    {A2A_QUOTE_VALIDITY_MAX_MINUTES}).
                  </span>
                </div>
                <button
                  type="button"
                  disabled={approvingRef === quote.reference}
                  onClick={() => void handleApprove(quote)}
                  className="min-h-11 rounded-xl bg-emerald px-4 py-2.5 text-sm font-semibold text-navy disabled:opacity-60"
                >
                  {approvingRef === quote.reference ? "Approving…" : "Approve Quote"}
                </button>
              </div>
            </article>
          );
        })}

        {awaitingPayment.map((quote) => (
          <article
            key={quote.reference}
            className="rounded-2xl border border-emerald/25 bg-emerald/5 p-4"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
              {quote.statusLabel}
            </p>
            <p className="mt-1 font-semibold text-white">
              {quote.customerName} · {quote.quotedPriceLabel}
            </p>
            <p className="text-sm text-white/70">
              Valid {quote.quoteValidityLabel}
              {quote.quoteExpiresAt
                ? ` · expires ${new Date(quote.quoteExpiresAt).toLocaleString("en-GB", {
                    timeZone: "Europe/London",
                  })}`
                : ""}
            </p>
            <p className="mt-1 text-xs text-white/50">{quote.reference}</p>
            {quote.paymentUrl ? (
              <a
                href={quote.paymentUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm font-medium text-emerald underline"
              >
                Open payment link
              </a>
            ) : null}
          </article>
        ))}

        <button
          type="button"
          onClick={() => void load()}
          className="text-sm text-white/55 underline hover:text-white"
        >
          Refresh
        </button>
      </div>
    </section>
  );
}
