"use client";

import {
  EXPRESS_DROP_OFF_PASSED_ON_NOTE,
  EXPRESS_DROP_OFF_REMOVED_EXPLANATION,
  expressDropOffConfirmRemovalLabel,
  expressDropOffRecommendedLabel,
  expressDropOffRemoveLabel,
  type ExpressDropOffAirportCode,
} from "../../shared/express-drop-off";

type Props = {
  airportCode: ExpressDropOffAirportCode;
  selected: boolean;
  removalAcknowledged: boolean;
  onSelectedChange: (selected: boolean) => void;
  onRemovalAcknowledgedChange: (acknowledged: boolean) => void;
  /** When true, block continuing without acknowledgement (visual emphasis). */
  requireAcknowledgement?: boolean;
  className?: string;
};

/**
 * Accessible Express Drop-Off selector — default recommended / optional remove.
 */
export default function ExpressDropOffSelector({
  airportCode,
  selected,
  removalAcknowledged,
  onSelectedChange,
  onRemovalAcknowledgedChange,
  requireAcknowledgement = false,
  className = "",
}: Props) {
  const groupName = `express-drop-off-${airportCode}`;

  return (
    <fieldset
      className={`min-w-0 space-y-3 rounded-xl border border-white/10 bg-white/5 px-3 py-3 ${className}`}
      aria-describedby={`${groupName}-note`}
    >
      <legend className="px-1 text-sm font-semibold text-white">
        Airport Express Drop-Off
      </legend>

      <div role="radiogroup" aria-label="Express Drop-Off options" className="space-y-2">
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
            {expressDropOffRecommendedLabel(airportCode)}
          </span>
        </label>

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
            {expressDropOffRemoveLabel(airportCode)}
          </span>
        </label>
      </div>

      {!selected ? (
        <div className="space-y-2 rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2.5">
          <p className="text-xs leading-relaxed text-amber-100/90">
            {EXPRESS_DROP_OFF_REMOVED_EXPLANATION}
          </p>
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
              {expressDropOffConfirmRemovalLabel()}
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
