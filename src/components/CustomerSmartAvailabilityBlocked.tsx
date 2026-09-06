"use client";

import {
  CUSTOMER_CHOOSE_ANOTHER_DATE_LABEL,
  CUSTOMER_CHOOSE_ANOTHER_TIME_LABEL,
  CUSTOMER_OTHER_TIMES_HEADING,
  CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE,
  CUSTOMER_WHATSAPP_SECONDARY_MESSAGE,
  formatCustomerClock,
  type CustomerPublicAlternativeTime,
} from "../../shared/customer-smart-availability";
import { bookingHelpWhatsAppUrl } from "@/lib/booking-help-whatsapp";

export function CustomerSmartAvailabilityBlocked({
  message = CUSTOMER_SMART_AVAILABILITY_UNAVAILABLE_MESSAGE,
  alternativeTimes = [],
  onSelectAlternative,
  onChooseAnotherTime,
  onChooseAnotherDate,
  selectingTime = null,
}: {
  message?: string;
  alternativeTimes?: CustomerPublicAlternativeTime[];
  onSelectAlternative?: (option: CustomerPublicAlternativeTime) => void;
  onChooseAnotherTime?: () => void;
  onChooseAnotherDate?: () => void;
  selectingTime?: string | null;
}) {
  const hasAlternatives = alternativeTimes.length > 0 && Boolean(onSelectAlternative);
  const chooseAnotherDate = onChooseAnotherDate ?? (!hasAlternatives ? onChooseAnotherTime : undefined);

  return (
    <div className="space-y-3" data-customer-smart-availability-blocked>
      <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
        {message}
      </p>
      {hasAlternatives ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white">{CUSTOMER_OTHER_TIMES_HEADING}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {alternativeTimes.map((option) => {
              const label = formatCustomerClock(option.tripTime) || option.tripTime;
              const busy = selectingTime === option.tripTime;
              return (
                <button
                  key={`${option.tripDate}-${option.tripTime}`}
                  type="button"
                  disabled={Boolean(selectingTime)}
                  onClick={() => onSelectAlternative?.(option)}
                  className="rounded-xl border border-emerald/40 bg-emerald/10 px-3 py-3 text-sm font-semibold text-white transition-colors hover:border-emerald hover:bg-emerald/20 disabled:cursor-wait disabled:opacity-70"
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
          className="btn-secondary w-full"
        >
          {CUSTOMER_CHOOSE_ANOTHER_TIME_LABEL}
        </button>
      ) : null}
      {!hasAlternatives && chooseAnotherDate ? (
        <button
          type="button"
          onClick={chooseAnotherDate}
          className="btn-secondary w-full"
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
