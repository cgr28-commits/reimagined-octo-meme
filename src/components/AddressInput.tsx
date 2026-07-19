"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  isGooglePlacesEnabled,
  loadGoogleMapsPlaces,
  parsePlaceAddress,
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
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hintId = useId();

  useEffect(() => {
    if (!autocompleteEnabled || !inputRef.current) {
      return;
    }

    let cancelled = false;

    void loadGoogleMapsPlaces()
      .then(() => {
        if (cancelled || !inputRef.current || !window.google?.maps?.places) {
          return;
        }

        const countries = airportCode === "DUB" ? (["gb", "ie"] as const) : (["gb"] as const);
        const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: [...countries] },
          fields: ["formatted_address", "address_components"],
          types: ["address"],
        });

        autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const formatted = place.formatted_address?.trim();
          if (!formatted) {
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
        });

        autocompleteRef.current = autocomplete;
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Address suggestions are unavailable right now. Enter your address manually.");
        }
      });

    return () => {
      cancelled = true;
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [airportCode, autocompleteEnabled, onChange]);

  return (
    <div>
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
        autoComplete={autocompleteEnabled ? "off" : "street-address"}
        value={value}
        onChange={(event) => {
          setLoadError(null);
          onChange(event.target.value);
        }}
        placeholder={placeholder}
        aria-describedby={hintId}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
      />

      <p id={hintId} className="mt-1.5 text-xs text-white/40">
        {loadError ??
          (autocompleteEnabled
            ? helperText
            : "Enter your full address including town and postcode")}
      </p>
    </div>
  );
}
