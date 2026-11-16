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

/**
 * Better search wording for venues whose plain name finds a nearby business or just the road
 * (checked against the live suggestions, 16 Nov 2026). Keyed by lower-case venue name.
 */
const VENUE_SEARCH_OVERRIDES: Record<string, string> = {
  "belfast waterfront": "Waterfront Hall, Lanyon Place, Belfast",
  "boucher road playing fields": "Boucher Road Playing Fields, Belfast BT12",
  "stormont estate": "Parliament Buildings, Stormont, Belfast",
  "belfast city hall grounds": "Belfast City Hall, Donegall Square North, Belfast",
  "titanic belfast": "Titanic Belfast, Olympic Way",
  "national football stadium at windsor park": "Windsor Park, Donegall Avenue, Belfast",
  "dublin city centre": "Spire of Dublin, O'Connell Street",
  "merrion square": "Merrion Square Park, Dublin 2",
};

async function lookup(venueName: string, venueArea: string): Promise<SelectedPlace | null> {
  const query = VENUE_SEARCH_OVERRIDES[venueName.trim().toLowerCase()] ?? `${venueName}, ${venueArea}`;
  const key = query.split(",")[0].trim().toLowerCase();
  const result = await fetchAddressPredictionsDetailed(query, "BFS");
  const predictions = result.predictions;
  if (!predictions.length) return null;
  // The suggestion named exactly as the venue, then one starting with it, then one naming all
  // of its words (so "The O2 Belfast" beats "Titanic Desserts | The O2 Belfast"); else the top one.
  const keyWords = words(key);
  const name = (p: (typeof predictions)[number]) => p.mainText.trim().toLowerCase();
  const match =
    predictions.find((p) => name(p) === key) ??
    predictions.find((p) => name(p).startsWith(key)) ??
    predictions.find((p) => keyWords.length > 0 && keyWords.every((w) => name(p).includes(w))) ??
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
