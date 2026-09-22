"use client";

import type { RefObject } from "react";
import {
  quoteDateTimeFieldShellClass,
  quoteDateTimeInputClass,
  type QuoteFieldHighlightState,
} from "@/lib/quote-ui-highlight";

type ScheduleFieldState = {
  hasError: boolean;
  complete: boolean;
};

function scheduleFieldState(
  options: ScheduleFieldState,
): QuoteFieldHighlightState {
  if (options.hasError) return "error";
  if (options.complete) return "complete";
  return "needs";
}

export type QuoteScheduleFieldsProps = {
  variant?: "quote" | "checkout";
  returnJourney: boolean;
  tripDate: string;
  tripTime: string;
  returnDate: string;
  returnTime: string;
  minTripDate: string;
  minReturnDate: string;
  minTripTime?: string;
  minReturnTime?: string;
  tripDateError?: string;
  returnDateError?: string;
  outboundTimeLabel: string;
  returnTimeLabel: string;
  tripDateInputRef?: RefObject<HTMLInputElement | null>;
  tripTimeInputRef?: RefObject<HTMLInputElement | null>;
  returnDateInputRef?: RefObject<HTMLInputElement | null>;
  returnTimeInputRef?: RefObject<HTMLInputElement | null>;
  onTripDateChange: (value: string) => void;
  onTripTimeChange: (value: string) => void;
  onReturnDateChange: (value: string) => void;
  onReturnTimeChange: (value: string) => void;
  onTimeBlur?: () => void;
};

export default function QuoteScheduleFields({
  variant = "quote",
  returnJourney,
  tripDate,
  tripTime,
  returnDate,
  returnTime,
  minTripDate,
  minReturnDate,
  minTripTime,
  minReturnTime,
  tripDateError = "",
  returnDateError = "",
  outboundTimeLabel,
  returnTimeLabel,
  tripDateInputRef,
  tripTimeInputRef,
  returnDateInputRef,
  returnTimeInputRef,
  onTripDateChange,
  onTripTimeChange,
  onReturnDateChange,
  onReturnTimeChange,
  onTimeBlur,
}: QuoteScheduleFieldsProps) {
  const isQuote = variant === "quote";
  const dateIncomplete = !tripDate.trim();
  const timeIncomplete = !tripTime.trim();

  return (
    <section
      id="quote-section-schedule"
      className="scroll-mt-44 space-y-3 md:scroll-mt-28"
      data-quote-schedule
    >
      <p
        data-booking-nav-heading
        tabIndex={-1}
        className={
          isQuote
            ? "form-label outline-none"
            : "text-xs font-semibold uppercase tracking-wider text-white outline-none"
        }
      >
        {isQuote ? "Pickup date & time" : "Pickup"}
        {isQuote && (dateIncomplete || timeIncomplete || (returnJourney && (!returnDate || !returnTime))) ? (
          <span className="ml-1.5 font-normal normal-case tracking-normal text-emerald/80">
            (required)
          </span>
        ) : null}
      </p>

      <div className="grid w-full min-w-0 max-w-full gap-3 sm:grid-cols-2">
        <div className="min-w-0 max-w-full">
          <label htmlFor="date" className="form-label">
            {returnJourney ? "Outbound date" : "Pickup date"}
          </label>
          <div
            className={quoteDateTimeFieldShellClass(
              scheduleFieldState({
                hasError: Boolean(tripDateError),
                complete: Boolean(tripDate.trim()),
              }),
            )}
          >
            <input
              id="date"
              ref={tripDateInputRef}
              name="date"
              type="date"
              min={minTripDate}
              value={tripDate}
              aria-invalid={Boolean(tripDateError)}
              aria-describedby={tripDateError ? "trip-date-error" : undefined}
              required
              onChange={(e) => onTripDateChange(e.target.value)}
              onInput={(e) => onTripDateChange((e.target as HTMLInputElement).value)}
              className={quoteDateTimeInputClass()}
            />
          </div>
        </div>
        <div className="min-w-0 max-w-full">
          <label htmlFor="time" className="form-label">
            {outboundTimeLabel}
          </label>
          <div
            className={quoteDateTimeFieldShellClass(
              scheduleFieldState({
                hasError: Boolean(tripDateError),
                complete: Boolean(tripTime.trim()),
              }),
            )}
          >
            <input
              id="time"
              ref={tripTimeInputRef}
              name="time"
              type="time"
              min={minTripTime}
              value={tripTime}
              aria-invalid={Boolean(tripDateError)}
              aria-describedby={tripDateError ? "trip-date-error" : undefined}
              required
              onChange={(e) => onTripTimeChange(e.target.value)}
              onInput={(e) => onTripTimeChange((e.target as HTMLInputElement).value)}
              onBlur={onTimeBlur}
              className={quoteDateTimeInputClass()}
            />
          </div>
        </div>
        <p
          id="trip-date-error"
          role={tripDateError ? "alert" : undefined}
          className="sm:col-span-2 min-h-[1.1rem] text-xs text-red-400"
        >
          {tripDateError || "\u00a0"}
        </p>
      </div>

      {returnJourney ? (
        <div className="grid w-full min-w-0 max-w-full gap-3 sm:grid-cols-2">
          <div className="min-w-0 max-w-full">
            <label htmlFor="returnDate" className="form-label">
              Return date
            </label>
            <div
              className={quoteDateTimeFieldShellClass(
                scheduleFieldState({
                  hasError: Boolean(returnDateError),
                  complete: Boolean(returnDate.trim()),
                }),
              )}
            >
              <input
                id="returnDate"
                ref={returnDateInputRef}
                name="returnDate"
                type="date"
                min={minReturnDate}
                value={returnDate}
                required
                onChange={(e) => onReturnDateChange(e.target.value)}
                onInput={(e) => onReturnDateChange((e.target as HTMLInputElement).value)}
                className={quoteDateTimeInputClass()}
              />
            </div>
          </div>
          <div className="min-w-0 max-w-full">
            <label htmlFor="returnTime" className="form-label">
              {returnTimeLabel}
            </label>
            <div
              className={quoteDateTimeFieldShellClass(
                scheduleFieldState({
                  hasError: Boolean(returnDateError),
                  complete: Boolean(returnTime.trim()),
                }),
              )}
            >
              <input
                id="returnTime"
                ref={returnTimeInputRef}
                name="returnTime"
                type="time"
                min={minReturnTime}
                value={returnTime}
                required
                onChange={(e) => onReturnTimeChange(e.target.value)}
                onInput={(e) => onReturnTimeChange((e.target as HTMLInputElement).value)}
                onBlur={onTimeBlur}
                className={quoteDateTimeInputClass()}
              />
            </div>
          </div>
          <p className="sm:col-span-2 min-h-[1.1rem] text-xs text-red-400">
            {returnDateError || "\u00a0"}
          </p>
        </div>
      ) : null}
    </section>
  );
}
