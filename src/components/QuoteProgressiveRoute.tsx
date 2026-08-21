"use client";

import { useEffect, useRef } from "react";
import type { SelectedPlace } from "@/lib/selected-place";
import AddressInput from "@/components/AddressInput";
import {
  CUSTOMER_AIRPORTS,
  QUOTE_JOURNEY_INTENT_OPTIONS,
  type CustomerAirportCode,
  type QuoteJourneyIntent,
} from "@/lib/quote-journey-intent";
import { SERVICE_FLAGS } from "@/lib/data";
import {
  AIRPORT_PICKUP_WAITING_COPY,
  GROUP_QUOTE_FEE_NOTE,
  NON_AIRPORT_WAITING_COPY,
} from "@/lib/journey-inclusions";
import { scheduleBookingNavAfterRender } from "@/lib/quote-step-nav-scroll";
import {
  FIVE_PLUS_PASSENGERS,
  FIVE_PLUS_SUITCASES,
  formatPassengerChoice,
  formatSuitcaseChoice,
} from "@/lib/vehicle-selection";
import type { QuickSelectAirportCode } from "@/lib/selected-place";

const SELECTABLE_AIRPORTS = CUSTOMER_AIRPORTS.filter(
  (airport) => SERVICE_FLAGS.belfastCityAirport || airport.code !== "BHD",
);

const SELECT_CARD =
  "flex min-h-[4.5rem] flex-col items-start justify-center rounded-2xl border px-4 py-3 text-left transition-all lg:min-h-[3.75rem] lg:px-3.5 lg:py-2.5";
const SELECT_CARD_ON = "border-emerald bg-emerald text-navy shadow-sm";
const SELECT_CARD_OFF =
  "border-white/15 bg-white/5 text-white hover:border-emerald/40 hover:bg-emerald/10";

function ChoiceGrid({
  label,
  options,
  value,
  onChange,
  formatOption,
  columns,
}: {
  label: string;
  options: number[];
  value: number | null;
  onChange: (value: number) => void;
  formatOption?: (value: number) => string;
  columns?: number;
}) {
  const cols = columns ?? options.length;
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">{label}</p>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(cols, options.length)}, minmax(0, 1fr))` }}
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
                selected
                  ? "bg-emerald text-navy shadow-sm"
                  : "border border-white/15 bg-white/5 text-white/85 hover:border-emerald/40 hover:text-white"
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

export type QuoteProgressiveRouteProps = {
  journeyIntent: QuoteJourneyIntent | null;
  onJourneyIntentChange: (intent: QuoteJourneyIntent) => void;
  selectedAirportCode: CustomerAirportCode | "";
  onAirportSelect: (code: CustomerAirportCode) => void;
  pickupAddress: string;
  dropoffAddress: string;
  onPickupChange: (value: string) => void;
  onDropoffChange: (value: string) => void;
  onPickupPlaceSelect: (place: SelectedPlace) => void;
  onDropoffPlaceSelect: (place: SelectedPlace) => void;
  pickupPlaceError: string;
  dropoffPlaceError: string;
  /** Confirmed place currently held by the parent (incl. restored from storage). */
  pickupConfirmedPlace?: SelectedPlace | null;
  dropoffConfirmedPlace?: SelectedPlace | null;
  pickupRestoredHint?: boolean;
  dropoffRestoredHint?: boolean;
  onClearPickup?: () => void;
  onClearDropoff?: () => void;
  addressLookupCode: string;
  journeyMode: "one-way" | "return" | null;
  onJourneyModeChange: (value: "one-way" | "return") => void;
  passengers: number | null;
  onPassengersChange: (value: number) => void;
  exactPassengers: number | null;
  onExactPassengersChange: (value: number | null) => void;
  suitcases: number | null;
  onSuitcasesChange: (value: number) => void;
  isGroupQuote: boolean;
  showRouteFields: boolean;
  /** Addresses complete — show One Way / Return (not passengers yet). */
  showJourneyModeFields: boolean;
  /** Journey mode chosen — show passenger / suitcase controls. */
  showPartyFields: boolean;
  journeyKindLabel?: string;
};

export default function QuoteProgressiveRoute({
  journeyIntent,
  onJourneyIntentChange,
  selectedAirportCode,
  onAirportSelect,
  pickupAddress,
  dropoffAddress,
  onPickupChange,
  onDropoffChange,
  onPickupPlaceSelect,
  onDropoffPlaceSelect,
  pickupPlaceError,
  dropoffPlaceError,
  pickupConfirmedPlace = null,
  dropoffConfirmedPlace = null,
  pickupRestoredHint = false,
  dropoffRestoredHint = false,
  onClearPickup,
  onClearDropoff,
  addressLookupCode,
  journeyMode,
  onJourneyModeChange,
  passengers,
  onPassengersChange,
  exactPassengers,
  onExactPassengersChange,
  suitcases,
  onSuitcasesChange,
  isGroupQuote,
  showRouteFields,
  showJourneyModeFields,
  showPartyFields,
  journeyKindLabel,
}: QuoteProgressiveRouteProps) {
  const showAirportPicker =
    journeyIntent === "to-airport" || journeyIntent === "from-airport";
  const airportChosen = Boolean(selectedAirportCode);
  const showAddresses =
    journeyIntent === "address-to-address" || (showAirportPicker && airportChosen);
  const returnJourney = journeyMode === "return";

  // Addresses complete → stop at One Way / Return (never skip to passengers).
  const hadJourneyModeScrollRef = useRef(false);
  useEffect(() => {
    if (!showJourneyModeFields) {
      hadJourneyModeScrollRef.current = false;
      return;
    }
    if (hadJourneyModeScrollRef.current) return;
    hadJourneyModeScrollRef.current = true;
    // Blur active address field so suggestion overlays dismiss before scroll.
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    return scheduleBookingNavAfterRender("quote-section-journey-mode");
  }, [showJourneyModeFields]);

  // One Way / Return chosen → then move to passengers / suitcases.
  const hadPartyFieldsScrollRef = useRef(false);
  useEffect(() => {
    if (!showPartyFields || journeyMode == null) {
      hadPartyFieldsScrollRef.current = false;
      return;
    }
    if (hadPartyFieldsScrollRef.current) return;
    hadPartyFieldsScrollRef.current = true;
    return scheduleBookingNavAfterRender("quote-section-passengers");
  }, [showPartyFields, journeyMode]);

  function handlePassengersChange(value: number) {
    onPassengersChange(value);
    if (value < FIVE_PLUS_PASSENGERS) {
      onExactPassengersChange(null);
      return;
    }
    // Require an explicit 5 / 6 / 7 tap — do not assume 5.
    onExactPassengersChange(null);
  }

  function handleExactPassengersChange(value: number) {
    const next = Math.min(7, Math.max(5, value));
    onPassengersChange(next);
    onExactPassengersChange(next);
  }

  return (
    <div className="quote-field space-y-5 lg:space-y-4">
      <div id="quote-section-journey" className="min-h-[3.25rem] lg:min-h-0">
        <h3 className="text-base font-semibold text-white sm:text-lg lg:text-base">Where are you travelling?</h3>
        <p className="mt-1 min-h-[1rem] text-xs text-white/55 lg:min-h-0">
          {journeyKindLabel || "Choose how you’d like to travel"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:gap-2.5" role="group" aria-label="Journey type">
        {QUOTE_JOURNEY_INTENT_OPTIONS.map((option) => {
          const selected = journeyIntent === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onJourneyIntentChange(option.id)}
              className={`${SELECT_CARD} ${selected ? SELECT_CARD_ON : SELECT_CARD_OFF}`}
            >
              <span className="text-sm font-bold sm:text-base">{option.title}</span>
              <span
                className={`mt-1 text-xs leading-snug ${selected ? "text-navy/80" : "text-white/55"}`}
              >
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      {showAirportPicker && (
        <div id="quote-section-airport" className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-white/50">
            Which airport?
          </p>
          <div className="grid gap-2 lg:grid-cols-2" role="group" aria-label="Airport">
            {SELECTABLE_AIRPORTS.map((airport) => {
              const selected = selectedAirportCode === airport.code;
              return (
                <button
                  key={airport.code}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onAirportSelect(airport.code)}
                  className={`${SELECT_CARD} ${selected ? SELECT_CARD_ON : SELECT_CARD_OFF}`}
                >
                  <span className="text-sm font-bold">{airport.title}</span>
                </button>
              );
            })}
          </div>
          {!airportChosen && (
            <p className="text-xs text-amber-200/90">Please choose an airport.</p>
          )}
          {selectedAirportCode === "LDY" && (
            <p className="rounded-xl border border-white/10 bg-navy-dark/40 px-3 py-2 text-xs text-white/70">
              City of Derry Airport transfers are between LDY and the greater Belfast area.
            </p>
          )}
        </div>
      )}

      {showAddresses && showRouteFields && (
        <div id="quote-section-addresses" className="space-y-4">
          {(journeyIntent === "to-airport" || journeyIntent === "address-to-address") && (
            <AddressInput
              id="pickup"
              name="pickup"
              value={pickupAddress}
              onChange={onPickupChange}
              onSelectPlace={onPickupPlaceSelect}
              requireSuggestion
              confirmedPlace={pickupConfirmedPlace}
              restoredHint={pickupRestoredHint}
              onClear={onClearPickup}
              selectionError={pickupPlaceError}
              airportCode={addressLookupCode}
              label={journeyIntent === "to-airport" ? "Where should we pick you up?" : "Pickup address"}
              placeholder="Enter pickup address or hotel"
              helperText="Pick a complete address from the suggestions"
            />
          )}
          {(journeyIntent === "from-airport" || journeyIntent === "address-to-address") && (
            <div id="quote-section-dropoff">
              <AddressInput
                id="dropoff"
                name="dropoff"
                value={dropoffAddress}
                onChange={onDropoffChange}
                onSelectPlace={onDropoffPlaceSelect}
                requireSuggestion
                confirmedPlace={dropoffConfirmedPlace}
                restoredHint={dropoffRestoredHint}
                onClear={onClearDropoff}
                selectionError={dropoffPlaceError}
                airportCode={addressLookupCode}
                label={
                  journeyIntent === "from-airport" ? "Where are you travelling to?" : "Destination"
                }
                placeholder="Enter destination address or hotel"
                helperText="Pick a complete address from the suggestions"
              />
            </div>
          )}
          {journeyIntent === "to-airport" && airportChosen && (
            <p className="rounded-xl border border-white/10 bg-navy-dark/40 px-3 py-2 text-xs text-white/70">
              Destination:{" "}
              <strong className="text-white">
                {SELECTABLE_AIRPORTS.find((a) => a.code === selectedAirportCode)?.title}
              </strong>
            </p>
          )}
          {journeyIntent === "from-airport" && airportChosen && (
            <p className="rounded-xl border border-white/10 bg-navy-dark/40 px-3 py-2 text-xs text-white/70">
              Pickup:{" "}
              <strong className="text-white">
                {SELECTABLE_AIRPORTS.find((a) => a.code === selectedAirportCode)?.title}
              </strong>
            </p>
          )}
        </div>
      )}

      {showJourneyModeFields && (
        <div id="quote-section-journey-mode" className="space-y-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
            Journey
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              aria-pressed={journeyMode === "one-way"}
              onClick={() => onJourneyModeChange("one-way")}
              className={`min-h-12 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all lg:min-h-11 ${
                journeyMode === "one-way"
                  ? "bg-emerald text-navy shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              One Way
            </button>
            <button
              type="button"
              aria-pressed={journeyMode === "return"}
              onClick={() => onJourneyModeChange("return")}
              className={`min-h-12 rounded-lg px-3 py-2.5 text-sm font-semibold transition-all lg:min-h-11 ${
                journeyMode === "return"
                  ? "bg-emerald text-navy shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Return · 5% off
            </button>
          </div>
          {journeyMode == null && (
            <p
              id="quote-journey-mode-prompt"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80"
              role="status"
            >
              Choose One Way or Return to continue.
            </p>
          )}
          {returnJourney && showAddresses && (
            <div className="rounded-xl border border-emerald/20 bg-emerald/10 px-4 py-3 text-xs text-white/80">
              <p className="font-semibold text-emerald">Return journey</p>
              <p className="mt-1">
                Outbound route will be reversed automatically — you’ll only need the return date and
                time on the next step.
              </p>
            </div>
          )}
        </div>
      )}

      {showPartyFields && (
        <div className="space-y-5 lg:space-y-4">
          <div className="grid gap-5 lg:grid-cols-2 lg:items-start lg:gap-3.5">
            <div id="quote-section-passengers" className="space-y-5 lg:space-y-3.5">
              <ChoiceGrid
                label="Passengers"
                options={[1, 2, 3, 4, FIVE_PLUS_PASSENGERS]}
                value={
                  passengers == null
                    ? null
                    : passengers >= FIVE_PLUS_PASSENGERS
                      ? FIVE_PLUS_PASSENGERS
                      : passengers
                }
                onChange={handlePassengersChange}
                formatOption={formatPassengerChoice}
              />

              {passengers != null && passengers >= FIVE_PLUS_PASSENGERS && (
                <div
                  id="quote-section-exact-passengers"
                  className="space-y-3 rounded-2xl border border-amber-400/25 bg-amber-400/10 px-4 py-4"
                >
                  <p className="text-sm font-semibold text-amber-100">
                    Travelling with 5–7 passengers?
                  </p>
                  <p className="text-xs leading-relaxed text-white/75">
                    We can quote a fixed Minibus fare online for your journey (Minibus — 5–7
                    passengers). Enter your details, see the exact price, and pay securely to
                    confirm.
                  </p>
                  <ChoiceGrid
                    label="Exact passengers"
                    options={[5, 6, 7]}
                    value={
                      exactPassengers != null && exactPassengers >= 5 && exactPassengers <= 7
                        ? exactPassengers
                        : null
                    }
                    onChange={handleExactPassengersChange}
                    formatOption={(value) => String(value)}
                    columns={3}
                  />
                  <p className="text-xs text-white/65">{GROUP_QUOTE_FEE_NOTE}</p>
                </div>
              )}
            </div>

            <div id="quote-section-suitcases" className="space-y-5 lg:space-y-3.5">
              {/* Single row 0–4|5+ — no secondary exact-bags step (avoids duplicate 5+ controls). */}
              <ChoiceGrid
                label="Suitcases / large bags"
                options={[0, 1, 2, 3, 4, FIVE_PLUS_SUITCASES]}
                value={
                  suitcases == null
                    ? null
                    : suitcases >= FIVE_PLUS_SUITCASES
                      ? FIVE_PLUS_SUITCASES
                      : suitcases
                }
                onChange={onSuitcasesChange}
                formatOption={formatSuitcaseChoice}
              />
            </div>
          </div>

          {(passengers == null ||
            suitcases == null ||
            (passengers >= FIVE_PLUS_PASSENGERS && exactPassengers == null)) && (
            <p
              id="quote-party-prompt"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80"
              role="status"
            >
              Select your passenger and suitcase numbers to see your fixed price.
            </p>
          )}

          {isGroupQuote ? (
            <div className="rounded-xl border border-white/10 bg-navy-dark/40 px-4 py-3 text-xs leading-relaxed text-white/70">
              <p>{AIRPORT_PICKUP_WAITING_COPY}</p>
              <p className="mt-2">{NON_AIRPORT_WAITING_COPY}</p>
            </div>
          ) : journeyIntent === "from-airport" ? (
            <div className="rounded-xl border border-white/10 bg-navy-dark/40 px-4 py-3 text-xs leading-relaxed text-white/70">
              <p>{AIRPORT_PICKUP_WAITING_COPY}</p>
            </div>
          ) : journeyIntent === "to-airport" ? (
            <div className="rounded-xl border border-white/10 bg-navy-dark/40 px-4 py-3 text-xs leading-relaxed text-white/70">
              <p>{NON_AIRPORT_WAITING_COPY}</p>
              {returnJourney && (
                <>
                  <p className="mt-2 font-semibold text-white/80">On your return (airport pickup)</p>
                  <p className="mt-1">{AIRPORT_PICKUP_WAITING_COPY}</p>
                </>
              )}
            </div>
          ) : journeyIntent === "address-to-address" ? (
            <div className="rounded-xl border border-white/10 bg-navy-dark/40 px-4 py-3 text-xs leading-relaxed text-white/70">
              <p>{NON_AIRPORT_WAITING_COPY}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export type { QuickSelectAirportCode };
