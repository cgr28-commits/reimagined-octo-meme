import type { ReactNode } from "react";
import Link from "next/link";
import {
  CANCELLATION_POLICY_PATH,
  CHECKOUT_CANCELLATION_HEADING,
  CHECKOUT_CANCELLATION_SUMMARY,
  VIEW_FULL_CANCELLATION_POLICY_LABEL,
} from "../../shared/cancellation-policy";

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
  paymentAmountLabel,
}: BookingTermsConsentProps) {
  const fareLabel = paymentAmountLabel?.trim() || "the displayed fare";

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-300/35 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-white/85">
        <p className="font-semibold text-white">{CHECKOUT_CANCELLATION_HEADING}</p>
        <p className="mt-1.5">{CHECKOUT_CANCELLATION_SUMMARY}</p>
        <p className="mt-2">
          <PolicyLink href={CANCELLATION_POLICY_PATH}>
            {VIEW_FULL_CANCELLATION_POLICY_LABEL}
          </PolicyLink>
        </p>
      </div>
      {mode === "quote-request" ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-white/75">
          <p className="font-semibold text-white/90">Agreement</p>
          <p className="mt-1.5">
            I understand this is a quote request. My journey is not booked yet. If the quote is
            approved, I’ll receive my personalised price and a secure SumUp payment link. My booking
            is confirmed only after payment is received.
          </p>
        </div>
      ) : null}
      <label
        className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border bg-white/[0.04] px-4 py-3 text-left ${
          error
            ? "border-red-400/55 ring-1 ring-red-400/30"
            : "border-white/15"
        }`}
      >
        <input
          type="checkbox"
          checked={accepted}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "booking-terms-error" : undefined}
          onChange={(event) => onAcceptedChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-navy-dark text-emerald focus:ring-emerald/30"
        />
        <span className="min-w-0 break-words text-sm leading-relaxed text-white/80">
          {mode === "card-payment" ? (
            <>
              I agree to the{" "}
              <PolicyLink href="/terms/">Terms &amp; Conditions</PolicyLink> and{" "}
              <PolicyLink href="/privacy/">Privacy Policy</PolicyLink>, including the{" "}
              <PolicyLink href={CANCELLATION_POLICY_PATH}>cancellation policy</PolicyLink>{" "}
              above, and authorise payment of {fareLabel}. My booking is confirmed once payment is
              completed.
            </>
          ) : mode === "quote-request" ? (
            <>
              I agree to the{" "}
              <PolicyLink href="/terms/">Terms &amp; Conditions</PolicyLink> and{" "}
              <PolicyLink href="/privacy/">Privacy Policy</PolicyLink>, including the{" "}
              <PolicyLink href={CANCELLATION_POLICY_PATH}>cancellation policy</PolicyLink>{" "}
              and quote-request agreement above.
            </>
          ) : (
            <>
              I agree to the{" "}
              <PolicyLink href="/terms/">Terms &amp; Conditions</PolicyLink> and{" "}
              <PolicyLink href="/privacy/">Privacy Policy</PolicyLink>, including the{" "}
              <PolicyLink href={CANCELLATION_POLICY_PATH}>cancellation policy</PolicyLink>{" "}
              above. I understand this is a booking request — once you confirm the job, you will
              email a SumUp payment link, and my booking is confirmed only after payment is
              received.
            </>
          )}
        </span>
      </label>
      {error && (
        <p id="booking-terms-error" role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
      <p className="text-xs leading-relaxed text-white/45">
        Keep your confirmation email or booking reference as proof of agreement.
      </p>
    </div>
  );
}
