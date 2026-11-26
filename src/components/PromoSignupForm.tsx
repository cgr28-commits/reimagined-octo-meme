"use client";

/**
 * Email → 10% discount code form (pop-up, mobile banner sheet and quote-results banner).
 * Marketing permission is a separate, optional, unticked box; the code is sent either way.
 */
import { useId, useState } from "react";
import { PROMO_MARKETING_CONSENT_WORDING } from "../../shared/promo-code";
import { markPromoSignedUp, requestPromoCode } from "@/lib/promo-api";
import { SITE } from "@/lib/data";

type Props = {
  source: "popup" | "mobile-banner" | "quote-banner" | "exit-intent";
  validityDays: number;
  percentLabel: string;
  /** Scheduled offer id while one runs (remembered separately in this browser). */
  offerId?: string;
  /** Visual theme: navy card (pop-up / sheet) or white card (inside the quote tool). */
  tone?: "navy" | "light";
  autoFocus?: boolean;
  onDone?: () => void;
};

export default function PromoSignupForm({ source, validityDays, percentLabel, offerId, tone = "navy", autoFocus = false, onDone }: Props) {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ code?: string; note?: string } | null>(null);
  const dark = tone === "navy";

  async function submit() {
    if (state === "sending") return;
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setState("sending");
    const result = await requestPromoCode({ email: value, marketingOptIn: marketing, source, website: honeypot });
    if (result.ok) {
      setState("done");
      setMessage(result.message);
      if (result.previewCode || result.previewNote) setPreview({ code: result.previewCode, note: result.previewNote });
      markPromoSignedUp(Date.now(), offerId);
      onDone?.();
    } else {
      setState("idle");
      setError(result.error);
    }
  }

  if (state === "done") {
    return (
      <div role="status" aria-live="polite" data-promo-confirmation className={dark ? "text-white" : "text-navy"}>
        <p className="flex items-center gap-2 text-base font-bold">
          <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald text-sm text-navy">✓</span>
          Check your inbox
        </p>
        <p className={`mt-2 text-sm leading-relaxed ${dark ? "text-white/85" : "text-navy/80"}`}>{message}</p>
        {preview ? (
          <p data-promo-preview-code className="mt-3 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-[#071c38]">
            <strong>Preview site only — no email sent.</strong>{" "}
            {preview.code ? (
              <>
                Your code: <span className="font-mono font-bold tracking-wide">{preview.code}</span>
              </>
            ) : (
              preview.note
            )}
          </p>
        ) : null}
        <p className={`mt-2 text-xs leading-relaxed ${dark ? "text-white/70" : "text-navy/65"}`}>
          Enter the code under “Have a promo code?” when you book. It is linked to the email address you gave us.
        </p>
      </div>
    );
  }

  const inputId = `${uid}-email`;
  const consentId = `${uid}-consent`;
  const errorId = `${uid}-error`;
  return (
    // Not a <form>: the quote-results banner sits inside the booking form, and forms cannot nest.
    <div role="form" aria-label={`Get your ${percentLabel} discount code`} data-promo-form>
      <label htmlFor={inputId} className={`block text-sm font-semibold ${dark ? "text-white" : "text-navy"}`}>
        Email address
      </label>
      <input
        id={inputId}
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        placeholder="you@example.com"
        className="mt-1.5 block w-full rounded-xl border border-[#c9d4e2] bg-white px-4 py-3 text-base text-[#071c38] placeholder:text-[#8a99ad] focus:border-emerald focus:outline-none focus:ring-2 focus:ring-emerald/40"
      />
      {/* Honeypot for bots: hidden from people and screen readers. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
        </label>
      </div>
      <div className="mt-3 flex items-start gap-2.5">
        <input
          id={consentId}
          type="checkbox"
          checked={marketing}
          onChange={(e) => setMarketing(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[#2fbf4a]"
        />
        <label htmlFor={consentId} className={`cursor-pointer text-xs leading-snug ${dark ? "text-white/80" : "text-navy/75"}`}>
          {PROMO_MARKETING_CONSENT_WORDING}
        </label>
      </div>
      {error ? (
        <p id={errorId} role="alert" className={`mt-2 text-sm font-semibold ${dark ? "text-[#ffb4b4]" : "text-[#b42318]"}`}>
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={state === "sending"}
        className="btn-primary mt-4 w-full rounded-xl px-5 text-base disabled:cursor-wait"
      >
        {state === "sending" ? "Sending…" : `Send My ${percentLabel} Discount Code`}
      </button>
      <a
        href={`https://wa.me/${SITE.whatsappAssistantLive ? SITE.whatsappAssistant : SITE.whatsapp}?text=${encodeURIComponent("Hello, can I have the promo code?")}`}
        target="_blank"
        rel="noopener noreferrer"
        data-promo-whatsapp
        className={`mt-2 inline-flex min-h-11 w-full items-center justify-center text-sm font-semibold underline underline-offset-4 ${dark ? "text-white" : "text-navy"}`}
      >
        Prefer WhatsApp? Get your code there
      </a>
      <p className={`mt-2.5 text-[11px] leading-snug ${dark ? "text-white/60" : "text-navy/55"}`}>
        Valid for {validityDays} days. Airport charges excluded; minimum vehicle fare applies; one use per customer. See our{" "}
        <a href="/privacy/" className="underline underline-offset-2">Privacy Policy</a>.
      </p>
    </div>
  );
}
