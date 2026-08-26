"use client";

import ExpressDropOffSelector from "@/components/ExpressDropOffSelector";
import {
  EXPRESS_DROP_OFF_PASSED_ON_NOTE,
  expressDropOffBreakdownLabel,
  type ExpressAirportService,
  type ExpressDropOffAirportCode,
} from "../../shared/express-drop-off";

type Props = {
  airportCode: ExpressDropOffAirportCode;
  service?: ExpressAirportService;
  selected: boolean;
  removalAcknowledged: boolean;
  onSelectedChange: (selected: boolean) => void;
  onRemovalAcknowledgedChange: (acknowledged: boolean) => void;
  requireAcknowledgement?: boolean;
  allowFreeAlternative?: boolean;
  /**
   * summary — payment pages: show choice + Change.
   * full — initial quote: always show the selector.
   */
  mode?: "full" | "summary";
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  className?: string;
};

/**
 * Full Express control for the initial quote, or a compact
 * summary with Change on later payment pages.
 */
export default function ExpressDropOffChoice({
  airportCode,
  service = "drop-off",
  selected,
  removalAcknowledged,
  onSelectedChange,
  onRemovalAcknowledgedChange,
  requireAcknowledgement = false,
  allowFreeAlternative,
  mode = "full",
  editing = false,
  onEditingChange,
  className = "",
}: Props) {
  if (mode === "summary" && !editing) {
    return (
      <div
        className={`min-w-0 space-y-2 rounded-xl border border-white/10 bg-white/5 px-3 py-3 ${className}`}
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1 text-sm text-white/85">
            <p className="font-medium text-white">
              {service === "pick-up" ? "Express Pick-Up" : "Express Drop-Off"}
            </p>
            <p>{expressDropOffBreakdownLabel(airportCode, selected, service)}</p>
            <p className="text-xs text-white/50">{EXPRESS_DROP_OFF_PASSED_ON_NOTE}</p>
          </div>
          {allowFreeAlternative !== false ? (
            <button
              type="button"
              onClick={() => onEditingChange?.(true)}
              className="min-h-11 shrink-0 rounded-xl border border-white/20 px-3 text-sm font-semibold text-white hover:bg-white/5"
            >
              Change
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-w-0 space-y-2 ${className}`}>
      <ExpressDropOffSelector
        airportCode={airportCode}
        service={service}
        selected={selected}
        removalAcknowledged={removalAcknowledged}
        onSelectedChange={onSelectedChange}
        onRemovalAcknowledgedChange={onRemovalAcknowledgedChange}
        requireAcknowledgement={requireAcknowledgement}
        allowFreeAlternative={allowFreeAlternative}
      />
      {mode === "summary" && editing ? (
        <button
          type="button"
          onClick={() => onEditingChange?.(false)}
          className="min-h-10 text-sm font-medium text-white/70 underline-offset-2 hover:underline"
        >
          Done
        </button>
      ) : null}
    </div>
  );
}
