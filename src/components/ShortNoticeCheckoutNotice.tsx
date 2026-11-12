import {
  MINIBUS_NOTICE_BODY,
  MINIBUS_NOTICE_HEADING,
} from "../../shared/availability-resource";
import { overnightTooSoonBody, overnightTooSoonHeading } from "../../shared/owner-quiet-hours";
import {
  CHOOSE_ANOTHER_PICKUP_TIME_LABEL,
  leadTimeHoursLabel,
  normalizeMinimumBookingNoticeHours,
  normalizeMinimumShortNoticeLeadHours,
  SHORT_NOTICE_CONFIRMATION_WINDOW_HOURS,
  tooSoonRequestHeading,
} from "../../shared/booking-notice";

export const SHORT_NOTICE_BOOK_NOW_HEADING = "Short-notice journey — you can still book";

/** Compact checkout copy. The notice window still comes from the existing hours setting. */
export function shortNoticeCheckoutSummary(noticeHours: number): string {
  const hours = normalizeMinimumBookingNoticeHours(noticeHours);
  return `Your pickup is within our ${hours}-hour short-notice period. Book now and we’ll confirm your booking shortly.`;
}

export function shortNoticePaymentFollowUpLines(
  // Kept for callers; the confirmation window is no longer shown to customers.
  _windowHours: unknown = SHORT_NOTICE_CONFIRMATION_WINDOW_HOURS,
): readonly [string, string, string] {
  return [
    "Your card is held for the fare — nothing is charged until we confirm.",
    "We’ll confirm your booking shortly by email.",
    "If we’re unable to complete your booking, the funds are released right away.",
  ];
}

export const SHORT_NOTICE_PAYMENT_FOLLOW_UP = shortNoticePaymentFollowUpLines().join(" ");

export function MinibusNoticeCheckoutNotice() {
  return (
    <div
      className="rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-left sm:rounded-xl sm:px-3.5 sm:py-2.5"
      role="status"
      aria-live="polite"
      data-minibus-notice-checkout
    >
      <p className="text-sm font-semibold leading-snug text-amber-100">{MINIBUS_NOTICE_HEADING}</p>
      <p className="mt-0.5 text-xs leading-snug text-amber-50/90 sm:text-sm">{MINIBUS_NOTICE_BODY}</p>
    </div>
  );
}

export default function ShortNoticeCheckoutNotice({ noticeHours }: { noticeHours: number }) {
  return (
    <div
      className="rounded-lg border border-emerald/40 bg-emerald/10 px-3 py-2 text-left sm:rounded-xl sm:px-3.5 sm:py-2.5"
      role="status"
      aria-live="polite"
      data-short-notice-book-now
    >
      <p className="text-sm font-semibold leading-snug text-white">
        {SHORT_NOTICE_BOOK_NOW_HEADING}
      </p>
      <p className="mt-0.5 text-xs leading-snug text-white/85 sm:text-sm">
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
    </div>
  );
}

export function TooSoonCheckoutNotice({
  leadHours,
  onChooseAnotherTime,
  overnight = false,
}: {
  leadHours: number;
  onChooseAnotherTime: () => void;
  /** Too soon only because we're closed overnight (22:00–07:00). */
  overnight?: boolean;
}) {
  const hours = normalizeMinimumShortNoticeLeadHours(leadHours);
  if (overnight) {
    const [first, second] = overnightTooSoonBody().split("\n\n");
    return (
      <div
        className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-3 text-left sm:rounded-xl sm:px-3.5"
        role="status"
        aria-live="polite"
        data-too-soon-booking
        data-overnight-too-soon
      >
        <p className="text-sm font-semibold leading-snug text-white">{overnightTooSoonHeading()}</p>
        <p className="mt-1 text-xs leading-snug text-white/80 sm:text-sm">{first}</p>
        <p className="mt-1 text-xs leading-snug text-white/80 sm:text-sm">{second}</p>
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
