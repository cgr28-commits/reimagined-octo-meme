"use client";

import {
  COMBINED_AIRPORT_ACCESS_RETURN_NOTE,
  EXPRESS_DROP_OFF_PASSED_ON_NOTE,
  combinedAirportAccessConfirmRemovalLabel,
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
  requireAcknowledgement?: boolean;
  /** Only offer the free alternative when every leg supports it. */
  allowFreeAlternative?: boolean;
  className?: string;
};

/**
 * Single "Airport access" control for a return booking. The customer makes
 * one choice that is applied to both the outbound and return legs together —
 * the underlying legs remain independently tracked in booking/pricing state.
 */
export default function CombinedAirportAccessSelector({
  totalFeeGbp,
  selected,
  removalAcknowledged,
  onSelectedChange,
  onRemovalAcknowledgedChange,
  requireAcknowledgement = false,
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
              onChange={() => onSelectedChange(false)}
              className="mt-1 h-4 w-4 shrink-0 border-white/30 accent-emerald"
            />
            <span className="min-w-0 leading-snug">
              {combinedAirportAccessRemoveLabel(totalFeeGbp)}
            </span>
          </label>
        ) : null}
      </div>

      {allowFreeAlternative && !selected ? (
        <div className="space-y-2 rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2.5">
          <label
            className={`flex min-h-11 cursor-pointer items-start gap-3 text-sm ${
              requireAcknowledgement && !removalAcknowledged
                ? "text-amber-100"
                : "text-white/85"
            }`}
          >
            <input
              type="checkbox"
              checked={removalAcknowledged}
              onChange={(e) => onRemovalAcknowledgedChange(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 rounded border-white/30 accent-emerald"
              aria-required={requireAcknowledgement}
            />
            <span className="min-w-0 leading-snug">
              {combinedAirportAccessConfirmRemovalLabel()}
            </span>
          </label>
        </div>
      ) : null}

      <p id={`${groupName}-note`} className="text-xs text-white/50">
        {EXPRESS_DROP_OFF_PASSED_ON_NOTE}
      </p>
    </fieldset>
  );
}
