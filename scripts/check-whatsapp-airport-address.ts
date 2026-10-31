/**
 * WhatsApp quotes: a real chat (31 Oct 2026) looped on "pickup and drop-off are both
 * Belfast International". The website's journey message names the airport twice in one
 * address ("…Airport, Airport Rd, Aldergrove BT29 4AB"), "arriving into" read as a
 * drop-off, and labelled drop-offs ("My drop off is …") were ignored.
 */
import assert from "node:assert/strict";
import { decideWhatsAppReply, newWhatsAppConversation } from "../shared/whatsapp-quote-bot";

const now = new Date("2026-10-31T14:22:00Z");
function run(messages: string[]) {
  let conv = newWhatsAppConversation(now);
  let last = decideWhatsAppReply(conv, messages[0]!, { now });
  conv = last.conversation ?? conv;
  for (const msg of messages.slice(1)) {
    last = decideWhatsAppReply(conv, msg, { now });
    conv = last.conversation ?? conv;
  }
  return { draft: conv.draft, reply: last.reply ?? "" };
}

const website =
  "Hi, I'd like a price for this journey:\nFrom: Belfast International Airport, Airport Rd, Aldergrove BT29 4AB, UK\n" +
  "To: 122D Steeple Rd, Antrim BT41 2LW, UK\nDate: 2026-11-01 at 01:40\nOne way\nPassengers: 1\nSuitcases: 1";
const arriving =
  "Arriving into Belfast International late tonight (1.40AM.. so technically Sunday morning - 1st November) \n\n" +
  "I'm flying from Tenerife with Jet 2 - flight reference is LS378\n\nMy destination from the airport would be:\n\n122D Steeple Road, Antrim, BT41 2LW";
const labelled = "My pick up is Belfast international \n\nMy drop off is 122D steeple road, Antrim";

const a = run([website]);
assert.equal(a.draft.pickupAddress, "Belfast International Airport");
assert.equal(a.draft.dropoffAddress, "122D Steeple Rd, Antrim BT41 2LW, UK");
assert.equal(a.draft.fromAirport, true);
assert.doesNotMatch(a.reply, /both/);
console.log("OK  website journey message: airport named twice in one address is one place");

const b = run([website, arriving, labelled]);
assert.match(b.draft.dropoffAddress ?? "", /^122D Steeple R.*BT41 2LW/i, "keeps the full address with postcode");
assert.equal(b.draft.outboundDate, "2026-11-01", "'tonight (… 1st November)' keeps the calendar date");
assert.equal(b.draft.returnDate, undefined, "one-way trips get no return date");
assert.equal(b.draft.flightNumber, "LS378");
console.log("OK  follow-ups keep the journey; calendar date beats 'tonight' on one-way trips");

const c = run([arriving]);
assert.equal(c.draft.pickupAddress, "Belfast International Airport", "'arriving into' the airport is the pickup");
assert.equal(c.draft.dropoffAddress, "122D Steeple Road, Antrim, BT41 2LW");
assert.equal(c.draft.outboundDate, "2026-11-01");
const d = run([labelled]);
assert.equal(d.draft.pickupAddress, "Belfast International Airport");
assert.equal(d.draft.dropoffAddress, "122D steeple road, Antrim");
console.log("OK  'arriving into' = pickup; 'my drop off is …' / 'destination … would be:' are read");

const e = run(["Belfast International to Belfast City airport on 5th November at 10am"]);
assert.equal(e.draft.pickupAddress, "Belfast International Airport");
assert.equal(e.draft.dropoffAddress, "Belfast City Airport");
const f = run(["I'm landing at Belfast City at 6pm on Friday, going to 12 Main Street Bangor BT20 5AA"]);
assert.equal(f.draft.pickupAddress, "Belfast City Airport");
assert.equal(f.draft.dropoffAddress, "12 Main Street Bangor BT20 5AA");
console.log("OK  airport-to-airport and landing-at routes unchanged");
