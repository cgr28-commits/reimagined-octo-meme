"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  fetchAddressPredictionsDetailed,
  fetchPlaceDetails,
  fetchSelectedPlaceDetails,
  geocodePickupAddress,
  isGooglePlacesEnabled,
  isPureFullNorthernIrelandPostcodeQuery,
  type AddressPrediction,
} from "@/lib/google-maps";
import type { SelectedPlace } from "@/lib/selected-place";
import { buildDisplayAddress, looksLikeStreetAddressLine, normaliseAddressCompareKey } from "@/lib/selected-place";
import { hasLeadingStreetNumber } from "../../shared/journey-address-label";
import { isHighConfidenceAddressMatch } from "@/lib/address-match";

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
  /**
   * Parent-held confirmed place (including restored from storage). Hydrates the
   * internal selection so continue works without re-tapping the same suggestion.
   */
  confirmedPlace?: SelectedPlace | null;
  /** Subtle “using previous address” hint when a confirmed place was restored. */
  restoredHint?: boolean;
  onClear?: () => void;
  selectionError?: string;
  /**
   * below = suggestions float under the field.
   * above = suggestions float above the field (quote bot typing bar).
   */
  suggestionsPlacement?: "below" | "above";
  /** Hide the visible label (still available to screen readers). */
  hideLabel?: boolean;
  className?: string;
  /**
   * When this token changes, run Places search for the current value and open
   * suggestions (skipped when a confirmed place is already set).
   */
  autoSuggestToken?: number | string | null;
  /**
   * With autoSuggestToken: auto-confirm only an exact/high-confidence match;
   * otherwise leave suggestions open for a one-tap confirm.
   */
  autoConfirmExactMatch?: boolean;
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
  disableAutoScroll = true,
  onSelectAddress,
  onSelectPlace,
  requireSuggestion = false,
  confirmedPlace = null,
  restoredHint = false,
  onClear,
  selectionError,
  suggestionsPlacement = "below",
  hideLabel = false,
  className = "",
  autoSuggestToken = null,
  autoConfirmExactMatch = false,
}: AddressInputProps) {
  const autocompleteEnabled = isGooglePlacesEnabled();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const houseInputRef = useRef<HTMLInputElement>(null);
  const selectedPlaceRef = useRef<SelectedPlace | null>(null);
  const selectPredictionRef = useRef<(prediction: AddressPrediction) => Promise<void>>(
    async () => undefined,
  );
  const lastAutoSuggestTokenRef = useRef<number | string | null>(null);
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

  // Keep internal selection in sync with parent-confirmed / restored places.
  useEffect(() => {
    if (confirmedPlace?.placeId?.trim() && confirmedPlace.formattedAddress?.trim()) {
      selectedPlaceRef.current = confirmedPlace;
      return;
    }
    if (!confirmedPlace?.placeId?.trim()) {
      // Parent cleared confirmation (edit / clear) — drop local selection.
      if (!value.trim()) {
        selectedPlaceRef.current = null;
      } else if (!selectedPlaceRef.current?.placeId?.trim()) {
        selectedPlaceRef.current = null;
      }
    }
  }, [confirmedPlace, value]);

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
    (query: string, options?: { autoConfirmExact?: boolean }) => {
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
          if (options?.autoConfirmExact) {
            const exact = result.predictions.find((prediction) =>
              isHighConfidenceAddressMatch(trimmed, prediction),
            );
            if (exact) {
              void selectPredictionRef.current(exact);
              return;
            }
          }

          setSuggestions(result.predictions);
          setSuggestionsOpen(result.predictions.length > 0);
          setNeedsHouseNumber(result.needsHouseNumber);
          if (result.needsHouseNumber && result.postcode) {
            setLockedPostcode(result.postcode);
            window.requestAnimationFrame(() => {
              houseInputRef.current?.focus({ preventScroll: true });
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

          // Avoid scrollIntoView on suggestion updates — it causes mobile page jump.
          if (
            result.predictions.length > 0 &&
            !disableAutoScroll &&
            !showAbove &&
            typeof window !== "undefined" &&
            window.matchMedia("(min-width: 768px)").matches
          ) {
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

  // Parent-driven search after WhatsApp extract (or similar) — open suggestions for one-tap confirm.
  useEffect(() => {
    if (autoSuggestToken == null || autoSuggestToken === "") return;
    if (lastAutoSuggestTokenRef.current === autoSuggestToken) return;
    lastAutoSuggestTokenRef.current = autoSuggestToken;
    if (confirmedPlace?.placeId?.trim()) return;
    const query = value.trim();
    if (query.length < 3 || !autocompleteEnabled) return;
    const timer = window.setTimeout(() => {
      requestSuggestions(query, { autoConfirmExact: autoConfirmExactMatch });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [
    autoSuggestToken,
    autoConfirmExactMatch,
    autocompleteEnabled,
    confirmedPlace?.placeId,
    requestSuggestions,
    value,
  ]);

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
      const numberMatch = next.match(/^(\d+[a-zA-Z]?)\b/);
      const refined: SelectedPlace = {
        ...previous,
        // Keep the structured postal address for area/geo checks — only the
        // visible display line tracks what the customer is typing.
        formattedAddress: previous.formattedAddress || next,
        displayAddress: next,
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
      displayAddress: next,
      placeName: null,
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
    selectedPlaceRef.current = null;
    setSuggestions([]);
    setSuggestionsOpen(false);
    setLoadError(null);
    setNeedsHouseNumber(false);
    setHouseOrBuilding("");
    setLockedPostcode(null);
    if (onClear) {
      onClear();
    } else {
      onChange("");
      if (requireSuggestion) {
        onSelectPlace?.({
          placeId: "",
          formattedAddress: "",
          displayAddress: "",
          placeName: null,
          lat: null,
          lng: null,
          countryCode: null,
          postalCode: null,
          streetNumber: null,
          route: null,
          locality: null,
        });
      }
    }
    inputRef.current?.focus({ preventScroll: true });
  }

  async function handleSelect(prediction: AddressPrediction) {
    setSuggestionsOpen(false);
    setSuggestions([]);
    setNeedsHouseNumber(false);
    setHouseOrBuilding("");
    setLockedPostcode(null);

    const place = await fetchSelectedPlaceDetails(
      prediction.placeId,
      airportCode,
      value,
      prediction.mainText,
    );
    if (place) {
      const typedNumber = value.trim().match(/^(\d+[a-zA-Z]?)\b/)?.[1];
      const postal = place.formattedAddress;
      const resolvedHasNumber = hasLeadingStreetNumber(postal);
      const suggestionHasNumber = hasLeadingStreetNumber(prediction.description);
      const postalWithNumber =
        typedNumber && !resolvedHasNumber && suggestionHasNumber
          ? prediction.description
          : postal;

      // Never treat a street-line suggestion ("18 Collingwood Avenue") as a
      // venue name — that duplicates Ave/Avenue (and Rd/Road) onto the postal.
      const suggestionName = prediction.mainText?.trim() || "";
      const suggestionIsStreetLine = looksLikeStreetAddressLine(suggestionName);
      const apiPlaceName = place.placeName?.trim() || "";
      const apiNameIsStreetLine = looksLikeStreetAddressLine(apiPlaceName);
      const postalKey = normaliseAddressCompareKey(postalWithNumber);
      const suggestionKey = normaliseAddressCompareKey(suggestionName);

      let placeName: string | null = null;
      if (apiPlaceName && !apiNameIsStreetLine) {
        placeName = apiPlaceName;
      } else if (
        suggestionName &&
        !suggestionIsStreetLine &&
        suggestionKey &&
        !postalKey.includes(suggestionKey)
      ) {
        placeName = suggestionName;
      }

      const resolvedDisplay = buildDisplayAddress(placeName, postalWithNumber);
      let nextPlace: SelectedPlace = {
        ...place,
        formattedAddress: postalWithNumber,
        displayAddress: resolvedDisplay,
        placeName,
        streetNumber: place.streetNumber || typedNumber || null,
      };
      // Ideal/GetAddress picks often omit lat/lng — geocode so Quick Quote /
      // TripMap can measure the route (BFS distance floor needs miles).
      if (
        (typeof nextPlace.lat !== "number" || typeof nextPlace.lng !== "number") &&
        resolvedDisplay.trim().length >= 8
      ) {
        const coords = await geocodePickupAddress(resolvedDisplay);
        if (coords) {
          nextPlace = { ...nextPlace, lat: coords.lat, lng: coords.lng };
        }
      }
      selectedPlaceRef.current = nextPlace;
      onChange(resolvedDisplay);
      onSelectAddress?.(resolvedDisplay);
      onSelectPlace?.(nextPlace);
      setLoadError(null);
      return;
    }

    const formatted = await fetchPlaceDetails(
      prediction.placeId,
      airportCode,
      value,
      prediction.mainText,
    );
    const nextAddress =
      formatted ?? buildDisplayAddress(prediction.mainText, prediction.description);
    const typedNumber = value.trim().match(/^(\d+[a-zA-Z]?)\b/)?.[1];
    let nextPlace: SelectedPlace = {
      placeId: prediction.placeId,
      formattedAddress: prediction.description,
      displayAddress: nextAddress,
      placeName: prediction.mainText || null,
      lat: null,
      lng: null,
      countryCode: null,
      postalCode: null,
      streetNumber: typedNumber ?? null,
      route: null,
      locality: null,
    };
    if (nextAddress.trim().length >= 8) {
      const coords = await geocodePickupAddress(nextAddress);
      if (coords) {
        nextPlace = { ...nextPlace, lat: coords.lat, lng: coords.lng };
      }
    }
    selectedPlaceRef.current = nextPlace;
    onChange(nextAddress);
    onSelectAddress?.(nextAddress);
    onSelectPlace?.(nextPlace);
    setLoadError(null);
  }
  selectPredictionRef.current = handleSelect;

  const showSuggestions = suggestionsOpen && suggestions.length > 0;
  const showHouseStep = needsHouseNumber || Boolean(lockedPostcode && houseOrBuilding);
  const hasConfirmedSelection = Boolean(confirmedPlace?.placeId?.trim());
  const hintMessage =
    selectionError ??
    loadError ??
    (restoredHint && hasConfirmedSelection
      ? "Using your previous address — edit or clear to choose a different one."
      : hasConfirmedSelection && requireSuggestion
        ? "Address confirmed — edit to choose a different one."
        : autocompleteEnabled
          ? helperText ??
            "Type a street, hotel or landmark — or a postcode, then your house number."
          : "Enter your full address including town and postcode");

  const hintToneClass =
    selectionError || loadError
      ? "text-red-300"
      : restoredHint && hasConfirmedSelection
        ? "text-emerald/80"
        : "text-white/40";

  const fieldShellRef = useRef<HTMLDivElement>(null);
  const [overlayStyle, setOverlayStyle] = useState<CSSProperties | undefined>(undefined);

  const updateOverlayPosition = useCallback(() => {
    if (!showAbove || !showSuggestions || !fieldShellRef.current) {
      setOverlayStyle(undefined);
      return;
    }
    const rect = fieldShellRef.current.getBoundingClientRect();
    setOverlayStyle({
      position: "fixed",
      left: Math.max(8, rect.left),
      width: Math.min(rect.width, window.innerWidth - 16),
      bottom: Math.max(8, window.innerHeight - rect.top + 6),
      top: "auto",
      zIndex: 90,
    });
  }, [showAbove, showSuggestions]);

  useEffect(() => {
    if (!showAbove || !showSuggestions) {
      setOverlayStyle(undefined);
      return;
    }
    updateOverlayPosition();
    window.addEventListener("resize", updateOverlayPosition);
    window.addEventListener("scroll", updateOverlayPosition, true);
    return () => {
      window.removeEventListener("resize", updateOverlayPosition);
      window.removeEventListener("scroll", updateOverlayPosition, true);
    };
  }, [showAbove, showSuggestions, updateOverlayPosition, suggestions.length, value]);

  const suggestionList = showSuggestions ? (
    <ul
      id={listboxId}
      role="listbox"
      style={showAbove ? overlayStyle : undefined}
      className={`address-suggestions address-suggestions-overlay max-h-[min(40vh,16rem)] overflow-y-auto overscroll-contain rounded-xl border border-[#d7e0ec] bg-white shadow-xl shadow-black/25 ${
        showAbove
          ? "z-[90]"
          : "absolute left-0 right-0 top-[calc(100%+0.35rem)] z-[80]"
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
            <span className="block truncate text-base font-semibold leading-snug text-navy">
              {prediction.mainText}
            </span>
            {prediction.secondaryText ? (
              <span className="mt-0.5 block truncate text-sm leading-snug text-navy/70">
                {prediction.secondaryText}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  ) : null;

  return (
    <div
      ref={containerRef}
      className={`relative min-w-0 ${showSuggestions || showHouseStep ? "z-30" : "z-10"} ${className}`}
    >
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

      <div className="relative min-w-0" ref={fieldShellRef}>
        <div
          className={`rounded-xl border bg-white/5 transition-colors ${
            showSuggestions || showHouseStep
              ? "border-emerald/50 ring-1 ring-emerald/30"
              : "border-white/10 focus-within:border-emerald/50 focus-within:ring-1 focus-within:ring-emerald/30"
          }`}
        >
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
              title={value || undefined}
              aria-describedby={hintId}
              aria-expanded={showSuggestions}
              aria-controls={listboxId}
              aria-autocomplete="list"
              role="combobox"
              className="address-input box-border h-12 w-full min-w-0 border-0 bg-transparent py-3 pl-4 pr-11 text-base leading-normal text-white placeholder:text-white/30 outline-none truncate"
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

          {/* Reserved slot so postcode house-number step doesn't yank the whole form as hard. */}
          <div
            className={`grid transition-[grid-template-rows] duration-200 ease-out ${
              showHouseStep ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
            }`}
          >
            <div className="min-h-0 overflow-hidden">
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
                  tabIndex={showHouseStep ? 0 : -1}
                  className="box-border h-12 w-full min-w-0 rounded-lg border border-white/15 bg-white px-4 text-base font-semibold text-navy placeholder:font-normal placeholder:text-navy/35 outline-none focus:border-emerald focus:ring-1 focus:ring-emerald/40"
                />
                <p id={houseHintId} className="mt-1.5 min-h-[1rem] text-xs text-white/45">
                  {lockedPostcode
                    ? `Finding addresses at ${lockedPostcode} — type your number, then tap your address.`
                    : "Type your house number or building name, then tap your address."}
                </p>
              </div>
            </div>
          </div>
        </div>

        {suggestionList}
      </div>

      <p
        id={hintId}
        className={`mt-1.5 min-h-[2.5rem] text-xs leading-snug ${hintToneClass}`}
      >
        {hintMessage}
      </p>
    </div>
  );
}
