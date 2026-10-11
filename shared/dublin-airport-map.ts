import { matchServedAirportCode } from "./served-airports";

// Official Dublin Airport car-park map, kept unaltered.
// Source: https://www.dublinairport.com/car-parks/short-term-parking
export const DUBLIN_AIRPORT_MAP_IMAGE_URL = "https://www.myairporttaxini.co.uk/maps/dublin-airport-car-parks.jpg";
type CollectionJourney = { pickupLabel?: string | null; isFromAirport?: boolean | null };
export function isDublinAirportCollection(journey: CollectionJourney): boolean {
  return journey.isFromAirport !== false && matchServedAirportCode(journey.pickupLabel ?? "") === "DUB";
}
export function dublinAirportMapText(journey: CollectionJourney): string {
  return isDublinAirportCollection(journey)
    ? "\n\nDUBLIN AIRPORT COLLECTION MAP\nThe map shows Terminal 1, Terminal 2 and the airport car parks. Follow your collection instructions and the meeting point confirmed by your driver. The map is included in the HTML version of this email.\n"
    : "";
}
export function dublinAirportMapHtml(journey: CollectionJourney): string {
  if (!isDublinAirportCollection(journey)) return "";
  return `<div style="margin:20px 0;background:#ffffff;color:#071c38;">
<h2 style="font-size:18px;line-height:1.4;color:#071c38;">Dublin Airport T1 &amp; T2 collection map</h2>
<p style="font-size:14px;line-height:1.6;color:#071c38;">The map shows Terminal 1, Terminal 2 and the airport car parks. Follow your collection instructions and the meeting point confirmed by your driver.</p>
<img src="${DUBLIN_AIRPORT_MAP_IMAGE_URL}" alt="Dublin Airport map showing Terminal 1, Terminal 2 and the short-term car parks" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;background:#ffffff;" />
<p style="font-size:12px;line-height:1.6;color:#071c38;">Map: Dublin Airport.</p>
</div>`;
}
