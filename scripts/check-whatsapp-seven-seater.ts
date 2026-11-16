/**
 * WhatsApp chat — groups of 5–7 get an instant 7 Seater price, and a return with a
 * different group size is priced correctly (16 Nov 2026: Tríona, 6 out / 4 back to Dublin Airport,
 * was handed to the team because the bot stopped at 4 passengers).
 * No network. Run: npx tsx scripts/check-whatsapp-seven-seater.ts
 */
import assert from "node:assert/strict";

import { applyClaudeLedTurn, parseClaudeLedTurn } from "../shared/whatsapp-claude-led";
import {
  buildWhatsAppQuoteReply,
  buildWhatsAppSplitQuoteReply,
  buildWhatsAppSummary,
  newWhatsAppConversation,
  validateWhatsAppDraft,
  whatsAppDraftToQuoteBody,
  whatsAppNeedsSevenSeater,
  whatsAppQuoteLegs,
  type WhatsAppConversation,
  type WhatsAppQuoteDraft,
} from "../shared/whatsapp-quote-bot";

const now = new Date("2026-11-16T16:13:53Z");
let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};

const triona: WhatsAppQuoteDraft = {
  pickupAddress: "44 Ballysillan Road, Belfast BT14 6JY, UK",
  dropoffAddress: "Dublin Airport",
  airportCode: "DUB",
  fromAirport: false,
  outboundDate: "2027-02-01",
  outboundTime: "09:00",
  passengers: 6,
  suitcases: 6,
  returnJourney: true,
  returnDate: "2027-02-15",
  returnTime: "19:00",
  returnPassengers: 4,
  returnSuitcases: 4,
};

check("6 passengers is no longer handed to the team", () => {
  assert.equal(validateWhatsAppDraft({ ...triona }, now), null);
  assert.equal(validateWhatsAppDraft({ ...triona, returnJourney: false, passengers: 7 }, now), null);
});

check("more than 7 still goes to the team", () => {
  const problem = validateWhatsAppDraft({ ...triona, returnJourney: false, passengers: 8 }, now);
  assert.ok(problem?.handoff);
  assert.match(problem!.message, /more than 7/);
  const back = validateWhatsAppDraft({ ...triona, passengers: 4, returnPassengers: 9 }, now);
  assert.ok(back?.handoff);
});

check("5–7 passengers or 5+ cases price the 7 Seater; 4 and 4 stay in a car", () => {
  assert.equal(whatsAppNeedsSevenSeater(4, 4), false);
  assert.equal(whatsAppNeedsSevenSeater(5, 0), true);
  assert.equal(whatsAppNeedsSevenSeater(2, 6), true);
  const body = whatsAppDraftToQuoteBody({ ...triona, returnJourney: false }, now);
  assert.equal(body.vehicleChoice, "Minibus");
  assert.equal(body.passengers, 6);
  assert.equal(body.suitcases, 5, "the website's top 7 Seater luggage choice is 5+");
  const car = whatsAppDraftToQuoteBody({ ...triona, returnJourney: false, passengers: 3, suitcases: 2 }, now);
  assert.equal(car.vehicleChoice, "Saloon");
  assert.equal(car.suitcases, 2);
});

check("Tríona: 6 out in the 7 Seater, 4 back in a car → two one-way quotes with the right legs", () => {
  const legs = whatsAppQuoteLegs(triona);
  assert.equal(legs.length, 2);
  const [out, back] = legs;
  assert.equal(out!.leg, "outbound");
  assert.equal(out!.draft.returnJourney, false);
  assert.equal(out!.draft.passengers, 6);
  assert.equal(out!.draft.dropoffAddress, "Dublin Airport");
  assert.equal(whatsAppDraftToQuoteBody(out!.draft, now).vehicleChoice, "Minibus");
  assert.equal(back!.leg, "return");
  assert.equal(back!.draft.pickupAddress, "Dublin Airport");
  assert.equal(back!.draft.dropoffAddress, triona.pickupAddress);
  assert.equal(back!.draft.fromAirport, true);
  assert.equal(back!.draft.outboundDate, "2027-02-15");
  assert.equal(back!.draft.outboundTime, "19:00");
  assert.equal(back!.draft.passengers, 4);
  const backBody = whatsAppDraftToQuoteBody(back!.draft, now);
  assert.equal(backBody.vehicleChoice, "Saloon");
  assert.equal(backBody.journeyMode, "one-way");
  assert.equal(backBody.fromAirport, true);
});

check("flight number goes with the airport pickup leg only", () => {
  const legs = whatsAppQuoteLegs({ ...triona, flightNumber: "EI3341" });
  assert.equal(legs[0]!.draft.flightNumber, undefined);
  assert.equal(legs[1]!.draft.flightNumber, "EI3341");
});

check("different group but same vehicle both ways → one return quote sized for the bigger group", () => {
  const legs = whatsAppQuoteLegs({ ...triona, passengers: 3, suitcases: 2, returnPassengers: 4, returnSuitcases: 4 });
  assert.equal(legs.length, 1);
  assert.equal(legs[0]!.draft.passengers, 4);
  assert.equal(legs[0]!.draft.suitcases, 4);
  assert.equal(whatsAppDraftToQuoteBody(legs[0]!.draft, now).journeyMode, "return");
});

check("same group both ways is unchanged (one return quote)", () => {
  const d = { ...triona };
  delete d.returnPassengers;
  delete d.returnSuitcases;
  const legs = whatsAppQuoteLegs(d);
  assert.equal(legs.length, 1);
  assert.equal(legs[0]!.draft, d);
});

check("Claude reading Tríona's message records 6 out / 4 back and reaches the summary", () => {
  const turn = parseClaudeLedTurn({
    reply: "Perfect, here's your journey:",
    action: "ready_to_confirm",
    updates: {
      pickup: "44 Ballysillan Road, BT14 6JY",
      dropoff: "Dublin Airport",
      date: "2027-02-01",
      passengers: 6,
      suitcases: 6,
      returnJourney: true,
      returnDate: "2027-02-15",
      returnTime: "19:00",
      returnPassengers: 4,
      returnSuitcases: 4,
    },
  });
  assert.ok(turn);
  assert.equal(turn!.updates.returnPassengers, 4);
  const decision = applyClaudeLedTurn(newWhatsAppConversation(now), turn!, { now, scheduleUpFront: false });
  assert.notEqual(decision.action, "handoff");
  assert.equal(decision.conversation.draft.returnPassengers, 4);
  assert.match(decision.reply, /Passengers:\* 6/);
  assert.match(decision.reply, /Return:\* 4 passengers/);
  assert.match(decision.reply, /Reply \*YES\*/);
});

check("a return count equal to the outward count is not kept; one way clears it", () => {
  const conv: WhatsAppConversation = { ...newWhatsAppConversation(now), draft: { ...triona } };
  const same = applyClaudeLedTurn(conv, { reply: "ok", action: "reply", updates: { returnPassengers: 6, returnSuitcases: 6 } }, { now });
  assert.equal(same.conversation.draft.returnPassengers, undefined);
  assert.equal(same.conversation.draft.returnSuitcases, undefined);
  const conv2: WhatsAppConversation = { ...newWhatsAppConversation(now), draft: { ...triona } };
  const oneWay = applyClaudeLedTurn(conv2, { reply: "ok", action: "reply", updates: { returnJourney: false } }, { now });
  assert.equal(oneWay.conversation.draft.returnPassengers, undefined);
});

check("summary shows the return group only when it differs", () => {
  assert.match(buildWhatsAppSummary(triona), /Return:\* 4 passengers/);
  const same = { ...triona };
  delete same.returnPassengers;
  delete same.returnSuitcases;
  assert.doesNotMatch(buildWhatsAppSummary(same), /Return:\* \d+ passengers/);
});

check("price messages name the 7 Seater; split reply has both prices and links", () => {
  assert.match(buildWhatsAppQuoteReply({ amountLabel: "£344", bookingUrl: "https://x", sevenSeater: true }), /7 Seater\* is \*£344/);
  assert.doesNotMatch(buildWhatsAppQuoteReply({ amountLabel: "£150", bookingUrl: "https://x" }), /7 Seater/);
  const reply = buildWhatsAppSplitQuoteReply({
    legs: [
      { leg: "outbound", amountLabel: "£344", bookingUrl: "https://a", passengers: 6, sevenSeater: true, linkHours: 24 },
      { leg: "return", amountLabel: "£270", bookingUrl: "https://b", passengers: 4, sevenSeater: false, linkHours: 24 },
    ],
    journey: { airportCode: "DUB", fromAirport: false, returnJourney: true },
  });
  assert.match(reply, /Outward journey\* \(6 passengers, 7 Seater\): \*£344/);
  assert.match(reply, /Return journey\* \(4 passengers, car\): \*£270/);
  assert.match(reply, /https:\/\/a[\s\S]*https:\/\/b/);
  assert.doesNotMatch(reply, /undefined|Mercedes/);
  console.log("\n--- Split price message ---\n" + reply + "\n");
});

console.log(`\n${passed} 7 Seater WhatsApp checks passed`);
