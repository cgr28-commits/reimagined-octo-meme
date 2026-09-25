"use client";

import {
  CUSTOMER_CHOOSE_ANOTHER_DATE_LABEL,
  CUSTOMER_CHOOSE_ANOTHER_TIME_LABEL,
  CUSTOMER_OTHER_TIMES_HEADING,
  CUSTOMER_SELECT_TIME_HINT,
  CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE,
  CUSTOMER_WHATSAPP_SECONDARY_MESSAGE,
  formatCustomerClock,
  sortCustomerAlternativeTimesByCloseness,
  type CustomerPublicAlternativeTime,
} from "../../shared/customer-smart-availability";
import { bookingHelpWhatsAppUrl } from "@/lib/booking-help-whatsapp";

export function CustomerSmartAvailabilityBlocked({
  message = CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE,
  requestedTripTime,
  alternativeTimes = [],
  onSelectAlternative,
  onChooseAnotherTime,
  onChooseAnotherDate,
  selectingTime = null,
}: {
  message?: string;
  requestedTripTime?: string;
  alternativeTimes?: CustomerPublicAlternativeTime[];
  onSelectAlternative?: (option: CustomerPublicAlternativeTime) => void;
  onChooseAnotherTime?: () => void;
  onChooseAnotherDate?: () => void;
  selectingTime?: string | null;
}) {
  const orderedTimes = sortCustomerAlternativeTimesByCloseness(
    requestedTripTime || "",
    alternativeTimes,
  );
  const hasAlternatives = orderedTimes.length > 0 && Boolean(onSelectAlternative);
  const chooseAnotherDate = onChooseAnotherDate ?? (!hasAlternatives ? onChooseAnotherTime : undefined);

  return (
    <div
      className="space-y-3"
      data-customer-smart-availability-blocked
      data-unavailable-time-panel
    >
      <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold leading-relaxed text-red-100 sm:text-base">
        {message}
      </p>
      {hasAlternatives ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white sm:text-base">{CUSTOMER_OTHER_TIMES_HEADING}</p>
          <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
            {orderedTimes.map((option) => {
              const label = formatCustomerClock(option.tripTime) || option.tripTime;
              const busy = selectingTime === option.tripTime;
              return (
                <button
                  key={`${option.tripDate}-${option.tripTime}`}
                  type="button"
                  disabled={Boolean(selectingTime)}
                  onClick={() => onSelectAlternative?.(option)}
                  className="min-h-14 w-full rounded-xl border border-emerald/40 bg-emerald/10 px-4 py-3.5 text-lg font-semibold text-white transition-colors hover:border-emerald hover:bg-emerald/20 disabled:cursor-wait disabled:opacity-70"
                >
                  {busy ? "Checking…" : label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {hasAlternatives && onChooseAnotherTime ? (
        <button
          type="button"
          onClick={onChooseAnotherTime}
          className="btn-secondary min-h-12 w-full text-base font-semibold"
        >
          {CUSTOMER_CHOOSE_ANOTHER_TIME_LABEL}
        </button>
      ) : null}
      {hasAlternatives ? (
        <p className="text-sm leading-relaxed text-white/70">{CUSTOMER_SELECT_TIME_HINT}</p>
      ) : null}
      {!hasAlternatives && chooseAnotherDate ? (
        <button
          type="button"
          onClick={chooseAnotherDate}
          className="btn-secondary min-h-12 w-full text-base font-semibold"
        >
          {CUSTOMER_CHOOSE_ANOTHER_DATE_LABEL}
        </button>
      ) : null}
      <p className="text-xs leading-relaxed text-white/55">
        {CUSTOMER_WHATSAPP_SECONDARY_MESSAGE}{" "}
        <a
          href={bookingHelpWhatsAppUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-white/80"
        >
          WhatsApp
        </a>
      </p>
    </div>
  );
}
