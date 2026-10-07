"use client";

import {
  canOfferExpressFreeAlternative,
  expressAirportOptionHeading,
  expressQuoteExpressHint,
  expressQuoteExpressTitle,
  expressQuoteFreeHint,
  expressQuoteFreeTitle,
  expressQuoteSelectionConfirmation,
  getExpressDropOffFeeGbp,
  type ExpressAirportService,
  type ExpressDropOffAirportCode,
} from "../../shared/express-drop-off";
import {
  AIRPORT_ACCESS_INCLUDED_BODY,
  AIRPORT_ACCESS_INCLUDED_HEADING,
} from "../../shared/executive-vehicle";
import { type AirportAccessChoice } from "../../shared/meet-greet";

export type AirportAccessTone = "on-dark" | "on-light";

type Props = {
  airportCode: ExpressDropOffAirportCode | "DUB";
  service?: ExpressAirportService;
  selected: boolean;
  removalAcknowledged: boolean;
  onSelectedChange: (selected: boolean) => void;
  onRemovalAcknowledgedChange: (acknowledged: boolean) => void;
  /** Pickup-only third choice. Omit on drop-off. */
  meetGreetFeeGbp?: number | null;
  accessChoice?: AirportAccessChoice;
  onAccessChoiceChange?: (choice: AirportAccessChoice) => void;
  /** When true, block continuing without acknowledgement (visual emphasis). */
  requireAcknowledgement?: boolean;
  /** Override free-alternative gate (defaults from shared config + service). */
  allowFreeAlternative?: boolean;
  /** Distinguishes outbound vs return radio groups on the same airport. */
  idPrefix?: string;
  /** Optional legend override, e.g. "Outbound journey – Airport drop-off". */
  heading?: string;
  /** Current transfer total, so the confirmation line matches the price. */
  fareTotalGbp?: number | null;
  /** Terminal access is already in the fare. No free/express or Meet & Greet choice. */
  terminalAccessIncluded?: boolean;
  className?: string;
  /** Light card (quote result) vs dark glass card. */
  tone?: AirportAccessTone;
};

/**
 * Accessible Express / Free airport-access choice — both options always visible.
 */
export default function ExpressDropOffSelector({
  airportCode,
  service = "drop-off",
  selected,
  removalAcknowledged: _removalAcknowledged,
  onSelectedChange,
  onRemovalAcknowledgedChange,
  meetGreetFeeGbp: _meetGreetFeeGbp = null,
  accessChoice,
  onAccessChoiceChange,
  requireAcknowledgement: _requireAcknowledgement = false,
  allowFreeAlternative,
  idPrefix,
  heading,
  fareTotalGbp = null,
  className = "",
  tone = "on-dark",
  terminalAccessIncluded = false,
}: Props) {
  const groupName = `${idPrefix ? `${idPrefix}-` : ""}express-airport-${service}-${airportCode}`;
  const freeAvailable =
    typeof allowFreeAlternative === "boolean"
      ? allowFreeAlternative
      : canOfferExpressFreeAlternative({ airportCode, service });
  const light = tone === "on-light";
  const styles = accessChoiceStyles(light);
  const legend = heading || expressAirportOptionHeading(service);
  const feeGbp = airportCode === "DUB" ? 0 : getExpressDropOffFeeGbp(airportCode);
  const choice: AirportAccessChoice =
    accessChoice === "meet-greet" ? "express" : (accessChoice ?? (selected ? "express" : "free"));
  const choose = (next: AirportAccessChoice) => {
    onAccessChoiceChange?.(next);
    onSelectedChange(next === "express");
    onRemovalAcknowledgedChange(next !== "express");
  };

  if (terminalAccessIncluded) {
    return (
      <div
        className={`min-w-0 max-w-full ${className}`}
        data-airport-access-included
        data-express-service={service}
        data-express-selected="express"
      >
        <p className={`text-sm font-semibold ${styles.heading}`}>{AIRPORT_ACCESS_INCLUDED_HEADING}</p>
        <p className={`mt-1 text-xs leading-snug ${styles.hint}`}>{AIRPORT_ACCESS_INCLUDED_BODY}</p>
      </div>
    );
  }

  return (
    <fieldset
      className={`min-w-0 max-w-full space-y-2 overflow-hidden ${className}`}
      data-express-service={service}
      data-express-selected={choice}
      aria-describedby={`${groupName}-note`}
    >
      <legend className={`px-0.5 text-sm font-semibold ${styles.heading}`}>
        {legend}
      </legend>

      <div
        role="radiogroup"
        aria-label={`${legend} options`}
        className="space-y-2"
      >
        {freeAvailable || airportCode === "DUB" ? (
          <label className={`${styles.card} ${choice === "free" ? styles.selectedFree : styles.idle}`}>
            <input
              type="radio"
              name={groupName}
              checked={choice === "free"}
              onChange={() => choose("free")}
              className={`mt-0.5 h-4 w-4 shrink-0 ${styles.radio}`}
            />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block break-words font-semibold">
                {airportCode === "DUB"
                  ? "Standard pickup"
                  : expressQuoteFreeTitle(airportCode, service, choice === "free")}
              </span>
              <span className={`mt-0.5 block break-words text-xs font-normal ${styles.hint}`}>
                {airportCode === "DUB"
                  ? "Meet at the airport’s paid pickup point."
                  : expressQuoteFreeHint(service, airportCode)}
              </span>
            </span>
          </label>
        ) : null}

        {airportCode !== "DUB" ? (
          <label className={`${styles.card} ${choice === "express" ? styles.selected : styles.idle}`}>
            <input
              type="radio"
              name={groupName}
              checked={choice === "express"}
              onChange={() => choose("express")}
              className={`mt-0.5 h-4 w-4 shrink-0 ${styles.radio}`}
            />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block break-words font-semibold">
                {expressQuoteExpressTitle(airportCode, service, choice === "express")}
              </span>
              <span className={`mt-0.5 block break-words text-xs font-normal ${styles.hint}`}>
                {expressQuoteExpressHint(service)}
              </span>
            </span>
          </label>
        ) : null}

      </div>

      <p id={`${groupName}-note`} className={`break-words text-xs font-medium leading-relaxed ${styles.note}`}>
        {airportCode === "DUB"
            ? "✓ Standard pickup selected."
            : expressQuoteSelectionConfirmation({
                service,
                expressSelected: choice === "express",
                feeGbp,
                totalGbp: fareTotalGbp,
              })}
      </p>
    </fieldset>
  );
}

export function accessChoiceStyles(light: boolean) {
  return {
    heading: light ? "text-navy" : "text-white",
    hint: light ? "text-[#475569]" : "quote-secondary",
    note: light ? "text-[#334155]" : "quote-secondary",
    radio: light ? "border-navy/30 accent-emerald" : "border-white/40 accent-emerald",
    card: "flex w-full min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
    selected: light
      ? "border-emerald bg-emerald/15 text-navy ring-2 ring-emerald/35"
      : "quote-choice-selected",
    selectedFree: light
      ? "border-emerald bg-emerald/15 text-navy ring-2 ring-emerald/35"
      : "border-amber-400/55 bg-amber-500/12 text-white",
    idle: light
      ? "border-navy/15 text-navy/80 hover:border-navy/30"
      : "border-white/28 text-white hover:border-white/42",
  };
}
