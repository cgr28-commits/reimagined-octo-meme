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
import { savePaidBookingRecordFromConfirm } from "../workers/addresses/src/refund-handlers";
import { getPaidBookingRecord } from "../workers/addresses/src/paid-booking-store";
import { approvedProductionProfitabilitySettings } from "../src/lib/owner-profitability-settings";

async function main() {
  const originalFetch=globalThis.fetch, originalNow=Date.now;
  let now=Date.parse("2026-10-22T12:00:00Z"); Date.now=()=>now;
  const origin="https://www.myairporttaxini.co.uk";
  const store=new Map<string,string>();
  const kv={async get(key:string,type?:string){const v=store.get(key);return v==null?null:type==="json"?JSON.parse(v):v;},async put(key:string,value:string){store.set(key,value);},async delete(key:string){store.delete(key);},async list(){return {keys:[],list_complete:true};}} as unknown as KVNamespace;
  const env={TRACKING_STORE:kv,GOOGLE_PLACES_API_KEY:"mock-google",SUMUP_API_KEY:"mock-sumup",SUMUP_MERCHANT_CODE:"mock-merchant",QUOTE_RECEIPT_SECRET:"isolated-receipt-secret",PUBLIC_SITE_ORIGIN:origin};
  let routeCalls=0, checkoutAmount=0, checkouts=0, checks=0;
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
      return Response.json({id:`isolated-${checkouts}`,checkout_reference:body.checkout_reference,hosted_checkout_url:"https://checkout.sumup.com/isolated",status:"PENDING",amount:body.amount},{status:201});
    }
    throw Error(`Unexpected external call ${request.method} ${url.origin}${url.pathname}`);
  };
  try {
    for(const minimum of [45,60.25]) for(const mode of [true,false]) for(const target of [40,400]) for(const route of reviewed.routes) for(const vehicle of [SALOON_VEHICLE,ESTATE_VEHICLE]) for(const returning of [false,true]) {
      now+=61_000;store.clear();
      const pricing=defaultOwnerPricingSettings();pricing.version=checkouts+1;
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
      const access=quoteAirportAccessCharges({airportCode:airport.code,fromAirport:from,returnJourney:returning,expressLegs:express.legs,fees:pricing.meetGreet});
      const total=composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:quote.journeyFareGbp!,airportFixedCostsGbp:quote.airportFixedCostsGbp,airportAccessChargeGbp:access.airportAccessChargeGbp,returnJourney:returning,preserveFixedFarePence:quote.preserveBfsMinimumPence}).finalAmountPayableGbp;
      const key=[minimum,mode,airport.code,from,vehicle,returning].join(":");
      if(target===40)targetBaselines.set(key,total);else assert.equal(total,targetBaselines.get(key),"Changing hourly analysis target must never change the customer fare in any pricing mode");
      const booking={customerName:"Isolated Test",customerEmail:"test@example.invalid",mobileNumber:"07700900123",pickupLabel:pickupAddress,dropoffLabel:dropoffAddress,tripLabel:from?"Airport pickup":"Airport drop-off",tripDate:journey.outboundDate,tripTime:journey.outboundTime,returnDate:journey.returnDate,returnTime:journey.returnTime,returnJourney:returning,passengers:1,suitcases:1,vehicle,isAirportTrip:true,isFromAirport:from,airportCode:airport.code,flightNumber:"BA1234",returnFlightNumber:"BA1234",termsAcceptedAt:new Date().toISOString()};
      const response=await worker.fetch(new Request("https://worker.invalid/payments",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({booking,pickupPlaceId,dropoffPlaceId,quoteReceipt:quote.quoteReceipt,amount:quote.amount,acceptedFinalAmountGbp:total,journeyFareGbp:quote.journeyFareGbp,airportFixedCostsGbp:quote.airportFixedCostsGbp,description:"Isolated test",redirectUrl:origin+"/booking-confirmed/"})}),env as never);
      const body=await response.json() as {checkoutId:string};assert.equal(response.status,200,JSON.stringify(body));assert.equal(checkoutAmount,total);
      const pending=await getPendingCheckout(kv,body.checkoutId);assert.ok(pending);
      await savePaidBookingRecordFromConfirm({env,booking:pending.booking,checkoutId:body.checkoutId,amount:total,currency:"GBP",amountPaidLabel:`£${total.toFixed(2)}`,paymentReference:body.checkoutId,calendarEventIds:[]});
      const paid=await getPaidBookingRecord(kv,body.checkoutId);assert.equal(paid?.amount,total);assert.equal(paid?.pickupPlaceId,pickupPlaceId);assert.equal(paid?.dropoffPlaceId,dropoffPlaceId);assert.equal(paid?.pickupLat,from?airport.lat:reviewed.lat);assert.equal(paid?.dropoffLng,from?reviewed.lng:airport.lng);
      if(minimum===45&&mode&&target===40)results.push({airport:airport.code,direction:route.direction,vehicle:vehicle===SALOON_VEHICLE?"Saloon":"Estate",return:returning,miles:Number((route.distanceMetres/1000*0.621371).toFixed(5)),vehicleFare:quote.journeyFareGbp,fixed:quote.airportFixedCostsGbp,access:access.airportAccessChargeGbp,total});
      checks++;
    }
    assert.equal(checks,192);assert.ok(routeCalls>0);
    console.log(JSON.stringify(results,null,2));
    console.log(`PASS ${checks} signed browser-quote → SumUp → finalized booking cases across three airports, both directions, vehicles, return types, pricing modes, analysis targets and changed fractional minimum/supplement settings; passenger routing only; no external writes.`);
  } finally {globalThis.fetch=originalFetch;Date.now=originalNow;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
