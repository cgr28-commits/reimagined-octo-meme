"use client";

import { FormEvent, memo, useEffect, useMemo, useState } from "react";
import AddressInput from "@/components/AddressInput";
import TripMap from "@/components/TripMap";
import { AIRPORTS, SITE, VEHICLE_TYPES } from "@/lib/data";
import { readPrefillAirport } from "@/lib/quote-prefill";
import {
  calculateQuote,
  formatQuote,
} from "@/lib/quote";

type TripMode = "airport" | "address";
type TripDirection = "to-airport" | "from-airport";

const PICKUP_STORAGE_KEY = "my-airport-taxi-ni-pickup-address";
const DROPOFF_STORAGE_KEY = "my-airport-taxi-ni-dropoff-address";

const ESTATE = "Estate Car (1–4 passengers)" as const;
const MINIBUS = "Minibus (7–8 passengers)" as const;

type VehicleType = (typeof VEHICLE_TYPES)[number];

function getAutoVehicle(passengers: number, suitcases: number): VehicleType | null {
  if (passengers >= 8 || suitcases >= 5) {
    return MINIBUS;
  }
  if (suitcases === 4) {
    return ESTATE;
  }
  return null;
}

function parseDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}`);
}

function isReturnAfterOutbound(
  outboundDate: string,
  outboundTime: string,
  returnDate: string,
  returnTime: string,
): boolean {
  return parseDateTime(returnDate, returnTime) > parseDateTime(outboundDate, outboundTime);
}

function QuoteCard() {
  const [submitted, setSubmitted] = useState(false);
  const [tripMode, setTripMode] = useState<TripMode>("airport");
  const [tripDirection, setTripDirection] = useState<TripDirection>("to-airport");
  const [airportCode, setAirportCode] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [returnJourney, setReturnJourney] = useState(false);
  const [returnDateError, setReturnDateError] = useState("");
  const [tripDate, setTripDate] = useState("");
  const [tripTime, setTripTime] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [vehicle, setVehicle] = useState<VehicleType>(VEHICLE_TYPES[0]);
  const [passengers, setPassengers] = useState(1);
  const [suitcases, setSuitcases] = useState(1);

  const autoVehicle = getAutoVehicle(passengers, suitcases);
  const quoteVehicle = autoVehicle ?? vehicle;
  const isVehicleAutoSelected = autoVehicle != null;

  const isAirportTrip = tripMode === "airport";
  const isFromAirport = tripDirection === "from-airport";
  const addressLookupCode = isAirportTrip ? airportCode : "BFS";

  useEffect(() => {
    const savedPickup = localStorage.getItem(PICKUP_STORAGE_KEY);
    const savedDropoff = localStorage.getItem(DROPOFF_STORAGE_KEY);
    if (savedPickup) {
      setPickupAddress(savedPickup);
    }
    if (savedDropoff) {
      setDropoffAddress(savedDropoff);
    }
  }, []);

  useEffect(() => {
    function applyAirportPrefill(code: string) {
      if (AIRPORTS.some((airport) => airport.code === code)) {
        setTripMode("airport");
        setAirportCode(code);
        setTripDirection("to-airport");
      }
    }

    if (window.location.hash === "#quote") {
      const params = new URLSearchParams(window.location.search);
      const airportFromQuery = params.get("airport")?.trim().toUpperCase();
      if (airportFromQuery) {
        applyAirportPrefill(airportFromQuery);
      }
    }

    const stored = readPrefillAirport();
    if (stored) {
      applyAirportPrefill(stored);
    }

    function handlePrefill(event: Event) {
      const code = (event as CustomEvent<string>).detail;
      if (code) {
        applyAirportPrefill(code);
      }
    }

    window.addEventListener("quote-prefill-airport", handlePrefill);
    return () => window.removeEventListener("quote-prefill-airport", handlePrefill);
  }, []);

  const isScheduleComplete =
    Boolean(tripDate && tripTime) &&
    (!returnJourney || Boolean(returnDate && returnTime));

  const quoteAddress = isFromAirport ? dropoffAddress : pickupAddress;
  const isAddressComplete = Boolean(airportCode && quoteAddress.trim());

  const canShowPrice = isScheduleComplete && isAddressComplete;

  const liveQuote = useMemo(() => {
    if (!isAirportTrip || !canShowPrice) {
      return null;
    }

    return calculateQuote(quoteAddress, airportCode, quoteVehicle, returnJourney, {
      outboundDate: tripDate,
      outboundTime: tripTime,
      returnDate,
      returnTime,
      returnJourney,
    });
  }, [
    airportCode,
    canShowPrice,
    isAirportTrip,
    quoteAddress,
    returnDate,
    returnJourney,
    returnTime,
    tripDate,
    tripTime,
    quoteVehicle,
  ]);

  function handlePickupChange(value: string) {
    setPickupAddress(value);
    if (value.trim()) {
      localStorage.setItem(PICKUP_STORAGE_KEY, value.trim());
    }
  }

  function handleDropoffChange(value: string) {
    setDropoffAddress(value);
    if (value.trim()) {
      localStorage.setItem(DROPOFF_STORAGE_KEY, value.trim());
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);

    const pickup = (data.get("pickup") as string).trim();
    const dropoff = (data.get("dropoff") as string).trim();
    const airportCodeValue = (data.get("destination") as string).trim();
    const airportName =
      AIRPORTS.find((a) => a.code === airportCodeValue)?.name ?? airportCodeValue;
    const date = tripDate;
    const time = tripTime;
    const returnDateValue = returnJourney ? returnDate : "";
    const returnTimeValue = returnJourney ? returnTime : "";

    if (returnJourney) {
      if (!returnDateValue || !returnTimeValue) {
        setReturnDateError("Please select a return date and time.");
        return;
      }
      if (!isReturnAfterOutbound(date, time, returnDateValue, returnTimeValue)) {
        setReturnDateError("Return date and time must be after your outbound trip.");
        return;
      }
    }
    setReturnDateError("");

    const passengers = data.get("passengers") as string;
    const suitcases = data.get("suitcases") as string;
    const vehicleType = data.get("vehicle") as string;
    const flightNumber = (data.get("flightNumber") as string).trim();
    const name = data.get("name") as string;

    let tripLabel: string;
    let pickupLabel: string;
    let destinationLabel: string;

    if (isAirportTrip) {
      tripLabel = isFromAirport ? "Airport pickup" : "Airport drop-off";
      pickupLabel = isFromAirport ? airportName : pickup;
      destinationLabel = isFromAirport ? dropoff : airportName;
    } else {
      tripLabel = "Address to address";
      pickupLabel = pickup;
      destinationLabel = dropoff;
    }

    const estimatedPrice =
      isAirportTrip && liveQuote ? formatQuote(liveQuote.amount) : null;

    const message = encodeURIComponent(
      `Hi, I'd like a quote please.\n\n` +
        `Name: ${name}\n` +
        `Trip: ${tripLabel}\n` +
        `Pickup: ${pickupLabel}\n` +
        `Drop-off: ${destinationLabel}\n` +
        `Return journey: ${returnJourney ? "Yes" : "No"}\n` +
        `${returnJourney ? "Outbound date" : "Date"}: ${date}\n` +
        `${returnJourney ? "Outbound time" : "Time"}: ${time}\n` +
        (returnJourney ? `Return date: ${returnDateValue}\nReturn time: ${returnTimeValue}\n` : "") +
        (isAirportTrip && flightNumber ? `Flight number: ${flightNumber}\n` : "") +
        `Passengers: ${passengers}\n` +
        `Suitcases: ${suitcases}\n` +
        `Vehicle: ${vehicleType}\n` +
        (estimatedPrice
          ? `Estimated price: ${estimatedPrice}\n`
          : !isAirportTrip
            ? "Please provide a personal quote for this journey.\n"
            : ""),
    );

    window.open(`https://wa.me/${SITE.whatsapp}?text=${message}`, "_blank");
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 4000);
  }

  const quoteHint = isAirportTrip
    ? !airportCode
      ? "Select an airport to see your estimated price"
      : !isScheduleComplete
        ? returnJourney && tripDate && tripTime && (!returnDate || !returnTime)
          ? "Select your return date and time to see your estimated price"
          : "Select your date and time to see your estimated price"
        : !isAddressComplete
          ? `Enter your ${isFromAirport ? "drop-off" : "pickup"} address to see your estimated price`
          : ""
    : "Fill in your journey details and send via WhatsApp — we'll confirm your fare personally.";

  return (
    <div className="glass-card rounded-2xl p-6 sm:p-8 lg:animate-float">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white sm:text-2xl">Get a Live Quote</h2>
        <p className="mt-1 text-sm text-white/60">
          {isAirportTrip
            ? "See your estimated price instantly, then book via WhatsApp"
            : "Send your address-to-address trip details and we'll quote you personally"}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
            Service Type
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => {
                setTripMode("airport");
                setReturnDateError("");
              }}
              className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                isAirportTrip
                  ? "bg-emerald text-navy shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Airport transfer
            </button>
            <button
              type="button"
              onClick={() => {
                setTripMode("address");
                setReturnDateError("");
              }}
              className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition-all sm:text-sm ${
                !isAirportTrip
                  ? "bg-emerald text-navy shadow-sm"
                  : "text-white/70 hover:text-white"
              }`}
            >
              Address to address
            </button>
          </div>
        </div>

        {isAirportTrip && (
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
        )}

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/50">
            Journey
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => {
                setReturnJourney(false);
                setReturnDateError("");
              }}
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
          <label
            htmlFor="name"
            className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
          >
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

        {isAirportTrip && (
          <div>
            <label
              htmlFor="destination"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              {isFromAirport ? "Pickup Airport" : "Destination Airport"}
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
        )}

        {!isAirportTrip && <input type="hidden" name="destination" value="" />}

        {isAirportTrip ? (
          isFromAirport ? (
            <>
              <AddressInput
                id="dropoff"
                name="dropoff"
                value={dropoffAddress}
                onChange={handleDropoffChange}
                airportCode={addressLookupCode}
                label="Your Drop-off Address"
                placeholder="e.g. Donegall Square, Belfast or 12 Donegall Square"
                helperText="Type your street name or full address — numbered addresses appear in the list for you to pick"
              />
              <input type="hidden" name="pickup" value={airportCode ? AIRPORTS.find((a) => a.code === airportCode)?.name ?? "" : ""} />
            </>
          ) : (
            <>
              <AddressInput
                id="pickup"
                name="pickup"
                value={pickupAddress}
                onChange={handlePickupChange}
                airportCode={addressLookupCode}
                label="Your Pickup Address"
                placeholder="e.g. Donegall Square, Belfast or 12 Donegall Square"
                helperText="Type your street name or full address — numbered addresses appear in the list for you to pick"
              />
              <input type="hidden" name="dropoff" value={airportCode ? AIRPORTS.find((a) => a.code === airportCode)?.name ?? "" : ""} />
            </>
          )
        ) : (
          <>
            <AddressInput
              id="pickup"
              name="pickup"
              value={pickupAddress}
              onChange={handlePickupChange}
              airportCode={addressLookupCode}
              label="Pickup Address"
              placeholder="e.g. 12 High Street, Bangor"
              helperText="Where should we collect you?"
            />
            <AddressInput
              id="dropoff"
              name="dropoff"
              value={dropoffAddress}
              onChange={handleDropoffChange}
              airportCode={addressLookupCode}
              label="Drop-off Address"
              placeholder="e.g. 45 Main Street, Lisburn"
              helperText="Where are you going?"
            />
          </>
        )}

        <TripMap
          tripMode={tripMode}
          originAddress={
            isAirportTrip
              ? isFromAirport
                ? (AIRPORTS.find((a) => a.code === airportCode)?.mapLabel ?? "")
                : pickupAddress
              : pickupAddress
          }
          destinationAddress={
            isAirportTrip
              ? isFromAirport
                ? dropoffAddress
                : (AIRPORTS.find((a) => a.code === airportCode)?.mapLabel ?? "")
              : dropoffAddress
          }
          airportCode={airportCode}
          tripDirection={tripDirection}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="date"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              {returnJourney ? "Outbound Date" : "Date"}
            </label>
            <input
              id="date"
              name="date"
              type="date"
              required
              value={tripDate}
              onChange={(e) => setTripDate(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
            />
          </div>
          <div>
            <label
              htmlFor="time"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              {returnJourney ? "Outbound Time" : "Time"}
            </label>
            <input
              id="time"
              name="time"
              type="time"
              required
              value={tripTime}
              onChange={(e) => setTripTime(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
            />
          </div>
        </div>

        {returnJourney && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="returnDate"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
              >
                Return Date
              </label>
              <input
                id="returnDate"
                name="returnDate"
                type="date"
                required
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
              />
            </div>
            <div>
              <label
                htmlFor="returnTime"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
              >
                Return Time
              </label>
              <input
                id="returnTime"
                name="returnTime"
                type="time"
                required
                value={returnTime}
                onChange={(e) => setReturnTime(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 [color-scheme:dark]"
              />
            </div>
            {returnDateError && (
              <p className="sm:col-span-2 text-xs text-red-400">{returnDateError}</p>
            )}
          </div>
        )}

        {isAirportTrip && (
          <div>
            <label
              htmlFor="flightNumber"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
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
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="passengers"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              Passengers
            </label>
            <select
              id="passengers"
              name="passengers"
              required
              value={passengers}
              onChange={(e) => setPassengers(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-navy-light px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
            >
              {Array.from({ length: 8 }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="suitcases"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              Suitcases (23kg each)
            </label>
            <select
              id="suitcases"
              name="suitcases"
              required
              value={suitcases}
              onChange={(e) => setSuitcases(Number(e.target.value))}
              className="w-full rounded-xl border border-white/10 bg-navy-light px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30"
            >
              {Array.from({ length: 9 }, (_, index) => index).map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="vehicle"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-white/50"
            >
              Vehicle Type
            </label>
            <input type="hidden" name="vehicle" value={quoteVehicle} />
            <select
              id="vehicle"
              required
              value={quoteVehicle}
              onChange={(e) => setVehicle(e.target.value as VehicleType)}
              disabled={isVehicleAutoSelected}
              className="w-full rounded-xl border border-white/10 bg-navy-light px-4 py-3 text-sm text-white outline-none transition-colors focus:border-emerald/50 focus:ring-1 focus:ring-emerald/30 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
            {passengers >= 8 ? (
              <p className="mt-1.5 text-xs text-white/40">
                Minibus selected automatically for 8 passengers.
              </p>
            ) : suitcases >= 5 ? (
              <p className="mt-1.5 text-xs text-white/40">
                Minibus selected automatically for 5 or more suitcases.
              </p>
            ) : suitcases === 4 ? (
              <p className="mt-1.5 text-xs text-white/40">
                Estate car selected automatically for 4 suitcases.
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-emerald/30 bg-emerald/10 px-4 py-4">
          {isAirportTrip ? (
            liveQuote ? (
              <>
                <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                  {returnJourney ? "Estimated return price" : "Estimated price"}
                </p>
                <p className="mt-1 text-3xl font-bold text-white">{formatQuote(liveQuote.amount)}</p>
                <p className="mt-2 text-xs text-white/60">{quoteVehicle.split(" (")[0]}</p>
                <p className="mt-3 text-xs leading-relaxed text-white/60">
                  Includes express drop-off and pickup fees, and 60 minutes complimentary waiting
                  time from when your plane lands.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-medium uppercase tracking-wider text-white/50">
                  Estimated price
                </p>
                <p className="mt-1 text-sm text-white/70">{quoteHint}</p>
              </>
            )
          ) : (
            <>
              <p className="text-xs font-medium uppercase tracking-wider text-emerald">
                Personal quote
              </p>
              <p className="mt-1 text-sm text-white/80">
                Address-to-address fares vary by route. Send your details below and we&apos;ll reply
                on WhatsApp with your exact price.
              </p>
              <p className="mt-2 text-xs text-white/60">{quoteHint}</p>
            </>
          )}
          <p className="mt-3 text-[11px] text-white/40">
            Includes vehicle, driver, fuel, and tolls.
          </p>
        </div>

        <button
          type="submit"
          className="w-full rounded-xl bg-emerald py-3.5 text-sm font-bold text-navy transition-all hover:bg-emerald-light hover:shadow-lg hover:shadow-emerald/25"
        >
          {submitted
            ? "Opening WhatsApp…"
            : isAirportTrip && liveQuote
              ? `Book for ${formatQuote(liveQuote.amount)} via WhatsApp`
              : isAirportTrip
                ? "Send via WhatsApp"
                : "Send details for a quote via WhatsApp"}
        </button>
      </form>
    </div>
  );
}

export default memo(QuoteCard);
