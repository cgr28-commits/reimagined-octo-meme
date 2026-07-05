"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { AddressSuggestion } from "@/lib/address-suggestion";

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
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  useEffect(() => {
    const trimmed = value.trim();

    if (trimmed.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsSearching(true);

      try {
        const params = new URLSearchParams({ q: trimmed });
        if (airportCode) {
          params.set("airport", airportCode);
        }

        const response = await fetch(`/api/addresses?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          setSuggestions([]);
          setIsOpen(false);
          return;
        }

        const data = (await response.json()) as { suggestions?: AddressSuggestion[] };
        const nextSuggestions = data.suggestions ?? [];
        setSuggestions(nextSuggestions);
        setIsOpen(nextSuggestions.length > 0);
        setHighlightedIndex(-1);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setIsOpen(false);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value, airportCode]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectSuggestion(suggestion: AddressSuggestion) {
    void (async () => {
      let resolved = suggestion.address;

      try {
        if (!/^\d+$/.test(suggestion.id)) {
          const params = new URLSearchParams({ id: suggestion.id });
          if (airportCode) {
            params.set("airport", airportCode);
          }

          const response = await fetch(`/api/addresses?${params.toString()}`);
          if (response.ok) {
            const data = (await response.json()) as { address?: string };
            if (data.address) {
              resolved = data.address;
            }
          }
        }
      } catch {
        // Use the suggestion label if full resolution fails.
      }

      onChange(resolved);
      setIsOpen(false);
      setSuggestions([]);
    })();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => (current + 1) % suggestions.length);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex(
        (current) => (current - 1 + suggestions.length) % suggestions.length,
      );
    }

    if (event.key === "Enter" && highlightedIndex >= 0) {
      event.preventDefault();
      selectSuggestion(suggestions[highlightedIndex]);
    }

    if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-white/50">
          {label}
        </label>
        {action}
      </div>

      <div className="relative">
        <input
          id={id}
          name={name}
          type="text"
          required={required}
          autoComplete="street-address"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
        />

        {isSearching && (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-white/40">
            Searching…
          </span>
        )}

        {isOpen && suggestions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-20 mt-2 max-h-56 w-full overflow-auto rounded-xl border border-white/10 bg-navy-light py-2 shadow-xl"
          >
            {suggestions.map((suggestion, index) => (
              <li key={suggestion.id} role="option" aria-selected={highlightedIndex === index}>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectSuggestion(suggestion)}
                  className={`block w-full px-4 py-2.5 text-left text-sm transition-colors ${
                    highlightedIndex === index
                      ? "bg-emerald/15 text-white"
                      : "text-white/75 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {suggestion.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {helperText && <p className="mt-1.5 text-xs text-white/40">{helperText}</p>}
    </div>
  );
}
