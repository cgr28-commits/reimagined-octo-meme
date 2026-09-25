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
  return {
    pickup: PREVIEW_BELFAST_CITY_HALL_PLACE,
    dropoff,
    passengers: party.passengers,
    suitcases: party.suitcases,
    tripDate: nextWeekdayMorningDate(),
    tripTime: "10:00",
  };
}
