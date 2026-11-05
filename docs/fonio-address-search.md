# Fonio Google address search

## Feasibility (existing Maps stack)

**Yes — our existing Google Places integration supports this without a new Google API product.**

| Existing piece | Reuse |
|----------------|--------|
| Server key `GOOGLE_PLACES_API_KEY` (Worker secret) | Same key as website `/addresses` |
| `searchGoogleAddressSuggestions` | Autocomplete + establishment/street fallbacks |
| `resolveGooglePlaceDetails` | Place ID → formatted address + lat/lng |
| Served airport catalogue (BFS/BHD/DUB/LDY) | Reliable airport match without Places |
| Address validation / service-area filters | Same NI–ROI gates as the website |
| Pricing | Unchanged — `/voice/quote` → `createPricedQuickQuote` |

Gaps closed by this work: new `POST /voice/address-search` (Fonio auth), confirm/clarify speech helpers, Get Quote accepts `pickupPlaceId` / `dropoffPlaceId`.

## Behaviour

1. Fonio sends conversational `query` (e.g. “Hilton in Belfast”).
2. Worker searches catalogue + Google (server-side only).
3. One confident match → `status=confirm` + brief `say`.
4. Several matches → `status=clarify` + one question.
5. Caller confirms → call with `placeId` → `status=confirmed` + coords.
6. Get Quote receives `placeId` + formatted address; never invents fares/distances.

Failures (quota / no key / no match): ask postcode or Leave Message — never invent a place.

## Deploy gate

Not deployed. Requires approved Worker deploy + Fonio tool paste (`docs/fonio-tool-config.md` § Address Search) before live calls use it.
