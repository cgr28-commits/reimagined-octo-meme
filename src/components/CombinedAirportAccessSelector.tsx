"use client";

import {
  COMBINED_AIRPORT_ACCESS_RETURN_NOTE,
  EXPRESS_DROP_OFF_REMOVED_EXPLANATION,
  combinedQuoteExpressHint,
  combinedQuoteExpressTitle,
  combinedQuoteFreeHint,
  combinedQuoteFreeTitle,
  expressAirportOptionHeading,
  expressDropOffSelectionConfirmation,
} from "../../shared/express-drop-off";
import {
  accessChoiceStyles,
  type AirportAccessTone,
} from "@/components/ExpressDropOffSelector";

type Props = {
  /** Airport used to look up the per-leg Express fee (BFS £5 / BHD £4). */
  airportCode?: string | null;
  /** Total Express fee across both legs (e.g. two BFS legs = £5 + £5 = £10). */
  totalFeeGbp: number;
  /** True when Express is selected for both legs. */
  selected: boolean;
  removalAcknowledged: boolean;
  onSelectedChange: (selected: boolean) => void;
  onRemovalAcknowledgedChange: (acknowledged: boolean) => void;
  requireAcknowledgement?: boolean;
  /** Only offer the free alternative when every leg supports it. */
  allowFreeAlternative?: boolean;
  className?: string;
  tone?: AirportAccessTone;
  /** Current calculated total, used in the selection confirmation. */
  fareTotalGbp?: number | null;
};

/**
 * Single always-visible "Airport access" control for a return booking.
 */
export default function CombinedAirportAccessSelector({
  airportCode,
  totalFeeGbp,
  selected,
  removalAcknowledged: _removalAcknowledged,
  onSelectedChange,
  onRemovalAcknowledgedChange,
  requireAcknowledgement: _requireAcknowledgement = false,
  allowFreeAlternative = true,
  className = "",
  tone = "on-dark",
  fareTotalGbp = null,
}: Props) {
  const groupName = "combined-airport-access";
  const light = tone === "on-light";
  const styles = accessChoiceStyles(light);
  const sectionHeading = expressAirportOptionHeading("drop-off");
  const showFareConfirmation =
    typeof fareTotalGbp === "number" && Number.isFinite(fareTotalGbp);
  const confirmation = showFareConfirmation
    ? expressDropOffSelectionConfirmation({
        selected,
        addedFeeGbp: totalFeeGbp,
        fareTotalGbp,
      })
    : null;

  return (
    <fieldset
      className={`min-w-0 space-y-2 ${className}`}
      aria-describedby={
        confirmation || (!selected && allowFreeAlternative) ? `${groupName}-note` : undefined
      }
    >
      <legend className={`px-0.5 text-sm font-semibold ${styles.heading}`}>
        {sectionHeading}
      </legend>
      <p className={`px-0.5 text-[0.8125rem] font-medium leading-snug ${styles.hint}`}>
        {COMBINED_AIRPORT_ACCESS_RETURN_NOTE}
      </p>

      <div role="radiogroup" aria-label={`${sectionHeading} options`} className="space-y-3">
        {allowFreeAlternative ? (
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
                {combinedQuoteFreeTitle(totalFeeGbp, !selected)}
              </span>
              <span className={`mt-1 block break-words text-[0.8125rem] font-medium leading-snug ${styles.hint}`}>
                {combinedQuoteFreeHint(airportCode)}
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
              {combinedQuoteExpressTitle(totalFeeGbp, selected)}
            </span>
            <span className={`mt-1 block break-words text-[0.8125rem] font-medium leading-snug ${styles.hint}`}>
              {combinedQuoteExpressHint(airportCode)}
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
      ) : allowFreeAlternative && !selected ? (
        <p id={`${groupName}-note`} className={`text-sm font-medium leading-relaxed ${styles.note}`}>
          {EXPRESS_DROP_OFF_REMOVED_EXPLANATION}
        </p>
      ) : null}
    </fieldset>
  );
}
