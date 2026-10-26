/**
 * WhatsApp assistant transcript (owner dashboard) and the "chat finished" email.
 * Run: npx tsx scripts/check-whatsapp-chat-log.ts
 */
import assert from "node:assert/strict";
import {
  appendWhatsAppChat,
  formatWhatsAppChatTranscript,
  getWhatsAppChat,
  isWhatsAppChatDueForEmail,
  listWhatsAppChats,
  markWhatsAppChatEmailed,
} from "../workers/addresses/src/whatsapp-chat-log";

type Entry = { value: string; metadata?: unknown };
function memoryKv(): KVNamespace {
  const data = new Map<string, Entry>();
  return {
    async get(key: string, type?: string) {
      const hit = data.get(key);
      if (!hit) return null;
      return type === "json" ? JSON.parse(hit.value) : hit.value;
    },
    async put(key: string, value: string, options?: { metadata?: unknown }) {
      data.set(key, { value, metadata: options?.metadata });
    },
    async list({ prefix }: { prefix: string }) {
      const keys = [...data.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([name, e]) => ({ name, metadata: e.metadata }));
      return { keys, list_complete: true, cursor: "" };
    },
  } as unknown as KVNamespace;
}

async function main() {
  const store = memoryKv();
  await appendWhatsAppChat(store, "447700900123", { from: "customer", text: "BT9 6AA to BFS Friday 5am" }, "Sam Taylor");
  await appendWhatsAppChat(store, "447700900123", { from: "assistant", text: "Reply YES to get your fixed price" });
  await appendWhatsAppChat(store, "447700900999", { from: "customer", text: "Hi" });
  await appendWhatsAppChat(store, "447700900999", { from: "assistant", text: "Welcome", failed: true });

  const chats = await listWhatsAppChats(store);
  assert.equal(chats.length, 2);
  const sam = chats.find((c) => c.phone === "447700900123")!;
  assert.equal(sam.name, "Sam Taylor", "name kept from the customer message");
  assert.equal(sam.lastFrom, "assistant");

  const record = (await getWhatsAppChat(store, "+44 7700 900123"))!;
  assert.equal(record.messages.length, 2);
  const transcript = formatWhatsAppChatTranscript(record);
  assert.match(transcript, /Sam Taylor:\nBT9 6AA to BFS Friday 5am/);
  assert.match(transcript, /Assistant:\nReply YES/);
  const other = (await getWhatsAppChat(store, "447700900999"))!;
  assert.match(formatWhatsAppChatTranscript(other), /Assistant \(NOT DELIVERED\)/);

  // Emailed only once the chat has been quiet for 30 minutes, and only new messages after that.
  const updated = Date.parse(sam.updatedAt);
  assert.equal(isWhatsAppChatDueForEmail(sam, new Date(updated + 10 * 60 * 1000)), false);
  assert.equal(isWhatsAppChatDueForEmail(sam, new Date(updated + 31 * 60 * 1000)), true);
  const emailedAt = new Date(updated + 31 * 60 * 1000).toISOString();
  await markWhatsAppChatEmailed(store, record, emailedAt);
  const afterEmail = (await listWhatsAppChats(store)).find((c) => c.phone === sam.phone)!;
  assert.equal(isWhatsAppChatDueForEmail(afterEmail, new Date(updated + 120 * 60 * 1000)), false);
  const reloaded = (await getWhatsAppChat(store, sam.phone))!;
  assert.equal(formatWhatsAppChatTranscript(reloaded, reloaded.emailedAt), "", "nothing new since the email");

  console.log("All WhatsApp chat log checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
