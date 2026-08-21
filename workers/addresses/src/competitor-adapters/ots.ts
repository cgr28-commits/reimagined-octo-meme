/**
 * OTS (Onward Travel Solutions) adapter — legitimate public quote form on
 * https://www.airporttaxis-uk.co.uk/
 * Respects delays/retries; never invents prices.
 */
import type { CompetitorPricingAdapter, CompetitorQuoteRequest, CompetitorQuoteResult } from "./types";

const OTS_QUOTE_URL = "https://www.airporttaxis-uk.co.uk/";
const OTS_USER_AGENT =
  "Mozilla/5.0 (compatible; MyAirportTaxiNI-PricingIntel/1.0; +https://www.myairporttaxini.co.uk)";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePriceForVehicle(html: string, vehicleHeading: string): number | null {
  const escaped = vehicleHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const section = html.match(
    new RegExp(`<h2>\\s*${escaped}\\s*<\\/h2>[\\s\\S]*?(?=<div class="group vehicle">|<\\/form>)`, "i"),
  );
  if (!section) return null;
  const oneWayMatch = section[0].match(
    /<label[^>]*class=["']single["'][\s\S]*?&pound;(\d+(?:\.\d{2})?)/i,
  );
  if (!oneWayMatch) return null;
  return Number(oneWayMatch[1]);
}

function otsHeadingForClass(vehicleClass: string): string {
  if (vehicleClass === "Minibus") return "Minibus";
  if (vehicleClass === "Estate") return "Estate Car";
  return "Saloon";
}

export const otsCompetitorAdapter: CompetitorPricingAdapter = {
  id: "ots",
  async fetchQuote(request: CompetitorQuoteRequest): Promise<CompetitorQuoteResult> {
    const fetchedAt = new Date().toISOString();
    const heading = otsHeadingForClass(request.vehicleClass);

    try {
      const body = new URLSearchParams();
      body.append("waypoints[]", request.pickupLabel);
      body.append("waypoints[]", request.dropoffLabel);
      body.append("action", "Quote Now");

      const res = await fetch(OTS_QUOTE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": OTS_USER_AGENT,
          Referer: OTS_QUOTE_URL,
        },
        body,
        redirect: "follow",
      });

      if (!res.ok) {
        return {
          competitor: "ots",
          unavailableReason: `http_${res.status}`,
          fetchedAt,
        };
      }

      const html = await res.text();
      let price = parsePriceForVehicle(html, heading);
      // Fall back to Estate one-way if exact class section missing (common calibration path).
      if (price == null && heading !== "Estate Car") {
        price = parsePriceForVehicle(html, "Estate Car");
      }
      await sleep(250);

      if (price == null || !Number.isFinite(price)) {
        return {
          competitor: "ots",
          unavailableReason: "price_not_found_in_public_quote",
          fetchedAt,
        };
      }

      return {
        competitor: "ots",
        priceGbp: price,
        vehicleClass: request.vehicleClass,
        fetchedAt,
      };
    } catch (error) {
      return {
        competitor: "ots",
        unavailableReason: error instanceof Error ? error.message : "ots_fetch_failed",
        fetchedAt,
      };
    }
  },
};
