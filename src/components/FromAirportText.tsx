"use client";

import HubHeadingText from "./HubHeadingText";
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
  highlight,
  fromAirportHighlight,
}: {
  text: string;
  fromAirportText?: string;
  /** Words to show in brand green (e.g. the destination in a heading). */
  highlight?: string;
  /** Green words for the swapped (?from=airport) text. */
  fromAirportHighlight?: string;
  /** The ?from= value that switches the text (default "airport"). */
  fromValue?: string;
}) {
  const [swap, setSwap] = useState(false);
  useEffect(() => {
    if (fromAirportText && openedFromAirport(fromValue)) setSwap(true);
  }, [fromAirportText, fromValue]);
  const shown = swap && fromAirportText ? fromAirportText : text;
  const green = swap && fromAirportText ? fromAirportHighlight : highlight;
  return green ? <HubHeadingText text={shown} subject={green} /> : <>{shown}</>;
}
