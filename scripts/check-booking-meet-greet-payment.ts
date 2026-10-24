/** Reviewed route fixtures and real quote/payment/final-booking handlers; no live writes. */
import assert from "node:assert/strict";
// Synthetic route fixtures exercise short and long fares without changing airport pins.
const reviewed = { placeId: "test-home", address: "12 Holywood Road, Belfast BT4 1NT, UK", lat: 54.6063, lng: -5.8711,
  routes: ["BFS", "BHD", "DUB"].flatMap(airport => ["pickup", "dropoff"].map(direction => ({ airport, direction, distanceMetres: airport === "DUB" ? 160000 : 32000, durationSeconds: 1800 }))) };
import { buildDriverAssignmentEmail, type BookingJobRecord } from "../shared/booking-job";
import { calculateDepositCashQuote } from "../shared/deposit-cash";
import { defaultOwnerPricingSettings, validateOwnerPricingInput, toPublicOwnerPricingConfig } from "../shared/owner-pricing-config";
import { SERVED_AIRPORTS } from "../shared/served-airports";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import { createPaymentCheckout } from "../src/lib/create-payment";
import { calculateServerQuote } from "../src/lib/quick-quote-api";
import { handleQuoteCalculateRequest } from "../workers/addresses/src/quote-handlers";
import { enrichDriverJob } from "../workers/addresses/src/driver-booking-handlers";
import type { TrackingJobRecord } from "../shared/tracking";
import worker from "../workers/addresses/src/index";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { resolveExpressDropOff } from "../shared/express-drop-off";
import { quoteAirportAccessCharges, quoteOptionalMeetGreet } from "../shared/meet-greet";
import { getPendingCheckout } from "../workers/addresses/src/pending-checkout-store";
import { finalizePaidCheckout } from "../workers/addresses/src/finalize-paid-checkout";
import type { SumUpCheckoutDetails } from "../shared/sumup-checkout";
import { getPaidBookingRecord } from "../workers/addresses/src/paid-booking-store";
import { approvedProductionProfitabilitySettings } from "../src/lib/owner-profitability-settings";

async function main() {
  const originalFetch=globalThis.fetch, originalNow=Date.now;
  let now=Date.parse("2026-10-22T12:00:00Z"); Date.now=()=>now;
  const origin="https://www.myairporttaxini.co.uk";
  const store=new Map<string,string>();
  const kv={async get(key:string,type?:string){const v=store.get(key);return v==null?null:type==="json"?JSON.parse(v):v;},async put(key:string,value:string){store.set(key,value);},async delete(key:string){store.delete(key);},async list(){return {keys:[],list_complete:true};}} as unknown as KVNamespace;
  const env={TRACKING_STORE:kv,GOOGLE_PLACES_API_KEY:"mock-google",SUMUP_API_KEY:"mock-sumup",SUMUP_MERCHANT_CODE:"mock-merchant",QUOTE_RECEIPT_SECRET:"isolated-receipt-secret",PUBLIC_SITE_ORIGIN:origin,RESEND_API_KEY:"mock-email",BOOKING_TO_EMAIL:"owner@example.invalid",BOOKING_FROM_EMAIL:"bookings@example.invalid"};
  let distanceScaleForRoute=1;
  let routeCalls=0, checkoutAmount=0, checkouts=0, checks=0;
  const paidCheckouts = new Map<string, SumUpCheckoutDetails>();
  const emails: { to: string | string[]; text: string; html?: string }[] = [];

  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init);const url=new URL(request.url);
    if(url.pathname==="/payments") {
      const payload = await request.clone().json() as { quoteReceipt?: string };
      assert.equal(Boolean(payload.quoteReceipt), Boolean(env.QUOTE_RECEIPT_SECRET), "Payment adapter forwards the current signed receipt");
      return worker.fetch(new Request(request, { headers: { ...Object.fromEntries(request.headers), Origin: origin } }), env as never);
    }
    if(url.pathname==="/quote/calculate")return handleQuoteCalculateRequest(request,origin,env);
    if(url.hostname==="places.googleapis.com")return Response.json({id:reviewed.placeId,formattedAddress:reviewed.address,displayName:{text:"152-154 Holywood Road"},types:["street_address"],location:{latitude:reviewed.lat,longitude:reviewed.lng},addressComponents:[{longText:"152-154",types:["street_number"]},{longText:"Holywood Road",types:["route"]},{longText:"BT4 1NY",types:["postal_code"]},{longText:"United Kingdom",shortText:"GB",types:["country"]}]});
    if(url.pathname.includes("/route/v1/driving/")){
      routeCalls++;const coords=decodeURIComponent(url.pathname).split("/driving/")[1]!;
      const home=`${reviewed.lng},${reviewed.lat}`;
      const airport=SERVED_AIRPORTS.find(a=>coords.includes(`${a.lng},${a.lat}`));
      assert.ok(airport,`Unexpected positioning or unknown airport route: ${coords}`);
      assert.ok(coords.includes(home),"Only passenger mileage may be routed during quoting/checkout");
      const direction=coords.startsWith(home)?"dropoff":"pickup";
      const route=reviewed.routes.find(r=>r.airport===airport.code&&r.direction===direction)!;
      return Response.json({code:"Ok",routes:[{distance:route.distanceMetres * distanceScaleForRoute,duration:route.durationSeconds}]});
    }
    if(url.hostname==="api.sumup.com"&&request.method==="POST"){
      const body=await request.json() as {amount:number;checkout_reference:string};checkoutAmount=body.amount;checkouts++;
      const id = `isolated-${checkouts}`;
      paidCheckouts.set(id, { id, checkout_reference: body.checkout_reference, status: "PAID", amount: body.amount, currency: "GBP", transactions: [{ id: `transaction-${id}`, transaction_code: `code-${id}`, status: "SUCCESSFUL" }] });
      return Response.json({id,checkout_reference:body.checkout_reference,hosted_checkout_url:"https://checkout.sumup.com/isolated",status:"PENDING",amount:body.amount},{status:201});
    }
    if(url.hostname==="api.sumup.com"&&request.method==="GET"&&url.pathname.startsWith("/v0.1/checkouts/")){
      const checkout = paidCheckouts.get(url.pathname.split("/").at(-1)!);
      assert.ok(checkout, "Confirmation must verify a checkout created by the payment handler");
      return Response.json(checkout);
    }
    if(url.hostname==="api.resend.com"&&request.method==="POST"&&url.pathname==="/emails"){
      emails.push(await request.json());
      return Response.json({ id: `mock-email-${emails.length}` });
    }
    throw Error(`Unexpected external call ${request.method} ${url.origin}${url.pathname}`);
  };
  try {
    for (const fee of [0, 17.25, 100]) {
      const saved=validateOwnerPricingInput({...defaultOwnerPricingSettings(),meetGreet:{bfsGbp:fee,bhdGbp:fee,dubGbp:fee}});
      assert.ok(saved.ok);
      const fees=toPublicOwnerPricingConfig(saved.settings).meetGreet;
      for(const pickupAirportCode of ["BFS","BHD","DUB"]) {
        assert.deepEqual(quoteOptionalMeetGreet({selected:true,pickupAirportCode,fees}),{ok:true,feeGbp:fee});
      }
      for(const pickupAirportCode of [null,undefined,"LDY","Belfast City Hall"]) {
        assert.equal(quoteOptionalMeetGreet({selected:true,pickupAirportCode,fees}).ok,false);
        assert.deepEqual(quoteOptionalMeetGreet({selected:false,pickupAirportCode,fees}),{ok:true,feeGbp:0});
      }
    }
    for(const deposit of [false,true]) for(const fee of [15,18.25]) for(const selected of [false,true]) for(const minimum of [45]) for(const distanceScale of [0.1]) for(const signed of [false,true]) for(const route of reviewed.routes) for(const vehicle of [SALOON_VEHICLE,ESTATE_VEHICLE]) for(const returning of [false,true]) {
      now+=11 * 60_000;store.clear(); distanceScaleForRoute = distanceScale; env.QUOTE_RECEIPT_SECRET = signed ? "isolated-receipt-secret" : "";
      const depositSettings={enabled:true,percent:20,minimumGbp:15};
      store.set("booking:settings",JSON.stringify({depositCash:depositSettings}));
      const pricing=defaultOwnerPricingSettings();pricing.version=checkouts+1;pricing.meetGreet={bfsGbp:fee,bhdGbp:fee+1,dubGbp:fee+10};
      pricing.saloonFormula={enabled:true,startingChargeGbp:10,ratePerMileGbp:2.5,minimumFareGbp:30};
      pricing.estate.upliftGbp=minimum===45?7:9.35;pricing.bfsMinimumSaloonFareGbp=minimum;
      pricing.night.enabled=true;pricing.night.surchargeRate=0.25;pricing.weekend.enabled=true;pricing.weekend.surchargeRate=0.1;
      pricing.profitability={...approvedProductionProfitabilitySettings(),targetHourlyEarningsGbp:40};
      store.set("owner:pricing-settings",JSON.stringify(pricing));
      const airport=SERVED_AIRPORTS.find(a=>a.code===route.airport)!;
      const from=route.direction==="pickup";
      const pickupAddress=from?airport.formattedAddress:reviewed.address,dropoffAddress=from?reviewed.address:airport.formattedAddress;
      const pickupPlaceId=from?airport.placeId:reviewed.placeId,dropoffPlaceId=from?reviewed.placeId:airport.placeId;
      const journey={pickupAddress,dropoffAddress,pickupPlaceId,dropoffPlaceId,returnJourney:returning,outboundDate:"2026-11-13",outboundTime:"12:00",returnDate:"2026-11-20",returnTime:"12:00",passengers:1,suitcases:1,vehicleType:vehicle};
      const quote=await calculateServerQuote(journey);
      assert.ok(quote.ok,JSON.stringify(quote)); assert.equal(Boolean(quote.quoteReceipt?.startsWith("v4-optional-terminal-access.")), signed, "Browser retains the BFS-only signed receipt when available");
      const express=resolveExpressDropOff({airportCode:airport.code,fromAirport:from,returnJourney:returning,selected:true,outboundSelected:true,returnSelected:true});
      const access=quoteAirportAccessCharges({airportCode:airport.code,fromAirport:from,returnJourney:returning,expressLegs:express.legs,fees:pricing.meetGreet});
      const transferTotal=composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:quote.journeyFareGbp!,airportFixedCostsGbp:quote.airportFixedCostsGbp,airportAccessChargeGbp:access.airportAccessChargeGbp,returnJourney:returning,preserveFixedFarePence:quote.preserveBfsMinimumPence}).finalAmountPayableGbp;
      const charge=selected && from ? (airport.code==="BFS"?fee:airport.code==="BHD"?fee+1:fee+10) : 0;
      const total=Math.round((transferTotal+charge)*100)/100;
      const paidNow=deposit?calculateDepositCashQuote(total,depositSettings).depositGbp:total;
      const booking={meetGreetFeeGbp:999,estimatedPrice:`£${total.toFixed(2)}`,customerName:"Isolated Test",customerEmail:"test@example.invalid",mobileNumber:"07700900123",pickupLabel:pickupAddress,dropoffLabel:dropoffAddress,tripLabel:from?"Airport pickup":"Airport drop-off",tripDate:journey.outboundDate,tripTime:journey.outboundTime,returnDate:journey.returnDate,returnTime:journey.returnTime,returnJourney:returning,passengers:1,suitcases:1,vehicle,isAirportTrip:true,isFromAirport:from,airportCode:airport.code,flightNumber:"BA1234",returnFlightNumber:"BA1234",termsAcceptedAt:new Date().toISOString()};
      const checkoutRequest = { paymentMethod: deposit ? "DEPOSIT_CASH" as const : "FULL_ONLINE" as const, cashAgreementAccepted: deposit || undefined, meetGreetSelected: selected, booking, pickupPlaceId, dropoffPlaceId, quoteReceipt: quote.quoteReceipt, amount: quote.amount, acceptedFinalAmountGbp: total, journeyFareGbp: quote.journeyFareGbp, airportFixedCostsGbp: quote.airportFixedCostsGbp, description: "Isolated test", redirectUrl: origin + "/booking-confirmed/" };
      const checkoutsBeforeTamper = checkouts;
      await assert.rejects(createPaymentCheckout({ ...checkoutRequest, acceptedFinalAmountGbp: 1 }), "Client-submitted final fare must be rejected");
      assert.equal(checkouts, checkoutsBeforeTamper, "Tampering never creates a SumUp checkout");
      if(selected && !from) {
        await assert.rejects(createPaymentCheckout(checkoutRequest), /Meet & Greet is available only/);
        assert.equal(checkouts, checkoutsBeforeTamper);checks++;continue;
      }
      const body = await createPaymentCheckout(checkoutRequest);
      assert.ok(body.checkoutId); assert.equal(checkoutAmount, paidNow);
      const pending=await getPendingCheckout(kv,body.checkoutId);assert.ok(pending);
      assert.equal(pending.amount, paidNow, "Pending checkout keeps the server-authoritative amount");
      // A later admin edit must not reprice a payment or the resulting confirmation.
      store.set("owner:pricing-settings", JSON.stringify({ ...pricing, meetGreet: {bfsGbp:99,bhdGbp:99,dubGbp:99}, bfsMinimumSaloonFareGbp: 999, estate: { upliftGbp: 99 } }));
      const emailStart = emails.length;
      const finalize = () => finalizePaidCheckout({ env, checkoutId: body.checkoutId, booking: pending.booking, logPaidBookingCalendar: async () => ({ logged: true, events: 0, eventIds: [] }) });
      const confirmed = await finalize();
      assert.equal(confirmed.ok, true, JSON.stringify(confirmed));
      assert.equal(confirmed.paid, true);
      assert.equal(confirmed.amountPaid, `£${paidNow.toFixed(2)}`);
      assert.equal(confirmed.purchase?.value, total);
      assert.equal(confirmed.meetGreetFeeGbp, selected ? charge : undefined);
      assert.equal(confirmed.customerEmailSent, true);
      assert.equal(confirmed.ownerEmailSent, true);
      const sent = emails.slice(emailStart);
      assert.equal(sent.length, 2, "Exactly one customer confirmation and one owner alert");
      const customerEmail = sent.find(email => email.to.includes(pending.booking.customerEmail));
      const ownerEmail = sent.find(email => email.to.includes(env.BOOKING_TO_EMAIL));
      assert.ok(customerEmail?.text.includes(`£${total.toFixed(2)}`), "Customer text confirmation matches the checkout");
      assert.ok(customerEmail?.html?.includes(`£${total.toFixed(2)}`), "Customer HTML confirmation matches the checkout");
      assert.ok(ownerEmail?.text.includes(`£${total.toFixed(2)}`), "Owner alert matches the checkout");
      const paid=await getPaidBookingRecord(kv,confirmed.paymentReference);assert.equal(paid?.amount,total);
      assert.equal(paid?.totalFare, total);
      if(deposit) {assert.equal(paid?.onlineAmountPaid,paidNow);assert.equal(paid?.cashBalanceDue,Math.round((total-paidNow)*100)/100);}
      assert.equal(paid?.meetGreetFeeGbp, selected ? charge : undefined);
      if(selected) {
        assert.equal(paid?.outboundAirportAccessOption,"meet-greet");
        const driverJob=await enrichDriverJob({token:"test-driver",pickupAt:"2026-11-13T12:00",paymentReference:confirmed.paymentReference,journeyLeg:"outbound",isAirportTrip:true,isFromAirport:true,airportCode:airport.code,pickupLabel:pickupAddress,dropoffLabel:dropoffAddress,tripDate:journey.outboundDate,tripTime:journey.outboundTime,status:"confirmed"} as unknown as TrackingJobRecord,env,null,"driver");
        assert.equal(driverJob.airportAccessOption,"meet-greet","Assigned driver receives the service instruction");
        const assignment=buildDriverAssignmentEmail({job:{...booking,id:"test",customerMobile:booking.mobileNumber,driverFirstName:"Test"} as unknown as BookingJobRecord,acceptUrl:"https://example.invalid/accept",meetGreetSelected:typeof paid?.meetGreetFeeGbp === "number"});
        assert.match(assignment.text,/Outbound collection.*Meet & Greet.*name board/);
        assert.match(assignment.html,/Outbound collection.*Meet &amp; Greet.*name board/);
        assert.ok(customerEmail?.text.includes("Meet & Greet"));
        assert.ok(customerEmail?.html?.includes("Meet &amp; Greet") || customerEmail?.html?.includes("Meet & Greet"));
        assert.ok(ownerEmail?.text.includes("Meet & Greet") || ownerEmail?.text.includes("MEET & GREET"));
        assert.equal(paid?.outboundAirportAccessChargeGbp,airport.code === "DUB" ? access.outboundAirportAccessChargeGbp : charge,"Belfast Meet & Greet includes the access charge once");
      }
      const repeated=await finalize();
      assert.equal(repeated.alreadyFinalized, true, "Duplicate confirmation is idempotent");
      assert.equal(repeated.meetGreetFeeGbp, selected ? charge : undefined);
      assert.equal(emails.length, emailStart + 2, "Duplicate confirmation must not send additional emails");
      checks++;
    }
    assert.equal(checks,384);assert.ok(routeCalls>0);

    console.log(`PASS ${checks} signed browser-quote → SumUp → paid confirmation → stored booking → customer/owner email cases across three airports, both directions, vehicles, return types, signed/unsigned checkout and changed fractional Meet & Greet prices; later settings preserve agreed fares; repeat confirmation is idempotent; passenger routing only; no external writes.`);
  } finally {globalThis.fetch=originalFetch;Date.now=originalNow;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
