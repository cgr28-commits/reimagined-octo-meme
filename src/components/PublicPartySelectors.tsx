"use client";

import {
  formatPassengerChoice,
  formatSuitcaseChoice,
} from "@/lib/vehicle-selection";
import {
  QUOTE_CHOICE_OFF,
  QUOTE_CHOICE_ON,
} from "@/lib/quote-ui-highlight";
import {
  publicPassengerCapacityCopy,
  publicPassengerOptions,
  publicSuitcaseOptions,
} from "../../shared/passenger-limits";

/** Four columns so 1–7 wraps as 1–4 / 5–7 and bags as 0–3 / 4 / 5+ on ~390px. */
export const PUBLIC_PARTY_SELECTOR_COLUMNS = 4;

function choiceGridShellClass(hasError: boolean): string {
  const layout = "flex h-full flex-col";
  if (hasError) {
    return `${layout} rounded-2xl border border-red-400/70 bg-red-500/[0.08] p-2 ring-1 ring-red-400/35`;
  }
  return `${layout} rounded-2xl border border-white/14 bg-white/[0.03] p-2`;
}

export function PartyChoiceGrid({
  label,
  hint,
  options,
  value,
  onChange,
  formatOption,
  columns = PUBLIC_PARTY_SELECTOR_COLUMNS,
  needsCompletion = false,
  hasError = false,
}: {
  label: string;
  hint?: string;
  options: number[];
  value: number | null;
  onChange: (value: number) => void;
  formatOption?: (value: number) => string;
  columns?: number;
  needsCompletion?: boolean;
  hasError?: boolean;
}) {
  const cols = Math.min(columns, Math.max(1, options.length));
  return (
    <div className={choiceGridShellClass(hasError)}>
      <div className="mb-2">
        <p className="form-label mb-0 lg:min-h-9">
          {label}
          {needsCompletion && value == null ? (
            <span className="ml-1.5 font-normal normal-case tracking-normal text-emerald/80">
              (required)
            </span>
          ) : null}
        </p>
        <p
          className={
            hint
              ? "mt-1 text-[11px] font-medium leading-snug text-white/70 lg:min-h-8"
              : "mt-1 hidden text-[11px] font-medium leading-snug text-white/70 lg:block lg:min-h-8 lg:invisible"
          }
        >
          {hint || "Include all children in the passenger total."}
        </p>
      </div>
      <div
        className="grid grid-cols-4 gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        role="group"
        aria-label={label}
      >
        {options.map((option) => {
          const selected = value !== null && value === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option)}
              className={`min-h-12 rounded-xl text-base font-semibold transition-all lg:min-h-11 ${
                selected ? QUOTE_CHOICE_ON : QUOTE_CHOICE_OFF
              }`}
            >
              {formatOption ? formatOption(option) : String(option)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type PublicPartySelectorsProps = {
  publicMinibusEnabled: boolean;
  passengers: number | null;
  suitcases: number | null;
  onPassengersChange: (value: number) => void;
  onSuitcasesChange: (value: number) => void;
  passengersError?: string;
  suitcasesError?: string;
};

export default function PublicPartySelectors({
  publicMinibusEnabled,
  passengers,
  suitcases,
  onPassengersChange,
  onSuitcasesChange,
  passengersError = "",
  suitcasesError = "",
}: PublicPartySelectorsProps) {
  const passengerOptions = publicPassengerOptions(publicMinibusEnabled === true);
  const suitcaseOptions = publicSuitcaseOptions(publicMinibusEnabled === true);
  const selectedPassengers =
    passengers != null && passengerOptions.includes(passengers) ? passengers : null;
  const selectedSuitcases =
    suitcases != null && suitcaseOptions.includes(suitcases) ? suitcases : null;

  return (
    <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2 lg:items-stretch lg:gap-3.5">
      <div id="quote-section-passengers" className="order-1 flex h-full min-w-0 flex-col">
        <PartyChoiceGrid
          label="Passengers"
          hint="Include all children in the passenger total."
          options={passengerOptions}
          value={selectedPassengers}
          onChange={onPassengersChange}
          formatOption={formatPassengerChoice}
          needsCompletion={passengers == null}
          hasError={Boolean(passengersError)}
        />
        {passengersError ? (
          <p id="quote-passengers-error" role="alert" data-field-error className="mt-2 text-xs text-red-300">
            {passengersError}
          </p>
        ) : null}
      </div>

      {!passengersError ? (
        <p className="quote-secondary order-2 text-xs lg:order-3 lg:col-span-2">
          {publicPassengerCapacityCopy(publicMinibusEnabled === true)}
        </p>
      ) : null}

      <div id="quote-section-suitcases" className="order-3 flex h-full min-w-0 flex-col lg:order-2">
        <PartyChoiceGrid
          label="Standard suitcases (23kg)"
          options={suitcaseOptions}
          value={selectedSuitcases}
          onChange={onSuitcasesChange}
          formatOption={formatSuitcaseChoice}
          needsCompletion={suitcases == null}
          hasError={Boolean(suitcasesError)}
        />
        {suitcasesError ? (
          <p id="quote-suitcases-error" role="alert" data-field-error className="mt-2 text-xs text-red-300">
            {suitcasesError}
          </p>
        ) : null}
      </div>
    </div>
  );
}
