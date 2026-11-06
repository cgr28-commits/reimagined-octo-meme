/**
 * Customer calls the quote off: the assistant says goodbye and stops asking for
 * journey details or showing Today / Tomorrow buttons.
 * Replays the 6 Nov 2026 chat with Dave (got a direct flight to Dublin instead).
 *
 * Run: tsx scripts/check-whatsapp-not-needed.ts
 */

import assert from "node:assert/strict";
import {
  decideWhatsAppReply,
  isWhatsAppNotNeeded,
  type WhatsAppConversation,
} from "../shared/whatsapp-quote-bot";

const NOW = new Date("2026-11-06T19:45:00Z");

console.log("=== Phrases that call the quote off ===");
for (const t of [
  "Hi colin I don't need the taxi now I got on a direct flight to Dublin thanks Dave",
  "Nah don't worry son I'm",
  "Nah don’t worry son I’m",
  "no longer need a taxi thanks",
  "I won't be needing a cab after all",
  "changed my mind",
  "never mind",
  "don't need it now",
  "taxi not needed anymore",
  "got another taxi sorted",
]) {
  assert.ok(isWhatsAppNotNeeded(t), `not needed: ${t}`);
}

console.log("=== Journey details and booking cancellations are not ===");
for (const t of [
  "I don't need a return",
  "one way, don't need a return thanks",
  "don't need a car seat",
  "Belfast to Dublin airport on Friday",
  "I need to cancel my booking MAT-1234",
  "I don't need the taxi I booked with you, can I get a refund",
  "no",
  "cancel",
]) {
  assert.ok(!isWhatsAppNotNeeded(t), `still handled as before: ${t}`);
}

console.log("=== Replay of Dave's chat ===");
let conversation: WhatsAppConversation | null = null;
const opener = decideWhatsAppReply(conversation, "Belfast to Dublin airport", { now: NOW, profileName: "Dave" });
conversation = opener.conversation;
assert.ok(conversation.draft.pickupAddress || conversation.draft.dropoffAddress, "quote was under way");

const off = decideWhatsAppReply(
  conversation,
  "Hi colin I don't need the taxi now I got on a direct flight to Dublin thanks Dave",
  { now: NOW, profileName: "Dave" },
);
assert.equal(off.action, "answer");
assert.equal(off.ai?.declined, true);
assert.equal(off.ai?.askFor, undefined, "asks for nothing");
assert.equal(off.buttons, undefined, "no buttons");
assert.equal(off.list, undefined, "no list");
assert.deepEqual(off.conversation.draft, {}, "quote closed");
assert.doesNotMatch(off.reply, /pick you up|what date|\?/i);
conversation = off.conversation;

const nah = decideWhatsAppReply(conversation, "Nah don't worry son I'm", { now: NOW, profileName: "Dave" });
assert.equal(nah.ai?.declined, true);
assert.equal(nah.buttons, undefined);
conversation = nah.conversation;

const bye = decideWhatsAppReply(conversation, "Sweet cheers bud regs Dave", { now: NOW, profileName: "Dave" });
assert.equal(bye.ai?.askFor, undefined, "a thank-you after closing asks nothing");
assert.equal(bye.buttons, undefined, "no Today / Tomorrow under a thank-you");
assert.equal(bye.list, undefined);

console.log("All not-needed checks passed.");
