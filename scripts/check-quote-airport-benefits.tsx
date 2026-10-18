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
      const waitingHtml = renderToStaticMarkup(<QuoteAirportBenefits {...props} />);
      assert.equal((waitingHtml.match(/data-airport-waiting-included/g) || []).length, pickup || returning ? 1 : 0);
      const benefits = buildQuoteAirportBenefits(props);
      assert.equal(benefits.length, returning ? 2 : 1);
      assert.match(benefits[0].heading, pickup ? /pick-up|Collection/ : /drop-off/);
      if (returning) assert.match(benefits[1].heading, pickup ? /drop-off/ : /pick-up|Collection/);
      if (code !== "DUB") assert.match(benefits[0].heading, /Terminal .* included/);
      else {
        assert.doesNotMatch(benefits[0].description, /closest|close to/);
        assert.match(benefits[0].heading, /Terminal .* included/);
        assert.match(benefits[0].description, pickup ? /No additional airport pick-up fee/ : /No additional airport drop-off fee/);
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
      assert.match(benefits[0].heading, /pick-up/);
      assert.match(benefits[1].heading, /drop-off/);
    }
  }
}
assert.deepEqual(buildQuoteAirportBenefits(fixture(null, null)), []);
const noFee = fixture("BFS", null);
noFee.expressSelection = resolveExpressDropOff({ airportCode: "BFS", fromAirport: true, selected: false });
assert.doesNotMatch(buildQuoteAirportBenefits(noFee)[0].heading, /included|Terminal/);
assert.doesNotMatch(buildQuoteAirportBenefits(noFee)[0].description, /charges included|close to/);

// Ignore inert sizing references when checking customer-visible claims and order.
// Balance nested divs so removing a reference never removes the live card content.
function visibleCardMarkup(html: string) {
  let depth = 0;
  return html.replace(/<\/?div\b[^>]*>|[^<]+|<[^>]*>/g, (token) => {
    if (depth) {
      if (/^<div\b/.test(token)) depth++;
      if (/^<\/div>/.test(token)) depth--;
      return "";
    }
    if (/^<div\b/.test(token) && token.includes("data-quote-layout-reference")) {
      assert.match(token, /aria-hidden="true"/);
      assert.match(token, /inert=""/);
      depth = 1;
      return "";
    }
    return token;
  });
}

const renderCard = (unavailable = false, price = "£54") => renderToStaticMarkup(
  <QuoteResultShowcase
    vehicleType="Saloon" passengers={2} suitcases={2} priceLabel="Fixed price" formattedPrice={price}
    priceUnavailable={unavailable}
    airportAccess={<QuoteAirportBenefits {...fixture("BFS", null)} />}
    bookButton={<button type="button" data-test-book>BOOK THIS TRANSFER</button>}
  />,
);
for (const price of ["£41", "£65", "£123.45"]) {
  const priced = visibleCardMarkup(renderCard(false, price));
  assert.equal(priced.split(price).length - 1, 2);
  assert.ok(priced.includes(`${price} total. The price you see is the price you pay.`));
}
const html = visibleCardMarkup(renderCard());
assert.ok(html.indexOf("£54") < html.indexOf("Terminal pick-up included"));
assert.ok(html.indexOf("Terminal pick-up included") < html.indexOf("BOOK THIS TRANSFER"));
assert.ok(html.indexOf("BOOK THIS TRANSFER") < html.indexOf("£54 total. The price you see is the price you pay."));
assert.doesNotMatch(visibleCardMarkup(renderCard(true)), /Terminal pick-up included/);
for (const vehicleType of ["Executive", "Minibus"]) {
  const manual = renderToStaticMarkup(
    <QuoteResultShowcase vehicleType={vehicleType} passengers={2} suitcases={2}
      priceLabel="Fixed price" formattedPrice="£54"
      requestQuote={{ heading: "Request a Quote", description: "A personalised quotation before payment." }}
      bookButton={<button type="submit">REQUEST A QUOTE</button>}
      airportAccess={<QuoteAirportBenefits {...fixture("BFS", null)} />}
    />,
  );
  assert.match(manual, /REQUEST A QUOTE/);
  assert.doesNotMatch(visibleCardMarkup(manual), /Fixed price|£54|No surprises|Terminal pick-up included/);
}
console.log("OK airport-to-airport, non-airport, unpaid-access fallback, card order and unavailable-fare checks");
