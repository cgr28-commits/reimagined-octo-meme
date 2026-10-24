import assert from "node:assert/strict";
import baseline from "./fixtures/main-release-vehicle-fares.json";
import {defaultOwnerPricingSettings} from "../shared/owner-pricing-config";
import {calculateQuote} from "../src/lib/quote";
import {SALOON_VEHICLE,ESTATE_VEHICLE} from "../src/lib/vehicle-selection";
const rows=[];
for(const formula of [false,true]) for(const uplift of [7,9.35]) for(const airport of ["BFS","BHD","DUB"] as const) for(const from of [false,true]) for(const returning of [false,true]) for(const vehicle of [SALOON_VEHICLE,ESTATE_VEHICLE]) for(const miles of [2,20,100]) for(const [date,time] of [["2026-11-10","12:00"],["2026-11-10","23:00"],["2026-11-14","12:00"],["2026-12-25","12:00"]]) {
 const settings=defaultOwnerPricingSettings();settings.saloonFormula={enabled:formula,startingChargeGbp:10,ratePerMileGbp:2.5,minimumFareGbp:35};settings.estate.upliftGbp=uplift;settings.bfsMinimumSaloonFareGbp=45;
 const quote=calculateQuote("Belfast City Hall, Belfast BT1 5GS",airport,vehicle,returning,{outboundDate:date,outboundTime:time,returnDate:"2026-12-28",returnTime:"12:00"},{distanceKm:miles/0.621371,durationMinutes:miles*2},from,settings);
 rows.push({formula,uplift,airport,from,returning,vehicle,miles,date,time,vehicleFare:quote?.journeyFareGbp,airportFixedCosts:airport==="DUB"?quote?.airportFixedCostsGbp:undefined});
}
assert.deepEqual(JSON.parse(JSON.stringify(rows)), baseline, "Vehicle fares must match main 2c6bfb59 across airports, directions, vehicles and date bands");
console.log(`PASS ${rows.length} unchanged-main vehicle fare comparisons`);
