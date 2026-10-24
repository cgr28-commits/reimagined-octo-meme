import {resolveJourneyAirportFees} from "../shared/airport-fixed-costs";
import {isolatedPaymentCoordinator} from "./fixtures/payment-coordinator";
/** Reviewed route fixtures and real quote/payment/final-booking handlers; no live writes. */
import assert from "node:assert/strict";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {quoteLegacyAirportAccessCharges} from "../shared/legacy-airport-access";
import { calculateDepositCashQuote } from "../shared/deposit-cash";
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
  assert.ok(process.env.PR692_BASELINE_ROOT, "Use the pinned reviewed main checkout");
  const oldModule = (file: string) => import(pathToFileURL(path.join(process.env.PR692_BASELINE_ROOT!, file)).href);
  const oldApi = await oldModule("src/lib/quick-quote-api.ts");
  const oldQuote = await oldModule("workers/addresses/src/quote-handlers.ts");
  const oldWorker = (await oldModule("workers/addresses/src/index.ts")).default;
  const oldAccess = await oldModule("shared/meet-greet.ts");
  const oldFixed = await oldModule("shared/airport-fixed-costs.ts");
  for(const pickupAirportCode of ["BFS","BHD","DUB"]) for(const dropoffAirportCode of ["BFS","BHD","DUB"]) for(const returnJourney of [false,true]) {
    const input={isAirportToAirport:true,pickupAirportCode,dropoffAirportCode,returnJourney};
    assert.deepEqual(resolveJourneyAirportFees({...input,legacyNiAccess:true}),oldFixed.resolveJourneyAirportFees(input),"Legacy A2A fixed costs match original rules exactly");
  }
  let mode = "existing";

  const originalFetch=globalThis.fetch, originalNow=Date.now;
  let now=Date.parse("2026-10-22T12:00:00Z"); Date.now=()=>now;
  const origin="https://www.myairporttaxini.co.uk";
  const store=new Map<string,string>();
  const kv={async get(key:string,type?:string){const v=store.get(key);return v==null?null:type==="json"?JSON.parse(v):v;},async put(key:string,value:string){store.set(key,value);},async delete(key:string){store.delete(key);},async list(){return {keys:[],list_complete:true};}} as unknown as KVNamespace;
  const env={QUOTE_LEAD_COORDINATOR:isolatedPaymentCoordinator(),TRACKING_STORE:kv,GOOGLE_PLACES_API_KEY:"mock-google",SUMUP_API_KEY:"mock-sumup",SUMUP_MERCHANT_CODE:"mock-merchant",QUOTE_RECEIPT_SECRET:"isolated-receipt-secret",PUBLIC_SITE_ORIGIN:origin,RESEND_API_KEY:"mock-email",BOOKING_TO_EMAIL:"owner@example.invalid",BOOKING_FROM_EMAIL:"bookings@example.invalid"};
  let routeCalls=0, checkoutAmount=0, checkouts=0, checks=0;
  const paidCheckouts = new Map<string, SumUpCheckoutDetails>();
  const emails: { to: string | string[]; text: string; html?: string }[] = [];
  const results:Record<string,unknown>[]=[]; const targetBaselines=new Map<string,number>();
  globalThis.fetch=async(input,init)=>{
    const request=new Request(input,init);const url=new URL(request.url);
    if(url.pathname==="/quote/calculate")return (mode === "existing" || mode === "pending" ? oldQuote.handleQuoteCalculateRequest : handleQuoteCalculateRequest)(request,origin,env);
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
    for (const testMode of ["existing", "refresh", "pending"]) for(const paymentMethod of ["FULL_ONLINE", "DEPOSIT_CASH"] as const) for(const route of reviewed.routes) for(const vehicle of [SALOON_VEHICLE,ESTATE_VEHICLE]) for(const returning of [false,true]) for(const mg of [false,true]) {
      const from = route.direction === "pickup";
      if(mg && !from) continue;
      mode = testMode;
      now+=61_000;store.clear();
      env.QUOTE_LEAD_COORDINATOR=isolatedPaymentCoordinator();
      const configuredFee=5, minimum=45, target=40;
      const depositSettings={enabled:true,percent:20,minimumGbp:15};
      store.set("booking:settings",JSON.stringify({depositCash:depositSettings}));
      const pricing=defaultOwnerPricingSettings();pricing.version=checkouts+1; pricing.terminalAccess={bfsGbp:configuredFee,bhdGbp:configuredFee===5?4:6.35};
      pricing.saloonFormula={enabled:true,startingChargeGbp:10,ratePerMileGbp:2.5,minimumFareGbp:30};
      pricing.estate.upliftGbp=minimum===45?7:9.35;pricing.bfsMinimumSaloonFareGbp=minimum;
      pricing.night.enabled=true;pricing.night.surchargeRate=0.25;pricing.weekend.enabled=true;pricing.weekend.surchargeRate=0.1;
      pricing.profitability={...approvedProductionProfitabilitySettings(),targetHourlyEarningsGbp:target};
      store.set("owner:pricing-settings",JSON.stringify(pricing));
      const airport=SERVED_AIRPORTS.find(a=>a.code===route.airport)!;

      const pickupAddress=from?airport.formattedAddress:reviewed.address,dropoffAddress=from?reviewed.address:airport.formattedAddress;
      const pickupPlaceId=from?airport.placeId:reviewed.placeId,dropoffPlaceId=from?reviewed.placeId:airport.placeId;
      const journey={pickupAddress,dropoffAddress,pickupPlaceId,dropoffPlaceId,returnJourney:returning,outboundDate:"2026-11-13",outboundTime:"12:00",returnDate:"2026-11-20",returnTime:"12:00",passengers:1,suitcases:1,vehicleType:vehicle};
      const quote=await oldApi.calculateServerQuote(journey);
      assert.ok(quote.ok,JSON.stringify(quote)); assert.ok(quote.quoteReceipt?.startsWith("v2-bfs-minimum."),"Browser adapter retains current signed receipt");
      const express=resolveExpressDropOff({airportCode:airport.code,fromAirport:from,returnJourney:returning,selected:true,outboundSelected:true,returnSelected:true});
      const accessInput={airportCode:airport.code,fromAirport:from,returnJourney:returning,expressLegs:express.legs,fees:pricing.meetGreet,outboundChoice:"express" as const,returnChoice:"express" as const};
      const access=oldAccess.quoteAirportAccessCharges(accessInput);
      assert.deepEqual(quoteLegacyAirportAccessCharges(accessInput),access,"Legacy access policy equals original main policy");
      const total=composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:quote.journeyFareGbp!,airportFixedCostsGbp:quote.airportFixedCostsGbp,airportAccessChargeGbp:access.airportAccessChargeGbp,returnJourney:returning,preserveFixedFarePence:quote.preserveBfsMinimumPence}).finalAmountPayableGbp + (mg ? (airport.code === "DUB" ? 25 : 15) : 0);
      const deposit=calculateDepositCashQuote(total,depositSettings);
      const charged=paymentMethod === "DEPOSIT_CASH" ? deposit.depositGbp : total;
      const booking={outboundAirportAccessOption:"express",returnAirportAccessOption:"express",customerName:"Isolated Legacy",customerEmail:"legacy@example.invalid",mobileNumber:"07700900123",pickupLabel:pickupAddress,dropoffLabel:dropoffAddress,tripLabel:from?"Airport pickup":"Airport drop-off",tripDate:journey.outboundDate,tripTime:journey.outboundTime,returnDate:journey.returnDate,returnTime:journey.returnTime,returnJourney:returning,passengers:1,suitcases:1,vehicle,isAirportTrip:true,isFromAirport:from,airportCode:airport.code,flightNumber:"BA1234",returnFlightNumber:"BA1234",termsAcceptedAt:new Date().toISOString()};
      if (checks === 0) {
        for(const invalidToken of [quote.quoteReceipt.replace("v2-bfs-minimum", "v4-optional-terminal-access"), quote.quoteReceipt.slice(0,-8)+"AAAAAAAA"]) {
          const before=checkouts;
          const rejected=await worker.fetch(new Request("https://worker.invalid/payments",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({booking,pickupPlaceId,dropoffPlaceId,quoteReceipt:invalidToken,amount:quote.amount,acceptedFinalAmountGbp:total,description:"Invalid receipt",redirectUrl:origin+"/booking-confirmed/"})}),env as never);
          assert.equal(rejected.status,409);assert.equal(checkouts,before,"Tampered/relabelled receipt cannot create a checkout");
        }
        const before=checkouts;
        const tampered=await worker.fetch(new Request("https://worker.invalid/payments",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({booking,pickupPlaceId,dropoffPlaceId,quoteReceipt:quote.quoteReceipt,amount:1,acceptedFinalAmountGbp:1,journeyFareGbp:quote.journeyFareGbp,airportFixedCostsGbp:quote.airportFixedCostsGbp,description:"Tampered isolated test",redirectUrl:origin+"/booking-confirmed/"})}),env as never);
        assert.equal(tampered.status,409,"Customer-modified displayed amount is rejected");
        assert.equal(checkouts,before,"Rejected amount never creates a SumUp checkout");
      }
      const pay=()=> (mode === "pending" ? oldWorker : worker).fetch(new Request("https://worker.invalid/payments",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({meetGreetSelected:mg,paymentMethod,cashAgreementAccepted:true,booking,pickupPlaceId,dropoffPlaceId,quoteReceipt:quote.quoteReceipt,amount:quote.amount,acceptedFinalAmountGbp:total,journeyFareGbp:quote.journeyFareGbp,airportFixedCostsGbp:quote.airportFixedCostsGbp,description:"Isolated test",redirectUrl:origin+"/booking-confirmed/"})}),env as never);
      const beforePay=checkouts;
      const paymentResponses=checks === 0 ? await Promise.all([pay(),pay()]) : [await pay()];
      const response=paymentResponses.find(result=>result.status===200)!;
      assert.ok(response,"A valid payment request succeeds");
      assert.equal(checkouts,beforePay+1,"Concurrent/repeated payment attempts create only one checkout");
      if(checks === 0) {assert.equal((await pay()).status,200);assert.equal(checkouts,beforePay+1,"Completed create is reused");}

      const body=await response.json() as {checkoutId:string};assert.equal(response.status,200,JSON.stringify(body));assert.equal(checkoutAmount,charged);
      const pending=await getPendingCheckout(kv,body.checkoutId);assert.ok(pending);
      assert.equal(pending.amount, charged, "Pending checkout keeps the server-authoritative amount");
      // A later admin edit must not reprice a payment or the resulting confirmation.
      store.set("owner:pricing-settings", JSON.stringify({ ...pricing, bfsMinimumSaloonFareGbp: 999, estate: { upliftGbp: 99 } }));
      const emailStart = emails.length;
      const finalize = () => finalizePaidCheckout({ env, checkoutId: body.checkoutId, booking: pending.booking, logPaidBookingCalendar: async () => ({ logged: true, events: 0, eventIds: [] }) });
      const pair=checks === 0 ? await Promise.all([finalize(),finalize()]) : [await finalize()];
      const confirmed = pair.find(result=>result.ok)!;
      assert.ok(confirmed,"At least one concurrent finalization succeeds");
      assert.equal(confirmed.ok, true, JSON.stringify(confirmed));
      assert.equal(confirmed.paid, true);
      assert.equal(confirmed.amountPaid, `£${charged.toFixed(2)}`);
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
      const paid=await getPaidBookingRecord(kv,confirmed.paymentReference);assert.equal(paid?.amount,total);if(mode !== "pending") {assert.equal(paid?.pickupPlaceId,pickupPlaceId);assert.equal(paid?.dropoffPlaceId,dropoffPlaceId);}assert.equal(paid?.pickupLabel,pickupAddress);assert.equal(paid?.dropoffLabel,dropoffAddress);
      assert.equal(paid?.totalFare, total);
      if(paymentMethod === "DEPOSIT_CASH") {
        assert.equal(paid?.cashBalanceDue,deposit.cashDueGbp);
        assert.equal(paid?.onlineAmountPaid,charged);
      }
      assert.equal((await finalize()).alreadyFinalized, true, "Duplicate confirmation is idempotent");
      assert.equal(emails.length, emailStart + 2, "Duplicate confirmation must not send additional emails");
      checks++;
    }
    assert.equal(checks,216);assert.ok(routeCalls>0);

    console.log(`PASS ${checks} original-main browser / refreshed legacy quotes / old pending checkouts → compatible backend, deposits/full payments, Meet & Greet, saved totals, confirmations and repeat finalization; isolated providers only.`);
  } finally {globalThis.fetch=originalFetch;Date.now=originalNow;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
