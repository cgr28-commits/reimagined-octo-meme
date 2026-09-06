"use client";

import type { SelectedPlace } from "@/lib/selected-place";
import AddressInput from "@/components/AddressInput";
import {
  CUSTOMER_AIRPORTS,
  QUOTE_JOURNEY_INTENT_OPTIONS,
  customerAirportTitle,
  type CustomerAirportCode,
  type QuoteJourneyIntent,
} from "@/lib/quote-journey-intent";
import { SERVICE_FLAGS } from "@/lib/data";
import {
  AIRPORT_PICKUP_WAITING_COPY,
  NON_AIRPORT_WAITING_COPY,
} from "@/lib/journey-inclusions";
import {
  formatPassengerChoice,
  formatSuitcaseChoice,
} from "@/lib/vehicle-selection";
import type { QuickSelectAirportCode } from "@/lib/selected-place";
import { choiceGroupNeedsClass } from "@/lib/quote-ui-highlight";

const SELECTABLE_AIRPORTS = CUSTOMER_AIRPORTS.filter(
  (airport) => SERVICE_FLAGS.belfastCityAirport || airport.code !== "BHD",
);

const SELECT_CARD =
  "flex min-h-[4.25rem] flex-col items-start justify-center rounded-2xl border px-3.5 py-2.5 text-left transition-all sm:min-h-[4.5rem] sm:px-4 sm:py-3 lg:min-h-[3.75rem] lg:px-3.5 lg:py-2.5";
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
  needsCompletion = false,
  hasError = false,
}: {
  label: string;
  options: number[];
  value: number | null;
  onChange: (value: number) => void;
  formatOption?: (value: number) => string;
  columns?: number;
  needsCompletion?: boolean;
  hasError?: boolean;
}) {
  const cols = columns ?? options.length;
  return (
    <div className={choiceGroupNeedsClass(needsCompletion && value == null, hasError)}>
      <p className="form-label">
        {label}
        {needsCompletion && value == null ? (
          <span className="ml-1 font-normal normal-case tracking-normal text-emerald/80">
            (required)
          </span>
        ) : null}
      </p>
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(cols, options.length)}, minmax(0, 1fr))` }}
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
  passengersError?: string;
  suitcasesError?: string;
  isGroupQuote: boolean;
  showRouteFields: boolean;
  /** Addresses complete — show One Way / Return (not passengers yet). */
  showJourneyModeFields: boolean;
  /** Journey mode chosen — show passenger / suitcase controls. */
  showPartyFields: boolean;
  /** Bumped when addresses/intent change (kept for parent; scroll owned by QuoteCard). */
  showStageScrollKey?: string;
  journeyKindLabel?: string;
  /**
   * Valid Return Offer only: lock direction/airport and hide the same-order
   * One way / Return · 5% toggle. Ordinary bookings must leave this unset.
   */
  lockReturnOfferJourney?: boolean;
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
  exactPassengers: _exactPassengers,
  onExactPassengersChange,
  suitcases,
  onSuitcasesChange,
  passengersError = "",
  suitcasesError = "",
  isGroupQuote: _isGroupQuote,
  showRouteFields,
  showJourneyModeFields,
  showPartyFields,
  showStageScrollKey: _showStageScrollKey = "",
  journeyKindLabel,
  lockReturnOfferJourney = false,
}: QuoteProgressiveRouteProps) {
  void _showStageScrollKey;
  const showAirportPicker =
    journeyIntent === "to-airport" || journeyIntent === "from-airport";
  const airportChosen = Boolean(selectedAirportCode);
  const showAddresses =
    journeyIntent === "address-to-address" || (showAirportPicker && airportChosen);
  const returnJourney = journeyMode === "return";

  // Progressive stage scrolling is owned exclusively by QuoteCard so only one
  // deliberate target fires per user action.

  function handlePassengersChange(value: number) {
    const next = Math.min(4, Math.max(1, value));
    onPassengersChange(next);
    onExactPassengersChange(null);
  }

  void _exactPassengers;
  void _isGroupQuote;

  return (
    <div className="quote-field space-y-2.5 sm:space-y-5 lg:space-y-4">
      <div id="quote-section-journey" className="lg:min-h-0">
        <h3 className="text-[0.9rem] font-semibold text-white sm:text-lg lg:text-base">
          Where are you travelling?
        </h3>
        <p className="quote-secondary mt-0.5 hidden text-xs sm:mt-1 sm:block">
          {journeyKindLabel || "Choose how you’d like to travel"}
        </p>
      </div>

      {lockReturnOfferJourney ? (
        <div className="space-y-3">
          <div
            className="rounded-2xl border border-emerald/35 bg-emerald/10 px-4 py-3"
            data-return-offer-direction={journeyIntent ?? ""}
          >
            <p className="text-sm font-bold text-white">
              {QUOTE_JOURNEY_INTENT_OPTIONS.find((option) => option.id === journeyIntent)?.title ||
                "Airport transfer"}
            </p>
            <p className="mt-1 text-xs leading-snug text-white/70">
              Single return journey from your original trip — direction is set from your booking.
            </p>
          </div>
          {airportChosen ? (
            <div id="quote-section-airport" className="space-y-2">
              <p className="form-label mb-0">Airport</p>
              <p
                className="rounded-2xl border border-emerald/35 bg-emerald/10 px-4 py-3 text-sm font-bold text-white"
                data-return-offer-airport={selectedAirportCode}
              >
                {customerAirportTitle(selectedAirportCode)}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div
            className={`grid gap-2 sm:grid-cols-3 sm:gap-3 lg:gap-2.5 ${choiceGroupNeedsClass(!journeyIntent)}`}
            role="group"
            aria-label="Journey type"
          >
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
                    className={`mt-1 text-xs leading-snug ${selected ? "text-navy/80" : "quote-secondary"}`}
                  >
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>

          {showAirportPicker && (
            <div id="quote-section-airport" className="space-y-3">
              <p className="form-label mb-0">
                Which airport?
                {!airportChosen ? (
                  <span className="ml-1 font-normal normal-case tracking-normal text-emerald/80">
                    (required)
                  </span>
                ) : null}
              </p>
              <div
                className={`grid gap-2 lg:grid-cols-2 ${choiceGroupNeedsClass(!airportChosen)}`}
                role="group"
                aria-label="Airport"
              >
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
                <p className="text-xs text-emerald/85">Please choose an airport.</p>
              )}
              {selectedAirportCode === "LDY" && (
                <p className="rounded-xl border border-white/10 bg-navy-dark/40 px-3 py-2 quote-secondary text-xs">
                  City of Derry Airport transfers are between LDY and the greater Belfast area.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {showAddresses && showRouteFields && (
        <div id="quote-section-addresses" className="scroll-mt-44 space-y-4 md:scroll-mt-28">
          {(journeyIntent === "to-airport" || journeyIntent === "address-to-address") && (
            <AddressInput
              key={`pickup-${journeyIntent}`}
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
              needsCompletion={!pickupConfirmedPlace?.placeId?.trim()}
              airportCode={addressLookupCode}
              label={journeyIntent === "to-airport" ? "Where should we pick you up?" : "Pickup address"}
              placeholder="Enter pickup address or hotel"
              helperText="Type your address, then tap a suggestion — typing alone is not enough"
            />
          )}
          {(journeyIntent === "from-airport" || journeyIntent === "address-to-address") && (
            <div id="quote-section-dropoff">
              <AddressInput
                key={`dropoff-${journeyIntent}`}
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
                needsCompletion={!dropoffConfirmedPlace?.placeId?.trim()}
                airportCode={addressLookupCode}
                label={
                  journeyIntent === "from-airport" ? "Where are you travelling to?" : "Destination"
                }
                placeholder="Enter destination address or hotel"
                helperText="Type your address, then tap a suggestion — typing alone is not enough"
              />
            </div>
          )}
          {journeyIntent === "to-airport" && airportChosen && (
            <p className="rounded-xl border border-white/10 bg-navy-dark/40 px-3 py-2 quote-secondary text-xs">
              Destination:{" "}
              <strong className="text-white">
                {SELECTABLE_AIRPORTS.find((a) => a.code === selectedAirportCode)?.title}
              </strong>
            </p>
          )}
          {journeyIntent === "from-airport" && airportChosen && (
            <p className="rounded-xl border border-white/10 bg-navy-dark/40 px-3 py-2 quote-secondary text-xs">
              Pickup:{" "}
              <strong className="text-white">
                {SELECTABLE_AIRPORTS.find((a) => a.code === selectedAirportCode)?.title}
              </strong>
            </p>
          )}
        </div>
      )}

      {showJourneyModeFields && !lockReturnOfferJourney && (
        <div
          id="journey-type-selector"
          className="scroll-mt-44 space-y-3 md:scroll-mt-28"
        >
          <p
            data-booking-nav-heading
            tabIndex={-1}
            className="form-label outline-none"
          >
            Journey
            {journeyMode == null ? (
              <span className="ml-1 font-normal normal-case tracking-normal text-emerald/80">
                (required)
              </span>
            ) : null}
          </p>
          <div
            role="group"
            aria-label="One way or return"
            className={`grid grid-cols-2 overflow-hidden rounded-xl border bg-white/[0.06] ${
              journeyMode == null
                ? "border-emerald/50 ring-1 ring-emerald/25"
                : "border-white/15"
            }`}
          >
            <button
              type="button"
              aria-pressed={journeyMode === "one-way"}
              onClick={() => onJourneyModeChange("one-way")}
              className={`min-h-[52px] w-full px-3 py-3 text-sm font-semibold transition-colors focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald lg:min-h-12 ${
                journeyMode === "one-way"
                  ? "bg-emerald text-navy"
                  : "bg-transparent text-white/75 hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              One way
            </button>
            <button
              type="button"
              aria-pressed={journeyMode === "return"}
              onClick={() => onJourneyModeChange("return")}
              className={`min-h-[52px] w-full border-l border-white/40 px-3 py-3 text-sm font-semibold transition-colors focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald lg:min-h-12 ${
                journeyMode === "return"
                  ? "bg-emerald text-navy"
                  : "bg-transparent text-white/75 hover:bg-white/[0.04] hover:text-white"
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
              Choose One way or Return to continue.
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
        <div
          id="passenger-luggage-section"
          className="scroll-mt-44 space-y-5 lg:space-y-4 md:scroll-mt-28"
        >
          <div className="grid gap-5 lg:grid-cols-2 lg:items-start lg:gap-3.5">
            <div id="quote-section-passengers" className="space-y-5 lg:space-y-3.5">
              <ChoiceGrid
                label="Passengers"
                options={[1, 2, 3, 4]}
                value={passengers == null ? null : Math.min(4, Math.max(1, passengers))}
                onChange={handlePassengersChange}
                formatOption={formatPassengerChoice}
                needsCompletion={passengers == null}
                hasError={Boolean(passengersError)}
              />
              {passengersError ? (
                <p id="quote-passengers-error" role="alert" data-field-error className="text-xs text-red-300">
                  {passengersError}
                </p>
              ) : (
                <p className="quote-secondary text-xs">
                  Private airport transfer for 1–4 passengers.
                </p>
              )}
            </div>

            <div id="quote-section-suitcases" className="space-y-5 lg:space-y-3.5">
              <ChoiceGrid
                label="Suitcases / large bags"
                options={[0, 1, 2, 3, 4]}
                value={suitcases == null ? null : Math.min(4, Math.max(0, suitcases))}
                onChange={onSuitcasesChange}
                formatOption={formatSuitcaseChoice}
                needsCompletion={suitcases == null}
                hasError={Boolean(suitcasesError)}
              />
              {suitcasesError ? (
                <p id="quote-suitcases-error" role="alert" data-field-error className="text-xs text-red-300">
                  {suitcasesError}
                </p>
              ) : null}
            </div>
          </div>

          {(passengers == null || suitcases == null) && !passengersError && !suitcasesError && (
            <p
              id="quote-party-prompt"
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/80"
              role="status"
            >
              Select your passenger and suitcase numbers to see your fixed price.
            </p>
          )}

          {journeyIntent === "from-airport" ? (
            <div className="rounded-xl border border-white/10 bg-navy-dark/40 px-4 py-3 quote-secondary text-xs leading-relaxed">
              <p>{AIRPORT_PICKUP_WAITING_COPY}</p>
            </div>
          ) : journeyIntent === "to-airport" ? (
            <div className="rounded-xl border border-white/10 bg-navy-dark/40 px-4 py-3 quote-secondary text-xs leading-relaxed">
              <p>{NON_AIRPORT_WAITING_COPY}</p>
              {returnJourney && (
                <>
                  <p className="mt-2 font-semibold text-white/80">On your return (airport pickup)</p>
                  <p className="mt-1">{AIRPORT_PICKUP_WAITING_COPY}</p>
                </>
              )}
            </div>
          ) : journeyIntent === "address-to-address" ? (
            <div className="rounded-xl border border-white/10 bg-navy-dark/40 px-4 py-3 quote-secondary text-xs leading-relaxed">
              <p>{NON_AIRPORT_WAITING_COPY}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export type { QuickSelectAirportCode };
