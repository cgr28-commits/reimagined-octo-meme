/**
 * Events page: turn an event's venue into a picked Google place for the quote tool.
 * Uses the same suggestions + place-details lookups as a customer typing the venue and
 * tapping the top match, so the drop-off counts as a confirmed (picked) address.
 */
import { fetchAddressPredictionsDetailed, fetchSelectedPlaceDetails } from "@/lib/google-maps";
import { isQuoteReadyPlace, type SelectedPlace } from "@/lib/selected-place";

const cache = new Map<string, Promise<SelectedPlace | null>>();

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["the", "and", "belfast", "dublin"].includes(w));
}

async function lookup(venueName: string, venueArea: string): Promise<SelectedPlace | null> {
  const query = `${venueName}, ${venueArea}`;
  const result = await fetchAddressPredictionsDetailed(query, "BFS");
  const predictions = result.predictions;
  if (!predictions.length) return null;
  // Prefer the suggestion that names the venue; otherwise the top suggestion.
  const nameWords = words(venueName);
  const match =
    predictions.find((p) => {
      const text = `${p.mainText} ${p.description}`.toLowerCase();
      return nameWords.length > 0 && nameWords.every((w) => text.includes(w));
    }) ??
    predictions.find((p) => {
      const text = `${p.mainText} ${p.description}`.toLowerCase();
      return nameWords.some((w) => text.includes(w));
    }) ??
    predictions[0];
  const place = await fetchSelectedPlaceDetails(match.placeId, "BFS", query, match.mainText);
  return place && isQuoteReadyPlace(place) ? place : null;
}

export function resolveEventVenuePlace(venueName: string, venueArea: string): Promise<SelectedPlace | null> {
  const key = `${venueName}|${venueArea}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = lookup(venueName, venueArea).catch(() => null);
    cache.set(key, pending);
    // A failed lookup can be retried on the next tap.
    void pending.then((place) => {
      if (!place) cache.delete(key);
    });
  }
  return pending;
}
