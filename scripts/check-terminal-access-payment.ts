/** Reviewed route fixtures and real quote/payment/final-booking handlers; no live writes. */
import assert from "node:assert/strict";
import reviewed from "./fixtures/reviewed-airport-routes.json";
import { defaultOwnerPricingSettings } from "../shared/owner-pricing-config";
import { SERVED_AIRPORTS } from "../shared/served-airports";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import { calculateServerQuote } from "../src/lib/quick-quote-api";
import { handleQuoteCalculateRequest } from "../workers/addresses/src/quote-handlers";
import worker from "../workers/addresses/src/index";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { resolveExpressDropOff } from "../shared/express-drop-off";
import { quoteAirportAccessCharges } from "../shared/meet-greet";
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
  let routeCalls=0, checkoutAmount=0, checkouts=0, checks=0;
  const paidCheckouts = new Map<string, SumUpCheckoutDetails>();
  const emails: { to: string | string[]; text: string; html?: string }[] = [];
  const results:Record<string,unknown>[]=[]; const targetBaselines=new Map<string,number>();
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init);const url=new URL(request.url);
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
      return Response.json({code:"Ok",routes:[{distance:route.distanceMetres,duration:route.durationSeconds}]});
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
    for(const configuredFee of [5,7.25]) for(const outboundChoice of ["free","express","meet-greet"] as const) for(const returnChoice of ["free","express","meet-greet"] as const) for(const minimum of [45]) for(const mode of [true]) for(const target of [40]) for(const route of reviewed.routes) for(const vehicle of [SALOON_VEHICLE,ESTATE_VEHICLE]) for(const returning of [false,true]) {
      now+=61_000;store.clear();
      const pricing=defaultOwnerPricingSettings();pricing.version=checkouts+1; pricing.terminalAccess={bfsGbp:configuredFee,bhdGbp:configuredFee===5?4:6.35};
      pricing.saloonFormula={enabled:mode,startingChargeGbp:10,ratePerMileGbp:2.5,minimumFareGbp:30};
      pricing.estate.upliftGbp=minimum===45?7:9.35;pricing.bfsMinimumSaloonFareGbp=minimum;
      pricing.night.enabled=true;pricing.night.surchargeRate=0.25;pricing.weekend.enabled=true;pricing.weekend.surchargeRate=0.1;
      pricing.profitability={...approvedProductionProfitabilitySettings(),targetHourlyEarningsGbp:target};
      store.set("owner:pricing-settings",JSON.stringify(pricing));
      const airport=SERVED_AIRPORTS.find(a=>a.code===route.airport)!;
      const from=route.direction==="pickup";
      const pickupAddress=from?airport.formattedAddress:reviewed.address,dropoffAddress=from?reviewed.address:airport.formattedAddress;
      const pickupPlaceId=from?airport.placeId:reviewed.placeId,dropoffPlaceId=from?reviewed.placeId:airport.placeId;
      const journey={pickupAddress,dropoffAddress,pickupPlaceId,dropoffPlaceId,returnJourney:returning,outboundDate:"2026-11-13",outboundTime:"12:00",returnDate:"2026-11-20",returnTime:"12:00",passengers:1,suitcases:1,vehicleType:vehicle};
      const quote=await calculateServerQuote(journey);
      assert.ok(quote.ok,JSON.stringify(quote)); assert.ok(quote.quoteReceipt?.startsWith("v3."),"Browser adapter retains current signed receipt");
      const express=resolveExpressDropOff({airportCode:airport.code,fromAirport:from,returnJourney:returning,selected:true,outboundSelected:true,returnSelected:true});
      const access=quoteAirportAccessCharges({airportCode:airport.code,fromAirport:from,returnJourney:returning,expressLegs:express.legs,fees:pricing.meetGreet,terminalAccessFees:pricing.terminalAccess,outboundChoice,returnChoice});
      const total=composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:quote.journeyFareGbp!,airportFixedCostsGbp:quote.airportFixedCostsGbp,airportAccessChargeGbp:access.airportAccessChargeGbp,returnJourney:returning,preserveFixedFarePence:quote.preserveBfsMinimumPence}).finalAmountPayableGbp;
      const key=[minimum,mode,airport.code,from,vehicle,returning].join(":");
      if(target===40)targetBaselines.set(key,total);else assert.equal(total,targetBaselines.get(key),"Changing hourly analysis target must never change the customer fare in any pricing mode");
      const booking={terminalAccessChoices:Object.fromEntries(access.legs.map(visit=>[`${visit.leg}:${visit.airportCode}:${visit.service}`,visit.option])),outboundAirportAccessOption:outboundChoice,returnAirportAccessOption:returnChoice,expressDropOffFee:9999,outboundAirportAccessChargeGbp:9999,customerName:"Isolated Test",customerEmail:"test@example.invalid",mobileNumber:"07700900123",pickupLabel:pickupAddress,dropoffLabel:dropoffAddress,tripLabel:from?"Airport pickup":"Airport drop-off",tripDate:journey.outboundDate,tripTime:journey.outboundTime,returnDate:journey.returnDate,returnTime:journey.returnTime,returnJourney:returning,passengers:1,suitcases:1,vehicle,isAirportTrip:true,isFromAirport:from,airportCode:airport.code,flightNumber:"BA1234",returnFlightNumber:"BA1234",termsAcceptedAt:new Date().toISOString()};
      if (checks === 0) {
        const before=checkouts;
        const tampered=await worker.fetch(new Request("https://worker.invalid/payments",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({booking,pickupPlaceId,dropoffPlaceId,quoteReceipt:quote.quoteReceipt,amount:1,acceptedFinalAmountGbp:1,journeyFareGbp:quote.journeyFareGbp,airportFixedCostsGbp:quote.airportFixedCostsGbp,description:"Tampered isolated test",redirectUrl:origin+"/booking-confirmed/"})}),env as never);
        assert.equal(tampered.status,409,"Customer-modified displayed amount is rejected");
        assert.equal(checkouts,before,"Rejected amount never creates a SumUp checkout");
      }
      const response=await worker.fetch(new Request("https://worker.invalid/payments",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({booking,pickupPlaceId,dropoffPlaceId,quoteReceipt:quote.quoteReceipt,amount:quote.amount,acceptedFinalAmountGbp:total,journeyFareGbp:quote.journeyFareGbp,airportFixedCostsGbp:quote.airportFixedCostsGbp,description:"Isolated test",redirectUrl:origin+"/booking-confirmed/"})}),env as never);
      const body=await response.json() as {checkoutId:string};assert.equal(response.status,200,JSON.stringify(body));assert.equal(checkoutAmount,total);
      const pending=await getPendingCheckout(kv,body.checkoutId);assert.ok(pending);
      assert.equal(pending.amount, total, "Pending checkout keeps the server-authoritative amount");
      assert.deepEqual(pending.booking.terminalAccessVisits, access.legs, "Server ignores tampered amounts and persists selected visits");
      if (airport.code !== "DUB") {
        const expectedFee = airport.code === "BFS" ? pricing.terminalAccess.bfsGbp : pricing.terminalAccess.bhdGbp;
        const expected = (choice: string, pickup: boolean) => choice === "express" ? expectedFee : choice === "meet-greet" && pickup ? 15 : 0;
        assert.equal(access.airportAccessChargeGbp, expected(outboundChoice, from) + (returning ? expected(returnChoice, !from) : 0));
        assert.equal(quote.airportFixedCostsGbp, 0, "Initial quote has no automatic Belfast barrier fee");
      }
      // A later admin edit must not reprice a payment or the resulting confirmation.
      store.set("owner:pricing-settings", JSON.stringify({ ...pricing, bfsMinimumSaloonFareGbp: 999, estate: { upliftGbp: 99 } }));
      const emailStart = emails.length;
      const finalize = () => finalizePaidCheckout({ env, checkoutId: body.checkoutId, booking: pending.booking, logPaidBookingCalendar: async () => ({ logged: true, events: 0, eventIds: [] }) });
      const confirmed = await finalize();
      assert.equal(confirmed.ok, true, JSON.stringify(confirmed));
      assert.equal(confirmed.paid, true);
      assert.equal(confirmed.amountPaid, `£${total.toFixed(2)}`);
      assert.equal(confirmed.purchase?.value, total);
      assert.equal(confirmed.customerEmailSent, true);
      assert.equal(confirmed.ownerEmailSent, true);
      const sent = emails.slice(emailStart);
      assert.equal(sent.length, 2, "Exactly one customer confirmation and one owner alert");
      const customerEmail = sent.find(email => email.to.includes(pending.booking.customerEmail));
      const ownerEmail = sent.find(email => email.to.includes(env.BOOKING_TO_EMAIL));
      assert.ok(customerEmail?.text.includes(`£${total.toFixed(2)}`), "Customer text confirmation matches the checkout");
      assert.ok(customerEmail?.html?.includes(`£${total.toFixed(2)}`), "Customer HTML confirmation matches the checkout");
      assert.ok(ownerEmail?.text.includes(`£${total.toFixed(2)}`), "Owner alert matches the checkout");
      const paid=await getPaidBookingRecord(kv,confirmed.paymentReference);assert.equal(paid?.amount,total);assert.equal(paid?.pickupPlaceId,pickupPlaceId);assert.equal(paid?.dropoffPlaceId,dropoffPlaceId);assert.equal(paid?.pickupLat,from?airport.lat:reviewed.lat);assert.equal(paid?.dropoffLng,from?reviewed.lng:airport.lng);
      assert.equal(paid?.totalFare, total);
      assert.deepEqual(paid?.terminalAccessVisits, access.legs, "Canonical database retains visit selections and charges");
      if (airport.code !== "DUB") {
        for (const visit of access.legs) {
          const label = visit.option === "meet-greet" ? "Meet & Greet" : visit.option === "express" ? "Terminal Access" : "Free Airport Access";
          assert.ok(customerEmail?.text.includes(label), `Customer confirmation contains ${label}`);
        }
      }
      assert.equal((await finalize()).alreadyFinalized, true, "Duplicate confirmation is idempotent");
      assert.equal(emails.length, emailStart + 2, "Duplicate confirmation must not send additional emails");
      if(minimum===45&&mode&&target===40)results.push({airport:airport.code,direction:route.direction,vehicle:vehicle===SALOON_VEHICLE?"Saloon":"Estate",return:returning,miles:Number((route.distanceMetres/1000*0.621371).toFixed(5)),vehicleFare:quote.journeyFareGbp,fixed:quote.airportFixedCostsGbp,access:access.airportAccessChargeGbp,total});
      checks++;
    }
    assert.equal(checks,432);assert.ok(routeCalls>0);

    console.log(`PASS ${checks} terminal access signed browser-quote → SumUp → paid confirmation → stored booking → customer/owner email cases across three airports, both directions, vehicles, return types, independent outbound/return choices and default/fractional configured access prices; later settings preserve agreed fares; repeat confirmation is idempotent; passenger routing only; no external writes.`);
  } finally {globalThis.fetch=originalFetch;Date.now=originalNow;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
