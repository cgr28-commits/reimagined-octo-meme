"use client";

import { useState, type ReactNode } from "react";
import AddressInput from "@/components/AddressInput";
import QuoteActionDialog from "@/components/QuoteActionDialog";
import QuoteHelpContact from "@/components/QuoteHelpContact";
import { fetchWorkerReverseGeocode } from "@/lib/addresses-api";
import {
  fetchAddressPredictionsDetailed,
  fetchSelectedPlaceDetails,
} from "@/lib/google-maps";
import {
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
  onRequestPrice: () => boolean | void;
  quoteReady: boolean;
  scheduleFields?: ReactNode;
  scheduleComplete?: boolean;
  scheduleDate?: string;
  scheduleTime?: string;
  onConfirmSchedule?: () => boolean;
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

function SwapIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h11l-3-3M17 17H6l3 3" />
    </svg>
  );
}

const selectClass =
  "box-border h-12 w-full min-w-0 rounded-xl border border-white/20 bg-[#0c2748] px-3 text-base font-semibold text-white outline-none focus:border-emerald focus:ring-1 focus:ring-emerald/50";

export default function HomepageQuoteFields({
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
  scheduleFields = null,
  scheduleComplete = false,
  scheduleDate = "",
  scheduleTime = "",
  onConfirmSchedule,
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
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
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
    <div data-homepage-quote-fields>
      <div className="space-y-1" data-homepage-quote-scroll>
      <div>
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
              className={`mt-0.5 text-[10px] font-bold tracking-[0.08em] ${
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
        label="Pickup location"
        placeholder="Enter pickup address or airport"
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
      {gpsMessage ? (
        <p className="-mt-1 text-xs leading-snug text-emerald" role="status" data-gps-message>
          {gpsMessage}
        </p>
      ) : null}

      <div className="flex justify-center">
        <button
          type="button"
          data-swap-locations
          aria-label="Swap pickup and drop-off"
          onClick={onSwap}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald text-[#071c38]"
        >
          <SwapIcon />
        </button>
      </div>

      <AddressInput
        key={`homepage-dropoff-${formResetKey}`}
        id="dropoff"
        name="dropoff"
        label="Drop-off location"
        placeholder="Enter destination address or airport"
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
        airportCode={addressLookupCode}
      />

      <div className="grid grid-cols-2 items-end gap-2" id="passenger-luggage-section">
        <div className="flex min-w-0 flex-col">
          <label htmlFor="quote-section-passengers" className="form-label mb-1">
            Passengers
          </label>
          <select
            id="quote-section-passengers"
            name="passengers"
            value={passengers == null ? "" : String(passengers)}
            onChange={(event) => onPassengersChange(event.target.value === "" ? null : Number(event.target.value))}
            className={selectClass}
            aria-invalid={Boolean(passengersError)}
          >
            <option value="">Select</option>
            {passengerChoices.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
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
          <select
            id="quote-section-suitcases"
            name="suitcases"
            value={suitcases == null ? "" : String(suitcases)}
            onChange={(event) => onSuitcasesChange(event.target.value === "" ? null : Number(event.target.value))}
            className={selectClass}
            aria-invalid={Boolean(suitcasesError)}
          >
            <option value="">Select</option>
            {suitcaseChoices.map((count) => (
              <option key={count} value={count}>
                {count === 0 ? "None" : formatPublicSuitcaseChoice(count)}
              </option>
            ))}
          </select>
          {suitcasesError ? (
            <p className="mt-1 text-xs text-red-300" role="alert">
              {suitcasesError}
            </p>
          ) : null}
        </div>
      </div>
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
      <p id="homepage-quote-requirements" role="status" className="text-xs leading-snug text-white/75">
        {!publicMinibusEnabled && ((passengers ?? 0) > 4 || (suitcases ?? 0) > 4)
          ? "The 7-Seater is unavailable. Online quotes currently support up to 4 passengers and 4 suitcases."
          : !pickupConfirmedPlace || !dropoffConfirmedPlace
            ? "Select and confirm both pickup and drop-off addresses."
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
          <div className="flex min-w-0 items-stretch gap-2">
            <button
              type="button"
              data-get-fixed-price
              disabled={!quoteReady}
              aria-describedby="homepage-quote-requirements"
              onClick={() => {
                if (!scheduleComplete) {
                  setScheduleDialogOpen(true);
                  return;
                }
                if (onRequestPrice() === false) setScheduleDialogOpen(true);
              }}
              className="btn-primary min-h-12 min-w-0 flex-1 rounded-xl px-2 text-sm font-semibold sm:text-base"
            >
              {actionLabel}
            </button>
            {scheduleComplete ? (
              <button
                type="button"
                data-edit-quote-schedule
                aria-label="Edit pickup date and time"
                aria-haspopup="dialog"
                aria-expanded={scheduleDialogOpen}
                onClick={() => setScheduleDialogOpen(true)}
                className="flex min-h-12 shrink-0 flex-col items-center justify-center rounded-xl border border-white/25 bg-white/5 px-3 text-xs font-semibold text-white hover:bg-white/10"
              >
                <span>{scheduleDate}</span>
                <span className="text-emerald">{scheduleTime} · Edit</span>
              </button>
            ) : null}
          </div>
          <QuoteHelpContact className="sm:hidden" />
        </div>
      ) : null}
      {scheduleDialogOpen && scheduleFields ? (
        <QuoteActionDialog
          title="Pickup date & time"
          onClose={() => setScheduleDialogOpen(false)}
        >
          <div className="space-y-4" data-homepage-schedule-dialog>
            <p className="text-sm leading-relaxed text-white/80">
              Choose when you need picked up. We’ll use this to show your fixed price.
              {journeyMode === "return" ? " Add the return pickup time too." : ""}
            </p>
            {scheduleFields}
            <button
              type="button"
              data-confirm-quote-schedule
              onClick={() => {
                if (onConfirmSchedule?.()) setScheduleDialogOpen(false);
              }}
              className="btn-primary min-h-12 w-full rounded-xl text-base"
            >
              Save date & time
            </button>
          </div>
        </QuoteActionDialog>
      ) : null}
    </div>
  );
}
