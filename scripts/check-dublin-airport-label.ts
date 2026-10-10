import assert from "node:assert/strict";
import { airportDisplayLabel } from "../shared/airport-display-label";
import { placeDisplayText, type SelectedPlace } from "../src/lib/selected-place";
import { buildCustomerConfirmationEmail, buildOwnerPaidBookingEmail, buildUpdatedBookingConfirmationEmail, type PaidBookingReceipt } from "../shared/booking-notifications";
const place: SelectedPlace = { placeId: "selected-airport", formattedAddress: "Dublin", lat:53.4213, lng:-6.2701, countryCode:"IE", postalCode:null };
assert.equal(placeDisplayText(place), "Dublin Airport");
assert.equal(placeDisplayText({...place, formattedAddress:"Dublin, Ireland", displayAddress:"Dublin, Ireland"}), "Dublin Airport, Ireland");
assert.equal(placeDisplayText({...place, lat:53.3498,lng:-6.2603}), "Dublin");
assert.equal(airportDisplayLabel("Terminal 2, Dublin", "DUB"), "Dublin Airport, Terminal 2, Dublin");
assert.equal(airportDisplayLabel("Dublin Airport, Terminal 1", "DUB"), "Dublin Airport, Terminal 1");
const receipt: PaidBookingReceipt = {customerName:"Test",customerEmail:"test@example.invalid",mobileNumber:"07700900123",tripLabel:"Airport transfer",pickupLabel:"Belfast City Hall",dropoffLabel:"Dublin",returnJourney:false,tripDate:"2026-12-01",tripTime:"10:00",returnDate:"",returnTime:"",flightNumber:"",passengers:2,suitcases:0,vehicle:"saloon",isAirportTrip:true,airportCode:"DUB",isFromAirport:false,amountPaid:"£100",paymentReference:"test"};
for (const from of [false,true]) {
 const input={...receipt,isFromAirport:from,pickupLabel:from?"Dublin":"Belfast City Hall",dropoffLabel:from?"Belfast City Hall":"Dublin"};
 const customer=buildCustomerConfirmationEmail(input);
 assert.match(customer.text, /(?:Pickup|Drop-off): Dublin Airport/);
 assert.match(customer.html, /Dublin Airport/);
 assert.match(buildOwnerPaidBookingEmail(input).body, /Dublin Airport/);
 assert.match(buildUpdatedBookingConfirmationEmail(input).text, /Dublin Airport/);
 assert.equal(from?input.pickupLabel:input.dropoffLabel, "Dublin");
}
const city=buildCustomerConfirmationEmail({...receipt,isAirportTrip:false,airportCode:undefined});
assert.match(city.text,/Drop-off: Dublin\n/);
console.log("PASS: airport quote labels, terminal preservation, inbound/outbound customer HTML/text and owner emails, amended confirmation, city unchanged, no stored mutation");
