/**
 * Free airport pick-up points (Long Stay car parks) — shown on /pickup/<slug>/
 * and linked from the WhatsApp pickup / "driver arrived" messages.
 *
 * Coordinates are the Long Stay car park locations from Google Maps. If the owner
 * confirms a more exact free pick-up spot, update latitude/longitude here.
 */
import { AIRPORT_PICKUP_COPY } from "./company-voice-journey";

export type PickupPoint = {
  slug: string;
  airportCode: "BFS" | "BHD";
  airportName: string;
  title: string;
  latitude: number;
  longitude: number;
  walkNote: string;
  directions: string;
};

export const FREE_PICKUP_POINTS: PickupPoint[] = [
  {
    slug: "belfast-international-long-stay",
    airportCode: "BFS",
    airportName: "Belfast International Airport",
    title: "Free pick-up: Long Stay car park",
    latitude: 54.6623158,
    longitude: -6.2202916,
    walkNote: "Around a 5-minute walk from the terminal.",
    directions: AIRPORT_PICKUP_COPY.bfsBhdFree,
  },
  {
    slug: "belfast-city-long-stay",
    airportCode: "BHD",
    airportName: "George Best Belfast City Airport",
    title: "Free pick-up: Long Stay car park",
    latitude: 54.6174561,
    longitude: -5.8671823,
    walkNote: "Approximately a 5–10 minute walk from the terminal, along the covered walkway.",
    directions: AIRPORT_PICKUP_COPY.bfsBhdFree,
  },
];

export function getFreePickupPoint(slug: string): PickupPoint | undefined {
  return FREE_PICKUP_POINTS.find((p) => p.slug === slug);
}

export function freePickupPointForAirport(code: string | null | undefined): PickupPoint | undefined {
  const c = String(code ?? "").toUpperCase();
  return FREE_PICKUP_POINTS.find((p) => p.airportCode === c);
}

export function googleMapsUrl(point: Pick<PickupPoint, "latitude" | "longitude">): string {
  return `https://www.google.com/maps/search/?api=1&query=${point.latitude},${point.longitude}`;
}

/** Keyless Google Maps embed centred on the point. */
export function googleMapsEmbedUrl(point: Pick<PickupPoint, "latitude" | "longitude">): string {
  return `https://maps.google.com/maps?q=${point.latitude},${point.longitude}&z=17&output=embed`;
}
