/**
 * Preview-host-only seed for the real customer quote on the homepage.
 * Never runs on production hostnames.
 */

import { previewCustomerJourneyRequested, previewPartyFromQuery } from "@/lib/pricing-preview-store";
import { quickSelectToPlace, type SelectedPlace } from "@/lib/selected-place";
import { todayLondonDate } from "@/lib/format-datetime";
import { parseLondonLocalDateTime } from "../../shared/uk-time";

/** Belfast City Hall — known NI landmark used only to review the live quote UI. */
export const PREVIEW_BELFAST_CITY_HALL_PLACE: SelectedPlace = {
  placeId: "ChIJZ2jHcXU2YEgRqUOczktECqs",
  formattedAddress: "Donegall Square N, Belfast BT1 5GS, UK",
  displayAddress: "Belfast City Hall, Donegall Square N, Belfast BT1 5GS, UK",
  placeName: "Belfast City Hall",
  lat: 54.5964,
  lng: -5.9302,
  countryCode: "GB",
  postalCode: "BT1 5GS",
  streetNumber: null,
  route: "Donegall Square North",
  locality: "Belfast",
  administrativeArea: "Northern Ireland",
};

export type PreviewCustomerQuoteSeed = {
  pickup: SelectedPlace;
  dropoff: SelectedPlace;
  passengers: number | null;
  suitcases: number | null;
  tripDate: string;
  tripTime: string;
};

/** Representative destinations for reviewing the existing all-Ireland airport corridor. */
export const IRELAND_PREVIEW_DESTINATIONS = {
  dublin: { label: "Trinity College, College Green, Dublin, Ireland", lat: 53.3438, lng: -6.2546, country: "IE" },
  cork: { label: "The English Market, Cork, Ireland", lat: 51.8973, lng: -8.4755, country: "IE" },
  galway: { label: "Eyre Square, Galway, Ireland", lat: 53.2744, lng: -9.049, country: "IE" },
  limerick: { label: "The Hunt Museum, Limerick, Ireland", lat: 52.6689, lng: -8.6232, country: "IE" },
  waterford: { label: "House of Waterford Crystal, Waterford, Ireland", lat: 52.2591, lng: -7.1063, country: "IE" },
  donegal: { label: "Letterkenny Bus Station, Letterkenny, County Donegal, Ireland", lat: 54.9512, lng: -7.7305, country: "IE" },
  sligo: { label: "Sligo Abbey, Sligo, Ireland", lat: 54.2702, lng: -8.4708, country: "IE" },
  dundalk: { label: "Dundalk Railway Station, Dundalk, County Louth, Ireland", lat: 54.0002, lng: -6.4129, country: "IE" },
  derry: { label: "Guildhall, Derry BT48 6DQ, Northern Ireland", lat: 54.997, lng: -7.321, country: "GB" },
  enniskillen: { label: "Enniskillen Castle, Enniskillen BT74 7HL, Northern Ireland", lat: 54.3448, lng: -7.6442, country: "GB" },
} as const;

function nextWeekdayMorningDate(now = new Date()): string {
  for (let offset = 2; offset <= 10; offset += 1) {
    const candidate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const date = todayLondonDate(candidate);
    const noon = parseLondonLocalDateTime(date, "10:00");
    if (!noon) continue;
    const weekday = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
    }).format(noon);
    if (weekday !== "Sat" && weekday !== "Sun") {
      return date;
    }
  }
  return todayLondonDate(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000));
}

export function readPreviewCustomerQuoteSeed(): PreviewCustomerQuoteSeed | null {
  if (!previewCustomerJourneyRequested()) return null;
  const dropoff = quickSelectToPlace("BFS");
  if (!dropoff) return null;
  const party = previewPartyFromQuery();
  const params = new URLSearchParams(window.location.search);
  if (params.get("previewJourney") === "ireland") {
    const key = params.get("previewDestination") ?? "dublin";
    const destination = IRELAND_PREVIEW_DESTINATIONS[key as keyof typeof IRELAND_PREVIEW_DESTINATIONS];
    if (!destination) return null;
    const pickup = quickSelectToPlace(params.get("previewAirport") === "BHD" ? "BHD" : "BFS");
    if (!pickup) return null;
    return {
      pickup,
      dropoff: {
        placeId: `preview-ireland-${key}`, formattedAddress: destination.label, displayAddress: destination.label,
        placeName: destination.label.split(",")[0], lat: destination.lat, lng: destination.lng,
        countryCode: destination.country, postalCode: null, streetNumber: null, route: null,
        locality: key, administrativeArea: destination.country === "GB" ? "Northern Ireland" : "Ireland",
      },
      passengers: party.passengers, suitcases: party.suitcases,
      tripDate: nextWeekdayMorningDate(), tripTime: "10:00",
    };
  }
  return {
    pickup: PREVIEW_BELFAST_CITY_HALL_PLACE,
    dropoff,
    passengers: party.passengers,
    suitcases: party.suitcases,
    tripDate: nextWeekdayMorningDate(),
    tripTime: "10:00",
  };
}
