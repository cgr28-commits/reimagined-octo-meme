import assert from 'node:assert/strict';
import { needsManualQuoteApproval, isGreaterBelfastIrelandInstantJourney, type SelectedPlace } from '../src/lib/selected-place';
import { PREVIEW_BELFAST_CITY_HALL_PLACE as belfast } from '../src/lib/preview-customer-quote';
import { calculateWebsiteOneWayFare } from '../src/lib/website-fare';
import { calculatePointToPointQuote } from '../src/lib/quote';
import { SALOON_VEHICLE, ESTATE_VEHICLE } from '../src/lib/vehicle-selection';
const destinations = [
  ['Cork',51.8985,-8.4756,'IE'], ['Galway',53.2707,-9.0568,'IE'],
  ['Limerick',52.6638,-8.6267,'IE'], ['Waterford',52.2593,-7.1101,'IE'],
  ['Letterkenny',54.95,-7.737,'IE'], ['Sligo',54.2766,-8.4761,'IE'],
  ['Derry',54.997,-7.321,'GB'], ['Enniskillen',54.3438,-7.631,'GB'],
  ['Ballycastle',55.205,-6.242,'GB'],
] as const;
function place(name: string, lat: number, lng: number, countryCode: string): SelectedPlace {
  return { ...belfast, placeId:`test-${name}`, placeName:`Test building in ${name}`,
    formattedAddress:`1 Test Street, ${name}, ${countryCode === 'IE' ? 'Ireland' : 'Northern Ireland'}`,
    displayAddress:null, postalCode:null, locality:name, administrativeArea:null,lat,lng,countryCode };
}
for (const [name,lat,lng,country] of destinations) {
  const destination=place(name,lat,lng,country);
  assert.equal(isGreaterBelfastIrelandInstantJourney(belfast,destination),true,name);
  assert.equal(needsManualQuoteApproval(belfast,destination),false,name);
  assert.equal(needsManualQuoteApproval(destination,belfast),true,`standalone ${name} pickup unchanged`);
  assert.equal(isGreaterBelfastIrelandInstantJourney({...belfast,placeId:''},destination),false);
  assert.equal(isGreaterBelfastIrelandInstantJourney(belfast,{...destination,lat:null,lng:null}),false);
  for (const vehicleType of [SALOON_VEHICLE,ESTATE_VEHICLE]) {
    const input={pickupAddress:belfast.formattedAddress,dropoffAddress:destination.formattedAddress,
      pickupPlace:belfast,dropoffPlace:destination,vehicleType,routeMetrics:{distanceKm:420,durationMinutes:300,source:'osrm' as const}};
    const fare=calculateWebsiteOneWayFare(input);
    assert.ok(fare && fare.amount>0);
    const existing=calculatePointToPointQuote(input.pickupAddress,input.dropoffAddress,vehicleType,false,{},input.routeMetrics,null);
    assert.equal(fare.amount,existing?.amount,'existing road-based pricing preserved');
    assert.equal(calculateWebsiteOneWayFare({...input,routeMetrics:null}),null);
    const returning=calculatePointToPointQuote(input.pickupAddress,input.dropoffAddress,vehicleType,true,{},input.routeMetrics,null);
    assert.ok(returning && returning.amount>fare.amount);
  }
}
assert.equal(isGreaterBelfastIrelandInstantJourney(belfast,place('Glasgow',55.864,-4.252,'GB')),false);
assert.equal(isGreaterBelfastIrelandInstantJourney(belfast,place('Foreign',53,-8,'FR')),false);
const newry=place('Newry',54.175,-6.34,'GB');
assert.equal(needsManualQuoteApproval(newry,place('Cork',51.8985,-8.4756,'IE')),true);
console.log('All-Ireland outbound eligibility, invalid/foreign/outside-area guards, fare parity, missing routes and return fares passed.');
