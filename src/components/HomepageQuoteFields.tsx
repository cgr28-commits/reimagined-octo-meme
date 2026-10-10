"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AddressInput from "@/components/AddressInput";
import { fetchWorkerReverseGeocode } from "@/lib/addresses-api";
import {
  fetchAddressPredictionsDetailed,
  fetchSelectedPlaceDetails,
} from "@/lib/google-maps";
import { looksLikeStreetAddressLine, type SelectedPlace } from "@/lib/selected-place";
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
  onPassengersChange: (value: number) => void;
  onSuitcasesChange: (value: number) => void;
  passengersError: string;
  suitcasesError: string;
  publicMinibusEnabled: boolean;
  onRequestPrice: () => void;
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
  formResetKey,
  quoteFormActive = true,
}: HomepageQuoteFieldsProps) {
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsMessage, setGpsMessage] = useState("");
  const [gpsSuggestToken, setGpsSuggestToken] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [mobileLayout, setMobileLayout] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [selectFocused, setSelectFocused] = useState(false);
  const quoteBarRef = useRef<HTMLDivElement>(null);
  const pickupSuggestionsRef = useRef(false);
  const dropoffSuggestionsRef = useRef(false);
  const showQuoteButton =
    quoteFormActive &&
    !(mobileLayout && (keyboardOpen || suggestionsOpen || selectFocused));
  const passengerChoices = publicPassengerOptions(publicMinibusEnabled);
  const suitcaseChoices = publicSuitcaseOptions(publicMinibusEnabled);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setMobileLayout(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const noteSuggestions = useCallback((field: "pickup" | "dropoff", open: boolean) => {
    if (field === "pickup") pickupSuggestionsRef.current = open;
    else dropoffSuggestionsRef.current = open;
    setSuggestionsOpen(pickupSuggestionsRef.current || dropoffSuggestionsRef.current);
  }, []);

  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    const update = () => {
      const hidden = window.innerHeight - visual.height - visual.offsetTop;
      setKeyboardOpen(hidden > 120);
    };
    update();
    visual.addEventListener("resize", update);
    visual.addEventListener("scroll", update);
    return () => {
      visual.removeEventListener("resize", update);
      visual.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const bar = quoteBarRef.current;
    if (!mobileLayout || !showQuoteButton || !bar) {
      root.style.removeProperty("--homepage-quote-bar");
      return;
    }
    const sync = () => {
      const height = Math.ceil(bar.getBoundingClientRect().height);
      if (height > 0) root.style.setProperty("--homepage-quote-bar", `${height}px`);
      else root.style.removeProperty("--homepage-quote-bar");
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(bar);
    window.addEventListener("resize", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
      root.style.removeProperty("--homepage-quote-bar");
    };
  }, [mobileLayout, showQuoteButton]);

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
      const predictions = await fetchAddressPredictionsDetailed(address, addressLookupCode);
      const first = predictions.predictions.find((prediction) =>
        predictionMatchesGeocode(prediction, address),
      );
      if (first?.placeId) {
        const place = await fetchSelectedPlaceDetails(
          first.placeId,
          addressLookupCode,
          address,
          first.mainText,
        );
        if (place?.placeId && place.lat != null && place.lng != null) {
          const venueName = first.mainText?.trim() || "";
          const withVenue =
            place.placeName?.trim() || !venueName || looksLikeStreetAddressLine(venueName)
              ? place
              : { ...place, placeName: venueName };
          onPickupPlaceSelect(withVenue);
          setGpsMessage("Check this address. You can edit it if it isn't quite right.");
          return;
        }
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
    <div className="flex min-h-0 flex-1 flex-col" data-homepage-quote-fields>
      <div
        className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pb-[var(--homepage-quote-bar,0px)]"
        data-homepage-quote-scroll
      >
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
        onSuggestionsVisibilityChange={(open) => noteSuggestions("pickup", open)}
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
        onSuggestionsVisibilityChange={(open) => noteSuggestions("dropoff", open)}
      />

      <div className="grid grid-cols-2 gap-2" id="passenger-luggage-section">
        <div>
          <label htmlFor="quote-section-passengers" className="form-label mb-1">
            Passengers
          </label>
          <select
            id="quote-section-passengers"
            name="passengers"
            value={passengers == null ? "" : String(passengers)}
            onChange={(event) => onPassengersChange(Number(event.target.value))}
            className={selectClass}
            aria-invalid={Boolean(passengersError)}
            onFocus={() => setSelectFocused(true)}
            onBlur={() => setSelectFocused(false)}
          >
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
        <div>
          <label htmlFor="quote-section-suitcases" className="form-label mb-1">
            Suitcases
          </label>
          <select
            id="quote-section-suitcases"
            name="suitcases"
            value={suitcases == null ? "" : String(suitcases)}
            onChange={(event) => onSuitcasesChange(Number(event.target.value))}
            className={selectClass}
            aria-invalid={Boolean(suitcasesError)}
            onFocus={() => setSelectFocused(true)}
            onBlur={() => setSelectFocused(false)}
          >
            {suitcaseChoices.map((count) => (
              <option key={count} value={count}>
                {formatPublicSuitcaseChoice(count)}
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

      </div>
      {showQuoteButton && mobileLayout && typeof document !== "undefined"
        ? createPortal(
            <div ref={quoteBarRef} data-sticky-quote-bar data-quote-price-action="pinned">
              <button
                type="button"
                data-get-fixed-price
                onClick={onRequestPrice}
                className="btn-primary min-h-12 w-full rounded-xl text-base"
              >
                Get My Fixed Price →
              </button>
            </div>,
            document.body,
          )
        : null}
      {showQuoteButton && !mobileLayout ? (
        <div data-quote-price-action="inline" className="max-sm:hidden shrink-0 pt-1.5">
          <button
            type="button"
            data-get-fixed-price
            onClick={onRequestPrice}
            className="btn-primary min-h-12 w-full rounded-xl text-base"
          >
            Get My Fixed Price →
          </button>
        </div>
      ) : null}
    </div>
  );
}
