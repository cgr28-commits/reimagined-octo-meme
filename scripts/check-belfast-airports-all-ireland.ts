import assert from "node:assert/strict";
import { IRELAND_PREVIEW_DESTINATIONS } from "../src/lib/preview-customer-quote";
import { quickSelectToPlace, needsManualQuoteApproval, type SelectedPlace } from "../src/lib/selected-place";
import { destinationEligibleForStandardAirportPickup } from "../shared/airport-pickup-service-area";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
let cases = 0;
for (const airportCode of ["BFS", "BHD"] as const) {
  const pickup = quickSelectToPlace(airportCode)!;
  for (const [key, point] of Object.entries(IRELAND_PREVIEW_DESTINATIONS)) {
    const dropoff: SelectedPlace = { placeId: `test-${key}`, formattedAddress: point.label, displayAddress: point.label,
      placeName: point.label.split(",")[0], lat: point.lat, lng: point.lng, countryCode: point.country,
      postalCode: null, streetNumber: null, route: null, locality: key, administrativeArea: point.country === "GB" ? "Northern Ireland" : "Ireland" };
    assert.equal(needsManualQuoteApproval(pickup, dropoff), false, `${airportCode}/${key}: frontend eligibility`);
    assert.ok(destinationEligibleForStandardAirportPickup({airportCode,addressText:point.label,lat:point.lat,lng:point.lng}));
    for (const returnJourney of [false,true]) {
      for (const vehicleType of [SALOON_VEHICLE,ESTATE_VEHICLE]) {
        const result = calculateAuthoritativeWebsiteQuote({airportCode,fromAirport:true,pickupAddress:pickup.formattedAddress,
          dropoffAddress:point.label,returnJourney,passengers:2,suitcases:2,vehicleType,
          routeMetrics:{distanceKm:200,durationMinutes:150,source:"osrm"},
          destinationLat:point.lat,destinationLng:point.lng});
        assert.ok(result.ok, `${airportCode}/${key}/${vehicleType}/${returnJourney}: public server engine`);
        if (result.ok) assert.ok(Number.isFinite(result.amount) && result.amount>0);
        cases++;
      }
    }
  }
}
const missingRoute = calculateAuthoritativeWebsiteQuote({airportCode:"BFS",fromAirport:true,pickupAddress:"Belfast International Airport",
  dropoffAddress:"Cork, Ireland",returnJourney:false,passengers:2,suitcases:2,vehicleType:SALOON_VEHICLE});
assert.equal(missingRoute.ok,false);
console.log(`PASS ${cases} Belfast airport/all-Ireland quote cases: both airports, ten destinations, Saloon/Estate, one-way/return. Missing route never invents a price.`);
