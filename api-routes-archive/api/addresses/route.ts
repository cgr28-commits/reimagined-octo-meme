import { NextRequest, NextResponse } from "next/server";
import {
  formatGetAddressDetail,
  formatNominatimAddress,
  isAddressAllowedForAirport,
  isNorthernIrelandAddressParts,
  isNorthernIrelandText,
} from "@/lib/address-utils";
import { GETADDRESS_NI_FILTER } from "@/lib/northern-ireland";

export type AddressSuggestion = {
  id: string;
  label: string;
  address: string;
};

type GetAddressAutocomplete = {
  suggestions?: Array<{ id: string; address: string }>;
};

type GetAddressDetail = {
  line_1?: string;
  line_2?: string;
  line_3?: string;
  town_or_city?: string;
  county?: string;
  postcode?: string;
};

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

type NominatimResult = {
  place_id: number;
  display_name?: string;
  address?: NominatimAddress;
};

function normaliseAirportCode(value: string | null): string {
  return value?.trim().toUpperCase() ?? "";
}

async function searchGetAddress(query: string, apiKey: string): Promise<AddressSuggestion[]> {
  const autocompleteUrl = new URL(
    `https://api.getAddress.io/autocomplete/${encodeURIComponent(query)}`,
  );
  autocompleteUrl.searchParams.set("api-key", apiKey);
  autocompleteUrl.searchParams.set("all", "true");
  autocompleteUrl.searchParams.set("filter", GETADDRESS_NI_FILTER);

  const response = await fetch(autocompleteUrl, { next: { revalidate: 3600 } });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as GetAddressAutocomplete;

  return (data.suggestions ?? [])
    .filter((item) => isNorthernIrelandText(item.address))
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      label: item.address,
      address: item.address,
    }));
}

async function resolveGetAddress(
  id: string,
  apiKey: string,
  airportCode: string,
): Promise<string | null> {
  const response = await fetch(
    `https://api.getAddress.io/get/${encodeURIComponent(id)}?api-key=${apiKey}`,
    { next: { revalidate: 86400 } },
  );

  if (!response.ok) {
    return null;
  }

  const detail = (await response.json()) as GetAddressDetail;

  if (
    !isAddressAllowedForAirport(airportCode, {
      postcode: detail.postcode,
      county: detail.county,
      city: detail.town_or_city,
      displayName: formatGetAddressDetail(detail),
    })
  ) {
    return null;
  }

  return formatGetAddressDetail(detail) || null;
}

async function searchNominatim(
  query: string,
  airportCode: string,
): Promise<AddressSuggestion[]> {
  const allowIreland = airportCode === "DUB";
  const scopedQuery = allowIreland
    ? query
    : /northern ireland|,\s*bt/i.test(query)
      ? query
      : `${query}, Northern Ireland`;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", scopedQuery);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", allowIreland ? "ie,gb" : "gb");
  url.searchParams.set("limit", "12");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "MyAirportTaxiNI/1.0 (https://myairporttaxini.co.uk)",
      Accept: "application/json",
    },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as NominatimResult[];

  return data
    .filter((item) =>
      item.address
        ? isAddressAllowedForAirport(airportCode, {
            postcode: item.address.postcode,
            county: item.address.county,
            state: item.address.state,
            city: item.address.city,
            town: item.address.town ?? item.address.village,
            country: item.address.country,
            displayName: item.display_name,
          })
        : isNorthernIrelandText(item.display_name ?? ""),
    )
    .slice(0, 6)
    .map((item) => {
      const address = item.address
        ? formatNominatimAddress(item.address)
        : item.display_name ?? "";

      return {
        id: String(item.place_id),
        label: address,
        address,
      };
    })
    .filter((item) => item.address);
}

function mergeSuggestions(
  primary: AddressSuggestion[],
  secondary: AddressSuggestion[],
): AddressSuggestion[] {
  const seen = new Set<string>();
  const merged: AddressSuggestion[] = [];

  for (const suggestion of [...primary, ...secondary]) {
    const key = suggestion.address.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(suggestion);

    if (merged.length >= 6) {
      break;
    }
  }

  return merged;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim();
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const airportCode = normaliseAirportCode(request.nextUrl.searchParams.get("airport"));
  const apiKey = process.env.GETADDRESS_API_KEY;

  if (id && apiKey) {
    try {
      const address = await resolveGetAddress(id, apiKey, airportCode);
      if (!address) {
        return NextResponse.json({ error: "Address not found" }, { status: 404 });
      }
      return NextResponse.json({ address });
    } catch {
      return NextResponse.json({ error: "Address lookup failed" }, { status: 502 });
    }
  }

  if (query.length < 3) {
    return NextResponse.json({ suggestions: [] satisfies AddressSuggestion[] });
  }

  try {
    let suggestions: AddressSuggestion[];

    if (apiKey && airportCode === "DUB") {
      const [niSuggestions, expandedSuggestions] = await Promise.all([
        searchGetAddress(query, apiKey),
        searchNominatim(query, airportCode),
      ]);
      suggestions = mergeSuggestions(niSuggestions, expandedSuggestions);
    } else if (apiKey) {
      suggestions = await searchGetAddress(query, apiKey);
    } else {
      suggestions = await searchNominatim(query, airportCode);
    }

    return NextResponse.json({ suggestions, provider: apiKey ? "getaddress" : "nominatim" });
  } catch {
    return NextResponse.json({ error: "Address lookup failed" }, { status: 502 });
  }
}
