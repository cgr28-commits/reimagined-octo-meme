"use client";

import { FormEvent, useEffect, useState } from "react";
import { AIRPORTS, SITE, VEHICLE_TYPES } from "@/lib/data";

type TripDirection = "to-airport" | "from-airport";

const ADDRESS_STORAGE_KEY = "my-airport-taxi-ni-pickup-address";

export default function QuoteCard() {
  const [submitted, setSubmitted] = useState(false);
  const [tripDirection, setTripDirection] = useState<TripDirection>("to-airport");
  const [airportCode, setAirportCode] = useState("");
  const [address, setAddress] = useState("");
  const [returnJourney, setReturnJourney] = useState(false);
  const [vehicle, setVehicle] = useState<(typeof VEHICLE_TYPES)[number]>(
    VEHICLE_TYPES[0],
  );

  useEffect(() => {
    const saved = localStorage.getItem(ADDRESS_STORAGE_KEY);
    if (saved) {
      setAddress(saved);
    }
  }, []);

  const isFromAirport = tripDirection === "from-airport";

  function handleAddressChange(value: string) {
    setAddress(value);

    if (value.trim()) {
      localStorage.setItem(ADDRESS_STORAGE_KEY, value.trim());
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const location = data.get("pickup") as string;
    const airportCodeValue = data.get("destination") as string;
    const airportName =
      AIRPORTS.find((a) => a.code === airportCodeValue)?.name ?? airportCodeValue;
    const date = data.get("date") as string;
    const time = data.get("time") as string;
    const passengers = data.get("passengers") as string;
    const suitcases = data.get("suitcases") as string;
    const vehicleType = data.get("vehicle") as string;
    const flightNumber = (data.get("flightNumber") as string).trim();
    const name = data.get("name") as string;

    const tripLabel = isFromAirport ? "Pickup from airport" : "To airport";
    const pickup = isFromAirport ? airportName : location;
    const destination = isFromAirport ? location : airportName;

    const message = encodeURIComponent(
      `Hi, I'd like a quote please.\n\n` +
        `Name: ${name}\n` +
        `Trip: ${tripLabel}\n` +
        `Pickup: ${pickup}\n` +
        `Drop-off: ${destination}\n` +
        `Return journey: ${returnJourney ? "Yes" : "No"}\n` +
        `Date: ${date}\n` +
        `Time: ${time}\n` +
        (flightNumber ? `Flight number: ${flightNumber}\n` : "") +
        `Passengers: ${passengers}\n` +
        `Suitcases: ${suitcases}\n` +
        `Vehicle: ${vehicleType}`,
    );

    window.open(`https://wa.me/${SITE.whatsapp}?text=${message}`, "_blank");
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 4000);
  }

  return (
    <div className="glass-card animate-float rounded-2xl p-6 sm:p-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white sm:text-2xl">Request a Quote</h2>
        <p className="mt-1 text-sm text-white/60">
          Send your trip details via WhatsApp and we&apos;ll confirm your quote with you directly
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
            Trip Type
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setTripDirection("to-airport")}
              className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                tripDirection === "to-airport"
                  ? "bg-emerald text-navy shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              To airport
            </button>
            <button
              type="button"
              onClick={() => setTripDirection("from-airport")}
              className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                tripDirection === "from-airport"
                  ? "bg-emerald text-navy shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              From airport
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
            Journey
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setReturnJourney(false)}
              className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                !returnJourney
                  ? "bg-emerald text-navy shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              One way
            </button>
            <button
              type="button"
              onClick={() => setReturnJourney(true)}
              className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                returnJourney
                  ? "bg-emerald text-navy shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Return journey
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="name" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
            Your Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="John Smith"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
          />
        </div>

        <div>
          <label htmlFor="destination" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
            {isFromAirport ? "Pickup Airport" : "Airport / Destination"}
          </label>
          <select
            id="destination"
            name="destination"
            required
            value={airportCode}
            onChange={(e) => setAirportCode(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-navy-light px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
          >
            <option value="">Select airport</option>
            {AIRPORTS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name} ({a.code}) — {a.distance}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="pickup" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
            {isFromAirport ? "Your Drop-off Address" : "Your Pickup Address"}
          </label>
          <input
            id="pickup"
            name="pickup"
            type="text"
            required
            autoComplete="street-address"
            value={address}
            onChange={(e) => handleAddressChange(e.target.value)}
            placeholder="e.g. 12 Donegall Square, Belfast BT1 5GS"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
          />
          <p className="mt-1.5 text-xs text-white/40">
            Enter your full address including town and postcode
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="date" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
              Date
            </label>
            <input
              id="date"
              name="date"
              type="date"
              required
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
            />
          </div>
          <div>
            <label htmlFor="time" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
              Time
            </label>
            <input
              id="time"
              name="time"
              type="time"
              required
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
            />
          </div>
        </div>

        <div>
          <label htmlFor="flightNumber" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
            Flight Number {isFromAirport ? "" : "(optional)"}
          </label>
          <input
            id="flightNumber"
            name="flightNumber"
            type="text"
            required={isFromAirport}
            placeholder="e.g. BA1234"
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm uppercase text-white placeholder:normal-case placeholder:text-white/30 outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
          />
          <p className="mt-1.5 text-xs text-white/40">
            {isFromAirport
              ? "Required for flight monitoring and complimentary airport waiting time."
              : "Optional — helps us track your flight if your plans change."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="passengers" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
              Passengers
            </label>
            <input
              id="passengers"
              name="passengers"
              type="number"
              min={1}
              max={8}
              required
              defaultValue={1}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
            />
          </div>
          <div>
            <label htmlFor="suitcases" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
              Suitcases
            </label>
            <input
              id="suitcases"
              name="suitcases"
              type="number"
              min={0}
              max={12}
              required
              defaultValue={1}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="vehicle" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50">
              Vehicle Type
            </label>
            <select
              id="vehicle"
              name="vehicle"
              required
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value as (typeof VEHICLE_TYPES)[number])}
              className="w-full rounded-xl border border-white/10 bg-navy-light px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
            >
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25"
        >
          {submitted ? "Opening WhatsApp…" : "Send via WhatsApp"}
        </button>
      </form>
    </div>
  );
}
