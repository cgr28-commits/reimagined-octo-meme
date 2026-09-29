import {
  minimumNoticeRequestHeading,
  normalizeMinimumBookingNoticeHours,
} from "../../shared/booking-notice";

/** Compact checkout copy. The notice window still comes from the existing hours setting. */
export function shortNoticeCheckoutSummary(noticeHours: number): string {
  const hours = normalizeMinimumBookingNoticeHours(noticeHours);
  return `This journey is within our ${hours}-hour booking period. We’ll confirm availability before taking payment.`;
}

export const SHORT_NOTICE_PAYMENT_FOLLOW_UP =
  "If available, we’ll email you a secure payment link. Please allow up to 1 hour for confirmation. Your booking is confirmed once payment is received.";

export default function ShortNoticeCheckoutNotice({ noticeHours }: { noticeHours: number }) {
  return (
    <div
      className="rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-left sm:rounded-xl sm:px-3.5 sm:py-2.5"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm font-semibold leading-snug text-amber-100">
        {minimumNoticeRequestHeading()}
      </p>
      <p className="mt-0.5 text-xs leading-snug text-amber-50/90 sm:text-sm">
        {shortNoticeCheckoutSummary(noticeHours)}
      </p>
    </div>
  );
}

export function ShortNoticePaymentFollowUp() {
  return (
    <p className="text-xs leading-snug quote-secondary sm:text-sm sm:leading-relaxed">
      {SHORT_NOTICE_PAYMENT_FOLLOW_UP}
    </p>
  );
}
