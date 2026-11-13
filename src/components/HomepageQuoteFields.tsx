"use client";

import { useState, type ReactNode } from "react";
import { UserRound, BriefcaseBusiness, ArrowDownUp, Minus, Plus, Check, Tag, Plane, Clock, CalendarCheck, Zap, type LucideIcon } from "lucide-react";
import AddressInput from "@/components/AddressInput";
import QuoteHelpContact from "@/components/QuoteHelpContact";
import { fetchWorkerReverseGeocode } from "@/lib/addresses-api";
import {
  fetchAddressPredictionsDetailed,
  fetchSelectedPlaceDetails,
} from "@/lib/google-maps";
import {
  INCOMPLETE_DROPOFF_ADDRESS_MESSAGE,
  INCOMPLETE_PICKUP_ADDRESS_MESSAGE,
  isIncompleteAddressPlace,
  isQuoteReadyPlace,
  venueNameForPlace,
  type SelectedPlace,
} from "@/lib/selected-place";
import {
  publicPassengerOptions,
  publicSuitcaseOptions,
} from "../../shared/passenger-limits";
import { formatPublicSuitcaseChoice } from "../../shared/vehicle-capacity";

type JourneyMode = "one-way" | "return";

type HomepageQuoteFieldsProps = {
  /** Approved mobile Design 2: steppers, swap button, no journey type or schedule on this step. */
  design2?: boolean;
  homepagePolish?: boolean;
  journeyMode: JourneyMode;
  onJourneyModeChange: (mode: JourneyMode) => void;
  pickupAddress: string;
  dropoffAddress: string;
  onPickupChange: (value: string) => void;
  onDropoffChange: (value: string) => void;
  onPickupPlaceSelect: (place: SelectedPlace) => void;
  onDropoffPlaceSelect: (place: SelectedPlace) => void;
  pickupPlaceError: string;
  dropoffPlaceError: string;
  pickupConfirmedPlace: SelectedPlace | null;
  dropoffConfirmedPlace: SelectedPlace | null;
  onClearPickup: () => void;
  onClearDropoff: () => void;
  addressLookupCode: string;
  onSwap: () => void;
  passengers: number | null;
  suitcases: number | null;
  onPassengersChange: (value: number | null) => void;
  onSuitcasesChange: (value: number | null) => void;
  passengersError: string;
  suitcasesError: string;
  publicMinibusEnabled: boolean;
  onRequestPrice: () => void;
  quoteReady: boolean;
  /** Design 3 mobile preview (?mobile=d3). */
  design3?: boolean;
  /** Drop-off chosen as a street/area with no house number or building name. */
  dropoffNeedsHouseNumber?: boolean;
  /** Desktop (1200px+): show the house-number prompt directly under the pickup field. */
  pickupNeedsHouseNumber?: boolean;
  scheduleFields?: ReactNode;
  scheduleComplete?: boolean;
  actionLabel?: string;
  capacityConfirmationRequired?: boolean;
  capacityConfirmed: boolean;
  onCapacityConfirmedChange: (value: boolean) => void;
  formResetKey: number;
  /** False once the homepage is showing quote results. */
  quoteFormActive?: boolean;
};

function requestCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(Object.assign(new Error("unavailable"), { code: 2 }));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 0,
    });
  });
}

function predictionMatchesGeocode(
  prediction: { description: string; mainText: string },
  address: string,
): boolean {
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const target = normalise(address);
  const main = normalise(prediction.mainText);
  const description = normalise(prediction.description);
  if (!target || !main) return false;
  if (target.includes(main) || description.includes(target)) return true;
  const head = target.split(" ").slice(0, 4).join(" ");
  return head.length > 8 && (description.includes(head) || main.includes(head));
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.sqrt(a));
}

/**
 * Turn a reverse-geocoded line into the same place record a tapped suggestion
 * produces. Prefer a nearby result that has a street or a building name.
 * Do not accept a far-away or incomplete match.
 */
async function resolveGpsPickupPlace(
  address: string,
  lat: number,
  lng: number,
  airportCode: string,
): Promise<SelectedPlace | null> {
  const head = address.split(",")[0]?.trim() ?? "";
  const queries = head && head.length >= 3 && head !== address.trim() ? [address, head] : [address];
  const seen = new Set<string>();
  let landmark: SelectedPlace | null = null;

  for (const query of queries) {
    const result = await fetchAddressPredictionsDetailed(query, airportCode);
    for (const prediction of result.predictions) {
      if (!prediction.placeId || seen.has(prediction.placeId)) continue;
      if (
        !predictionMatchesGeocode(prediction, address) &&
        !predictionMatchesGeocode(prediction, query)
      ) {
        continue;
      }
      seen.add(prediction.placeId);
      const place = await fetchSelectedPlaceDetails(
        prediction.placeId,
        airportCode,
        address,
        prediction.mainText,
      );
      if (!place?.placeId) continue;
      const venue = venueNameForPlace(prediction.mainText, place.locality);
      let next: SelectedPlace = place;
      if (!next.placeName?.trim() && venue) {
        next = { ...next, placeName: venue };
      }
      if (
        (typeof next.lat !== "number" || typeof next.lng !== "number") &&
        Number.isFinite(lat) &&
        Number.isFinite(lng)
      ) {
        next = { ...next, lat, lng };
      }
      if (typeof next.lat === "number" && typeof next.lng === "number") {
        if (distanceKm(lat, lng, next.lat, next.lng) > 0.8) continue;
      }
      if (!isQuoteReadyPlace(next) || isIncompleteAddressPlace(next)) continue;
      if (next.streetNumber?.trim() || next.route?.trim()) return next;
      landmark = landmark ?? next;
      if (seen.size >= 6) return landmark;
    }
  }
  return landmark;
}

function gpsFailureMessage(error: unknown): string {
  const code =
    typeof error === "object" && error && "code" in error
      ? Number((error as { code?: number }).code)
      : 0;
  if (code === 1) {
    return "Location access was not allowed. Enter your pickup address instead.";
  }
  if (code === 3) {
    return "We couldn't find your location in time. Enter your pickup address instead.";
  }
  return "Location isn't available on this device. Enter your pickup address instead.";
}

function LocationIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="3.25" strokeWidth="1.8" />
      <path strokeLinecap="round" strokeWidth="1.8" d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2" />
      <circle cx="12" cy="12" r="7.25" strokeWidth="1.8" />
    </svg>
  );
}

function selectClass(hasError: boolean) {
  const base = "box-border h-10 w-full min-w-0 rounded-xl border bg-white/[0.14] px-4 text-[17px] font-medium text-white outline-none transition-colors";
  return hasError
    ? `${base} border-red-400/70 ring-1 ring-inset ring-red-400/35 focus:border-red-400`
    : `${base} border-white/32 focus:border-emerald/70 focus:ring-1 focus:ring-inset focus:ring-emerald/35`;
}

function Design2Stepper({
  id,
  label,
  value,
  choices,
  onChange,
  format,
  error,
  allowUnset = false,
}: {
  allowUnset?: boolean;
  id: string;
  label: string;
  value: number | null;
  choices: number[];
  onChange: (value: number | null) => void;
  format: (value: number) => string;
  error: string;
}) {
  // allowUnset (Design 3 passengers): no value yet shows 0; minus at the first choice clears it again.
  const unset = allowUnset && value == null;
  const current = value ?? choices[0];
  const index = Math.max(0, choices.indexOf(current));
  const atMin = unset || (!allowUnset && index <= 0);
  const atMax = !unset && index >= choices.length - 1;
  return (
    <div data-d2-stepper className="min-w-0">
      <span id={`${id}-label`} data-d2-stepper-label>{label}</span>
      <div data-d2-stepper-row>
        <output id={id} aria-labelledby={`${id}-label`} aria-live="polite" data-d2-stepper-value>
          {unset ? "0" : format(current)}
        </output>
        <button
          type="button"
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={atMin}
          onClick={() => onChange(allowUnset && index <= 0 ? null : choices[index - 1])}
          data-d2-stepper-btn="minus"
        >
          <Minus size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={atMax}
          onClick={() => onChange(unset ? choices[0] : choices[index + 1])}
          data-d2-stepper-btn="plus"
        >
          <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>
      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const DESIGN2_BENEFITS: ReadonlyArray<{ label: string; icon: LucideIcon }> = [
  { label: "Fixed price, no meter", icon: Tag },
  { label: "Flight monitoring", icon: Plane },
  { label: "60 mins free airport waiting", icon: Clock },
  { label: "Free cancellation up to 24 hrs", icon: CalendarCheck },
];

export default function HomepageQuoteFields({
  design2 = false,
  homepagePolish = false,
  journeyMode,
  onJourneyModeChange,
  pickupAddress,
  dropoffAddress,
  onPickupChange,
  onDropoffChange,
  onPickupPlaceSelect,
  onDropoffPlaceSelect,
  pickupPlaceError,
  dropoffPlaceError,
  pickupConfirmedPlace,
  dropoffConfirmedPlace,
  onClearPickup,
  onClearDropoff,
  addressLookupCode,
  onSwap,
  passengers,
  suitcases,
  onPassengersChange,
  onSuitcasesChange,
  passengersError,
  suitcasesError,
  publicMinibusEnabled,
  onRequestPrice,
  quoteReady,
  design3 = false,
  dropoffNeedsHouseNumber = false,
  pickupNeedsHouseNumber = false,
  scheduleFields = null,
  scheduleComplete = false,
  actionLabel = "Get My Fixed Price →",
  capacityConfirmationRequired = true,
  capacityConfirmed,
  onCapacityConfirmedChange,
  formResetKey,
  quoteFormActive = true,
}: HomepageQuoteFieldsProps) {
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("");
  const [gpsSuggestToken, setGpsSuggestToken] = useState(0);
  const passengerChoices = publicPassengerOptions(true);
  const suitcaseChoices = publicSuitcaseOptions(true);

  async function locatePickup() {
    if (gpsBusy) return;
    setGpsMessage("");
    setGpsBusy(true);
    try {
      const position = await requestCurrentPosition();
      const address = await fetchWorkerReverseGeocode(
        position.coords.latitude,
        position.coords.longitude,
      );
      if (!address) {
        setGpsMessage(
          "We couldn't match that location to a pickup address. Please enter it manually.",
        );
        return;
      }
      const resolved = await resolveGpsPickupPlace(
        address,
        position.coords.latitude,
        position.coords.longitude,
        addressLookupCode,
      );
      if (resolved) {
        onPickupPlaceSelect(resolved);
        setGpsMessage("Check this address. You can edit it if it isn't quite right.");
        return;
      }
      onPickupChange(address);
      setGpsSuggestToken((token) => token + 1);
      setGpsMessage("Check this address and choose it from the suggestions.");
    } catch (error) {
      setGpsMessage(gpsFailureMessage(error));
    } finally {
      setGpsBusy(false);
    }
  }

  return (
    <div data-homepage-quote-fields data-d2-fields={design2 ? "" : undefined}>
      {design3 ? (
        /* Mobile homepage card title (owner mockup, 13 Nov 2026); hidden unless the CSS shows it. */
        <div className="hidden" data-d3-card-head aria-hidden="true">
          <Plane size={20} strokeWidth={2.2} data-d3-card-head-icon />
          <span data-d3-card-head-title>Get Your Fixed Airport Fare</span>
          <span data-d3-card-head-chip>
            <Zap size={13} strokeWidth={2.4} />
            Instant Quote
          </span>
        </div>
      ) : null}
      <div className="space-y-1" data-homepage-quote-scroll>
      <div hidden={design2}>
        <p className="form-label mb-1">Journey type</p>
        <div
          role="group"
          aria-label="Journey type"
          className="grid grid-cols-2 gap-1 rounded-xl bg-white/10 p-1"
        >
          <button
            type="button"
            aria-pressed={journeyMode === "one-way"}
            onClick={() => onJourneyModeChange("one-way")}
            className={`flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold ${
              journeyMode === "one-way"
                ? "bg-emerald text-[#071c38]"
                : "text-white hover:bg-white/10"
            }`}
          >
            One Way
          </button>
          <button
            type="button"
            aria-pressed={journeyMode === "return"}
            onClick={() => onJourneyModeChange("return")}
            className={`flex min-h-11 flex-col items-center justify-center rounded-lg px-3 py-1 leading-none ${
              journeyMode === "return"
                ? "bg-emerald text-[#071c38]"
                : "text-white hover:bg-white/10"
            }`}
          >
            <span className="text-sm font-semibold">Return</span>
            <span
              data-return-discount-note
              className={`mt-0.5 text-[11.5px] font-bold tracking-[0.06em] ${
                journeyMode === "return" ? "text-[#071c38]" : "text-emerald"
              }`}
            >
              SAVE 5%
            </span>
          </button>
        </div>
      </div>

      <AddressInput
        key={`homepage-pickup-${formResetKey}`}
        id="pickup"
        name="pickup"
        label={design2 ? "Pickup" : "Pickup location"}
        placeholder={design2 ? "Pickup address, postcode or airport" : "Enter pickup address or airport"}
        value={pickupAddress}
        onChange={onPickupChange}
        onSelectPlace={onPickupPlaceSelect}
        requireSuggestion
        confirmedPlace={pickupConfirmedPlace}
        onClear={onClearPickup}
        selectionError={pickupPlaceError}
        helperText=""
        reserveHelperSpace={false}
        dense
        compactHomepage
        airportCode={addressLookupCode}
        autoSuggestToken={gpsSuggestToken || null}
        startAdornment={
          <button
            type="button"
            data-gps-location
            aria-label="Use my current location"
            disabled={gpsBusy}
            onClick={() => {
              void locatePickup();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-emerald disabled:opacity-60"
          >
            <LocationIcon />
          </button>
        }
      />
      {/* Desktop (1200px+) only: address clarification beside its field (hidden below 1200px,
          where the existing message under the form is unchanged). */}
      {pickupNeedsHouseNumber ? (
        <p className="hidden" role="status" data-desktop-address-hint="pickup">
          {INCOMPLETE_PICKUP_ADDRESS_MESSAGE}
        </p>
      ) : null}
      {gpsMessage ? (
        <p className="-mt-1 text-xs leading-snug text-emerald" role="status" data-gps-message>
          {gpsMessage}
        </p>
      ) : null}

      {design2 ? (
        <div data-d2-swap-row>
          <button type="button" data-d2-swap aria-label="Swap pickup and drop-off" onClick={onSwap}>
            <ArrowDownUp size={18} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <AddressInput
        key={`homepage-dropoff-${formResetKey}`}
        id="dropoff"
        name="dropoff"
        label={design2 ? "Drop-off" : "Drop-off location"}
        placeholder={design2 ? "Destination address, postcode or airport" : "Enter destination address or airport"}
        value={dropoffAddress}
        onChange={onDropoffChange}
        onSelectPlace={onDropoffPlaceSelect}
        requireSuggestion
        confirmedPlace={dropoffConfirmedPlace}
        onClear={onClearDropoff}
        selectionError={dropoffPlaceError}
        helperText=""
        reserveHelperSpace={false}
        dense
        compactHomepage
        airportCode={addressLookupCode}
      />
      {dropoffNeedsHouseNumber ? (
        <p className="hidden" role="status" data-desktop-address-hint="dropoff">
          {INCOMPLETE_DROPOFF_ADDRESS_MESSAGE}
        </p>
      ) : null}

      {design3 ? (
        <div role="group" aria-label="Journey type" data-d2-segment data-d3-home-segment>
          <button type="button" aria-pressed={journeyMode !== "return"} onClick={() => onJourneyModeChange("one-way")}>
            One way
          </button>
          <button type="button" aria-pressed={journeyMode === "return"} onClick={() => onJourneyModeChange("return")}>
            Return
            <span data-return-discount-note>Save 5%</span>
          </button>
        </div>
      ) : null}
      {scheduleFields}

      {design2 ? (
        <div className="grid grid-cols-2 gap-2" id="passenger-luggage-section" data-d2-party>
          <Design2Stepper
            id="quote-section-passengers"
            label="Passengers"
            value={passengers}
            choices={passengerChoices}
            onChange={(value) => onPassengersChange(value)}
            format={(value) => String(value)}
            error={passengersError}
          />
          <Design2Stepper
            id="quote-section-suitcases"
            label="Suitcases"
            value={suitcases}
            choices={suitcaseChoices}
            onChange={(value) => { if (value != null) onSuitcasesChange(value); }}
            format={(value) => (value >= 5 ? "5+" : String(value))}
            error={suitcasesError}
          />
        </div>
      ) : null}
      {!design2 ? (
      <div className="grid grid-cols-2 items-end gap-2" id="passenger-luggage-section">
        <div className="flex min-w-0 flex-col">
          <label htmlFor="quote-section-passengers" className="form-label mb-1">
            Passengers
          </label>
          <div className={homepagePolish ? "homepage-compact-control relative" : "contents"}>
          {homepagePolish ? <UserRound className="homepage-field-icon" size={18} strokeWidth={1.8} aria-hidden="true" /> : <span className="pointer-events-none absolute mt-[2.1rem] ml-3 text-emerald" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg></span>}
          <select
            id="quote-section-passengers"
            name="passengers"
            value={passengers == null ? "" : String(passengers)}
            onChange={(event) => onPassengersChange(event.target.value === "" ? null : Number(event.target.value))}
            className={`${selectClass(Boolean(passengersError))} pl-9`}
            aria-invalid={Boolean(passengersError)}
          >
            <option value="">Select</option>
            {passengerChoices.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
          </div>
          {passengersError ? (
            <p className="mt-1 text-xs text-red-300" role="alert">
              {passengersError}
            </p>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-col">
          <label htmlFor="quote-section-suitcases" className="form-label mb-1 whitespace-nowrap leading-tight">
            Suitcases
          </label>
          <div className={homepagePolish ? "homepage-compact-control relative" : "contents"}>
          {homepagePolish ? <BriefcaseBusiness className="homepage-field-icon" size={18} strokeWidth={1.8} aria-hidden="true" /> : <span className="pointer-events-none absolute mt-[2.1rem] ml-3 text-emerald" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="7" width="16" height="14" rx="2"/><path d="M9 7V5a3 3 0 0 1 6 0v2M12 7v14"/></svg></span>}
          <select
            id="quote-section-suitcases"
            name="suitcases"
            value={suitcases == null ? "" : String(suitcases)}
            onChange={(event) => onSuitcasesChange(event.target.value === "" ? null : Number(event.target.value))}
            className={`${selectClass(Boolean(suitcasesError))} pl-9`}
            aria-invalid={Boolean(suitcasesError)}
          >
            <option value="">Select</option>
            {suitcaseChoices.map((count) => (
              <option key={count} value={count}>
                {count === 0 ? "None" : formatPublicSuitcaseChoice(count)}
              </option>
            ))}
          </select>
          </div>
          {suitcasesError ? (
            <p className="mt-1 text-xs text-red-300" role="alert">
              {suitcasesError}
            </p>
          ) : null}
        </div>
      </div>
      ) : null}
      {suitcases === 5 && publicMinibusEnabled && capacityConfirmationRequired ? (
        <div className="rounded-xl border border-white/20 p-3 text-xs text-white/85" data-homepage-capacity-check>
          <p>5+ means five or more suitcases. Contact us to confirm that the available 7-Seater can carry your full party and luggage before requesting a price.</p>
          <QuoteHelpContact />
          <label className="mt-2 flex items-start gap-2">
            <input type="checkbox" checked={capacityConfirmed} onChange={(event) => onCapacityConfirmedChange(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-emerald" />
            <span>My Airport Taxi NI has confirmed space for my full party and all suitcases.</span>
          </label>
        </div>
      ) : null}
      <p id="homepage-quote-requirements" role="status" className={design2 ? "sr-only" : "text-xs leading-snug text-white/75"}>
        {!publicMinibusEnabled && ((passengers ?? 0) > 4 || (suitcases ?? 0) > 4)
          ? "The 7-Seater is unavailable. Online quotes currently support up to 4 passengers and 4 suitcases."
          : !pickupConfirmedPlace || !dropoffConfirmedPlace
            ? "Select and confirm both pickup and drop-off addresses."
            : dropoffNeedsHouseNumber
              ? INCOMPLETE_DROPOFF_ADDRESS_MESSAGE
            : passengers == null || suitcases == null
              ? "Select passengers and suitcases to see your fixed price."
              : !scheduleComplete
                ? "Add your pickup date and time, and return date and time if needed."
              : suitcases === 5 && capacityConfirmationRequired && !capacityConfirmed
                ? "Confirm luggage capacity with us before requesting a price for 5+ suitcases."
                : !quoteReady
                  ? "Choose different, confirmed pickup and drop-off addresses and a suitable party size."
                  : "Ready to show your transfer options."}
      </p>
      </div>
      {quoteFormActive ? (
        <div data-quote-price-action="flow" className="shrink-0 pt-1.5 pb-1.5">
          <button
            type="button"
            data-get-fixed-price
            disabled={!quoteReady}
            aria-describedby="homepage-quote-requirements"
            onClick={onRequestPrice}
            className="btn-primary min-h-12 w-full rounded-xl text-base"
          >
            {design2 ? "Get My Fixed Price" : actionLabel}
          </button>
          {design2 ? (
            <>
              <p data-d2-caption>No payment needed for a quote · Instant price</p>
              <ul data-d2-benefits>
                {DESIGN2_BENEFITS.map(({ label, icon: Icon }) => (
                  <li key={label}>
                    <Check size={16} strokeWidth={2.6} aria-hidden="true" data-d2-benefit-check />
                    <Icon size={22} strokeWidth={2.2} aria-hidden="true" data-d2-benefit-icon />
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <QuoteHelpContact className="sm:hidden" />
          )}
        </div>
      ) : null}
    </div>
  );
}
