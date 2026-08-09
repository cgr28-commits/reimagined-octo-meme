import Link from "next/link";
import { TERMS_LAST_UPDATED } from "@/lib/terms";

type BookingTermsConsentProps = {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  error?: string;
  mode: "card-payment" | "booking-request";
  paymentAmountLabel?: string;
};

export default function BookingTermsConsent({
  accepted,
  onAcceptedChange,
  error,
  mode,
  paymentAmountLabel,
}: BookingTermsConsentProps) {
  return (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-left">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => onAcceptedChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/30 bg-navy-dark text-emerald focus:ring-emerald/30"
        />
        <span className="text-sm leading-relaxed text-white/80">
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
          , including the cancellation policy (full refund with at least 24 hours’ notice;
          non-refundable within 24 hours or for no-shows).
          {mode === "card-payment" ? (
            <>
              {" "}
              I authorise payment of {paymentAmountLabel ?? "the quoted fare"} for the service
              described above. My booking is confirmed once payment is completed.
            </>
          ) : (
            <>
              {" "}
              I understand this is a booking request — once you confirm the job, you will email a
              SumUp payment link, and my booking is confirmed only after payment is received.
            </>
          )}
        </span>
      </label>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <p className="text-xs leading-relaxed text-white/45">
        Terms version: {TERMS_LAST_UPDATED}. Keep your confirmation email or booking reference as
        proof of agreement.
      </p>
    </div>
  );
}
