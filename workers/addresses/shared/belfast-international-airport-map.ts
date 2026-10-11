import { matchServedAirportCode } from "./served-airports";

export const BELFAST_INTERNATIONAL_MAP_IMAGE_URL = "https://www.myairporttaxini.co.uk/maps/belfast-international-pick-up-drop-off.jpg";
type CollectionJourney = { pickupLabel?: string | null; isFromAirport?: boolean | null };
export function isBelfastInternationalCollection(journey: CollectionJourney): boolean {
  return journey.isFromAirport !== false && matchServedAirportCode(journey.pickupLabel ?? "") === "BFS";
}
export function belfastInternationalMapText(journey: CollectionJourney): string {
  return isBelfastInternationalCollection(journey)
    ? "\n\nBELFAST INTERNATIONAL AIRPORT MAP\nThe map shows the Express Pick-Up & Drop-Off Zone opposite the terminal. Follow the instructions for your booked collection option; Free Long Stay and Meet & Greet use different meeting points. The map is included in the HTML version of this email.\n"
    : "";
}
export function belfastInternationalMapHtml(journey: CollectionJourney): string {
  if (!isBelfastInternationalCollection(journey)) return "";
  return `<div style="margin:20px 0;background:#ffffff;color:#071c38;">
<h2 style="font-size:18px;line-height:1.4;color:#071c38;">Belfast International Airport collection map</h2>
<p style="font-size:14px;line-height:1.6;color:#071c38;">The map shows the Express Pick-Up &amp; Drop-Off Zone opposite the terminal. Follow the instructions for your booked collection option; Free Long Stay and Meet &amp; Greet use different meeting points.</p>
<img src="${BELFAST_INTERNATIONAL_MAP_IMAGE_URL}" alt="Belfast International Airport map showing the Express Pick-Up and Drop-Off Zone opposite the terminal" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;background:#ffffff;" />
</div>`;
}
