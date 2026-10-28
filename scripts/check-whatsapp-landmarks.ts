/**
 * WhatsApp assistant understands well-known places without a full address,
 * "X to Y" without "from", and an address that arrives with a time.
 * Replays the 28 Oct 2026 Grand Central → Belfast City Airport chat.
 *
 * Run: tsx scripts/check-whatsapp-landmarks.ts
 */

import assert from "node:assert/strict";
import { decideWhatsAppReply, type WhatsAppConversation } from "../shared/whatsapp-quote-bot";
import { findKnownPlaces, knownPlaceLabel } from "../shared/belfast-landmarks";
import { parseAirportCode, parseQuickQuoteMessage } from "../shared/quick-quote-parse";

const NOW = new Date("2026-10-28T13:45:00Z");
const GRAND_CENTRAL = "Grand Central Station, Belfast BT12 5DR";

function chat(messages: string[]): { conversation: WhatsAppConversation; replies: string[] } {
  let conversation: WhatsAppConversation | null = null;
  const replies: string[] = [];
  for (const text of messages) {
    const decision = decideWhatsAppReply(conversation, text, { now: NOW, profileName: "Kira" });
    conversation = decision.conversation;
    replies.push(decision.reply);
  }
  return { conversation: conversation!, replies };
}

console.log("=== Known places ===");
assert.equal(knownPlaceLabel("Belfast grand central"), GRAND_CENTRAL);
assert.equal(knownPlaceLabel("grand central station please"), GRAND_CENTRAL);
assert.equal(knownPlaceLabel("Great Victoria Street station"), GRAND_CENTRAL);
assert.match(knownPlaceLabel("the Grand Central Hotel") ?? "", /Grand Central Hotel/, "the hotel is not the station");
assert.match(knownPlaceLabel("Europa hotel") ?? "", /Europa Hotel/);
assert.match(knownPlaceLabel("Titanic Belfast") ?? "", /Titanic Belfast/);
assert.equal(knownPlaceLabel("12 Main Street, Lisburn"), null);
assert.equal(findKnownPlaces("from Grand Central to the Europa hotel").length, 2);

console.log("=== Belfast City Hospital / centre are not the airport ===");
assert.equal(parseAirportCode("Belfast City Hospital"), null);
assert.equal(parseAirportCode("Belfast city centre"), null);
assert.equal(parseAirportCode("Belfast City Airport"), "BHD");
assert.equal(parseAirportCode("belfast city"), "BHD");
assert.equal(parseQuickQuoteMessage("from Belfast City Hospital to 12 Main Street Lisburn", NOW).airportCode.value ?? null, null);

console.log("=== Replay: Kira, 28 Oct ===");
{
  const { conversation, replies } = chat([
    "Hello, I would like help arranging a Belfast Grand Central Station transfer to Belfast City airport.",
  ]);
  assert.equal(conversation.draft.pickupAddress, GRAND_CENTRAL, "pickup understood from the first message");
  assert.equal(conversation.draft.dropoffAddress, "Belfast City Airport");
  assert.equal(conversation.draft.airportCode, "BHD");
  assert.equal(conversation.draft.fromAirport, false);
  assert.doesNotMatch(replies[0], /Where should we pick you up/i, "does not ask for the pickup again");
}

console.log("=== Address + time in one reply ===");
{
  const { conversation, replies } = chat([
    "I need a taxi to Belfast City Airport",
    "Belfast grand central at 15:25",
  ]);
  assert.equal(conversation.draft.pickupAddress, GRAND_CENTRAL);
  assert.equal(conversation.draft.outboundTime, "15:25", "time kept as well");
  assert.doesNotMatch(replies[1], /Where should we pick you up/i, "no repeated question");
}
{
  const { conversation } = chat(["I need a taxi to Belfast International", "12 Main Street, Lisburn BT28 1AA at 6am tomorrow"]);
  assert.equal(conversation.draft.pickupAddress, "12 Main Street, Lisburn BT28 1AA");
  assert.equal(conversation.draft.outboundTime, "06:00");
  assert.equal(conversation.draft.outboundDate, "2026-10-29");
}

console.log("=== Other phrasings ===");
{
  const { conversation } = chat(["Grand Central to BFS please"]);
  assert.equal(conversation.draft.pickupAddress, GRAND_CENTRAL);
  assert.equal(conversation.draft.dropoffAddress, "Belfast International Airport");
}
{
  const { conversation } = chat(["Taxi from Belfast City Airport to the Europa Hotel"]);
  assert.equal(conversation.draft.pickupAddress, "Belfast City Airport");
  assert.equal(conversation.draft.fromAirport, true);
  assert.match(conversation.draft.dropoffAddress ?? "", /Europa Hotel/);
}
{
  const { conversation } = chat(["I need to get to Grand Central from Belfast International"]);
  assert.equal(conversation.draft.pickupAddress, "Belfast International Airport");
  assert.equal(conversation.draft.dropoffAddress, GRAND_CENTRAL);
}
{
  const { conversation } = chat(["Transfer from my hotel to grand central station"]);
  assert.equal(conversation.draft.dropoffAddress, GRAND_CENTRAL, "'to <place>' is the destination");
}
{
  // Changing the pickup to a known place.
  const { conversation } = chat([
    "From 12 Main Street, Lisburn BT28 1AA to Belfast City Airport",
    "Sorry, change the pickup to the Europa hotel",
  ]);
  assert.match(conversation.draft.pickupAddress ?? "", /Europa Hotel/);
  assert.equal(conversation.draft.dropoffAddress, "Belfast City Airport");
}
{
  const { conversation } = chat(["Belfast City Hospital to Belfast International"]);
  assert.match(conversation.draft.pickupAddress ?? "", /Belfast City Hospital/);
  assert.equal(conversation.draft.dropoffAddress, "Belfast International Airport");
  assert.equal(conversation.draft.airportCode, "BFS");
}

console.log("PASS");
