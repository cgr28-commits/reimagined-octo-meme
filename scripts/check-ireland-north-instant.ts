import assert from "node:assert/strict";
import { PREVIEW_DUBLIN_HOTEL_PLACE as dublin, PREVIEW_BELFAST_HOTEL_PLACE as belfast } from "../src/lib/preview-customer-quote";
import { needsManualQuoteApproval, quickSelectToPlace, type SelectedPlace } from "../src/lib/selected-place";
import { calculateAuthoritativeWebsiteQuote } from "../src/lib/quote-service";
import { calculateDublinCityBeyondAirportQuote } from "../src/lib/quote";
import { ESTATE_VEHICLE, SALOON_VEHICLE } from "../src/lib/vehicle-selection";
import { getPaymentBookingBlockers } from "../shared/paid-booking-gate";
import { defaultOwnerPricingSettings } from "../shared/owner-pricing-config";
import { isM2A26ServiceCorridorDestination } from "../shared/m2-a26-service-corridor";
const northDestinations = [
  {name:"Antrim",lat:54.719,lng:-6.210,postcode:"BT41 4LH"},
  {name:"Ballymena",lat:54.865,lng:-6.276,postcode:"BT43 6AH"},
  {name:"Ballymoney",lat:55.070,lng:-6.512,postcode:"BT53 6AN"},
  {name:"Coleraine",lat:55.133,lng:-6.668,postcode:"BT52 1DP"},
];
for (const destination of northDestinations) {
  assert.ok(isM2A26ServiceCorridorDestination(destination.lat,destination.lng));
  const place: SelectedPlace={...belfast,placeName:`${destination.name} test hotel`,locality:destination.name,
    formattedAddress:`${destination.name} test hotel, ${destination.postcode}, Northern Ireland`,
    displayAddress:`${destination.name} test hotel, ${destination.postcode}, Northern Ireland`,
    lat:destination.lat,lng:destination.lng,postalCode:destination.postcode};
  assert.equal(needsManualQuoteApproval(dublin,place),false);
}
for (const [lat,lng] of [[54.997,-7.321],[55.205,-6.255],[54.175,-6.340],[54.345,-7.644],[55.195,-6.650]]) {
  assert.equal(isM2A26ServiceCorridorDestination(lat,lng),false);
  const place: SelectedPlace={...belfast,placeName:"Outside corridor hotel",formattedAddress:"Outside corridor hotel, Northern Ireland",
    displayAddress:"Outside corridor hotel, Northern Ireland",locality:"Outside corridor",route:null,postalCode:null,lat,lng};
  assert.equal(needsManualQuoteApproval(dublin,place),true);
}
for (const [pickup,dropoff] of [[dublin,belfast]]) {
  assert.equal(needsManualQuoteApproval(pickup,dropoff),false);
  for (const returnJourney of [false,true]) {
    const input = { pickupAddress:pickup.formattedAddress,dropoffAddress:dropoff.formattedAddress,
      fromAirport:false,returnJourney,passengers:4,suitcases:4,vehicleType:ESTATE_VEHICLE,
      routeMetrics:{distanceKm:175,durationMinutes:125,source:"osrm" as const},
      outboundDate:"2026-10-25",outboundTime:"07:00",returnDate:"2026-10-26",returnTime:"10:00" };
    const server = calculateAuthoritativeWebsiteQuote(input);
    assert.ok(server.ok);
    const client = calculateDublinCityBeyondAirportQuote(belfast.formattedAddress,ESTATE_VEHICLE,input.routeMetrics,returnJourney,
      {outboundDate:input.outboundDate,outboundTime:input.outboundTime,returnDate:input.returnDate,returnTime:input.returnTime});
    assert.ok(client);
    if(server.ok && client) assert.equal(server.amount,client.amount);
    assert.equal(calculateAuthoritativeWebsiteQuote({...input,routeMetrics:undefined}).ok,false);
  }
}
const cork: SelectedPlace = {...dublin,formattedAddress:"The English Market, Cork, Ireland",displayAddress:"The English Market, Cork, Ireland",placeName:"The English Market",locality:"Cork",lat:51.8973,lng:-8.4755};
const newry: SelectedPlace = {...belfast,formattedAddress:"12 Hill Street, Newry BT34 1AR, Northern Ireland",displayAddress:"12 Hill Street, Newry BT34 1AR, Northern Ireland",postalCode:"BT34 1AR",lat:54.175,lng:-6.34};
assert.equal(needsManualQuoteApproval(cork,belfast),false);
assert.equal(needsManualQuoteApproval(belfast,cork),true);
assert.equal(needsManualQuoteApproval(dublin,newry),true);
assert.equal(needsManualQuoteApproval(belfast,{...belfast,placeName:"Another Belfast Hotel"}),false);
assert.equal(needsManualQuoteApproval(dublin,{...belfast,placeName:null,streetNumber:null,formattedAddress:"Belfast",displayAddress:"Belfast",lat:null,lng:null}),true);
assert.equal(needsManualQuoteApproval(quickSelectToPlace("DUB")!,belfast),false);
assert.equal(needsManualQuoteApproval(quickSelectToPlace("BFS")!,cork),false);
const complete = { customerName:"Preview Customer",customerEmail:"preview@example.invalid",mobileNumber:"+14154103225",
  tripLabel:"Dublin city transfer",pickupLabel:dublin.formattedAddress,dropoffLabel:belfast.formattedAddress,
  tripDate:"2026-10-25",tripTime:"07:00",vehicle:ESTATE_VEHICLE,passengers:4,childSeats:0,
  termsAcceptedAt:new Date().toISOString(),isAirportTrip:false,returnJourney:false };
assert.deepEqual(getPaymentBookingBlockers(complete),[]);
assert.ok(getPaymentBookingBlockers({...complete,tripDate:"",tripTime:""}).length>0);
assert.ok(getPaymentBookingBlockers({...complete,returnJourney:true,returnDate:"",returnTime:""}).length>0);
const pricing = defaultOwnerPricingSettings(); pricing.minibus.publicEnabled=false;
assert.equal(calculateAuthoritativeWebsiteQuote({pickupAddress:dublin.formattedAddress,dropoffAddress:belfast.formattedAddress,
  returnJourney:false,passengers:7,suitcases:2,vehicleType:"7-Seater Minibus (up to 7 passengers)",maxPassengers:7,
  routeMetrics:{distanceKm:175,durationMinutes:125,source:"osrm"},pricing}).ok,false);
assert.equal(needsManualQuoteApproval(belfast,dublin),true);
console.log("PASS inbound hotel journey, 4 passengers/4 suitcases Estate, one-way/return, client/server price parity, no route/no price, manual-route boundaries, booking validation and unavailable Minibus.");

assert.equal(needsManualQuoteApproval({...dublin,countryCode:"FR"},belfast),true);
assert.equal(needsManualQuoteApproval({...belfast,administrativeArea:"Scotland",formattedAddress:"Campbeltown, Scotland",lat:55.425,lng:-5.606,postalCode:null},belfast),true);
