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
  /** Current transfer total, so the confirmation line matches the price. */
  fareTotalGbp?: number | null;
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
  requireAcknowledgement: _requireAcknowledgement = false,
  allowFreeAlternative,
  idPrefix,
  heading,
  fareTotalGbp = null,
  className = "",
  tone = "on-dark",
}: Props) {
  const groupName = `${idPrefix ? `${idPrefix}-` : ""}express-airport-${service}-${airportCode}`;
  const freeAvailable =
    typeof allowFreeAlternative === "boolean"
      ? allowFreeAlternative
      : canOfferExpressFreeAlternative({ airportCode, service });
  const light = tone === "on-light";
  const styles = accessChoiceStyles(light);
  const legend = heading || expressAirportOptionHeading(service);
  const feeGbp = getExpressDropOffFeeGbp(airportCode);

  return (
    <fieldset
      className={`min-w-0 max-w-full space-y-2 overflow-hidden ${className}`}
      data-express-service={service}
      data-express-selected={selected ? "express" : "free"}
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
              className={`mt-0.5 h-4 w-4 shrink-0 ${styles.radio}`}
            />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block break-words font-semibold">
                {expressQuoteFreeTitle(airportCode, service, !selected)}
              </span>
              <span className={`mt-0.5 block break-words text-xs font-normal ${styles.hint}`}>
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
            className={`mt-0.5 h-4 w-4 shrink-0 ${styles.radio}`}
          />
          <span className="min-w-0 flex-1 leading-snug">
            <span className="block break-words font-semibold">
              {expressQuoteExpressTitle(airportCode, service, selected)}
            </span>
            <span className={`mt-0.5 block break-words text-xs font-normal ${styles.hint}`}>
              {expressQuoteExpressHint(service)}
            </span>
          </span>
        </label>
      </div>

      <p id={`${groupName}-note`} className={`break-words text-xs font-medium leading-relaxed ${styles.note}`}>
        {expressQuoteSelectionConfirmation({
          service,
          expressSelected: selected,
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
