"use client";

import {
  COMBINED_AIRPORT_ACCESS_RETURN_NOTE,
  EXPRESS_DROP_OFF_REMOVED_EXPLANATION,
  combinedQuoteExpressTitle,
  combinedQuoteFreeTitle,
  expressQuoteExpressHint,
  expressQuoteFreeHint,
} from "../../shared/express-drop-off";
import {
  accessChoiceStyles,
  type AirportAccessTone,
} from "@/components/ExpressDropOffSelector";

type Props = {
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
};

/**
 * Single always-visible "Airport access" control for a return booking.
 */
export default function CombinedAirportAccessSelector({
  totalFeeGbp,
  selected,
  removalAcknowledged: _removalAcknowledged,
  onSelectedChange,
  onRemovalAcknowledgedChange,
  requireAcknowledgement: _requireAcknowledgement = false,
  allowFreeAlternative = true,
  className = "",
  tone = "on-dark",
}: Props) {
  const groupName = "combined-airport-access";
  const light = tone === "on-light";
  const styles = accessChoiceStyles(light);

  return (
    <fieldset
      className={`min-w-0 space-y-2 ${className}`}
      aria-describedby={!selected && allowFreeAlternative ? `${groupName}-note` : undefined}
    >
      <legend className={`px-0.5 text-sm font-semibold ${styles.heading}`}>
        Airport access option
      </legend>
      <p className={`px-0.5 text-xs ${styles.hint}`}>{COMBINED_AIRPORT_ACCESS_RETURN_NOTE}</p>

      <div role="radiogroup" aria-label="Airport access options" className="space-y-2">
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
              {combinedQuoteExpressTitle(totalFeeGbp, selected)}
            </span>
            <span className={`mt-0.5 block text-xs font-normal ${styles.hint}`}>
              {expressQuoteExpressHint("drop-off")}
            </span>
          </span>
        </label>

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
              className={`mt-0.5 h-4 w-4 shrink-0 ${styles.radio}`}
            />
            <span className="min-w-0 leading-snug">
              <span className="block font-semibold">
                {combinedQuoteFreeTitle(totalFeeGbp, !selected)}
              </span>
              <span className={`mt-0.5 block text-xs font-normal ${styles.hint}`}>
                {expressQuoteFreeHint("drop-off")}
              </span>
            </span>
          </label>
        ) : null}
      </div>

      {allowFreeAlternative && !selected ? (
        <p id={`${groupName}-note`} className={`text-xs leading-relaxed ${styles.note}`}>
          {EXPRESS_DROP_OFF_REMOVED_EXPLANATION}
        </p>
      ) : null}
    </fieldset>
  );
}
