/** BFS-only minimum/configuration tests; in-memory storage, no external writes. */
import assert from "node:assert/strict";
import { applyBfsMinimumFare, bfsMinimumHasPence } from "../shared/bfs-minimum-fare";
import { defaultOwnerPricingSettings, toPublicOwnerPricingConfig, validateOwnerPricingInput } from "../shared/owner-pricing-config";
import { calculateQuote, calculateAirportToAirportQuote, calculatePointToPointQuote } from "../src/lib/quote";
import { SALOON_VEHICLE, ESTATE_VEHICLE } from "../src/lib/vehicle-selection";
import { composeWebsiteFareBreakdown } from "../shared/website-fare-breakdown";
import { resolveExpressDropOff } from "../shared/express-drop-off";
import { quoteAirportAccessCharges } from "../shared/meet-greet";
import { SERVED_AIRPORTS, matchServedAirportCode } from "../shared/served-airports";
import { resolveSumUpChargeAmountGbp } from "../shared/open-website-payment-fares";
import { handleOwnerPricingRequest } from "../workers/addresses/src/owner-pricing-handlers";
import { getOwnerPricingSettings, listOwnerPricingAudit } from "../workers/addresses/src/owner-pricing-store";
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
      const access = quoteAirportAccessCharges({ airportCode: "BFS", fromAirport, returnJourney: false, expressLegs: express.legs, fees: settings.meetGreet });
      eq(access.airportAccessChargeGbp, 5, "pickup/dropoff access separate and once");
      const total = composeWebsiteFareBreakdown({ journeyFareBeforeAirportAccessGbp: quote.journeyFareGbp!, airportAccessChargeGbp: access.airportAccessChargeGbp }).finalAmountPayableGbp;
      eq(total, expected + (vehicle === ESTATE_VEHICLE ? 7 : 0) + 5, "payable excludes access from floor");
      eq(resolveSumUpChargeAmountGbp(total,total),total,"payment amount parity");
    }
  }
  for (const fromAirport of [false, true]) {
    const quote = calculateQuote("12 Holywood Road, Belfast BT4 1NT", "BFS", SALOON_VEHICLE, true, schedule, metrics(30), fromAirport, settings)!;
    eq(quote.journeyFareGbp,85.5,"return floor per leg before 5% discount");
    const access = quoteAirportAccessCharges({ airportCode:"BFS", fromAirport, returnJourney:true, expressLegs:resolveExpressDropOff({airportCode:"BFS",fromAirport,returnJourney:true,selected:true,outboundSelected:true,returnSelected:true}).legs });
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

  for (const alias of ["BFS", "Belfast International Airport", "Aldergrove Airport"]) eq(matchServedAirportCode(alias), "BFS", "existing BFS aliases qualify");
  console.log(`PASS ${checks} BFS minimum, other-airport invariance, Estate, return, fees and admin persistence checks.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
