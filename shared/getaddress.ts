import { isAddressAllowedForAirport, isNorthernIrelandText, sortSuggestionsByStreetNumber } from "./address-validation";

export const GETADDRESS_NI_FILTER = "postcode:BT";

export type AddressSuggestion = {
  id: string;
  label: string;
  address: string;
  mainText: string;
  secondaryText: string;
};

type GetAddressAutocompleteResponse = {
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

function formatGetAddressDetail(detail: GetAddressDetail): string {
  return [detail.line_1, detail.line_2, detail.line_3, detail.town_or_city, detail.county, detail.postcode]
    .filter(Boolean)
    .join(", ");
}

function splitAddressLabel(label: string): { mainText: string; secondaryText: string } {
  const parts = label.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return { mainText: label, secondaryText: "" };
  }

  return {
    mainText: parts[0] ?? label,
    secondaryText: parts.slice(1).join(", "),
  };
}

function toGetAddressSuggestion(item: { id: string; address: string }): AddressSuggestion {
  const { mainText, secondaryText } = splitAddressLabel(item.address);

  return {
    id: `ga:${item.id}`,
    label: item.address,
    address: item.address,
    mainText,
    secondaryText,
  };
}

export async function searchGetAddress(
  apiKey: string,
  query: string,
  airportCode: string,
): Promise<AddressSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) {
    return [];
  }

  const response = await fetch(
    `https://api.getAddress.io/autocomplete/${encodeURIComponent(trimmed)}?api-key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        all: true,
        top: 6,
        show_postcode: true,
        ...(airportCode !== "DUB" ? { filter: { postcode: "BT" } } : {}),
      }),
    },
  );

  if (!response.ok) {
    // Fall back to GET for older API key formats.
    const fallbackUrl = new URL(
      `https://api.getAddress.io/autocomplete/${encodeURIComponent(trimmed)}`,
    );
    fallbackUrl.searchParams.set("api-key", apiKey);
    fallbackUrl.searchParams.set("all", "true");
    fallbackUrl.searchParams.set("top", "6");
    fallbackUrl.searchParams.set("show-postcode", "true");
    if (airportCode !== "DUB") {
      fallbackUrl.searchParams.set("filter", GETADDRESS_NI_FILTER);
    }

    const fallbackResponse = await fetch(fallbackUrl.toString());
    if (!fallbackResponse.ok) {
      return [];
    }

    const fallbackData = (await fallbackResponse.json()) as GetAddressAutocompleteResponse;
    return sortSuggestionsByStreetNumber(
      (fallbackData.suggestions ?? [])
        .filter((item) => isNorthernIrelandText(item.address))
        .map(toGetAddressSuggestion),
    ).slice(0, 6);
  }

  const data = (await response.json()) as GetAddressAutocompleteResponse;

  return sortSuggestionsByStreetNumber(
    (data.suggestions ?? [])
      .filter((item) => isNorthernIrelandText(item.address))
      .map(toGetAddressSuggestion),
  ).slice(0, 6);
}

export async function resolveGetAddress(
  apiKey: string,
  placeId: string,
  airportCode: string,
): Promise<string | null> {
  const id = placeId.startsWith("ga:") ? placeId.slice(3) : placeId;

  const response = await fetch(
    `https://api.getAddress.io/get/${encodeURIComponent(id)}?api-key=${encodeURIComponent(apiKey)}`,
  );

  if (!response.ok) {
    return null;
  }

  const detail = (await response.json()) as GetAddressDetail;
  const formatted = formatGetAddressDetail(detail);

  if (
    !formatted ||
    !isAddressAllowedForAirport(airportCode.trim().toUpperCase(), {
      postcode: detail.postcode,
      county: detail.county,
      city: detail.town_or_city,
      displayName: formatted,
    })
  ) {
    return null;
  }

  return formatted;
}

export function isGetAddressPlaceId(placeId: string): boolean {
  return placeId.startsWith("ga:");
}
