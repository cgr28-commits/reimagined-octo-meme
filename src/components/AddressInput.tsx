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
  /** Skip scrolling the page when suggestions open (e.g. inside the quote bot). */
  disableAutoScroll?: boolean;
  /** Called after a suggestion is chosen (full formatted address). */
  onSelectAddress?: (address: string) => void;
  /**
   * portal = dropdown below/above based on space (quote form).
   * inline = always attached just above the typing field (quote bot bar).
   */
  suggestionsMode?: "portal" | "inline";
  /** Hide the visible label (still available to screen readers). */
  hideLabel?: boolean;
  className?: string;
};

type DropdownPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "above" | "below";
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
  suggestionsMode = "portal",
  hideLabel = false,
  className = "",
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
  const useInlineSuggestions = suggestionsMode === "inline";

  const updateDropdownPosition = useCallback(() => {
    if (!inputRef.current) {
      return;
    }

    const rect = inputRef.current.getBoundingClientRect();
    const viewportHeight =
      window.visualViewport?.height ?? window.innerHeight;
    const viewportOffsetTop = window.visualViewport?.offsetTop ?? 0;
    const spaceBelow = viewportOffsetTop + viewportHeight - rect.bottom - 12;
    const spaceAbove = rect.top - viewportOffsetTop - 12;
    // Bot typing bar: keep suggestions glued above the field the customer is using.
    const preferAbove =
      suggestionsMode === "inline" || (spaceBelow < 180 && spaceAbove > spaceBelow);
    const available = Math.max(120, preferAbove ? spaceAbove : spaceBelow);

    setDropdownPosition({
      top: preferAbove ? rect.top - 8 : rect.bottom + 8,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: Math.min(rect.width, window.innerWidth - 16),
      maxHeight: Math.min(suggestionsMode === "inline" ? 220 : 256, available),
      placement: preferAbove ? "above" : "below",
    });
  }, [suggestionsMode]);

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
    if (!disableAutoScroll && !useInlineSuggestions) {
      inputRef.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      });
    }

    const onViewportChange = () => updateDropdownPosition();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    window.visualViewport?.addEventListener("resize", onViewportChange);
    window.visualViewport?.addEventListener("scroll", onViewportChange);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      window.visualViewport?.removeEventListener("resize", onViewportChange);
      window.visualViewport?.removeEventListener("scroll", onViewportChange);
    };
  }, [
    disableAutoScroll,
    suggestions.length,
    suggestionsOpen,
    updateDropdownPosition,
    useInlineSuggestions,
    value,
  ]);

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
          updateDropdownPosition();
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
    [airportCode, autocompleteEnabled, updateDropdownPosition],
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
    }, useInlineSuggestions ? 220 : 300);
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

  const suggestionItems = suggestions.map((prediction) => (
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
  ));

  const showSuggestions = suggestionsOpen && suggestions.length > 0;

  const suggestionsPortal =
    showSuggestions && typeof document !== "undefined"
      ? createPortal(
          <ul
            className={`address-suggestions-portal fixed z-[100000] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-white shadow-2xl ${
              useInlineSuggestions ? "ring-2 ring-emerald/35" : ""
            }`}
            style={
              dropdownPosition
                ? {
                    top:
                      dropdownPosition.placement === "above"
                        ? undefined
                        : dropdownPosition.top,
                    bottom:
                      dropdownPosition.placement === "above"
                        ? window.innerHeight - dropdownPosition.top
                        : undefined,
                    left: dropdownPosition.left,
                    width: dropdownPosition.width,
                    maxHeight: dropdownPosition.maxHeight,
                  }
                : { visibility: "hidden" }
            }
          >
            {suggestionItems}
          </ul>,
          document.body,
        )
      : null;

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
            updateDropdownPosition();
            if (suggestions.length > 0) {
              setSuggestionsOpen(true);
            } else if (value.trim().length >= 3) {
              requestSuggestions(value);
            }
          }}
          placeholder={placeholder}
          aria-describedby={hintId}
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
          className="address-input w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-4 pr-11 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
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
