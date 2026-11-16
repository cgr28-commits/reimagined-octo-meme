/**
 * Branded WhatsApp templates: every customer template has a "_v2" copy with the logo banner
 * image header; the owner approval template stays plain.
 * Run: npx tsx scripts/check-whatsapp-branded-templates.ts
 */
import assert from "node:assert/strict";
import {
  allWhatsAppTemplateDefinitions,
  buildTemplatePayload,
  whatsAppTemplateDefinitions,
  WHATSAPP_BRAND_HEADER_URL,
} from "../workers/addresses/src/whatsapp-templates";

const plain = whatsAppTemplateDefinitions();
const all = allWhatsAppTemplateDefinitions();
const branded = all.filter((d) => d.name.endsWith("_v2"));
assert.equal(branded.length, plain.length - 1, "one branded copy per customer template");
assert.ok(!all.some((d) => d.name === "mat_owner_booking_approval_v2"));
for (const def of branded) {
  const header = def.components[0] as { type?: string; format?: string; example?: { header_handle?: string[] } };
  assert.equal(header.type, "HEADER");
  assert.equal(header.format, "IMAGE");
  assert.deepEqual(header.example?.header_handle, [WHATSAPP_BRAND_HEADER_URL]);
  assert.equal(def.components.filter((c) => c.type === "HEADER").length, 1, `${def.name}: one header`);
  const base = plain.find((p) => `${p.name}_v2` === def.name)!;
  assert.equal(def.category, base.category, `${def.name}: same category`);
}
const tip = all.find((d) => d.name === "mat_tip_request_v2")!;
assert.match(String((tip.components.find((c) => c.type === "BODY") as { text?: string }).text), /^\*Enjoyed your journey\?\*\n\n/);
console.log("OK  branded copies: image banner header, same category, text header moved into the body");

const payload = buildTemplatePayload("mat_web_quote_link_v2", ["a", "b", "c", "d"], "token", WHATSAPP_BRAND_HEADER_URL) as {
  template: { name: string; components: Array<{ type: string; parameters: Array<Record<string, unknown>> }> };
};
assert.equal(payload.template.name, "mat_web_quote_link_v2");
assert.equal(payload.template.components[0].type, "header");
assert.deepEqual(payload.template.components[0].parameters[0], { type: "image", image: { link: WHATSAPP_BRAND_HEADER_URL } });
const plainPayload = buildTemplatePayload("mat_web_quote_link", ["a"]) as { template: { components: Array<{ type: string }> } };
assert.equal(plainPayload.template.components[0].type, "body");
assert.equal(WHATSAPP_BRAND_HEADER_URL, "https://www.myairporttaxini.co.uk/whatsapp/header.jpg");
console.log("OK  branded send carries the banner; plain send unchanged");
console.log("\nAll branded WhatsApp template checks passed.");
