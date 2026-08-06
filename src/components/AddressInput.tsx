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
  /** Skip scrolling the page when suggestions open (e.g. inside the quote bot). */
  disableAutoScroll?: boolean;
  /** Called after a suggestion is chosen (full formatted address). */
  onSelectAddress?: (address: string) => void;
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
  suggestionsPlacement = "below",
  hideLabel = false,
  className = "",
}: AddressInputProps) {
  const autocompleteEnabled = isGooglePlacesEnabled();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<AddressPrediction[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const hintId = useId();
  const listboxId = useId();
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
        return;
      }

      void fetchAddressPredictions(trimmed, airportCode)
        .then((predictions) => {
          setSuggestions(predictions);
          setSuggestionsOpen(predictions.length > 0);
          setLoadError(
            predictions.length === 0
              ? "No matching addresses found — keep typing or enter your full address manually."
              : null,
          );

          if (predictions.length > 0 && !disableAutoScroll && !showAbove) {
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
          setLoadError("Address suggestions are unavailable right now. Enter your address manually.");
        });
    },
    [airportCode, autocompleteEnabled, disableAutoScroll, showAbove],
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
    }, 220);
  }

  function handleClear() {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    onChange("");
    setSuggestions([]);
    setSuggestionsOpen(false);
    setLoadError(null);
    inputRef.current?.focus();
  }

  async function handleSelect(prediction: AddressPrediction) {
    setSuggestionsOpen(false);
    setSuggestions([]);

    const formatted = await fetchPlaceDetails(prediction.placeId, airportCode, value);
    const nextAddress = formatted ?? prediction.description;
    onChange(nextAddress);
    onSelectAddress?.(nextAddress);
    setLoadError(null);
  }

  const showSuggestions = suggestionsOpen && suggestions.length > 0;

  const suggestionList = showSuggestions ? (
    <ul
      id={listboxId}
      role="listbox"
      className="address-suggestions max-h-48 overflow-y-auto overscroll-contain border-t border-[#d7e0ec] bg-white"
    >
      {suggestions.map((prediction) => (
        <li key={prediction.placeId} role="option">
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

      {/* One control: typed value stays visible; suggestions expand inside the same bar. */}
      <div
        className={`overflow-hidden rounded-xl border bg-white/5 transition-colors ${
          showSuggestions
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

        {!showAbove ? suggestionList : null}
      </div>

      <p id={hintId} className="mt-1.5 text-xs text-white/40">
        {loadError ??
          (autocompleteEnabled
            ? helperText
            : "Enter your full address including town and postcode")}
      </p>
    </div>
  );
}
