import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildQuoteAirportBenefits } from "../src/components/QuoteAirportBenefits";
import QuoteAirportBenefits from "../src/components/QuoteAirportBenefits";
import QuoteResultShowcase from "../src/components/QuoteResultShowcase";
import { resolveJourneyAirportFees } from "../shared/airport-fixed-costs";
import { resolveExpressDropOff } from "../shared/express-drop-off";

// The app uses Next's automatic JSX runtime; tsx uses classic JSX with jsx:preserve.
Object.assign(globalThis, { React });

function fixture(pickup: string | null, dropoff: string | null, returnJourney = false) {
  const airportToAirport = Boolean(pickup && dropoff);
  const code = pickup || dropoff;
  return {
    pickupAirportCode: pickup,
    dropoffAirportCode: dropoff,
    returnJourney,
    airportFees: resolveJourneyAirportFees({
      isAirportToAirport: airportToAirport,
      pickupAirportCode: pickup,
      dropoffAirportCode: dropoff,
      airportCode: code,
      fromAirport: Boolean(pickup),
      returnJourney,
    }),
    expressSelection: resolveExpressDropOff({ airportCode: code, fromAirport: Boolean(pickup), returnJourney, selected: true }),
  };
}

for (const code of ["BFS", "BHD", "DUB"]) {
  for (const pickup of [true, false]) {
    for (const returning of [false, true]) {
      const props = fixture(pickup ? code : null, pickup ? null : code, returning);
      const before = JSON.stringify(props);
      const benefits = buildQuoteAirportBenefits(props);
      assert.equal(benefits.length, returning ? 2 : 1);
      assert.match(benefits[0].heading, pickup ? /Pickup|Collection/ : /Drop-Off/);
      if (returning) assert.match(benefits[1].heading, pickup ? /Drop-Off/ : /Pickup|Collection/);
      if (code !== "DUB") assert.match(benefits[0].heading, /Terminal .* Included/);
      else {
        assert.doesNotMatch(benefits[0].description, /closest|close to/);
        assert.match(benefits[0].description, pickup ? /pickup\/parking charges included/ : /No airport drop-off charge/);
      }
      assert.equal(JSON.stringify(props), before, "Rendering must not mutate fare data");
      console.log(`OK ${code} ${pickup ? "pickup" : "drop-off"}${returning ? " return" : ""}`);
    }
  }
}
for (const pickup of ["BFS", "BHD", "DUB"]) {
  for (const dropoff of ["BFS", "BHD", "DUB"].filter((code) => code !== pickup)) {
    for (const returning of [false, true]) {
      const benefits = buildQuoteAirportBenefits(fixture(pickup, dropoff, returning));
      assert.equal(benefits.length, returning ? 4 : 2);
      assert.match(benefits[0].heading, /Pickup/);
      assert.match(benefits[1].heading, /Drop-Off/);
    }
  }
}
assert.deepEqual(buildQuoteAirportBenefits(fixture(null, null)), []);
const noFee = fixture("BFS", null);
noFee.expressSelection = resolveExpressDropOff({ airportCode: "BFS", fromAirport: true, selected: false });
assert.doesNotMatch(buildQuoteAirportBenefits(noFee)[0].heading, /Included|Terminal/);
assert.doesNotMatch(buildQuoteAirportBenefits(noFee)[0].description, /charges included|close to/);

const renderCard = (unavailable = false) => renderToStaticMarkup(
  <QuoteResultShowcase
    vehicleType="Saloon" passengers={2} suitcases={2} priceLabel="Fixed price" formattedPrice="£54"
    priceUnavailable={unavailable}
    airportAccess={<QuoteAirportBenefits {...fixture("BFS", null)} />}
    bookButton={<button type="button" data-test-book>BOOK THIS TRANSFER</button>}
  />,
);
const html = renderCard();
assert.ok(html.indexOf("£54") < html.indexOf("Terminal Pickup Included"));
assert.ok(html.indexOf("Terminal Pickup Included") < html.indexOf("BOOK THIS TRANSFER"));
assert.ok(html.indexOf("BOOK THIS TRANSFER") < html.indexOf("Fixed price. No surprises."));
assert.doesNotMatch(renderCard(true), /Terminal Pickup Included/);
console.log("OK airport-to-airport, non-airport, unpaid-access fallback, card order and unavailable-fare checks");
