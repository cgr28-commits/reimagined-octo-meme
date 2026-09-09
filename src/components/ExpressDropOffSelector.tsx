"use client";

import {
  canOfferExpressFreeAlternative,
  expressAirportOptionHeading,
  expressDropOffRemovedExplanation,
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
}: Props) {
  const groupName = `${idPrefix ? `${idPrefix}-` : ""}express-airport-${service}-${airportCode}`;
  const freeAvailable =
    typeof allowFreeAlternative === "boolean"
      ? allowFreeAlternative
      : canOfferExpressFreeAlternative({ airportCode, service });
  const light = tone === "on-light";
  const styles = accessChoiceStyles(light);

  return (
    <fieldset
      className={`min-w-0 space-y-2 ${className}`}
      aria-describedby={!selected && freeAvailable ? `${groupName}-note` : undefined}
    >
      <legend className={`px-0.5 text-sm font-semibold ${styles.heading}`}>
        {heading || expressAirportOptionHeading(service)}
      </legend>

      <div
        role="radiogroup"
        aria-label={`${heading || expressAirportOptionHeading(service)} options`}
        className="space-y-2"
      >
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
          <span className="min-w-0 leading-snug">
            <span className="block font-semibold">
              {expressQuoteExpressTitle(airportCode, service, selected)}
            </span>
            <span className={`mt-0.5 block text-xs font-normal ${styles.hint}`}>
              {expressQuoteExpressHint(service)}
            </span>
          </span>
        </label>

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
            <span className="min-w-0 leading-snug">
              <span className="block font-semibold">
                {expressQuoteFreeTitle(airportCode, service, !selected)}
              </span>
              <span className={`mt-0.5 block text-xs font-normal ${styles.hint}`}>
                {expressQuoteFreeHint(service)}
              </span>
            </span>
          </label>
        ) : null}
      </div>

      {freeAvailable && !selected ? (
        <p id={`${groupName}-note`} className={`text-xs leading-relaxed ${styles.note}`}>
          {expressDropOffRemovedExplanation(service)}
        </p>
      ) : null}
    </fieldset>
  );
}

export function accessChoiceStyles(light: boolean) {
  return {
    heading: light ? "text-navy" : "text-white",
    hint: light ? "text-navy/55" : "text-white/55",
    note: light ? "text-navy/70" : "text-white/70",
    radio: light ? "border-navy/30 accent-emerald" : "border-white/30 accent-emerald",
    card: "flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors",
    selected: light
      ? "border-emerald bg-emerald/15 text-navy"
      : "border-emerald bg-emerald/10 text-white",
    selectedFree: light
      ? "border-amber-600/50 bg-amber-500/15 text-navy"
      : "border-amber-400/50 bg-amber-500/10 text-white",
    idle: light
      ? "border-navy/15 text-navy/80 hover:border-navy/30"
      : "border-white/15 text-white/80 hover:border-white/30",
  };
}
