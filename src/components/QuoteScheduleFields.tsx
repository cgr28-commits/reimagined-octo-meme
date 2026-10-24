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

// Display only: keep the full ISO date in the native input and existing booking state.
function mobileDateText(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Select date";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year.slice(-2)}`;
}

export type QuoteScheduleFieldsProps = {
  variant?: "quote" | "checkout";
  homepageInline?: boolean;
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
  homepageInline = false,
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

  const fieldGridClass = isQuote
    ? `grid w-full min-w-0 max-w-full ${homepageInline ? "grid-cols-2 gap-2 sm:gap-3" : "gap-3 sm:grid-cols-2"}`
    : "grid w-full min-w-0 max-w-full gap-2 sm:grid-cols-2";

  return (
    <section
      id="quote-section-schedule"
      className={`scroll-mt-44 md:scroll-mt-28 ${isQuote ? (homepageInline ? "space-y-0 sm:space-y-3" : "space-y-3") : "space-y-2"}`}
      data-quote-schedule
      data-homepage-inline-schedule={homepageInline || undefined}
    >
      {isQuote ? (
      <p
        data-booking-nav-heading
        tabIndex={-1}
        className={`form-label outline-none ${homepageInline ? "sr-only sm:not-sr-only" : ""}`}
      >
        Pickup date & time
        {dateIncomplete || timeIncomplete || (returnJourney && (!returnDate || !returnTime)) ? (
          <span className="ml-1.5 font-normal normal-case tracking-normal text-emerald/80">
            (required)
          </span>
        ) : null}
      </p>
      ) : null}

      <div className={fieldGridClass}>
        <div className="min-w-0 max-w-full">
          <label htmlFor="date" className="form-label">
            {returnJourney ? "Outbound date" : "Pickup date"}
          </label>
          <div
            data-schedule-control={homepageInline ? "date" : undefined}
            data-schedule-empty={homepageInline && !tripDate ? true : undefined}
            className={`${homepageInline ? "homepage-matched-date-time" : ""} ${quoteDateTimeFieldShellClass(
              scheduleFieldState({
                hasError: Boolean(tripDateError),
                complete: Boolean(tripDate.trim()),
              }),
            )}`}
          >
            {homepageInline ? <span className="homepage-schedule-prompt" aria-hidden="true">{mobileDateText(tripDate)}</span> : null}
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
            data-schedule-control={homepageInline ? "time" : undefined}
            data-schedule-empty={homepageInline && !tripTime ? true : undefined}
            className={quoteDateTimeFieldShellClass(
              scheduleFieldState({
                hasError: Boolean(tripDateError),
                complete: Boolean(tripTime.trim()),
              }),
            )}`}
          >
            {homepageInline ? <span className="homepage-schedule-prompt" aria-hidden="true">{tripTime ? tripTime.slice(0, 5) : "Select time"}</span> : null}
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
          className={`sm:col-span-2 text-xs text-red-400 ${homepageInline ? "min-h-0 sm:min-h-[1.1rem]" : "min-h-[1.1rem]"}`}
        >
          {tripDateError || (homepageInline ? null : "\u00a0")}
        </p>
      </div>

      {returnJourney ? (
        <div className={fieldGridClass}>
          <div className="min-w-0 max-w-full">
            <label htmlFor="returnDate" className="form-label">
              Return date
            </label>
            <div
              data-schedule-control={homepageInline ? "date" : undefined}
              data-schedule-empty={homepageInline && !returnDate ? true : undefined}
              className={quoteDateTimeFieldShellClass(
                scheduleFieldState({
                  hasError: Boolean(returnDateError),
                  complete: Boolean(returnDate.trim()),
                }),
              )}`}
            >
              {homepageInline ? <span className="homepage-schedule-prompt" aria-hidden="true">{mobileDateText(returnDate)}</span> : null}
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
              data-schedule-control={homepageInline ? "time" : undefined}
              data-schedule-empty={homepageInline && !returnTime ? true : undefined}
              className={quoteDateTimeFieldShellClass(
                scheduleFieldState({
                  hasError: Boolean(returnDateError),
                  complete: Boolean(returnTime.trim()),
                }),
              )}`}
            >
              {homepageInline ? <span className="homepage-schedule-prompt" aria-hidden="true">{returnTime ? returnTime.slice(0, 5) : "Select time"}</span> : null}
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
          <p className={`sm:col-span-2 text-xs text-red-400 ${homepageInline ? "min-h-0 sm:min-h-[1.1rem]" : "min-h-[1.1rem]"}`}>
            {returnDateError || (homepageInline ? null : "\u00a0")}
          </p>
        </div>
      ) : null}
    </section>
  );
}
