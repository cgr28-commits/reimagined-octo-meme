/** Offline confirmation regression and reproducible public example. No email is sent. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { buildCustomerConfirmationEmail, buildUpdatedBookingConfirmationEmail, type PaidBookingReceipt } from '../shared/booking-notifications';
const receipt: PaidBookingReceipt = {
 customerName:'Alex Example',customerEmail:'alex@example.invalid',mobileNumber:'07700900123',
 tripLabel:'Belfast → Belfast City Airport',pickupLabel:'Belfast City Hall, Belfast BT1 5GS',dropoffLabel:'George Best Belfast City Airport (BHD)',
 returnJourney:false,tripDate:'2026-11-01',tripTime:'10:00',returnDate:'',returnTime:'',flightNumber:'EZY123',
 passengers:2,suitcases:2,vehicle:'Saloon',isAirportTrip:true,airportCode:'BHD',amountPaid:'£40.00',
 paymentReference:'EXAMPLE-PAYMENT',checkoutReference:'example-checkout',customerReference:'MAT-1001',
};
const options={manageUrl:'https://www.myairporttaxini.co.uk/manage-booking/?id=example-only'};
const email=buildCustomerConfirmationEmail(receipt,'My Airport Taxi NI',options);
const updated=buildUpdatedBookingConfirmationEmail(receipt,'My Airport Taxi NI',{...options,whatChanged:['Pickup time is now 10:00'],fareNote:'No change to your fare'});
for (const result of [email,updated]) {
 assert.match(result.subject,/MAT-1001/);
 assert.match(result.html,/Booking reference<\/span><br \/><span[^>]*>MAT-1001/);
 assert.match(result.html,/<strong[^>]*>Booking reference:<\/strong> MAT-1001/);
 assert.match(result.text,/Booking reference: MAT-1001/);
 assert.match(result.text,/^Dear Alex,/);
 assert.doesNotMatch(result.text,/Dear Alex Example/);
 assert.match(result.html,/Manage Your Booking/); assert.match(result.html,/Save My Airport Taxi NI to Contacts/);
 assert.match(result.html,/Cancellation policy/); assert.match(result.html,/£40\.00/);
 assert.match(result.html,/Belfast City Hall/); assert.match(result.html,/Belfast City Airport/);
 assert.match(result.html,/alex@example\.invalid/); // retain full booking/contact detail
 assert.match(result.html,/Alex Example/); // stored full name stays in booking details
 assert.equal(result.html.match(/logo\.png/g)?.length,1);
}
assert.match(email.html,/Thank you, Alex<\/div>/);
assert.match(updated.html,/Your booking has been updated, Alex<\/div>/);
assert.match(buildCustomerConfirmationEmail({...receipt,customerName:'  Alex   Example '}).html,/Thank you, Alex<\/div>/);
assert.match(buildCustomerConfirmationEmail({...receipt,customerName:''}).text,/^Dear there,/);
assert.match(buildCustomerConfirmationEmail({...receipt,customerName:'<Alex> Example'}).html,/Thank you, &lt;Alex&gt;<\/div>/);
// Use the same production builder, with clearly fictional details and inert example token.
if (process.argv.includes('--write')) writeFileSync('public/invoice-example.html',email.html+'\n');
assert.equal(readFileSync('public/invoice-example.html','utf8'),email.html+'\n','Regenerate the example using this script --write');
console.log('PASS first-name greetings, reference in subject/header/body, complete details, manage/contact/cancellation blocks, logo and production-generated preview');
