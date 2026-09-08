"use client";

import React from "react";
import {
  COMBINED_AIRPORT_ACCESS_REMOVED_EXPLANATION,
  COMBINED_AIRPORT_ACCESS_RETURN_NOTE,
  EXPRESS_DROP_OFF_PASSED_ON_NOTE,
  combinedAirportAccessRecommendedLabel,
  combinedAirportAccessRemoveLabel,
} from "../../shared/express-drop-off";

type Props = {
  /** Total Express fee across both legs (e.g. two BFS legs = £5 + £5 = £10). */
  totalFeeGbp: number;
  /** True when Express is selected for both legs. */
  selected: boolean;
  removalAcknowledged: boolean;
  onSelectedChange: (selected: boolean) => void;
  onRemovalAcknowledgedChange: (acknowledged: boolean) => void;
  /** Kept for callers; selecting the free option is enough acknowledgement. */
  requireAcknowledgement?: boolean;
  /** Only offer the free alternative when every leg supports it. */
  allowFreeAlternative?: boolean;
  className?: string;
};

/**
 * Single "Airport access" control for a return booking. One tap applies the
 * same Express / free choice to both legs. Choosing free immediately removes
 * the access charges and is treated as acknowledgement (no separate checkbox).
 */
export default function CombinedAirportAccessSelector({
  totalFeeGbp,
  selected,
  onSelectedChange,
  onRemovalAcknowledgedChange,
  allowFreeAlternative = true,
  className = "",
}: Props) {
  const groupName = "combined-airport-access";

  return (
    <fieldset
      className={`min-w-0 space-y-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 ${className}`}
      aria-describedby={`${groupName}-note`}
    >
      <legend className="px-1 text-sm font-semibold text-white">Airport access</legend>
      <p className="px-1 text-xs text-white/60">{COMBINED_AIRPORT_ACCESS_RETURN_NOTE}</p>

      <div role="radiogroup" aria-label="Airport access options" className="space-y-2">
        <label
          className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
            selected
              ? "border-emerald bg-emerald/10 text-white"
              : "border-white/15 text-white/80 hover:border-white/30"
          }`}
        >
          <input
            type="radio"
            name={groupName}
            checked={selected}
            onChange={() => {
              onSelectedChange(true);
              onRemovalAcknowledgedChange(false);
            }}
            className="mt-1 h-4 w-4 shrink-0 border-white/30 accent-emerald"
          />
          <span className="min-w-0 leading-snug">
            {combinedAirportAccessRecommendedLabel(totalFeeGbp)}
          </span>
        </label>

        {allowFreeAlternative ? (
          <label
            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
              !selected
                ? "border-amber-400/50 bg-amber-500/10 text-white"
                : "border-white/15 text-white/80 hover:border-white/30"
            }`}
          >
            <input
              type="radio"
              name={groupName}
              checked={!selected}
              onChange={() => {
                onSelectedChange(false);
                onRemovalAcknowledgedChange(true);
              }}
              className="mt-1 h-4 w-4 shrink-0 border-white/30 accent-emerald"
            />
            <span className="min-w-0 leading-snug">
              {combinedAirportAccessRemoveLabel(totalFeeGbp)}
            </span>
          </label>
        ) : null}
      </div>

      {allowFreeAlternative && !selected ? (
        <p className="text-xs leading-relaxed text-white/75">
          {COMBINED_AIRPORT_ACCESS_REMOVED_EXPLANATION}
        </p>
      ) : null}

      <p id={`${groupName}-note`} className="text-xs text-white/50">
        {EXPRESS_DROP_OFF_PASSED_ON_NOTE}
      </p>
    </fieldset>
  );
}
