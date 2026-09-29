import {
  CHOOSE_ANOTHER_PICKUP_TIME_LABEL,
  leadTimeHoursLabel,
  minimumNoticeRequestHeading,
  normalizeMinimumBookingNoticeHours,
  normalizeMinimumShortNoticeLeadHours,
  SHORT_NOTICE_CONFIRMATION_WINDOW_HOURS,
  shortNoticeConfirmWithinLine,
  tooSoonRequestHeading,
} from "../../shared/booking-notice";

/** Compact checkout copy. The notice window still comes from the existing hours setting. */
export function shortNoticeCheckoutSummary(noticeHours: number): string {
  const hours = normalizeMinimumBookingNoticeHours(noticeHours);
  return `This journey is within our ${hours}-hour booking period. We’ll confirm availability before taking payment.`;
}

export function shortNoticePaymentFollowUpLines(
  windowHours: unknown = SHORT_NOTICE_CONFIRMATION_WINDOW_HOURS,
): readonly [string, string, string, string] {
  return [
    "If available, we’ll email you a secure payment link.",
    shortNoticeConfirmWithinLine(windowHours),
    "If we’re unable to confirm within that time, your request will automatically expire.",
    "Your booking is confirmed once payment is received.",
  ];
}

export const SHORT_NOTICE_PAYMENT_FOLLOW_UP = shortNoticePaymentFollowUpLines().join(" ");

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

export function ShortNoticePaymentFollowUp({
  windowHours = SHORT_NOTICE_CONFIRMATION_WINDOW_HOURS,
}: {
  windowHours?: number;
}) {
  const lines = shortNoticePaymentFollowUpLines(windowHours);
  return (
    <div className="space-y-0.5 text-xs leading-snug quote-secondary sm:space-y-1 sm:text-sm sm:leading-relaxed">
      <p>{lines[0]}</p>
      <p className="font-semibold">{lines[1]}</p>
      <p>{lines[2]}</p>
      <p>{lines[3]}</p>
    </div>
  );
}

export function TooSoonCheckoutNotice({
  leadHours,
  onChooseAnotherTime,
}: {
  leadHours: number;
  onChooseAnotherTime: () => void;
}) {
  const hours = normalizeMinimumShortNoticeLeadHours(leadHours);
  return (
    <div
      className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-3 text-left sm:rounded-xl sm:px-3.5"
      role="status"
      aria-live="polite"
      data-too-soon-booking
    >
      <p className="text-sm font-semibold leading-snug text-white">{tooSoonRequestHeading()}</p>
      <p className="mt-1 text-xs leading-snug text-white/80 sm:text-sm">
        My Airport Taxi NI specialises in pre-booked airport transfers, so we’re unable to guarantee
        immediate pickups.
      </p>
      <p className="mt-1 text-xs leading-snug text-white/80 sm:text-sm">
        Please choose a pickup time at least {leadTimeHoursLabel(hours)} from now.
      </p>
      <button
        type="button"
        onClick={onChooseAnotherTime}
        className="btn-secondary mt-3 min-h-11 w-full"
      >
        {CHOOSE_ANOTHER_PICKUP_TIME_LABEL}
      </button>
    </div>
  );
}
