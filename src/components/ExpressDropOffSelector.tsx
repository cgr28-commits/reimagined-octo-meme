"use client";

import {
  EXPRESS_DROP_OFF_FEES_GBP,
  canOfferExpressFreeAlternative,
  expressAirportOptionHeading,
  expressDropOffRemovedExplanation,
  expressDropOffSelectionConfirmation,
  expressQuoteExpressHint,
  expressQuoteExpressTitle,
  expressQuoteFreeHint,
  expressQuoteFreeTitle,
  type ExpressAirportService,
  type ExpressDropOffAirportCode,
} from "../../shared/express-drop-off";

export type AirportAccessTone = "on-dark" | "on-light";

type Props = {
  airportCode: ExpressDropOffAirportCode;
  service?: ExpressAirportService;
  selected: boolean;
  removalAcknowledged: boolean;
  onSelectedChange: (selected: boolean) => void;
  onRemovalAcknowledgedChange: (acknowledged: boolean) => void;
  /** When true, block continuing without acknowledgement (visual emphasis). */
  requireAcknowledgement?: boolean;
  /** Override free-alternative gate (defaults from shared config + service). */
  allowFreeAlternative?: boolean;
  /** Distinguishes outbound vs return radio groups on the same airport. */
  idPrefix?: string;
  /** Optional legend override, e.g. "Outbound journey – Airport drop-off". */
  heading?: string;
  className?: string;
  /** Light card (quote result) vs dark glass card. */
  tone?: AirportAccessTone;
  /** Current calculated total, used in the selection confirmation. */
  fareTotalGbp?: number | null;
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
  requireAcknowledgement: _requireAcknowledgement = false,
  allowFreeAlternative,
  idPrefix,
  heading,
  className = "",
  tone = "on-dark",
  fareTotalGbp = null,
}: Props) {
  const groupName = `${idPrefix ? `${idPrefix}-` : ""}express-airport-${service}-${airportCode}`;
  const freeAvailable =
    typeof allowFreeAlternative === "boolean"
      ? allowFreeAlternative
      : canOfferExpressFreeAlternative({ airportCode, service });
  const light = tone === "on-light";
  const styles = accessChoiceStyles(light);
  const sectionHeading = heading || expressAirportOptionHeading(service);
  const showFareConfirmation =
    typeof fareTotalGbp === "number" && Number.isFinite(fareTotalGbp);
  const confirmation = showFareConfirmation
    ? expressDropOffSelectionConfirmation({
        service,
        selected,
        addedFeeGbp: EXPRESS_DROP_OFF_FEES_GBP[airportCode],
        fareTotalGbp,
      })
    : null;

  return (
    <fieldset
      className={`min-w-0 space-y-2 ${className}`}
      aria-describedby={confirmation || (!selected && freeAvailable) ? `${groupName}-note` : undefined}
    >
      <legend className={`px-0.5 text-sm font-semibold ${styles.heading}`}>
        {sectionHeading}
      </legend>

      <div
        role="radiogroup"
        aria-label={`${sectionHeading} options`}
        className="space-y-3"
      >
        {freeAvailable ? (
          <label className={`${styles.card} ${!selected ? styles.selectedFree : styles.idle}`}>
            <input
              type="radio"
              name={groupName}
              checked={!selected}
              onChange={() => {
                onSelectedChange(false);
                onRemovalAcknowledgedChange(true);
              }}
              className={`mt-1 h-5 w-5 shrink-0 ${styles.radio}`}
            />
            <span className="min-w-0 leading-snug">
              <span className="block break-words font-semibold">
                {expressQuoteFreeTitle(airportCode, service, !selected)}
              </span>
              <span className={`mt-1 block break-words text-[0.8125rem] font-medium leading-snug ${styles.hint}`}>
                {expressQuoteFreeHint(service, airportCode)}
              </span>
            </span>
          </label>
        ) : null}

        <label className={`${styles.card} ${selected ? styles.selected : styles.idle}`}>
          <input
            type="radio"
            name={groupName}
            checked={selected}
            onChange={() => {
              onSelectedChange(true);
              onRemovalAcknowledgedChange(false);
            }}
            className={`mt-1 h-5 w-5 shrink-0 ${styles.radio}`}
          />
          <span className="min-w-0 leading-snug">
            <span className="block break-words font-semibold">
              {expressQuoteExpressTitle(airportCode, service, selected)}
            </span>
            <span className={`mt-1 block break-words text-[0.8125rem] font-medium leading-snug ${styles.hint}`}>
              {expressQuoteExpressHint(service)}
            </span>
          </span>
        </label>
      </div>

      {confirmation ? (
        <p
          id={`${groupName}-note`}
          className={`text-sm font-medium leading-relaxed ${styles.note}`}
          data-express-selection-confirmation
        >
          {confirmation}
        </p>
      ) : freeAvailable && !selected ? (
        <p id={`${groupName}-note`} className={`text-sm font-medium leading-relaxed ${styles.note}`}>
          {expressDropOffRemovedExplanation(service)}
        </p>
      ) : null}
    </fieldset>
  );
}

export function accessChoiceStyles(light: boolean) {
  return {
    heading: light ? "text-navy" : "text-white",
    hint: light ? "text-[#475569]" : "quote-secondary",
    note: light ? "text-navy" : "quote-secondary",
    radio: light ? "border-navy/30 accent-emerald" : "border-white/40 accent-emerald",
    card: "flex min-h-12 cursor-pointer touch-manipulation items-start gap-3 rounded-xl border px-3 py-3 text-sm transition-colors",
    selected: light
      ? "border-2 border-emerald bg-emerald/15 text-navy ring-2 ring-emerald/30"
      : "quote-choice-selected",
    selectedFree: light
      ? "border-2 border-emerald bg-emerald/10 text-navy ring-2 ring-emerald/25"
      : "border-2 border-emerald/80 bg-emerald/15 text-white",
    idle: light
      ? "border-navy/20 text-navy hover:border-navy/40"
      : "border-white/28 text-white hover:border-white/42",
  };
}
