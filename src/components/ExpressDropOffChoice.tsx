"use client";

import ExpressDropOffSelector, {
  type AirportAccessTone,
} from "@/components/ExpressDropOffSelector";
import {
  EXPRESS_DROP_OFF_PASSED_ON_NOTE,
  expressDropOffBreakdownLabel,
  type ExpressAirportService,
  type ExpressDropOffAirportCode,
} from "../../shared/express-drop-off";
import {
  AIRPORT_ACCESS_INCLUDED_BODY,
  AIRPORT_ACCESS_INCLUDED_HEADING,
} from "../../shared/executive-vehicle";
import {
  MEET_GREET_DESCRIPTION,
  formatMeetGreetGbp,
  type AirportAccessChoice,
} from "../../shared/meet-greet";

type Props = {
  airportCode: ExpressDropOffAirportCode | "DUB";
  service?: ExpressAirportService;
  selected: boolean;
  removalAcknowledged: boolean;
  onSelectedChange: (selected: boolean) => void;
  onRemovalAcknowledgedChange: (acknowledged: boolean) => void;
  meetGreetFeeGbp?: number | null;
  accessChoice?: AirportAccessChoice;
  onAccessChoiceChange?: (choice: AirportAccessChoice) => void;
  requireAcknowledgement?: boolean;
  allowFreeAlternative?: boolean;
  /**
   * summary — payment pages: show choice + Change.
   * full — initial quote: always show the selector.
   */
  mode?: "full" | "summary";
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  idPrefix?: string;
  heading?: string;
  fareTotalGbp?: number | null;
  /** Terminal access is in the fare. Hide free/express and Meet & Greet choices. */
  terminalAccessIncluded?: boolean;
  className?: string;
  tone?: AirportAccessTone;
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
  meetGreetFeeGbp = null,
  accessChoice,
  onAccessChoiceChange,
  requireAcknowledgement = false,
  allowFreeAlternative,
  mode = "full",
  editing = false,
  onEditingChange,
  idPrefix,
  heading,
  fareTotalGbp = null,
  terminalAccessIncluded = false,
  className = "",
  tone = "on-dark",
}: Props) {
  if (terminalAccessIncluded) {
    const light = tone === "on-light";
    return (
      <div className={`min-w-0 ${className}`} data-airport-access-included>
        <p className={`text-sm font-semibold ${light ? "text-navy" : "text-white"}`}>
          {AIRPORT_ACCESS_INCLUDED_HEADING}
        </p>
        <p className={`mt-1 text-xs leading-snug ${light ? "text-[#475569]" : "text-white/75"}`}>
          {AIRPORT_ACCESS_INCLUDED_BODY}
        </p>
      </div>
    );
  }

  if (mode === "summary" && !editing) {
    return (
      <div
        className={`min-w-0 space-y-2 rounded-xl quote-panel px-3 py-3 ${className}`}
      >
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1 text-sm text-white/85">
            <p className="font-medium text-white">
              {heading ||
                (service === "pick-up" ? "Express Pick-Up" : "Express Drop-Off")}
            </p>
            <p>
              {accessChoice === "meet-greet" && typeof meetGreetFeeGbp === "number"
                ? `Meet & Greet — ${formatMeetGreetGbp(meetGreetFeeGbp)}. ${MEET_GREET_DESCRIPTION}`
                : airportCode === "DUB"
                  ? "Standard pickup"
                  : expressDropOffBreakdownLabel(airportCode, selected, service)}
            </p>
            <p className="text-xs quote-secondary">{EXPRESS_DROP_OFF_PASSED_ON_NOTE}</p>
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
        meetGreetFeeGbp={meetGreetFeeGbp}
        accessChoice={accessChoice}
        onAccessChoiceChange={onAccessChoiceChange}
        requireAcknowledgement={requireAcknowledgement}
        allowFreeAlternative={allowFreeAlternative}
        idPrefix={idPrefix}
        heading={heading}
        fareTotalGbp={fareTotalGbp}
        terminalAccessIncluded={terminalAccessIncluded}
        tone={tone}
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
