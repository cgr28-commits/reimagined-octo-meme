"use client";

import { useId, useState } from "react";
import { isValidEmailAddress } from "@/lib/booking-message";
import { saveQuote, type SaveQuoteRequest, type SaveQuoteResult } from "@/lib/saved-quote-api";

type SaveQuoteModalProps = {
  open: boolean;
  onClose: () => void;
  buildPayload: () => SaveQuoteRequest | null;
  onBookNow: () => void;
};

export default function SaveQuoteModal({
  open,
  onClose,
  buildPayload,
  onBookNow,
}: SaveQuoteModalProps) {
  const nameId = useId();
  const emailId = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SaveQuoteResult | null>(null);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError("");

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (trimmedName.length < 2) {
      setError("Please enter your name.");
      return;
    }
    if (!isValidEmailAddress(trimmedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    const payload = buildPayload();
    if (!payload) {
      setError("Your quote is no longer available. Please recalculate and try again.");
      return;
    }

    setSubmitting(true);
    try {
      const saved = await saveQuote({
        ...payload,
        customerName: trimmedName,
        customerEmail: trimmedEmail,
      });
      setResult(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your quote. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return;
    setName("");
    setEmail("");
    setError("");
    setResult(null);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-navy/80 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-quote-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-navy-dark shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald">
              My Airport Taxi NI
            </p>
            <h2 id="save-quote-title" className="mt-1 text-lg font-semibold text-white">
              {result ? "Your quote has been saved" : "Save Quote"}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg px-2 py-1 text-sm text-white/60 hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-5">
          {result ? (
            <div className="space-y-4 text-sm text-white/80">
              <p>Your fixed-price quote is saved for 7 days.</p>
              <p>
                {result.emailSent
                  ? `We’ve sent your saved quote to ${result.email}.`
                  : `Your quote is saved under reference ${result.reference}. We couldn’t send the email just now — you can still open your secure link below.`}
              </p>
              {result.emailSent ? (
                <p>We’ve emailed you a secure link so you can return and book whenever you’re ready.</p>
              ) : null}
              <p className="text-white/60">
                Your journey is not booked until payment has been completed.
              </p>
              <dl className="space-y-2 rounded-xl border border-white/10 bg-navy/50 p-4">
                <div className="flex justify-between gap-3">
                  <dt className="text-white/55">Reference</dt>
                  <dd className="font-mono text-white">{result.reference}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-white/55">Price</dt>
                  <dd className="text-lg font-semibold text-emerald">{result.amountLabel}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-white/55">Valid until</dt>
                  <dd className="text-right text-white">{result.expiresAtLabel}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-white/55">Email</dt>
                  <dd className="break-all text-right text-white">{result.email}</dd>
                </div>
              </dl>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    handleClose();
                    onBookNow();
                  }}
                  className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light"
                >
                  Book Now
                </button>
                <a
                  href={result.quoteUrl.replace(/^https?:\/\/[^/]+/, "") || `/quote/?t=${result.token}`}
                  className="w-full rounded-xl border border-white/20 py-3 text-center text-sm font-semibold text-white transition-all hover:bg-white/5"
                >
                  Open saved quote link
                </a>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-white/70">
                Save your fixed price for 7 days. We’ll email you a secure link — no mobile number
                needed yet, and you won’t be added to any marketing list.
              </p>
              <div>
                <label htmlFor={nameId} className="mb-1.5 block text-xs font-medium text-white/60">
                  Your name
                </label>
                <input
                  id={nameId}
                  name="customerName"
                  type="text"
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  className="quote-text-input min-h-12 w-full rounded-xl border border-white/15 bg-navy px-3 text-base text-white placeholder:text-white/35"
                  placeholder="Full name"
                />
              </div>
              <div>
                <label htmlFor={emailId} className="mb-1.5 block text-xs font-medium text-white/60">
                  Email address
                </label>
                <input
                  id={emailId}
                  name="customerEmail"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  className="quote-text-input min-h-12 w-full rounded-xl border border-white/15 bg-navy px-3 text-base text-white placeholder:text-white/35"
                  placeholder="you@example.com"
                />
              </div>
              {error ? (
                <p className="text-sm text-red-300" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "Saving your quote…" : "Save Quote"}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleClose}
                  className="w-full rounded-xl border border-white/20 py-3 text-sm font-semibold text-white/80 transition-all hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
