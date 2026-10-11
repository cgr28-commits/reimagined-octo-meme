import { matchServedAirportCode } from "./served-airports";

const ORIGIN = "https://www.myairporttaxini.co.uk";
export const BELFAST_CITY_MAP_PDF_URL = `${ORIGIN}/maps/belfast-city-express-pick-up-drop-off.pdf`;
export const BELFAST_CITY_MAP_IMAGE_URL = `${ORIGIN}/maps/belfast-city-express-pick-up-drop-off.jpg`;

type AirportMapJourney = {
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  pickupAirportCode?: string | null;
  dropoffAirportCode?: string | null;
  airportCode?: string | null;
};

export function includesBelfastCityAirport(journey: AirportMapJourney): boolean {
  const labelAirports = [matchServedAirportCode(journey.pickupLabel ?? ""),
    matchServedAirportCode(journey.dropoffLabel ?? "")].filter(Boolean);
  // Recognised labels take precedence over stale airport metadata after an amendment.
  if (labelAirports.length) return labelAirports.includes("BHD");
  return [journey.pickupAirportCode, journey.dropoffAirportCode, journey.airportCode]
    .some(code => code?.toUpperCase() === "BHD");
}

export function belfastCityMapText(journey: AirportMapJourney): string {
  return includesBelfastCityAirport(journey)
    ? `\n\nBELFAST CITY AIRPORT MAP\nExpress Pick-Up & Drop-Off area and car parks. Follow the instructions for your booked collection option.\nView the full-size map (PDF): ${BELFAST_CITY_MAP_PDF_URL}\n`
    : "";
}

export function belfastCityMapHtml(journey: AirportMapJourney): string {
  if (!includesBelfastCityAirport(journey)) return "";
  return `<div style="margin:20px 0;background:#ffffff;color:#071c38;">
<h2 style="font-size:18px;line-height:1.4;color:#071c38;">Belfast City Airport map</h2>
<p style="font-size:14px;line-height:1.6;color:#071c38;">Express Pick-Up &amp; Drop-Off area and car parks. Follow the instructions for your booked collection option.</p>
<a href="${BELFAST_CITY_MAP_PDF_URL}" style="color:#071c38;"><img src="${BELFAST_CITY_MAP_IMAGE_URL}" alt="Belfast City Airport Express Pick-Up and Drop-Off area and car parks" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0;" /></a>
<p style="font-size:14px;line-height:1.6;"><a href="${BELFAST_CITY_MAP_PDF_URL}" style="color:#071c38;font-weight:bold;">View the full-size map (PDF)</a></p>
</div>`;
}
