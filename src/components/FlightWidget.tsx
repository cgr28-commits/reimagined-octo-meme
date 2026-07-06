"use client";

import { useEffect, useRef } from "react";

type FlightType = "arrivals" | "departures";

type FlightWidgetProps = {
  iata: string;
  type: FlightType;
};

export default function FlightWidget({ iata, type }: FlightWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = "";

    const script = document.createElement("script");
    script.src = `https://fids.flightradar.live/widgets/airport/${iata}/${type}`;
    script.async = true;
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [iata, type]);

  return (
    <div
      ref={containerRef}
      className="flight-widget-host min-h-[420px] overflow-x-auto rounded-xl"
      aria-label={`${iata} ${type} flight board`}
      aria-live="polite"
    />
  );
}
