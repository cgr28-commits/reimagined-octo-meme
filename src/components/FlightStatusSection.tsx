"use client";

import { useState } from "react";
import { FLIGHT_AIRPORTS, SITE } from "@/lib/data";
import FlightWidget from "./FlightWidget";

type FlightType = "arrivals" | "departures";

export default function FlightStatusSection() {
  const [activeAirport, setActiveAirport] = useState(0);
  const [flightType, setFlightType] = useState<FlightType>("arrivals");

  const airport = FLIGHT_AIRPORTS[activeAirport];

  return (
    <section id="flight-status" className="relative py-20 sm:py-28">
      <div className="absolute inset-0 bg-gradient-to-b from-navy via-navy-dark/50 to-navy" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald">
            Plan Your Pickup
          </p>
          <h2 className="section-heading mx-auto mt-2 text-3xl font-bold text-white sm:text-4xl">
            Live Flight Status
          </h2>
          <p className="mt-5 text-base leading-relaxed text-white/60">
            Check real-time arrivals and departures before you book. Share your flight
            number via WhatsApp and we&apos;ll track delays automatically.
          </p>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-2">
          {FLIGHT_AIRPORTS.map((item, index) => (
            <button
              key={item.code}
              type="button"
              onClick={() => setActiveAirport(index)}
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-all ${
                activeAirport === index
                  ? "bg-emerald text-navy shadow-lg shadow-emerald/25"
                  : "border border-white/10 bg-white/[0.03] text-white/70 hover:border-emerald/30 hover:text-white"
              }`}
              aria-pressed={activeAirport === index}
            >
              {item.code}
              <span className="hidden sm:inline"> — {item.name}</span>
            </button>
          ))}
        </div>

        <div className="mt-8 glass-card overflow-hidden rounded-2xl">
          <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-emerald/15 px-3 py-1 text-xs font-bold tracking-wider text-emerald">
                  {airport.code}
                </span>
                <h3 className="text-lg font-bold text-white">{airport.name}</h3>
              </div>
              <p className="mt-1 text-sm text-white/50">{airport.subtitle}</p>
            </div>

            <div className="flex gap-2">
              {(["arrivals", "departures"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFlightType(type)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition-all ${
                    flightType === type
                      ? "bg-emerald/15 text-emerald"
                      : "text-white/50 hover:bg-white/5 hover:text-white"
                  }`}
                  aria-pressed={flightType === type}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 sm:p-6">
            <FlightWidget iata={airport.code} type={flightType} />
          </div>

          <div className="flex flex-col gap-4 border-t border-white/10 bg-white/[0.02] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs text-white/40">
              Data provided by{" "}
              <a
                href="https://flightradar.live"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 underline-offset-2 hover:text-emerald hover:underline"
              >
                Flightradar.live
              </a>
              . For official airport information, use the links below.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={airport.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:border-emerald/30 hover:text-emerald"
              >
                Official flight board
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
              <a
                href={`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(
                  `Hi, I'd like to book an airport transfer. My flight is arriving at ${airport.name} (${airport.code}).`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald px-4 py-2 text-xs font-semibold text-navy transition-all hover:bg-emerald-light"
              >
                Book transfer via WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
