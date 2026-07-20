"use client";

import { AIRPORTS } from "@/lib/data";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY?.trim() ?? "";

type TripMapProps = {
  pickup: string;
  airportCode: string;
  tripDirection: "to-airport" | "from-airport";
};

function buildDirectionsUrls(
  pickup: string,
  airportCode: string,
  tripDirection: TripMapProps["tripDirection"],
) {
  const airport = AIRPORTS.find((item) => item.code === airportCode);
  if (!airport) {
    return null;
  }

  const origin = tripDirection === "to-airport" ? pickup : airport.mapLabel;
  const destination = tripDirection === "to-airport" ? airport.mapLabel : pickup;

  const mapsLink = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  const embedUrl = API_KEY
    ? `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(API_KEY)}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving`
    : null;

  return { mapsLink, embedUrl, airportName: airport.name };
}

export default function TripMap({ pickup, airportCode, tripDirection }: TripMapProps) {
  const trimmedPickup = pickup.trim();

  if (!trimmedPickup || !airportCode || trimmedPickup.length < 8) {
    return null;
  }

  const urls = buildDirectionsUrls(trimmedPickup, airportCode, tripDirection);
  if (!urls) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <div className="border-b border-white/10 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wider text-emerald">Your route</p>
        <p className="mt-1 text-sm text-white/70">
          {tripDirection === "to-airport"
            ? `Pickup to ${urls.airportName}`
            : `${urls.airportName} to your drop-off`}
        </p>
      </div>

      {urls.embedUrl ? (
        <iframe
          title="Trip route map"
          src={urls.embedUrl}
          className="h-48 w-full border-0 bg-white sm:h-56"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
        />
      ) : (
        <div className="flex h-48 items-center justify-center px-4 text-center sm:h-56">
          <p className="text-sm text-white/60">Map preview unavailable — open the route in Google Maps.</p>
        </div>
      )}

      <div className="border-t border-white/10 px-4 py-3">
        <a
          href={urls.mapsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-emerald transition-colors hover:text-emerald-light"
        >
          Open route in Google Maps
        </a>
      </div>
    </div>
  );
}
