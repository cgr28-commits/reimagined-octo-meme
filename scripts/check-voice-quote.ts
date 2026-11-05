/** Phone assistant quotes: journey parsing, spoken replies, routing. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spokenGbp, voiceDate, voiceQuoteDraft, voiceQuoteSay, voiceTime, voiceVehicleSentence } from "../shared/voice-quote";

const now = new Date("2026-10-31T09:00:00Z"); // Saturday

assert.equal(voiceDate("2026-11-14", now), "2026-11-14");
assert.equal(voiceDate("14/11/2026", now), "2026-11-14");
assert.equal(voiceDate("tomorrow", now), "2026-11-01");
assert.equal(voiceDate("today", now), "2026-10-31");
assert.equal(voiceTime("17:30", now), "17:30");
assert.equal(voiceTime("5:05", now), "05:05");
assert.equal(voiceTime("5.30pm", now), "17:30");
console.log("OK  dates and times the assistant may send");

const ok = voiceQuoteDraft(
  {
    pickup: "Belfast International Airport",
    dropoff: "12 Main Street, Bangor BT20",
    date: "2026-11-14",
    time: "08:15",
    passengers: "2",
    suitcases: 2,
    returnJourney: "no",
  },
  now,
);
assert.ok(ok.ok);
if (ok.ok) {
  assert.equal(ok.draft.airportCode, "BFS");
  assert.equal(ok.draft.fromAirport, true);
  assert.equal(ok.draft.returnJourney, false);
  assert.equal(ok.draft.passengers, 2);
}
const missing = voiceQuoteDraft({ pickup: "Lisburn", passengers: 1 }, now);
assert.ok(!missing.ok);
assert.match(missing.say, /destination/i);
assert.doesNotMatch(missing.say, /date|time|passenger|suitcase/i, "One question at a time");
assert.equal(!missing.ok && "askNext" in missing ? missing.askNext : "", "dropoff");
const needBags = voiceQuoteDraft(
  { pickup: "Lisburn", dropoff: "BFS", date: "2026-11-14", time: "10:00", passengers: 2 },
  now,
);
assert.ok(!needBags.ok && /suitcase/i.test(needBags.say));
const past = voiceQuoteDraft({ pickup: "a", dropoff: "b", date: "2026-10-01", time: "10:00", passengers: 1, suitcases: 0 }, now);
assert.ok(!past.ok && /passed/.test(past.say));
const big = voiceQuoteDraft({ pickup: "a", dropoff: "b", date: "2026-11-14", time: "10:00", passengers: 6, suitcases: 0 }, now);
assert.ok(!big.ok && /larger vehicle/.test(big.say));
const same = voiceQuoteDraft(
  { pickup: "Belfast International", dropoff: "Aldergrove airport", date: "2026-11-14", time: "10:00", passengers: 1, suitcases: 0 },
  now,
);
assert.ok(!same.ok);
console.log("OK  one-question missing prompts; past, large-group and same-airport ask instead of pricing");

assert.equal(spokenGbp(65), "65 pounds");
assert.equal(spokenGbp(64.5), "64 pounds 50");
if (ok.ok) {
  const say = voiceQuoteSay({ amount: 144, draft: ok.draft, requestOnly: false, shortNotice: false });
  assert.match(say, /144 pounds one way/);
  assert.match(say, /60 minutes/);
  assert.match(say, /quotation|secure link/i);
  assert.match(say, /text, WhatsApp, or email/i);
  assert.doesNotMatch(say, /That's grand/i);
  assert.doesNotMatch(say, /non-refundable|cancel more than 24 hours/i, "Do not volunteer cancellation on the quote");
  assert.doesNotMatch(say, /10 minutes/, "Airport pickup only mentions airport waiting");
  assert.doesNotMatch(say, /surcharge|night|weekend|evening/i, "Never mentions surcharges");
  assert.doesNotMatch(say, /My Airport Taxi NI/i, "Spoken quote omits full business name");
  const home = voiceQuoteSay({ amount: 40, draft: { ...ok.draft, airportCode: null, fromAirport: false }, requestOnly: false, shortNotice: true });
  assert.match(home, /10 minutes/);
  assert.doesNotMatch(home, /60 minutes/);
  assert.match(home, /held for 2 hours/);
}
assert.match(voiceVehicleSentence("Estate Car (1–4 passengers)", 3), /Estate.*extra luggage/);
assert.match(voiceVehicleSentence("Standard Saloon (1–4 passengers)", 2), /Saloon.*2 suitcases/);
const cases = voiceQuoteDraft({ pickup: "a", dropoff: "b", date: "2026-11-14", time: "10:00", passengers: 2, suitcases: 6 }, now);
assert.ok(!cases.ok && /more than four suitcases/.test(cases.say));
console.log("OK  spoken price: right waiting time, vehicle for the luggage, no surcharge wording");

const worker = readFileSync(new URL("../workers/addresses/src/index.ts", import.meta.url), "utf8");
assert.match(worker, /"\/voice\/quote"/);
const handler = readFileSync(new URL("../workers/addresses/src/voice-quote.ts", import.meta.url), "utf8");
assert.match(handler, /checkWhatsAppAvailability\(draft, store\)/);
assert.match(handler, /createPricedQuickQuote\(/);
assert.match(handler, /consumeQuickQuoteCreateQuota\(/);
console.log("OK  same availability + pricing path as WhatsApp; rate limited");

const templates = readFileSync(new URL("../workers/addresses/src/whatsapp-templates.ts", import.meta.url), "utf8");
assert.match(templates, /name: "mat_quote_link"/);
assert.match(templates, /\/book-quote\/\?id=\{\{1\}\}/);
assert.match(templates, /export function sendQuoteLinkWhatsApp/);
assert.match(worker, /"\/voice\/send-link"/);
assert.match(handler, /memoKey\(priced\.record\.id\)/, "Quote is remembered so only phone-made links can be sent");
assert.match(handler, /const memo = await store\.get<VoiceQuoteMemo>\(memoKey\(quoteId\)/);
assert.ok(handler.includes("(\\+?44|0)7\\d{9}"), "UK mobiles only");
assert.match(handler, /sendBySms: true/, "Falls back to a text when WhatsApp can't send");
assert.match(handler, /smsText: smsText\(memo, priced\.bookingUrl\)/);
console.log("OK  WhatsApp booking link: phone-made quotes only, once each, UK mobiles; SMS backup");
