"use client";

import { useEffect, useState } from "react";

/** True when the page was opened with ?from=airport (Google Ads "from the airport" landings). */
export function openedFromAirport(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("from") === "airport";
}

/**
 * Town-to-airport pages opened with ?from=airport start the quote at the airport, so the
 * heading and intro read the other way round too. Without ?from=airport (and in the static
 * HTML Google indexes) the normal text is shown.
 */
export default function FromAirportText({ text, fromAirportText }: { text: string; fromAirportText?: string }) {
  const [swap, setSwap] = useState(false);
  useEffect(() => {
    if (fromAirportText && openedFromAirport()) setSwap(true);
  }, [fromAirportText]);
  return <>{swap && fromAirportText ? fromAirportText : text}</>;
}
