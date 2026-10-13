import assert from "node:assert/strict";
import { needsManualQuoteApproval, type SelectedPlace } from "../src/lib/selected-place";
import { defaultOwnerPricingSettings } from "../shared/owner-pricing-config";
import { approvedProductionProfitabilitySettings } from "../src/lib/owner-profitability-settings";
import { ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import { applyProfitabilityProtection, profitabilityFloorFromOperations, roundUpWholePoundGbp } from "../workers/addresses/src/profitability";
import { OPERATING_BASE } from "../workers/addresses/src/operating-base";
import { universalDrivingMilesFromKm } from "../shared/universal-distance-pricing";

function place(id: string, address: string, lat: number, lng: number, countryCode: string): SelectedPlace {
  return { placeId: id, formattedAddress: address, displayAddress: address, placeName: address.split(",")[0], lat, lng, countryCode, postalCode: null, streetNumber: null, route: null, locality: null, administrativeArea: null };
}
const dublin = place("citizenm", "citizenM Dublin St. Patrick's, 67-69 Bride St, Dublin D08 C8CN, Ireland", 53.339, -6.272, "IE");
const belfast = place("europa", "Europa Hotel, Great Victoria St, Belfast BT2 7AP, UK", 54.5946, -5.9358, "GB");
assert.equal(needsManualQuoteApproval(dublin, belfast), false);
assert.equal(needsManualQuoteApproval(belfast, dublin), false);
assert.equal(needsManualQuoteApproval(dublin, { ...belfast, lat: null, lng: null }), true);

async function main() {
  const originalFetch = globalThis.fetch;
  const legs: string[] = [];
  // Deliberately high positioning cost makes the operational floor dominate the curve.
  globalThis.fetch = async (input) => {
    legs.push(String(input));
    return Response.json({ code: "Ok", routes: [{ distance: 300000, duration: 18000 }] });
  };
  try {
    const settings = approvedProductionProfitabilitySettings();
    const pricing = { ...defaultOwnerPricingSettings(), profitability: settings };
    const passenger = { distanceKm: 175, durationMinutes: 125 };
    const floor = profitabilityFloorFromOperations({ operationalMiles: universalDrivingMilesFromKm(775), operationalMinutes: 725, settings });
    assert.ok(floor);
    for (const [pickup, dropoff] of [[dublin, belfast], [belfast, dublin]]) {
      for (const returnJourney of [false, true]) {
        const result = await applyProfitabilityProtection({
          pricing, vehicleType: ESTATE_VEHICLE, pickup: { lat: pickup.lat!, lng: pickup.lng! },
          dropoff: { lat: dropoff.lat!, lng: dropoff.lng! }, routeMetrics: passenger, returnJourney,
          schedule: { outboundDate: "2026-11-10", outboundTime: "12:00", returnJourney, returnDate: "2026-11-12", returnTime: "12:00" },
          existing: { amountGbp: 245, journeyFareGbp: 245, airportFixedCostsGbp: 0, nightWeekendSurchargeGbp: 0 },
        });
        assert.equal(result.applied, true);
        assert.equal(result.fallbackReason, null);
        const oneWay = roundUpWholePoundGbp(floor.floorGbp) + pricing.estate.upliftGbp;
        assert.ok(result.amountGbp >= (returnJourney ? oneWay * 2 * (1 - pricing.returnDiscount.rate) - 1 : oneWay), "Positioning and getting home must be included before vehicle uplift/return discount");
      }
    }
    const home = `${OPERATING_BASE.lng},${OPERATING_BASE.lat}`;
    assert.ok(legs.some(url => url.includes(`${home};${dublin.lng},${dublin.lat}`)));
    assert.ok(legs.some(url => url.includes(`${belfast.lng},${belfast.lat};${home}`)));
    assert.ok(legs.some(url => url.includes(`${home};${belfast.lng},${belfast.lat}`)));
    assert.ok(legs.some(url => url.includes(`${dublin.lng},${dublin.lat};${home}`)));
    console.log("Dublin hotel ↔ Belfast hotel eligibility and home-positioning profitability checks passed (one-way and return).");
  } finally { globalThis.fetch = originalFetch; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
