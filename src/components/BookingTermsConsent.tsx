import type { ReactNode } from "react";
import Link from "next/link";
import { CANCELLATION_POLICY_PATH } from "../../shared/cancellation-policy";

type BookingTermsConsentProps = {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  error?: string;
  mode: "card-payment" | "booking-request" | "quote-request";
  paymentAmountLabel?: string;
};

function PolicyLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-emerald underline decoration-emerald/40 underline-offset-2 hover:text-emerald-light"
    >
      {children}
    </Link>
  );
}

export default function BookingTermsConsent({
  accepted,
  onAcceptedChange,
  error,
  mode,
}: BookingTermsConsentProps) {
  return (
    <div className="space-y-2 sm:space-y-2.5">
      {mode === "quote-request" ? (
        <div className="rounded-xl quote-panel px-3 py-2.5 text-sm leading-relaxed quote-secondary sm:px-4 sm:py-3">
          <p className="font-semibold text-white">Agreement</p>
          <p className="mt-1">
            I understand this is a quote request. My journey is not booked yet. If the quote is
            approved, I’ll receive my personalised price and a secure SumUp payment link. My booking
            is confirmed only after payment is received.
          </p>
        </div>
      ) : null}
      <label
        className={`flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-lg border bg-white/[0.04] px-3 py-2.5 text-left sm:rounded-xl sm:px-4 sm:py-3 ${
          error
            ? "border-red-400/55 ring-1 ring-red-400/30"
            : "border-white/28"
        }`}
      >
        <input
          type="checkbox"
          checked={accepted}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "booking-terms-error" : undefined}
          onChange={(event) => onAcceptedChange(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 rounded border-white/30 bg-navy-dark text-emerald focus:ring-emerald/30"
        />
        <span className="min-w-0 break-words text-sm leading-snug text-white/92 sm:leading-relaxed">
          I agree to the <PolicyLink href="/terms/">Terms &amp; Conditions</PolicyLink>,{" "}
          <PolicyLink href={CANCELLATION_POLICY_PATH}>Cancellation Policy</PolicyLink> and{" "}
          <PolicyLink href="/privacy/">Privacy Policy</PolicyLink>.
        </span>
      </label>
      {error && (
        <p id="booking-terms-error" role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
