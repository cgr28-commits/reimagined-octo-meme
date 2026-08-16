"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  fetchAddressPredictionsDetailed,
  fetchPlaceDetails,
  fetchSelectedPlaceDetails,
  isGooglePlacesEnabled,
  isPureFullNorthernIrelandPostcodeQuery,
  type AddressPrediction,
} from "@/lib/google-maps";
import type { SelectedPlace } from "@/lib/selected-place";

type AddressInputProps = {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  label: ReactNode;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
  action?: ReactNode;
  airportCode?: string;
  /** Skip scrolling the page when suggestions open (e.g. inside the quote bot). */
  disableAutoScroll?: boolean;
  /** Called after a suggestion is chosen (full formatted address). */
  onSelectAddress?: (address: string) => void;
  /** Structured place (Place ID, lat/lng, country) when a suggestion is chosen. */
  onSelectPlace?: (place: SelectedPlace) => void;
  /**
   * When true, typing clears the previous Place ID selection and shows a hint
   * until a suggestion is chosen again.
   */
  requireSuggestion?: boolean;
  selectionError?: string;
  /**
   * below = suggestions expand under the field inside the same control (quote form / OTS-style).
   * above = suggestions expand above the field (quote bot typing bar).
   */
  suggestionsPlacement?: "below" | "above";
  /** Hide the visible label (still available to screen readers). */
  hideLabel?: boolean;
  className?: string;
};

export default function AddressInput({
  id,
  name,
  value,
  onChange,
  label,
  placeholder,
  helperText,
  required = true,
  action,
  airportCode = "",
  disableAutoScroll = false,
  onSelectAddress,
  onSelectPlace,
  requireSuggestion = false,
  selectionError,
  suggestionsPlacement = "below",
  hideLabel = false,
  className = "",
}: AddressInputProps) {
  const autocompleteEnabled = isGooglePlacesEnabled();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const houseInputRef = useRef<HTMLInputElement>(null);
  const selectedPlaceRef = useRef<SelectedPlace | null>(null);
  const [suggestions, setSuggestions] = useState<AddressPrediction[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsHouseNumber, setNeedsHouseNumber] = useState(false);
  const [houseOrBuilding, setHouseOrBuilding] = useState("");
  const [lockedPostcode, setLockedPostcode] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const hintId = useId();
  const listboxId = useId();
  const houseHintId = useId();
  const showAbove = suggestionsPlacement === "above";

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setSuggestionsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    setSuggestions([]);
    setSuggestionsOpen(false);
    setNeedsHouseNumber(false);
    setHouseOrBuilding("");
    setLockedPostcode(null);
  }, [airportCode]);

  const requestSuggestions = useCallback(
    (query: string) => {
      if (!autocompleteEnabled) {
        return;
      }

      const trimmed = query.trim();
      if (trimmed.length < 3) {
        setSuggestions([]);
        setSuggestionsOpen(false);
        setNeedsHouseNumber(false);
        return;
      }

      void fetchAddressPredictionsDetailed(trimmed, airportCode)
        .then((result) => {
          setSuggestions(result.predictions);
          setSuggestionsOpen(result.predictions.length > 0);
          setNeedsHouseNumber(result.needsHouseNumber);
          if (result.needsHouseNumber && result.postcode) {
            setLockedPostcode(result.postcode);
            window.requestAnimationFrame(() => {
              houseInputRef.current?.focus();
            });
          } else if (!result.needsHouseNumber) {
            setLockedPostcode(null);
          }

          setLoadError(
            result.predictions.length === 0 && !result.needsHouseNumber
              ? requireSuggestion
                ? "No matching addresses found — try a fuller street, hotel or airport name."
                : "No matching addresses found — keep typing or enter your full address manually."
              : null,
          );

          if (result.predictions.length > 0 && !disableAutoScroll && !showAbove) {
            window.requestAnimationFrame(() => {
              containerRef.current?.scrollIntoView({
                block: "nearest",
                inline: "nearest",
                behavior: "smooth",
              });
            });
          }
        })
        .catch(() => {
          setSuggestions([]);
          setSuggestionsOpen(false);
          setNeedsHouseNumber(false);
          setLoadError(
            requireSuggestion
              ? "Address suggestions are unavailable right now. Please try again shortly."
              : "Address suggestions are unavailable right now. Enter your address manually.",
          );
        });
    },
    [airportCode, autocompleteEnabled, disableAutoScroll, requireSuggestion, showAbove],
  );

  function clearSelectionOnType(next: string) {
    if (!requireSuggestion) {
      return;
    }

    const previous = selectedPlaceRef.current;
    const previousCore =
      previous?.route?.trim() ||
      previous?.formattedAddress.replace(/^\d+[a-zA-Z]?\s+/, "").split(",")[0]?.trim() ||
      "";
    const canKeepSelection =
      Boolean(previous?.placeId) &&
      previousCore.length >= 4 &&
      next
        .toLowerCase()
        .includes(previousCore.toLowerCase().slice(0, Math.min(previousCore.length, 18)));

    if (canKeepSelection && previous) {
      const numberMatch = next.trim().match(/^(\d+[a-zA-Z]?)\b/);
      const refined: SelectedPlace = {
        ...previous,
        formattedAddress: next.trim(),
        streetNumber: numberMatch?.[1] ?? previous.streetNumber ?? null,
      };
      selectedPlaceRef.current = refined;
      onSelectPlace?.(refined);
      return;
    }

    selectedPlaceRef.current = null;
    onSelectPlace?.({
      placeId: "",
      formattedAddress: next,
      lat: null,
      lng: null,
      countryCode: null,
      postalCode: null,
      streetNumber: null,
      route: null,
      locality: null,
    });
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setLoadError(null);
    onChange(next);
    clearSelectionOnType(next);

    if (!isPureFullNorthernIrelandPostcodeQuery(next)) {
      setNeedsHouseNumber(false);
      setHouseOrBuilding("");
      setLockedPostcode(null);
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      requestSuggestions(next);
    }, 220);
  }

  function handleHouseChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextHouse = event.target.value;
    setHouseOrBuilding(nextHouse);
    setLoadError(null);

    const postcode = lockedPostcode ?? value.trim();
    const composed = nextHouse.trim() ? `${nextHouse.trim()} ${postcode}` : postcode;
    onChange(composed);
    clearSelectionOnType(composed);

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      if (nextHouse.trim().length >= 1) {
        requestSuggestions(composed);
      } else {
        setSuggestions([]);
        setSuggestionsOpen(false);
        setNeedsHouseNumber(true);
      }
    }, 180);
  }

  function handleClear() {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    onChange("");
    selectedPlaceRef.current = null;
    if (requireSuggestion) {
      onSelectPlace?.({
        placeId: "",
        formattedAddress: "",
        lat: null,
        lng: null,
        countryCode: null,
        postalCode: null,
        streetNumber: null,
        route: null,
        locality: null,
      });
    }
    setSuggestions([]);
    setSuggestionsOpen(false);
    setLoadError(null);
    setNeedsHouseNumber(false);
    setHouseOrBuilding("");
    setLockedPostcode(null);
    inputRef.current?.focus();
  }

  async function handleSelect(prediction: AddressPrediction) {
    setSuggestionsOpen(false);
    setSuggestions([]);
    setNeedsHouseNumber(false);
    setHouseOrBuilding("");
    setLockedPostcode(null);

    const place = await fetchSelectedPlaceDetails(prediction.placeId, airportCode, value);
    if (place) {
      const typedNumber = value.trim().match(/^(\d+[a-zA-Z]?)\b/)?.[1];
      const resolvedHasNumber = /^\d+[a-zA-Z]?\s/.test(place.formattedAddress);
      const suggestionHasNumber = /^\d+[a-zA-Z]?\s/.test(prediction.description);
      const formattedAddress =
        typedNumber && !resolvedHasNumber && suggestionHasNumber
          ? prediction.description
          : place.formattedAddress;

      const nextPlace: SelectedPlace = {
        ...place,
        formattedAddress,
        streetNumber: place.streetNumber || typedNumber || null,
      };
      selectedPlaceRef.current = nextPlace;
      onChange(formattedAddress);
      onSelectAddress?.(formattedAddress);
      onSelectPlace?.(nextPlace);
      setLoadError(null);
      return;
    }

    const formatted = await fetchPlaceDetails(prediction.placeId, airportCode, value);
    const nextAddress = formatted ?? prediction.description;
    const typedNumber = value.trim().match(/^(\d+[a-zA-Z]?)\b/)?.[1];
    const nextPlace: SelectedPlace = {
      placeId: prediction.placeId,
      formattedAddress: nextAddress,
      lat: null,
      lng: null,
      countryCode: null,
      postalCode: null,
      streetNumber: typedNumber ?? null,
      route: null,
      locality: null,
    };
    selectedPlaceRef.current = nextPlace;
    onChange(nextAddress);
    onSelectAddress?.(nextAddress);
    onSelectPlace?.(nextPlace);
    setLoadError(null);
  }

  const showSuggestions = suggestionsOpen && suggestions.length > 0;
  const showHouseStep = needsHouseNumber || Boolean(lockedPostcode && houseOrBuilding);

  const suggestionList = showSuggestions ? (
    <ul
      id={listboxId}
      role="listbox"
      className={`address-suggestions overflow-y-auto overscroll-contain border-t border-[#d7e0ec] bg-white ${
        suggestions.length > 8 ? "max-h-[min(60vh,22rem)]" : "max-h-64"
      }`}
    >
      {suggestions.map((prediction, index) => (
        <li key={`${prediction.placeId}-${index}`} role="option">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void handleSelect(prediction)}
            className="block min-h-[3.25rem] w-full px-4 py-3.5 text-left transition-colors hover:bg-emerald/15 active:bg-emerald/20"
          >
            <span className="block text-base font-semibold leading-snug text-navy">
              {prediction.mainText}
            </span>
            {prediction.secondaryText ? (
              <span className="mt-0.5 block text-sm leading-snug text-navy/70">
                {prediction.secondaryText}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      {hideLabel ? (
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
      ) : (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-white/50">
            {label}
          </label>
          {action}
        </div>
      )}

      <div
        className={`overflow-hidden rounded-xl border bg-white/5 transition-colors ${
          showSuggestions || showHouseStep
            ? "border-emerald/50 ring-1 ring-emerald/30"
            : "border-white/10 focus-within:border-emerald/50 focus-within:ring-1 focus-within:ring-emerald/30"
        }`}
      >
        {showAbove ? suggestionList : null}

        <div className="relative">
          <input
            ref={inputRef}
            id={id}
            name={name}
            type="text"
            required={required}
            autoComplete="street-address"
            value={value}
            onChange={handleChange}
            onFocus={() => {
              if (suggestions.length > 0) {
                setSuggestionsOpen(true);
              } else if (value.trim().length >= 3) {
                requestSuggestions(value);
              }
            }}
            placeholder={placeholder}
            aria-describedby={hintId}
            aria-expanded={showSuggestions}
            aria-controls={listboxId}
            aria-autocomplete="list"
            role="combobox"
            className="address-input w-full border-0 bg-transparent py-3 pl-4 pr-11 text-sm text-white placeholder:text-white/30 outline-none"
          />
          {value ? (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear address"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          ) : null}
        </div>

        {showHouseStep ? (
          <div className="border-t border-white/10 bg-white/5 px-3 py-3">
            <label
              htmlFor={`${id}-house`}
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/55"
            >
              House number or building name
            </label>
            <input
              ref={houseInputRef}
              id={`${id}-house`}
              type="text"
              inputMode="text"
              autoComplete="off"
              value={houseOrBuilding}
              onChange={handleHouseChange}
              placeholder="e.g. 7 or Flat 2"
              aria-describedby={houseHintId}
              className="w-full rounded-lg border border-white/15 bg-white px-4 py-3.5 text-base font-semibold text-navy placeholder:font-normal placeholder:text-navy/35 outline-none focus:border-emerald focus:ring-1 focus:ring-emerald/40"
            />
            <p id={houseHintId} className="mt-1.5 text-xs text-white/45">
              {lockedPostcode
                ? `Finding addresses at ${lockedPostcode} — type your number, then tap your address.`
                : "Type your house number or building name, then tap your address."}
            </p>
          </div>
        ) : null}

        {!showAbove ? suggestionList : null}
      </div>

      <p
        id={hintId}
        className={`mt-1.5 text-xs ${
          selectionError || loadError ? "text-red-300" : "text-white/40"
        }`}
      >
        {selectionError ??
          loadError ??
          (autocompleteEnabled
            ? helperText ??
              "Type a street, hotel or landmark — or a postcode, then your house number."
            : "Enter your full address including town and postcode")}
      </p>
    </div>
  );
}
