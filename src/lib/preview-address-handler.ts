import { extractNorthernIrelandPostcode, isPureFullNorthernIrelandPostcodeQuery } from "../../shared/address-validation";
import { geocodeAddress, resolveGooglePlaceDetails, reverseGeocodeGoogle, searchGoogleAddressSuggestions } from "../../shared/google-places";
import { servedAirportFromPlaceId } from "../../shared/served-airports";

/** Read-only adapter for the draft preview; shares the Worker's strict Google place resolver. */
export async function handlePreviewAddressRequest(request: Request, apiKey?: string): Promise<Response> {
  const json = (value: unknown, status = 200) => Response.json(value, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  const url = new URL(request.url);
  const id = url.searchParams.get("id")?.trim();
  const query = url.searchParams.get("q")?.trim() ?? "";
  const airport = url.searchParams.get("airport")?.trim().toUpperCase() || "A2A";
  if ((id?.length ?? 0) > 256 || query.length > 256 ||
      (url.searchParams.get("forwardGeocode")?.length ?? 0) > 256) {
    return json({ error: "Invalid address request" }, 400);
  }
  if (!["A2A", "BFS", "BHD", "DUB", "LDY"].includes(airport)) return json({ error: "Invalid airport" }, 400);
  if (id) {
    const served = servedAirportFromPlaceId(id);
    if (served) return json({ ...served, address: served.formattedAddress, displayAddress: served.formattedAddress,
      placeName: served.name, provider: "served-airport" });
  }
  if (!apiKey?.trim()) return json({ error: "Preview address lookup is not configured", unavailable: true }, 503);
  try {
    if (id) {
      const details = await resolveGooglePlaceDetails(apiKey, id, airport);
      return details ? json({ ...details, address: details.displayAddress })
        : json({ error: "Please choose a full address, hotel or individual building from the suggestions." }, 422);
    }
    if (url.searchParams.has("lat") || url.searchParams.has("lon")) {
      if (!url.searchParams.has("lat") || !url.searchParams.has("lon")) return json({ error: "Invalid coordinates" }, 400);
      const lat = Number(url.searchParams.get("lat")), lon = Number(url.searchParams.get("lon"));
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
        return json({ error: "Invalid coordinates" }, 400);
      const address = await reverseGeocodeGoogle(apiKey, lat, lon, airport);
      return address ? json({ address }) : json({ error: "Address not found" }, 404);
    }
    const forward = url.searchParams.get("forwardGeocode")?.trim();
    if (forward) {
      const result = await geocodeAddress(apiKey, forward);
      return result ? json(result) : json({ error: "Address not found" }, 404);
    }
    if (query.length < 3) return json({ suggestions: [] });
    if (isPureFullNorthernIrelandPostcodeQuery(query)) return json({ suggestions: [], needsHouseNumber: true,
      postcode: extractNorthernIrelandPostcode(query), hint: "Enter your house number or building name to find your exact address." });
    return json({ suggestions: await searchGoogleAddressSuggestions(apiKey, query, airport), provider: "google", unavailable: false });
  } catch {
    return json({ error: "Address lookup is temporarily unavailable", unavailable: true }, 502);
  }
}
