"use client";

import PlaceHighlight from "@/components/PlaceHighlight";
import { useEffect, useState } from "react";

/** True when the page was opened with ?from=<value> (default "airport"; Google Ads direction landings). */
export function openedFromAirport(value = "airport"): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("from") === value;
}

/**
 * Town-to-airport pages opened with ?from=airport start the quote at the airport, so the
 * heading and intro read the other way round too. Without ?from=airport (and in the static
 * HTML Google indexes) the normal text is shown.
 */
export default function FromAirportText({
  text,
  fromAirportText,
  fromValue = "airport",
  places,
  fromAirportPlaces,
}: {
  text: string;
  fromAirportText?: string;
  /** Optional: place names to show in green in `text` (see PlaceHighlight). */
  places?: readonly string[];
  /** Optional: place names to show in green in `fromAirportText`. */
  fromAirportPlaces?: readonly string[];
  /** The ?from= value that switches the text (default "airport"). */
  fromValue?: string;
}) {
  const [swap, setSwap] = useState(false);
  useEffect(() => {
    if (fromAirportText && openedFromAirport(fromValue)) setSwap(true);
  }, [fromAirportText, fromValue]);
  const shown = swap && fromAirportText ? fromAirportText : text;
  const highlight = swap && fromAirportText ? fromAirportPlaces : places;
  return highlight ? <PlaceHighlight text={shown} places={highlight} /> : <>{shown}</>;
}
