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
  type AddressPrediction,
} from "@/lib/google-maps";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const hintId = useId();

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
      if (!autocompleteEnabled) {
        return;
      }

      const trimmed = query.trim();
      if (trimmed.length < 3) {
        setSuggestions([]);
        setSuggestionsOpen(false);
        return;
      }

      void fetchAddressPredictions(trimmed, airportCode)
        .then((predictions) => {
          if (inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            setDropdownPosition({
              top: rect.bottom + 8,
              left: rect.left,
              width: rect.width,
            });
          }
          setSuggestions(predictions);
          setSuggestionsOpen(predictions.length > 0);
          setLoadError(
            predictions.length === 0
              ? "No matching addresses found — keep typing or enter your full address manually."
              : null,
          );
        })
        .catch(() => {
          setSuggestions([]);
          setSuggestionsOpen(false);
          setLoadError("Address suggestions are unavailable right now. Enter your address manually.");
        });
    },
    [airportCode, autocompleteEnabled],
  );

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

    const formatted = await fetchPlaceDetails(prediction.placeId, airportCode, value);
    onChange(formatted ?? prediction.description);
    setLoadError(null);
  }

  const suggestionsPortal =
    suggestionsOpen &&
    suggestions.length > 0 &&
    typeof document !== "undefined"
      ? createPortal(
          <ul
            className="address-suggestions-portal fixed z-[100000] max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-white shadow-2xl"
            style={
              dropdownPosition
                ? {
                    top: dropdownPosition.top,
                    left: dropdownPosition.left,
                    width: dropdownPosition.width,
                  }
                : { visibility: "hidden" }
            }
          >
            {suggestions.map((prediction) => (
              <li key={prediction.placeId}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void handleSelect(prediction)}
                  className="block w-full px-4 py-3 text-left transition-colors hover:bg-emerald/15"
                >
                  <span className="block text-sm font-semibold text-navy">{prediction.mainText}</span>
                  {prediction.secondaryText ? (
                    <span className="mt-0.5 block text-xs text-navy/70">{prediction.secondaryText}</span>
                  ) : null}
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
          } else if (value.trim().length >= 3) {
            requestSuggestions(value);
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
