import Link from "next/link";

type BookingTermsConsentProps = {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  error?: string;
  mode: "card-payment" | "booking-request" | "quote-request";
  paymentAmountLabel?: string;
};

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
      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-white/65">
        <p className="font-semibold text-white/80">Cancellation summary</p>
        <div className="mt-1.5 space-y-2">
          <p>
            Cancel more than 24 hours before your scheduled pickup: You’ll receive a full refund.
          </p>
          <p>
            Cancel within 24 hours of your scheduled pickup: Your booking is normally
            non-refundable because your driver and time have already been reserved. We may provide
            a full or partial refund where appropriate depending on the circumstances.
          </p>
          <p>
            If we cancel your booking and cannot provide the journey: You’ll receive a full refund.
          </p>
          <p>Your statutory rights are not affected.</p>
        </div>
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
      <label className="flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-left">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => onAcceptedChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-navy-dark text-emerald focus:ring-emerald/30"
        />
        <span className="min-w-0 break-words text-sm leading-relaxed text-white/80">
          {mode === "card-payment" ? (
            <>
              I agree to the{" "}
              <Link
                href="/terms/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald underline decoration-emerald/40 underline-offset-2 hover:text-emerald-light"
              >
                Terms &amp; Conditions
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald underline decoration-emerald/40 underline-offset-2 hover:text-emerald-light"
              >
                Privacy Policy
              </Link>
              , including the cancellation policy above, and authorise payment of {fareLabel}. My
              booking is confirmed once payment is completed.
            </>
          ) : mode === "quote-request" ? (
            <>
              I agree to the{" "}
              <Link
                href="/terms/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald underline decoration-emerald/40 underline-offset-2 hover:text-emerald-light"
              >
                Terms &amp; Conditions
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald underline decoration-emerald/40 underline-offset-2 hover:text-emerald-light"
              >
                Privacy Policy
              </Link>
              , including the cancellation policy and quote-request agreement above.
            </>
          ) : (
            <>
              I agree to the{" "}
              <Link
                href="/terms/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald underline decoration-emerald/40 underline-offset-2 hover:text-emerald-light"
              >
                Terms &amp; Conditions
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald underline decoration-emerald/40 underline-offset-2 hover:text-emerald-light"
              >
                Privacy Policy
              </Link>
              , including the cancellation policy above. I understand this is a booking request —
              once you confirm the job, you will email a SumUp payment link, and my booking is
              confirmed only after payment is received.
            </>
          )}
        </span>
      </label>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <p className="text-xs leading-relaxed text-white/45">
        Keep your confirmation email or booking reference as proof of agreement.
      </p>
    </div>
  );
}
