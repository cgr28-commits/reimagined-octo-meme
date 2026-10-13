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

/** Preview fixture near the Dublin city hotel; replace with your own confirmed address to test. */
export const PREVIEW_DUBLIN_HOTEL_PLACE: SelectedPlace = {
  placeId: "preview-dublin-city-hotel", formattedAddress: "citizenM Dublin St. Patrick's, 67–69 Bride St, Dublin D08 C8CN, Ireland",
  displayAddress: "citizenM Dublin St. Patrick's, 67–69 Bride St, Dublin D08 C8CN, Ireland",
  placeName: "citizenM Dublin St. Patrick's", lat: 53.339, lng: -6.272,
  countryCode: "IE", postalCode: "D08 C8CN", streetNumber: "67–69", route: "Bride Street",
  locality: "Dublin", administrativeArea: "Dublin",
};
export const PREVIEW_BELFAST_HOTEL_PLACE: SelectedPlace = {
  placeId: "preview-belfast-city-hotel", formattedAddress: "Europa Hotel, Great Victoria St, Belfast BT2 7AP, UK",
  displayAddress: "Europa Hotel, Great Victoria St, Belfast BT2 7AP, UK",
  placeName: "Europa Hotel", lat: 54.5946, lng: -5.9358,
  countryCode: "GB", postalCode: "BT2 7AP", streetNumber: null, route: "Great Victoria Street",
  locality: "Belfast", administrativeArea: "Northern Ireland",
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
  const params = new URLSearchParams(window.location.search);
  if (params.get("previewJourney") === "ireland-north") {
    const origins = {
      dublin: PREVIEW_DUBLIN_HOTEL_PLACE,
      cork: {...PREVIEW_DUBLIN_HOTEL_PLACE, placeName: "The English Market", formattedAddress: "The English Market, Cork, Ireland", displayAddress: "The English Market, Cork, Ireland", lat:51.8973,lng:-8.4755,postalCode:null,locality:"Cork",route:null},
      galway: {...PREVIEW_DUBLIN_HOTEL_PLACE, placeName: "Eyre Square", formattedAddress: "Eyre Square, Galway, Ireland", displayAddress: "Eyre Square, Galway, Ireland",lat:53.2744,lng:-9.049,postalCode:null,locality:"Galway",route:null},
      derry: {...PREVIEW_BELFAST_HOTEL_PLACE, placeName: "Guildhall",formattedAddress: "Guildhall, Derry BT48 6DQ, Northern Ireland",displayAddress: "Guildhall, Derry BT48 6DQ, Northern Ireland",lat:54.997,lng:-7.321,postalCode:"BT48 6DQ",locality:"Derry",route:null},
    };
    const destinations = {
      belfast: PREVIEW_BELFAST_HOTEL_PLACE,
      antrim: {...PREVIEW_BELFAST_HOTEL_PLACE,placeName:"Antrim test destination",formattedAddress:"Antrim test destination, Antrim BT41 4LH, Northern Ireland",displayAddress:"Antrim test destination, Antrim BT41 4LH, Northern Ireland",lat:54.719,lng:-6.210,postalCode:"BT41 4LH",locality:"Antrim",route:null},
      ballymena: {...PREVIEW_BELFAST_HOTEL_PLACE,placeName:"Ballymena test destination",formattedAddress:"Ballymena test destination, Ballymena BT43 6AH, Northern Ireland",displayAddress:"Ballymena test destination, Ballymena BT43 6AH, Northern Ireland",lat:54.865,lng:-6.276,postalCode:"BT43 6AH",locality:"Ballymena",route:null},
      ballymoney: {...PREVIEW_BELFAST_HOTEL_PLACE,placeName:"Ballymoney test destination",formattedAddress:"Ballymoney test destination, Ballymoney BT53 6AN, Northern Ireland",displayAddress:"Ballymoney test destination, Ballymoney BT53 6AN, Northern Ireland",lat:55.070,lng:-6.512,postalCode:"BT53 6AN",locality:"Ballymoney",route:null},
      coleraine: {...PREVIEW_BELFAST_HOTEL_PLACE,placeName:"Coleraine test destination",formattedAddress:"Coleraine test destination, Coleraine BT52 1DP, Northern Ireland",displayAddress:"Coleraine test destination, Coleraine BT52 1DP, Northern Ireland",lat:55.133,lng:-6.668,postalCode:"BT52 1DP",locality:"Coleraine",route:null},
    };
    const pickup = origins[(params.get("previewOrigin") ?? "dublin") as keyof typeof origins];
    const destination = destinations[(params.get("previewDestination") ?? "belfast") as keyof typeof destinations];
    if (!pickup || !destination) return null;
    return {pickup,dropoff:destination,passengers:party.passengers,suitcases:party.suitcases,tripDate:nextWeekdayMorningDate(),tripTime:"07:00"};
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
