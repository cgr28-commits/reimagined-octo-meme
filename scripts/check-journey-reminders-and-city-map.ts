import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { evaluateJourneyReminder, resolveJourneyReminderCustomerName } from '../shared/journey-reminder';
import { evaluateAirportPickupReminder } from '../shared/airport-pickup-reminder';
import { buildCustomerConfirmationEmail, buildUpdatedBookingConfirmationEmail, type PaidBookingReceipt } from '../shared/booking-notifications';
import { BELFAST_CITY_MAP_IMAGE_URL, belfastCityMapHtml } from '../shared/belfast-city-airport-map';
import { processDueJourneyReminders } from '../workers/addresses/src/journey-reminder-handlers';
import { paidBookingRefKey } from '../shared/paid-booking-record';

const base = { customerName: 'Sarah Johnson', customerEmail: 'sarah@example.com',
  customerReference: 'MAT-4827', pickupLabel: '12 High Street, Belfast', dropoffLabel: 'George Best Belfast City Airport',
  tripDate: '2026-10-12', tripTime: '12:00', bookingStatus: 'confirmed', passengers: 2, suitcases: 0, vehicle: 'estate' };
const due = new Date('2026-10-12T07:00:00Z'); // 08:00 London, four hours before noon.
const reminder = evaluateJourneyReminder(base, due);
assert.ok(reminder.eligible);
assert.match(reminder.text, /Hi Sarah,/);
assert.match(reminder.html, /<strong[^>]*>Hi Sarah,<\/strong>/);
assert.match(reminder.html, />Message Us<\/a>/);
assert.match(reminder.html, /background-color:#2fbf4a/);
assert.doesNotMatch(reminder.html, /028 9602 2952|tel:/);
assert.doesNotMatch(reminder.text, /028 9602 2952/);
assert.equal(resolveJourneyReminderCustomerName('  ',' Sarah   Johnson '),'Sarah Johnson');
assert.equal(resolveJourneyReminderCustomerName('undefined','sarah@example.com','Sarah Johnson'),'Sarah Johnson');
assert.equal(resolveJourneyReminderCustomerName('null','customer','guest'),'');
const whatsappHref=reminder.html.match(/href="(https:\/\/wa\.me\/[^"]+)"[^>]*>Message Us/)[1].replace(/&amp;/g,'&');
assert.equal(new URL(whatsappHref).searchParams.get('text'),'Hi, I need help with my booking MAT-4827.');
for (const name of ['  Sarah   Johnson ','Sarah']) {
 const named=evaluateJourneyReminder({...base,customerName:name},due);assert.ok(named.eligible);assert.match(named.html,/<strong[^>]*>Hi Sarah,/);
}
const safeName=evaluateJourneyReminder({...base,customerName:'<Sarah> Johnson'},due);assert.ok(safeName.eligible);assert.match(safeName.html,/Hi &lt;Sarah&gt;,/);
assert.match(reminder.text, /Booking reference: MAT-4827/);
assert.match(reminder.text, /Suitcases: 0/);
assert.match(reminder.html, /class="matni-light"/);
assert.ok(!reminder.html.includes(BELFAST_CITY_MAP_IMAGE_URL));
assert.doesNotMatch(reminder.html, /\.pdf|full-size map/);
assert.equal(evaluateJourneyReminder(base, new Date(due.getTime()-1)).eligible, false);
assert.equal(evaluateJourneyReminder(base, new Date('2026-10-12T11:00:00Z')).eligible, false);
for (const patch of [{reminderSentAt: due.toISOString()}, {bookingStatus:'cancelled'}, {operationalStatus:'cancelled'},
  {cancelledLegs:['outbound']}, {outboundCancelledAt:due.toISOString()}, {bookingStatus:'awaiting_payment'},
  {bookingStatus:'refunded'}, {journeyStatus:'completed'}, {journeyStatus:'en_route'}, {isRefundTest:true}, {customerEmail:''}, {tripTime:''}]) {
  assert.equal(evaluateJourneyReminder({...base,...patch} as any,due).eligible,false, JSON.stringify(patch));
}
assert.equal(evaluateJourneyReminder({...base,bookingStatus:'refunded_active',refundedAt:due.toISOString()},due).eligible,true);
assert.equal(evaluateJourneyReminder({...base,journeyLeg:'return',cancelledLegs:['outbound']},due).eligible,true);
assert.equal(evaluateJourneyReminder({...base,journeyLeg:'return',cancelledLegs:['return']},due).eligible,false);
const returnReminder = evaluateJourneyReminder({...base,journeyLeg:'return',pickupLabel:base.dropoffLabel,dropoffLabel:base.pickupLabel},due);
assert.ok(returnReminder.eligible);
assert.match(returnReminder.text,/return journey/);
const ordinary = evaluateJourneyReminder({...base,dropoffLabel:'Antrim town centre'},due);
assert.ok(ordinary.eligible);
assert.ok(!ordinary.html.includes(BELFAST_CITY_MAP_IMAGE_URL));
for (const [tripDate,tripTime,utcDue] of [
  ['2026-10-13','02:00','2026-10-12T21:00:00Z'], // crosses midnight, no quiet-hour shift
  ['2026-12-12','12:00','2026-12-12T08:00:00Z'], // winter GMT
  ['2026-10-25','06:00','2026-10-25T02:00:00Z'], // clock-change day
]) {
  assert.equal(evaluateJourneyReminder({...base,tripDate,tripTime},new Date(utcDue)).eligible,true);
  assert.equal(evaluateJourneyReminder({...base,tripDate,tripTime},new Date(Date.parse(utcDue)-1)).eligible,false);
}
console.log('PASS four-hour boundary, overnight/DST, all directions, return cancellation, unpaid/completed/refund/test suppression');

const receipt: PaidBookingReceipt = {...base, mobileNumber:'07700 900123',tripLabel:'Belfast to Belfast City Airport', returnJourney:true,
  returnDate:'2026-10-15',returnTime:'16:00',flightNumber:'',isAirportTrip:true,airportCode:'BHD',isFromAirport:false,
  amountPaid:'£80.00', paymentReference:'TEST-PAYMENT', outboundAirportAccessOption:'express',returnAirportAccessOption:'free'};
const booking = buildCustomerConfirmationEmail(receipt);
const updated = buildUpdatedBookingConfirmationEmail(receipt);
assert.ok(!booking.html.includes(BELFAST_CITY_MAP_IMAGE_URL));
assert.ok(!updated.html.includes(BELFAST_CITY_MAP_IMAGE_URL));
assert.equal((booking.html.match(/Belfast City Airport map<\/h2>/g)||[]).length,0);
assert.ok(!booking.html.includes('class="matni-light"')); // invoice theme preserved
for (const direction of [true,false]) {
  const email = buildCustomerConfirmationEmail({...receipt,returnJourney:false,isFromAirport:direction,
    pickupLabel:direction?base.dropoffLabel:base.pickupLabel,dropoffLabel:direction?base.pickupLabel:base.dropoffLabel});
  assert.ok(!email.html.includes(BELFAST_CITY_MAP_IMAGE_URL));
}
assert.equal(belfastCityMapHtml({pickupLabel:'Dublin Airport',dropoffLabel:'Belfast International Airport'}),'');
const collection = evaluateAirportPickupReminder({...base,pickupLabel:base.dropoffLabel,dropoffLabel:base.pickupLabel,
  isFromAirport:true,outboundAirportAccessOption:'express'},due);
assert.ok(collection.eligible);
assert.ok(collection.html.includes(BELFAST_CITY_MAP_IMAGE_URL));
assert.ok(collection.html.indexOf("WHERE TO GO") < collection.html.indexOf(BELFAST_CITY_MAP_IMAGE_URL));
assert.ok(collection.html.indexOf(BELFAST_CITY_MAP_IMAGE_URL) < collection.html.indexOf("WHEN YOU ARE READY"));
assert.equal(collection.html.split(BELFAST_CITY_MAP_IMAGE_URL).length-1,1);
assert.match(collection.text,/baggage/);
const freeCollection = evaluateAirportPickupReminder({...base,pickupLabel:base.dropoffLabel,dropoffLabel:base.pickupLabel,
  isFromAirport:true,outboundAirportAccessOption:'free'},due);
assert.ok(freeCollection.eligible);
assert.match(freeCollection.text,/Long Stay/);
assert.match(freeCollection.html,/Follow the instructions for your booked collection option/);
assert.ok(freeCollection.html.indexOf(BELFAST_CITY_MAP_IMAGE_URL) < freeCollection.html.indexOf("WHEN YOU ARE READY"));
assert.ok(!returnReminder.html.includes(BELFAST_CITY_MAP_IMAGE_URL));
const cityReturnCollection=evaluateAirportPickupReminder({...base,pickupLabel:base.dropoffLabel,dropoffLabel:base.pickupLabel,isFromAirport:true,journeyLeg:'return',returnAirportAccessOption:'express'},due);
assert.ok(cityReturnCollection.eligible);assert.ok(cityReturnCollection.html.includes(BELFAST_CITY_MAP_IMAGE_URL));
assert.ok(!reminder.text.includes('BELFAST CITY AIRPORT MAP'));
assert.ok(!booking.text.includes('BELFAST CITY AIRPORT MAP'));
console.log('PASS City map only in outbound/return collection emails; confirmations/general journey reminders excluded');

const internationalInput = {...base,pickupLabel:'Belfast International Airport',dropoffLabel:base.pickupLabel,isFromAirport:true,outboundAirportAccessOption:'express' as const};
const internationalCollection=evaluateAirportPickupReminder(internationalInput,due);
const internationalJourney=evaluateJourneyReminder(internationalInput,due);
assert.ok(internationalCollection.eligible);assert.ok(internationalJourney.eligible);
const internationalMap='/maps/belfast-international-pick-up-drop-off.jpg';
for(const email of [internationalCollection]) {
 assert.ok(email.html.includes(internationalMap));assert.doesNotMatch(email.html,/\.pdf/);
 assert.match(email.html,/Free Long Stay and Meet &amp; Greet use different meeting points/);
}
assert.match(internationalCollection.text,/maximum stay of 10 minutes/);
for(const option of ['free','meet-greet'] as const) {
 const email=evaluateAirportPickupReminder({...internationalInput,outboundAirportAccessOption:option},due);
 assert.ok(email.eligible);assert.ok(email.html.includes(internationalMap));
 if(option==='free') assert.match(email.text,/Long Stay/);
}
const internationalReturn=evaluateJourneyReminder({...internationalInput,journeyLeg:'return',returnAirportAccessOption:'express'},due);
assert.ok(internationalReturn.eligible);assert.ok(!internationalReturn.html.includes(internationalMap));
assert.ok(!internationalJourney.html.includes(internationalMap));
assert.ok(!internationalJourney.text.includes("BELFAST INTERNATIONAL AIRPORT MAP"));
const returnCollection=evaluateAirportPickupReminder({...internationalInput,journeyLeg:"return",returnAirportAccessOption:"express"},due);
assert.ok(returnCollection.eligible);assert.ok(returnCollection.html.includes(internationalMap));
for(const patch of [{pickupLabel:base.pickupLabel,dropoffLabel:'Belfast International Airport',isFromAirport:false},
 {pickupLabel:'Dublin Airport'}, {pickupLabel:base.dropoffLabel}, {pickupLabel:base.pickupLabel,pickupAirportCode:'BFS'}, {isFromAirport:false}]) {
 const email=evaluateJourneyReminder({...internationalInput,...patch},due);assert.ok(email.eligible);
 assert.ok(!email.html.includes(internationalMap));
}
console.log('PASS BFS pickup-only maps: Express/Free/Meet & Greet, outbound/return collection emails only, general journey reminders/other airports/drop-offs excluded, no PDF');

// Real handler + in-memory KV + intercepted email: no customer email or API call leaves this test.
async function deliveryChecks() {
const items = new Map<string,string>();
const kv = {async get(key:string,type?:string) {const val=items.get(key);return !val?null:type==='json'?JSON.parse(val):val;},
 async put(key:string,val:string) {items.set(key,val);},async delete(key:string) {items.delete(key);}} as any;
const current = new Date();
const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).format(current);
const job = {token:'test-outbound',createdAt:current.toISOString(),customerName:'OLD NAME',customerEmail:'old@example.com',customerMobile:'',
 pickupLabel:'Old pickup',dropoffLabel:'Old destination',tripDate:day,tripTime:'12:00',pickupAt:day+'T12:00',
 paymentReference:'TEST-PAYMENT',sharingActive:false};
items.set('track:job:'+job.token,JSON.stringify(job));items.set('track:day:'+day,JSON.stringify([job.token,job.token]));
items.set(paidBookingRefKey('TEST-PAYMENT'),JSON.stringify({...receipt,tripDate:day,status:'confirmed',tripTime:'12:00'}));
const keys:string[]=[];
const requests:any[]=[]; const originalFetch=globalThis.fetch; let fail=true;
globalThis.fetch=(async (url:any,options:any)=>{assert.equal(String(url),'https://api.resend.com/emails');requests.push(JSON.parse(options.body));keys.push(options.headers['Idempotency-Key']);
 return new Response(JSON.stringify(fail?{message:'Test failure'}:{id:'test-email-id'}),{status:fail?500:200,headers:{'Content-Type':'application/json'}});}) as any;
try {
 const now = new Date(`${day}T09:00:00Z`); // within the lead in summer and winter
 const env={TRACKING_STORE:kv,RESEND_API_KEY:'test-only',BOOKING_FROM_EMAIL:'bookings@example.com'};
 let result=await processDueJourneyReminders(env,now); assert.equal(result.errors,1); assert.equal(result.sent,0);
 assert.ok(!JSON.parse(items.get('track:job:'+job.token)!).journeyReminderSentAt);
 fail=false; result=await processDueJourneyReminders(env,now);assert.equal(result.sent,1);
 assert.match(requests.at(-1).text,/Pickup: 12 High Street/);assert.match(requests.at(-1).text,/Hi Sarah,/);
 assert.ok(JSON.stringify(requests.at(-1).to).includes('sarah@example.com'));
 result=await processDueJourneyReminders(env,now);assert.equal(result.sent,0);assert.equal(requests.length,2);
 assert.ok(keys[0].startsWith('journey-reminder-test-outbound-'));assert.equal(keys[0],keys[1]);
 // Blank or placeholder payment name falls back to the stored tracking name.
 const fallback={...job,token:'name-fallback',customerName:'Sarah Johnson'};
 items.set('track:job:'+fallback.token,JSON.stringify(fallback));items.set('track:day:'+day,JSON.stringify([fallback.token]));
 items.set(paidBookingRefKey('TEST-PAYMENT'),JSON.stringify({...receipt,tripDate:day,status:'confirmed',customerName:'   '}));
 result=await processDueJourneyReminders(env,now);assert.equal(result.sent,1);
 assert.match(requests.at(-1).text,/^Hi Sarah,/);assert.match(requests.at(-1).html,/>Message Us<\/a>/);
 // Return uses current paid return date/time and reverses addresses independently.
 const ret={...job,token:'test-return',journeyLeg:'return'};
 items.set('track:job:'+ret.token,JSON.stringify(ret));items.set('track:day:'+day,JSON.stringify([job.token,ret.token]));
 items.set(paidBookingRefKey('TEST-PAYMENT'),JSON.stringify({...receipt,tripDate:day,returnDate:day,returnTime:'12:00',status:'confirmed'}));
 result=await processDueJourneyReminders(env,now);assert.equal(result.sent,1);
 assert.match(requests.at(-1).text,/Pickup: George Best Belfast City Airport/);
 assert.match(requests.at(-1).text,/Drop-off: 12 High Street/);
 assert.match(requests.at(-1).subject,/Return journey reminder/);
 assert.notEqual(keys.at(-1),keys[0]);
 const unneededReturn={...ret,token:'removed-return'};items.set('track:job:'+unneededReturn.token,JSON.stringify(unneededReturn));
 items.set('track:day:'+day,JSON.stringify([unneededReturn.token]));
 items.set(paidBookingRefKey('TEST-PAYMENT'),JSON.stringify({...receipt,tripDate:day,returnDate:day,status:'confirmed',returnJourney:false}));
 result=await processDueJourneyReminders(env,now);assert.equal(result.sent,0);
} finally {globalThis.fetch=originalFetch;}
console.log('PASS real delivery handler: updated recipient/details, failure retry, persistent dedupe, independent return leg');
}
deliveryChecks().catch(error => {console.error(error);process.exitCode=1;});
const cron=readFileSync('workers/addresses/src/index.ts','utf8');
assert.ok(cron.indexOf('processDueJourneyReminders(env,')<cron.indexOf('if (!shouldRunHourlyScheduledJobs(cron)) return;'));
mkdirSync('test-results/city-airport-emails',{recursive:true});
for(const [name,email] of Object.entries({'international-collection':internationalCollection,'international-journey-reminder':internationalJourney,'international-return-journey-reminder':internationalReturn,'city-booking':booking,'city-collection':collection,'journey-reminder':reminder,'return-journey-reminder':returnReminder,'ordinary-journey-reminder':ordinary})) {
 writeFileSync(`test-results/city-airport-emails/${name}.html`,email.html);
 writeFileSync(`test-results/city-airport-emails/${name}.txt`,email.text);
}
console.log('PASS email previews generated from the actual builders');
