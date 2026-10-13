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
  const previewDestinations: Record<string, [string, number, number, string]> = {
    cork: ["Cork City Hall, Anglesea Street, Cork, Ireland", 51.8966, -8.4656, "IE"],
    galway: ["Eyre Square, Galway, Ireland", 53.2742, -9.0497, "IE"],
    donegal: ["Donegal Castle, Donegal, Ireland", 54.6542, -8.1105, "IE"],
    derry: ["Guildhall, Derry, Northern Ireland", 54.9972, -7.3199, "GB"],
  };
  const selected = previewDestinations[new URLSearchParams(window.location.search).get("previewDestination") ?? ""];
  const dropoff = selected ? {
    ...PREVIEW_BELFAST_CITY_HALL_PLACE,
    placeId: `preview-ireland-${selected[0]}`,
    formattedAddress: selected[0], displayAddress: selected[0], placeName: selected[0].split(",")[0],
    lat: selected[1], lng: selected[2], countryCode: selected[3], postalCode: null,
    route: null, locality: null, administrativeArea: null,
  } : quickSelectToPlace("BFS");
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
