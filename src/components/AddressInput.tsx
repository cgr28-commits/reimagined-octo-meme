"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  fetchAddressPredictions,
  fetchPlaceDetails,
  isGooglePlacesEnabled,
  loadGoogleMapsPlaces,
  parsePlaceAddress,
  type AddressPrediction,
} from "@/lib/google-maps";
import { isAddressAllowedForAirport } from "@/lib/northern-ireland";

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
};

type DropdownPosition = {
  top: number;
  left: number;
  width: number;
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
}: AddressInputProps) {
  const autocompleteEnabled = isGooglePlacesEnabled();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<AddressPrediction[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const valueRef = useRef(value);
  const hintId = useId();

  valueRef.current = value;

  const countries =
    airportCode === "DUB" ? (["gb", "ie"] as const) : (["gb"] as const);

  const updateDropdownPosition = useCallback(() => {
    if (!inputRef.current) {
      return;
    }

    const rect = inputRef.current.getBoundingClientRect();
    setDropdownPosition({
      top: rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!autocompleteEnabled) {
      return;
    }

    void loadGoogleMapsPlaces()
      .then(() => setMapsReady(true))
      .catch(() => {
        setLoadError("Address suggestions are unavailable right now. Enter your address manually.");
      });
  }, [autocompleteEnabled]);

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
        const target = event.target as HTMLElement;
        if (!target.closest(".address-suggestions-portal")) {
          setSuggestionsOpen(false);
        }
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
  }, [airportCode]);

  useLayoutEffect(() => {
    if (!suggestionsOpen || suggestions.length === 0) {
      return;
    }

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [suggestions.length, suggestionsOpen, updateDropdownPosition, value]);

  const requestSuggestions = useCallback(
    (query: string) => {
      if (!autocompleteEnabled || !mapsReady) {
        return;
      }

      const trimmed = query.trim();
      if (trimmed.length < 3) {
        setSuggestions([]);
        setSuggestionsOpen(false);
        return;
      }

      void fetchAddressPredictions(trimmed, countries)
        .then((predictions) => {
          setSuggestions(predictions);
          setSuggestionsOpen(predictions.length > 0);
          if (predictions.length === 0) {
            setLoadError(null);
          }
        })
        .catch(() => {
          setSuggestions([]);
          setSuggestionsOpen(false);
          setLoadError("Address suggestions are unavailable right now. Enter your address manually.");
        });
    },
    [autocompleteEnabled, countries, mapsReady],
  );

  useEffect(() => {
    if (mapsReady && valueRef.current.trim().length >= 3) {
      requestSuggestions(valueRef.current);
    }
  }, [mapsReady, requestSuggestions]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setLoadError(null);
    onChange(next);

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      requestSuggestions(next);
    }, 300);
  }

  async function handleSelect(prediction: AddressPrediction) {
    setSuggestionsOpen(false);
    setSuggestions([]);

    const place = await fetchPlaceDetails(prediction.placePrediction);
    const formatted = place?.formattedAddress?.trim();
    if (!formatted || !place) {
      onChange(prediction.description);
      return;
    }

    const parts = parsePlaceAddress(place);
    if (
      !isAddressAllowedForAirport(airportCode, {
        ...parts,
        displayName: formatted,
      })
    ) {
      setLoadError(
        airportCode === "DUB"
          ? "Please choose an address in Northern Ireland or the Republic of Ireland."
          : "Please choose an address in Northern Ireland.",
      );
      return;
    }

    setLoadError(null);
    onChange(formatted);
  }

  const suggestionsPortal =
    suggestionsOpen &&
    suggestions.length > 0 &&
    dropdownPosition &&
    typeof document !== "undefined"
      ? createPortal(
          <ul
            className="address-suggestions-portal fixed z-[100000] overflow-hidden rounded-xl border border-white/10 bg-white shadow-2xl"
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
            }}
          >
            {suggestions.map((prediction) => (
              <li key={prediction.placeId}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void handleSelect(prediction)}
                  className="block w-full px-4 py-3 text-left text-sm text-navy transition-colors hover:bg-emerald/15"
                >
                  {prediction.description}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={containerRef} className="relative">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-white/50">
          {label}
        </label>
        {action}
      </div>

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
          updateDropdownPosition();
          if (suggestions.length > 0) {
            setSuggestionsOpen(true);
          }
        }}
        placeholder={placeholder}
        aria-describedby={hintId}
        className="address-input w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
      />

      {suggestionsPortal}

      <p id={hintId} className="mt-1.5 text-xs text-white/40">
        {loadError ??
          (autocompleteEnabled
            ? helperText
            : "Enter your full address including town and postcode")}
      </p>
    </div>
  );
}
