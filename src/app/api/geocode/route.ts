import { NextRequest, NextResponse } from "next/server";
import {
  formatNominatimAddress,
  isAddressAllowedForAirport,
  isAllowedCoordinates,
} from "@/lib/address-utils";

type NominatimAddress = {
  house_number?: string;
  road?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
};

type NominatimResponse = {
  display_name?: string;
  address?: NominatimAddress;
};

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat");
  const lon = request.nextUrl.searchParams.get("lon");
  const airportCode = request.nextUrl.searchParams.get("airport")?.trim().toUpperCase() ?? "";

  if (!lat || !lon) {
    return NextResponse.json({ error: "Missing coordinates" }, { status: 400 });
  }

  const latitude = Number(lat);
  const longitude = Number(lon);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  if (!isAllowedCoordinates(airportCode, latitude, longitude)) {
    return NextResponse.json({ error: "Location is outside the service area" }, { status: 404 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18");

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "MyAirportTaxiNI/1.0 (https://myairporttaxini.co.uk)",
        Accept: "application/json",
      },
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
    }

    const data = (await response.json()) as NominatimResponse;

    if (
      data.address &&
      !isAddressAllowedForAirport(airportCode, {
        postcode: data.address.postcode,
        county: data.address.county,
        state: data.address.state,
        city: data.address.city,
        town: data.address.town ?? data.address.village,
        country: data.address.country,
        displayName: data.display_name,
      })
    ) {
      return NextResponse.json({ error: "Location is outside the service area" }, { status: 404 });
    }

    const formatted = data.address
      ? formatNominatimAddress(data.address)
      : data.display_name ?? "";

    if (!formatted) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    return NextResponse.json({ address: formatted });
  } catch {
    return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
  }
}
