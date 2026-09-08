/**
 * Rendered one-tap Express drop-off selector (no acknowledgement checkbox).
 * Run: npx tsx scripts/check-express-drop-off-render.tsx
 */

import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import CombinedAirportAccessSelector from "../src/components/CombinedAirportAccessSelector";
import ExpressDropOffSelector from "../src/components/ExpressDropOffSelector";

function noop() {}

function renderExpress(input: {
  airportCode: "BFS" | "BHD";
  selected: boolean;
  service?: "drop-off" | "pick-up";
}) {
  return renderToStaticMarkup(
    createElement(ExpressDropOffSelector, {
      airportCode: input.airportCode,
      service: input.service ?? "drop-off",
      selected: input.selected,
      removalAcknowledged: !input.selected,
      onSelectedChange: noop,
      onRemovalAcknowledgedChange: noop,
    }),
  );
}

console.log("=== One-tap Express drop-off selector markup ===");

{
  const bfsExpress = renderExpress({ airportCode: "BFS", selected: true });
  assert.match(bfsExpress, /Airport drop-off/);
  assert.match(bfsExpress, /Express terminal — £5 included \(Recommended\)/);
  assert.match(bfsExpress, /Free drop-off area — save £5/);
  assert.doesNotMatch(bfsExpress, /type="checkbox"/);
  assert.doesNotMatch(bfsExpress, /I understand I will be dropped/);
  assert.doesNotMatch(bfsExpress, /Free drop-off selected\./);

  const bfsFree = renderExpress({ airportCode: "BFS", selected: false });
  assert.match(
    bfsFree,
    /Free drop-off selected\. You’ll be dropped at the designated free drop-off area, a short walk from the terminal\./,
  );
  assert.doesNotMatch(bfsFree, /type="checkbox"/);
  assert.doesNotMatch(bfsFree, /I understand I will be dropped/);

  const bhdExpress = renderExpress({ airportCode: "BHD", selected: true });
  assert.match(bhdExpress, /Express terminal — £4 included \(Recommended\)/);
  assert.match(bhdExpress, /Free drop-off area — save £4/);

  const pickupFree = renderExpress({
    airportCode: "BFS",
    selected: false,
    service: "pick-up",
  });
  assert.match(pickupFree, /Airport pick-up/);
  assert.match(pickupFree, /Free pick-up area — save £5/);
  assert.match(pickupFree, /Free pick-up selected\./);
  assert.doesNotMatch(pickupFree, /type="checkbox"/);

  const combinedFree = renderToStaticMarkup(
    createElement(CombinedAirportAccessSelector, {
      totalFeeGbp: 10,
      selected: false,
      removalAcknowledged: true,
      onSelectedChange: noop,
      onRemovalAcknowledgedChange: noop,
    }),
  );
  assert.match(combinedFree, /Express terminal — £10 included \(Recommended\)/);
  assert.match(combinedFree, /Free airport areas — save £10/);
  assert.match(combinedFree, /Free areas selected\./);
  assert.doesNotMatch(combinedFree, /type="checkbox"/);
  assert.doesNotMatch(
    combinedFree,
    /I understand that the designated free airport areas will be used for both journeys/,
  );

  console.log("OK  BFS £5 / BHD £4 one-tap options, no acknowledgement checkbox");
}

console.log("\nAll Express drop-off render checks passed.");
