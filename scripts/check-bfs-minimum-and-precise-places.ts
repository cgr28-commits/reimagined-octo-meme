import { fetchWorkerAddressDetails } from "../src/lib/addresses-api";
import { applyProfitabilityProtection, measureOperationalJob } from "../workers/addresses/src/profitability";
import { approvedProductionProfitabilitySettings } from "../src/lib/owner-profitability-settings";
import worker from "../workers/addresses/src/index";
import { savePaidBookingRecordFromConfirm } from "../workers/addresses/src/refund-handlers";
import { getPaidBookingRecord } from "../workers/addresses/src/paid-booking-store";
import { OPERATING_BASE } from "../workers/addresses/src/operating-base";
import { getPendingCheckout } from "../workers/addresses/src/pending-checkout-store";
/** Isolated regressions: no live settings, bookings, payments or emails. */
import assert from "node:assert/strict";
import { applyBfsMinimumFare, bfsMinimumHasPence } from "../shared/bfs-minimum-fare";
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig, validateOwnerPricingInput } from "../shared/owner-pricing-config";
import { calculateQuote, calculateAirportToAirportQuote, calculatePointToPointQuote } from "../src/lib/quote";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { resolveExpressDropOff } from "../shared/express-drop-off";
import { quoteAirportAccessCharges } from "../shared/meet-greet";
import { isPreciseQuotePlace } from "../shared/precise-quote-place";
import { resolveGooglePlaceDetails } from "../shared/google-places";
import { SERVED_AIRPORTS } from "../shared/served-airports";
import { resolvePaymentAirportContextFromAddresses, resolveSumUpChargeAmountGbp } from "../shared/open-website-payment-fares";
import { resolvePreciseQuoteRoute, resolvePreciseQuoteLocation } from "../workers/addresses/src/precise-quote-locations";
import { handleQuoteCalculateRequest } from "../workers/addresses/src/quote-handlers";
import { handleOwnerPricingRequest } from "../workers/addresses/src/owner-pricing-handlers";
import { getOwnerPricingSettings, listOwnerPricingAudit } from "../workers/addresses/src/owner-pricing-store";
import { isQuoteReadyPlace, selectedPlaceFromParts, detectAirportCodeFromPlace } from "../src/lib/selected-place";
import { buildAuthoritativeSavedQuotePricing } from "../workers/addresses/src/saved-quote-handlers";
import { handleOwnerCreateQuickQuote } from "../workers/addresses/src/quick-quote-handlers";

async function main() {
  let checks = 0;
  const eq = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
  const settings = defaultOwnerPricingSettings();
  settings.saloonFormula = { enabled: true, startingChargeGbp: 10, ratePerMileGbp: 2.5, minimumFareGbp: 30 };
  settings.estate.upliftGbp = 7;
  settings.night.enabled = false; settings.weekend.enabled = false;
  const schedule = { outboundDate: "2026-11-10", outboundTime: "12:00", returnDate: "2026-11-17", returnTime: "12:00" };
  const metrics = (fare: number) => ({ distanceKm: Math.max(0, (fare - 10) / 2.5) / 0.621371, durationMinutes: 30 });
  const bfs = SERVED_AIRPORTS.find(a => a.code === "BFS")!;
  const bhd = SERVED_AIRPORTS.find(a => a.code === "BHD")!;
  for (const fromAirport of [false, true]) for (const [input, expected] of [[30,45],[40,45],[44.99,45],[45,45],[55,55],[67,67]]) {
    eq(applyBfsMinimumFare(input, SALOON_VEHICLE, [fromAirport ? "BFS" : null, fromAirport ? null : "BFS"], settings), expected, "exact minimum boundary");
    for (const vehicle of [SALOON_VEHICLE, ESTATE_VEHICLE]) {
      const quote = calculateQuote("12 Holywood Road, Belfast BT4 1NT", "BFS", vehicle, false, schedule, metrics(input), fromAirport, settings)!;
      eq(quote.journeyFareGbp, expected + (vehicle === ESTATE_VEHICLE ? 7 : 0), "shared quote engine floor");
      const publicQuote = calculateQuote("12 Holywood Road, Belfast BT4 1NT", "BFS", vehicle, false, schedule, metrics(input), fromAirport, toPublicOwnerPricingConfig(settings))!;
      eq(publicQuote.amount, quote.amount, "public/worker settings parity");
      const express = resolveExpressDropOff({ airportCode: "BFS", fromAirport, returnJourney: false, selected: true });
      const access = quoteAirportAccessCharges({ outboundChoice: "express", airportCode: "BFS", fromAirport, returnJourney: false, expressLegs: express.legs, fees: settings.meetGreet });
      eq(access.airportAccessChargeGbp, 5, "pickup/dropoff access separate and once");
      const total = composeWebsiteFareBreakdown({ journeyFareBeforeAirportAccessGbp: quote.journeyFareGbp!, airportAccessChargeGbp: access.airportAccessChargeGbp }).finalAmountPayableGbp;
      eq(total, expected + (vehicle === ESTATE_VEHICLE ? 7 : 0) + 5, "payable excludes access from floor");
      eq(resolveSumUpChargeAmountGbp(total,total),total,"payment amount parity");
    }
  }
  for (const fromAirport of [false, true]) {
    const quote = calculateQuote("12 Holywood Road, Belfast BT4 1NT", "BFS", SALOON_VEHICLE, true, schedule, metrics(30), fromAirport, settings)!;
    eq(quote.journeyFareGbp,85.5,"return floor per leg before 5% discount");
    const access = quoteAirportAccessCharges({ outboundChoice:"express", returnChoice:"express", airportCode:"BFS", fromAirport, returnJourney:true, expressLegs:resolveExpressDropOff({airportCode:"BFS",fromAirport,returnJourney:true,selected:true,outboundSelected:true,returnSelected:true}).legs });
    eq(access.airportAccessChargeGbp,10,"two directional return fees");
    const final = composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:85.5,returnJourney:true,airportAccessChargeGbp:10});
    eq(final.returnJourneySavingGbp,4.5,"access not discounted"); eq(final.finalAmountPayableGbp,96,"existing whole-pound checkout rounding");
  }
  const fractional = {...settings,bfsMinimumSaloonFareGbp:45.25,estate:{upliftGbp:9.35}};
  eq(applyBfsMinimumFare(30,ESTATE_VEHICLE,["BFS"],fractional),54.6,"configured supplement after fractional floor");
  const fractionalTotal = composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:45.25,airportAccessChargeGbp:5,preserveFixedFarePence:bfsMinimumHasPence(SALOON_VEHICLE,["BFS"],fractional,[30])}).finalAmountPayableGbp;
  eq(fractionalTotal,50.25,"do not round configured floor down"); eq(resolveSumUpChargeAmountGbp(50.25,50.25,0.02,true),50.25,"fractional payment parity");
  for(const fromAirport of [false,true]) for(const returning of [false,true]) for(const vehicle of [SALOON_VEHICLE,ESTATE_VEHICLE]) {
    const total=(floor:number,normalSaloon:number)=>{
      const q=calculateQuote("12 Holywood Road, Belfast BT4 1NT","BFS",vehicle,returning,schedule,metrics(normalSaloon),fromAirport,{...settings,bfsMinimumSaloonFareGbp:floor})!;
      return composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:q.journeyFareGbp!,airportAccessChargeGbp:returning?10:5,returnJourney:returning,preserveFixedFarePence:q.preserveBfsMinimumPence}).finalAmountPayableGbp;
    };
    eq(total(45.25,55),total(45,55),"unused fractional minimum never changes higher-fare rounding");
    const q=calculateQuote("12 Holywood Road, Belfast BT4 1NT","BFS",vehicle,returning,schedule,metrics(30),fromAirport,{...settings,bfsMinimumSaloonFareGbp:45.25})!;
    eq(q.preserveBfsMinimumPence,true,"binding fractional minimum survives premiums/discount composition");
  }
  for (const code of ["BHD","DUB",null]) eq(applyBfsMinimumFare(30,SALOON_VEHICLE,[code],settings),30,"no minimum at other airports");
  for (const vehicle of ["Executive Saloon (1–4 passengers)","Minibus (5–7 passengers)"]) eq(applyBfsMinimumFare(30,vehicle,["BFS"],settings),30,"other vehicle policies unchanged");
  eq(calculateAirportToAirportQuote("BFS","BHD",bfs.formattedAddress,bhd.formattedAddress,SALOON_VEHICLE,false,schedule,metrics(30),settings)!.journeyFareGbp,45,"canonical A2A BFS floor");

  // Vary only the BFS setting: no side effects for another airport or an ordinary journey.
  const highBfsMinimum = { ...settings, bfsMinimumSaloonFareGbp: 500.25 };
  for (const fromAirport of [false, true]) for (const returning of [false, true]) for (const vehicle of [SALOON_VEHICLE, ESTATE_VEHICLE]) {
    for (const code of ["BHD", "DUB", "LDY"]) {
      const address = "12 Holywood Road, Belfast BT4 1NT";
      const quote = (pricing: typeof settings) => calculateQuote(address, code, vehicle, returning, schedule, metrics(30), fromAirport, pricing);
      assert.ok(quote(settings), `${code} fixture must produce a quote`);
      eq(quote(highBfsMinimum), quote(settings), `${code} ignores changes to the BFS minimum`);
    }
    const ordinary = (pricing: typeof settings) => calculatePointToPointQuote("12 Holywood Road, Belfast BT4 1NT", "10 High Street, Bangor BT20 5AY", vehicle, returning, schedule, metrics(30), null, undefined, pricing);
    assert.ok(ordinary(settings));
    eq(ordinary(highBfsMinimum), ordinary(settings), "ordinary journey ignores BFS minimum changes");
  }
  // BFS at either end still qualifies when the other end is another airport,
  // including the special Dublin routing branch. Fees stay separate.
  for (const otherCode of ["BHD", "DUB"]) for (const fromBfs of [false, true]) for (const returning of [false, true]) for (const vehicle of [SALOON_VEHICLE, ESTATE_VEHICLE]) {
    const other = SERVED_AIRPORTS.find(airport => airport.code === otherCode)!;
    const quote = (pricing: typeof settings) => calculateAirportToAirportQuote(fromBfs ? "BFS" : otherCode, fromBfs ? otherCode : "BFS", fromBfs ? bfs.formattedAddress : other.formattedAddress, fromBfs ? other.formattedAddress : bfs.formattedAddress, vehicle, returning, schedule, metrics(30), pricing)!;
    const raised = quote(highBfsMinimum);
    const expectedBase = 500.25 + (vehicle === ESTATE_VEHICLE ? settings.estate.upliftGbp : 0);
    const expectedJourney = Math.round(expectedBase * (returning ? 2 * (1 - settings.returnDiscount.rate) : 1) * 100) / 100;
    eq(raised.journeyFareGbp, expectedJourney, "BFS airport-to-airport floor and return discount");
    eq(raised.airportFixedCostsGbp, quote(settings).airportFixedCostsGbp, "BFS minimum leaves airport-to-airport fees unchanged");
  }

  const store = new Map<string,string>();
  const kv = {async get(k:string,t?:string){const v=store.get(k);return v==null?null:t==="json"?JSON.parse(v):v;},async put(k:string,v:string){store.set(k,v);},async list(){return {keys:[],list_complete:true};}} as unknown as KVNamespace;
  const env={TRACKING_STORE:kv,OWNER_ACCESS_KEY:"isolated-owner",GOOGLE_PLACES_API_KEY:"mock-key"};
  const origin="https://www.myairporttaxini.co.uk";
  const save = (value:unknown) => handleOwnerPricingRequest(new Request(origin+"/owner/pricing",{method:"POST",headers:{"X-Owner-Key":"isolated-owner","Content-Type":"application/json"},body:JSON.stringify({settings:value,expectedVersion:(value as {version:number}).version,postcodeRulesEditorVersion:2})}),env,origin);
  eq((await getOwnerPricingSettings(kv)).bfsMinimumSaloonFareGbp,45,"legacy/default setting");
  eq((await save({...settings,bfsMinimumSaloonFareGbp:47.25})).status,200,"admin save");
  const saved = await getOwnerPricingSettings(kv);
  eq(saved.bfsMinimumSaloonFareGbp,47.25,"admin persistence");eq(toPublicOwnerPricingConfig(saved).bfsMinimumSaloonFareGbp,47.25,"public config");
  eq((await listOwnerPricingAudit(kv))[0].changes.some(c=>c.setting.includes("Minimum Saloon Fare")),true,"audit change");
  const legacy={...saved}; delete legacy.bfsMinimumSaloonFareGbp;eq((await save(legacy)).status,200,"old admin save");
  eq((await getOwnerPricingSettings(kv)).bfsMinimumSaloonFareGbp,47.25,"old clients retain custom minimum");
  for (const bad of ["",null,-1,1001,45.001,NaN,Infinity]) eq(validateOwnerPricingInput({...settings,bfsMinimumSaloonFareGbp:bad}).ok,false,"invalid settings rejected");

  const numbered = {placeId:"test-home",formattedAddress:"12 Holywood Road, Belfast BT4 1NT, UK",displayAddress:"12 Holywood Road, Belfast BT4 1NT, UK",lat:54.6063,lng:-5.8711,streetNumber:"12",route:"Holywood Road",types:["street_address"],provider:"google"};
  eq(isPreciseQuotePlace(numbered),true,"numbered address");
  for (const types of [["route"],["locality","political"],["postal_code"],["postal_code_prefix"],["intersection"],["park","point_of_interest"],[]]) eq(isPreciseQuotePlace({...numbered,placeName:"12 Holywood Road",types}),false,"ambiguous structured types rejected");
  eq(isPreciseQuotePlace({...numbered,streetNumber:null}),false,"text cannot fabricate street number");
  eq(isPreciseQuotePlace({...numbered,lat:NaN}),false,"invalid coordinates rejected");
  eq(isPreciseQuotePlace({...numbered,provider:"ideal"}),false,"new quotes require Google");
  for (const types of [["premise"],["subpremise"],["lodging","establishment","point_of_interest"],["restaurant","establishment"]]) eq(isPreciseQuotePlace({...numbered,streetNumber:null,placeName:"Individual venue",types}),true,"named premises need no house number");
  for (const a of SERVED_AIRPORTS) eq(isPreciseQuotePlace({...a,placeId:a.placeId,formattedAddress:a.formattedAddress}),true,"predefined airport accepted");
  eq(detectAirportCodeFromPlace(selectedPlaceFromParts({...numbered,placeName:"Belfast International Airport Hotel",types:["lodging","establishment"]})),null,"hotel not canonical airport");
  eq(isQuoteReadyPlace(selectedPlaceFromParts(numbered)),true,"structured evidence retained");
  const ctx=resolvePaymentAirportContextFromAddresses("Belfast International Airport Hotel",bhd.formattedAddress,{pickupPlaceId:"test-hotel",dropoffPlaceId:bhd.placeId});
  assert.ok(ctx.ok);eq(ctx.context.airportCode,"BHD","BFS text cannot trigger floor");

  const originalFetch=globalThis.fetch;let routes=0;const routeUrls:string[]=[];const checkoutAmounts:number[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
    if(url.pathname.endsWith("/addresses")) return Response.json({...numbered,address:numbered.formattedAddress,countryCode:"GB"});
    if(url.hostname==="api.sumup.com" && init?.method==="POST") {
      const body=JSON.parse(String(init.body));checkoutAmounts.push(body.amount);
      return Response.json({id:`test-checkout-${checkoutAmounts.length}`,checkout_reference:body.checkout_reference,hosted_checkout_url:"https://checkout.sumup.com/isolated-test",status:"PENDING",amount:body.amount},{status:201});
    }
    if(url.hostname==="api.resend.com"||url.hostname==="api.mailchannels.net") return Response.json({id:"mock-email"});
    if(url.hostname==="places.googleapis.com") {
      const id=url.pathname.split("/").pop();const road=id==="test-road";
      const business=id==="test-hotel";
      const body={id,formattedAddress:road?"Holywood Road, Belfast, UK":numbered.formattedAddress,displayName:{text:business?"Individual Hotel":road?"Holywood Road":"12 Holywood Road"},types:road?["route"]:business?["lodging","establishment","point_of_interest"]:["street_address"],location:{latitude:numbered.lat,longitude:numbered.lng},addressComponents:[{longText:"Holywood Road",types:["route"]},...(!road&&!business?[{longText:"12",types:["street_number"]}]:[]),{longText:"Belfast",types:["locality"]},{longText:"BT4 1NT",types:["postal_code"]},{longText:"United Kingdom",shortText:"GB",types:["country"]}]};
      assert.match(new Headers(init?.headers).get("X-Goog-FieldMask")??"",/types/);
      return Response.json(body);
    }
    if(url.pathname.includes("/route/v1/driving/")){routes++;routeUrls.push(decodeURIComponent(url.pathname));return Response.json({code:"Ok",routes:[{distance:5000,duration:600}]});}
    throw Error("Unexpected network call: "+url.origin+url.pathname);
  };
  try {
    eq(isPreciseQuotePlace(await fetchWorkerAddressDetails("test-home","BFS")),true,"browser API adapter retains structured Google evidence");
    eq(await resolveGooglePlaceDetails("mock-key","test-road","BFS",undefined,"12 Holywood Road","12 Holywood Road"),null,"typed number cannot repair road result");
    eq(isPreciseQuotePlace(await resolveGooglePlaceDetails("mock-key","test-home","BFS")),true,"real Details response full address");
    eq(isPreciseQuotePlace(await resolveGooglePlaceDetails("mock-key","test-hotel","BFS")),true,"real Details response business");
    eq(await resolvePreciseQuoteLocation({address:"99 Holywood Road, Belfast",placeId:"test-home",googlePlacesApiKey:"mock-key"}),null,"stale selection label rejected");
    const before=routes;
    const invalid=await resolvePreciseQuoteRoute({pickupAddress:"Holywood Road, Belfast, UK",pickupPlaceId:"test-road",dropoffAddress:bfs.formattedAddress,dropoffPlaceId:bfs.placeId,googlePlacesApiKey:"mock-key"});
    eq(invalid.ok,false,"server rejects vague road");eq(routes,before,"invalid locations never routed");
    for(const fromAirport of [false,true]) {
      const payload={pickupAddress:fromAirport?bfs.formattedAddress:numbered.formattedAddress,dropoffAddress:fromAirport?numbered.formattedAddress:bfs.formattedAddress,pickupPlaceId:fromAirport?bfs.placeId:numbered.placeId,dropoffPlaceId:fromAirport?numbered.placeId:bfs.placeId,pickupLat:0,pickupLng:0,dropoffLat:0,dropoffLng:0,routeMetrics:{distanceKm:1,durationMinutes:1},returnJourney:false,passengers:1,suitcases:1,...schedule,airportCode:"BHD"};
      const response=await handleQuoteCalculateRequest(new Request(origin+"/quote/calculate",{method:"POST",body:JSON.stringify(payload)}),origin,env);
      const result=await response.json() as {ok:boolean;amount:number;diagnostics:{distanceKm:number}};
      eq(response.status,200,"quote endpoint accepts verified place");eq(result.amount,47.25,"quote reads changed BFS setting despite spoofed airport");eq(result.diagnostics.distanceKm,5,"server ignores client metrics");
    }
    eq(routeUrls.some(url=>url.includes(`/${bfs.lng},${bfs.lat};`)),true,"airport pickup uses verified Express road point");
    eq(routeUrls.some(url=>url.endsWith(`;${bfs.lng},${bfs.lat}`)),true,"airport dropoff uses same verified Express road point");
    eq([bfs.lat,bfs.lng],[54.6627299,-6.2173267],"verified BFS terminal loop");
    const savedQuote=await buildAuthoritativeSavedQuotePricing({journey:{pickupLabel:numbered.formattedAddress,dropoffLabel:bfs.formattedAddress,pickupPlaceId:numbered.placeId,dropoffPlaceId:bfs.placeId,tripDate:schedule.outboundDate,tripTime:schedule.outboundTime,returnJourney:false,passengers:1,suitcases:1,vehicle:SALOON_VEHICLE,tripLabel:"Airport drop-off"},pricing:await getOwnerPricingSettings(kv),googlePlacesApiKey:"mock-key"});
    assert.ok(savedQuote.ok);eq(savedQuote.quote.amount,47.25,"saved quote uses canonical BFS and strict details");
    const a2aSaved=await buildAuthoritativeSavedQuotePricing({journey:{pickupLabel:bfs.formattedAddress,dropoffLabel:bhd.formattedAddress,pickupPlaceId:bfs.placeId,dropoffPlaceId:bhd.placeId,tripDate:schedule.outboundDate,tripTime:schedule.outboundTime,returnJourney:false,passengers:1,suitcases:1,vehicle:SALOON_VEHICLE,tripLabel:"Airport transfer"},pricing:await getOwnerPricingSettings(kv),googlePlacesApiKey:"mock-key"});
    assert.ok(a2aSaved.ok);eq(a2aSaved.quote.journeyFareGbp,47.25,"saved airport-to-airport quote applies BFS floor");
    const protectedResult=await applyProfitabilityProtection({
      pricing:{...settings,saloonFormula:{...settings.saloonFormula!,enabled:false},profitability:approvedProductionProfitabilitySettings()},
      vehicleType:SALOON_VEHICLE,routeMetrics:{distanceKm:5,durationMinutes:10},pickup:{lat:numbered.lat,lng:numbered.lng},dropoff:{lat:bfs.lat,lng:bfs.lng},returnJourney:false,bfsAirportJourney:true,schedule:{},
      existing:{amountGbp:45,journeyFareGbp:45,airportFixedCostsGbp:0,nightWeekendSurchargeGbp:0},
    });
    eq(protectedResult.applied,false,"legacy mode never reprices from earnings targets");
    eq(protectedResult.journeyFareGbp,45,"tariff snapshot retained");
    await measureOperationalJob({pickup:numbered,dropoff:bfs,passenger:{distanceKm:5,durationMinutes:10}});
    eq(routeUrls.some(url=>url.includes(`/${OPERATING_BASE.lng},${OPERATING_BASE.lat};`)),true,"positioning starts at configured operating base");
    eq(routeUrls.some(url=>url.endsWith(`;${OPERATING_BASE.lng},${OPERATING_BASE.lat}`)),true,"return routing ends at same operating base");
    const postcodePricing={...settings,saloonFormula:{...settings.saloonFormula!,enabled:false},postcodePricingEnabled:true,postcodeRules:[{district:"BT4",airportCode:"BFS" as const,saloonFareGbp:40,enabled:true,approvalStatus:"approved" as const,direction:"both" as const}]};
    eq(calculateQuote(numbered.formattedAddress,"BFS",SALOON_VEHICLE,false,schedule,{distanceKm:5,durationMinutes:10},false,postcodePricing)!.journeyFareGbp,45,"postcode vehicle fare also meets BFS minimum");
    const payEnv={...env,SUMUP_API_KEY:"mock-sumup",SUMUP_MERCHANT_CODE:"mock-merchant",PUBLIC_SITE_ORIGIN:origin};
    for (const fromAirport of [false,true]) for(const returning of [false,true]) for(const vehicle of [SALOON_VEHICLE,ESTATE_VEHICLE]) {
      const p=await getOwnerPricingSettings(kv);
      const q=calculateQuote(numbered.formattedAddress,"BFS",vehicle,returning,schedule,{distanceKm:5,durationMinutes:10},fromAirport,p)!;
      const total=composeWebsiteFareBreakdown({journeyFareBeforeAirportAccessGbp:q.journeyFareGbp!,airportAccessChargeGbp:returning?10:5,returnJourney:returning,preserveFixedFarePence:true}).finalAmountPayableGbp;
      const booking={outboundAirportAccessOption:"express",returnAirportAccessOption:"express",customerName:"Isolated Test",customerEmail:"test@example.invalid",mobileNumber:"07700900123",pickupLabel:fromAirport?bfs.formattedAddress:numbered.formattedAddress,dropoffLabel:fromAirport?numbered.formattedAddress:bfs.formattedAddress,tripLabel:fromAirport?"Airport pickup":"Airport drop-off",tripDate:schedule.outboundDate,tripTime:schedule.outboundTime,returnDate:schedule.returnDate,returnTime:schedule.returnTime,returnJourney:returning,passengers:1,suitcases:1,vehicle,isAirportTrip:true,isFromAirport:fromAirport,airportCode:"BFS",flightNumber:"BA1234",returnFlightNumber:"BA1234",termsAcceptedAt:new Date().toISOString()};
      const payload={booking,pickupPlaceId:fromAirport?bfs.placeId:numbered.placeId,dropoffPlaceId:fromAirport?numbered.placeId:bfs.placeId,amount:q.amount,acceptedFinalAmountGbp:total,journeyFareGbp:q.journeyFareGbp,airportFixedCostsGbp:0,description:"Isolated test",redirectUrl:origin+"/booking-confirmed/"};
      const pay=(body:unknown)=>worker.fetch(new Request("https://worker.example/payments",{method:"POST",headers:{"Content-Type":"application/json",Origin:origin},body:JSON.stringify(body)}),payEnv as never);
      const result=await pay(payload);const data=await result.json() as {checkoutId:string};
      eq(result.status,200,"mocked checkout: "+JSON.stringify(data));eq(checkoutAmounts.at(-1),total,"SumUp receives exact authoritative fare");
      const pending=await getPendingCheckout(kv,data.checkoutId);
      eq(pending?.booking.pickupPlaceId,payload.pickupPlaceId,"persist verified pickup ID");
      eq(pending?.booking.dropoffPlaceId,payload.dropoffPlaceId,"persist verified destination ID");
      eq(pending?.booking.pickupLat,fromAirport?bfs.lat:numbered.lat,"persist authoritative coordinates");
      assert.ok(pending);
      const paymentReference=`isolated-${data.checkoutId}`;
      const storedBeforeFinalization = new Map(store);
      await savePaidBookingRecordFromConfirm({env:payEnv,booking:pending.booking,checkoutId:data.checkoutId,amount:total,currency:"GBP",amountPaidLabel:`£${total.toFixed(2)}`,paymentReference,calendarEventIds:[]});
      const paid=await getPaidBookingRecord(kv,paymentReference);
      eq(paid?.amount,total,"finalized booking retains the checkout amount");
      for(const key of ["pickupPlaceId","dropoffPlaceId","pickupLat","pickupLng","dropoffLat","dropoffLng"] as const) eq(paid?.[key],pending.booking[key],`finalized booking retains validated ${key}`);
      store.clear(); for(const [key,value] of storedBeforeFinalization) store.set(key,value); // isolate each fictional checkout from availability
      const count=checkoutAmounts.length;
      eq((await pay({...payload,acceptedFinalAmountGbp:1})).status,409,"tampered amount rejected");
      eq((await pay({...payload,pickupPlaceId:fromAirport?bfs.placeId:"test-road",dropoffPlaceId:fromAirport?"test-road":bfs.placeId,booking:{...booking,pickupLabel:fromAirport?bfs.formattedAddress:"Holywood Road, Belfast, UK",dropoffLabel:fromAirport?"Holywood Road, Belfast, UK":bfs.formattedAddress}})).status,409,"vague payment selection rejected");
      eq(checkoutAmounts.length,count,"rejected payment never reaches SumUp");
    }
    const rejected = await handleOwnerCreateQuickQuote(new Request(origin+"/owner/quick-quotes",{method:"POST",headers:{"X-Owner-Key":"isolated-owner"},body:JSON.stringify({pickupAddress:"Holywood Road, Belfast, UK",dropoffAddress:bfs.formattedAddress,pickupPlaceId:"test-road",dropoffPlaceId:bfs.placeId,returnJourney:false,passengers:1,suitcases:1,...schedule,vehicleChoice:"Saloon",routeMetrics:{distanceKm:5,durationMinutes:10}})}),env,origin);
    eq(rejected.status,422,"automatic owner quote cannot bypass precision with client route");
  } finally {globalThis.fetch=originalFetch;}
  console.log(`PASS ${checks} minimum, settings, address, route and quote/booking regressions; mocked network only.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
