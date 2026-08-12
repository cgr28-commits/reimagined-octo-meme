/**
 * Ensures the quote bot knowledge corpus covers the main site topics.
 * Run: npx tsx scripts/check-bot-site-knowledge.ts
 */

import assert from "node:assert/strict";
import { getAssistantKnowledgeChunks, emptyQuoteDraft, respondToAssistantMessage } from "../src/lib/quote-assistant";
import { SERVICE_FLAGS } from "../src/lib/data";

let passed = 0;

function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`✓ ${name}`);
    });
}

async function ask(question: string): Promise<string> {
  const { reply } = await respondToAssistantMessage(question, emptyQuoteDraft());
  assert.ok(reply.trim(), `no bot reply for: ${question}`);
  return reply;
}

async function main() {
  const chunks = getAssistantKnowledgeChunks();

  await check("Knowledge corpus is substantial", () => {
    assert.ok(chunks.length >= 40, `expected ≥40 chunks, got ${chunks.length}`);
    const body = chunks.map((c) => `${c.title}\n${c.body}`).join("\n").toLowerCase();
    for (const needle of [
      "greater belfast",
      "republic of ireland",
      "out-of-area",
      "licensed transport partners",
      "google places",
      "more than 24 hours",
      "belfast international",
      "dublin airport",
      "minibus",
      "sumup",
    ]) {
      assert.ok(body.includes(needle), `missing knowledge for: ${needle}`);
    }
  });

  await check("Includes airport guide page content", () => {
    const titles = chunks.map((c) => c.title).join(" | ");
    assert.match(titles, /Belfast International Airport Transfers/i);
    assert.match(titles, /Dublin Airport Transfers/i);
  });

  await check("Includes town and transfer route notes", () => {
    const titles = chunks.map((c) => c.title).join(" | ");
    assert.match(titles, /Bangor/i);
    assert.match(titles, /Lisburn/i);
    assert.match(titles, /to Belfast International/i);
  });

  if (SERVICE_FLAGS.addressToAddress) {
    await check("Includes long-distance and locations content", () => {
      const body = chunks.map((c) => `${c.title} ${c.body}`).join("\n");
      assert.match(body, /Private Long-Distance Transfers from Anywhere in Greater Belfast/);
      assert.match(body, /Bangor to Cork/);
      assert.match(body, /Request Fixed Quote/);
    });
  }

  await check("Bot answers cancellation question from site terms/FAQ", async () => {
    const reply = await ask("What is your cancellation and refund policy?");
    assert.match(reply.toLowerCase(), /24 hour|refund|non-refundable/);
  });

  await check("Bot answers long-distance / ROI pickup rules", async () => {
    const reply = await ask("Do you cover long-distance transfers to Cork and Galway?");
    assert.match(reply.toLowerCase(), /greater belfast|republic|ireland|fixed quote|long-distance/);
  });

  await check("Bot answers minibus / partner question", async () => {
    const reply = await ask("Do you offer minibus transfers through licensed transport partners?");
    assert.match(reply.toLowerCase(), /minibus|partner|5|8|request/);
  });

  await check("Bot answers Dublin Airport question with site airport copy", async () => {
    const reply = await ask("Tell me about Dublin Airport transfers");
    assert.match(reply.toLowerCase(), /dublin/);
  });

  await check("Bot answers privacy / Google Places question", async () => {
    const reply = await ask("How do you use Google Places and cookies?");
    assert.match(reply.toLowerCase(), /google|places|cookie|privacy|consent/);
  });

  console.log(`\n${passed} bot knowledge checks passed (${chunks.length} chunks)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
