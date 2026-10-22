/** Isolated Google responses for pricing tests; never call an external service. */
export const CITY_HALL_TEST_ADDRESS = "Belfast City Hall, Donegall Square N, Belfast BT1 5GS, UK";
export const preciseTestPlaceId = (address: string) => `ChIJ-test-${encodeURIComponent(address)}`;
export function preciseTestGoogleResponse(url: string): Response {
  const id = decodeURIComponent(new URL(url).pathname.split("/").at(-1) || "");
  const address = id.startsWith("ChIJ-test-") ? decodeURIComponent(id.slice("ChIJ-test-".length)) : CITY_HALL_TEST_ADDRESS;
  return new Response(JSON.stringify({
    id, formattedAddress: address, displayName: { text: address.split(",")[0] },
    types: ["premise"], location: { latitude: 54.5964, longitude: -5.9302 },
    addressComponents: [
      { longText: "United Kingdom", shortText: "GB", types: ["country"] },
      { longText: "Belfast", shortText: "Belfast", types: ["postal_town"] },
    ],
    // Historical code's location-only APIs remain covered by the same mock.
    status: "OK", result: { geometry: { location: { lat: 54.5964, lng: -5.9302 } } },
    results: [{ geometry: { location: { lat: 54.5964, lng: -5.9302 } } }],
  }), { headers: { "Content-Type": "application/json" } });
}
