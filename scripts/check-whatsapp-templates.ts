/**
 * WhatsApp template messages: only approved templates send, once per job, with
 * clean parameters; nothing sends when switched off.
 * Run: npx tsx scripts/check-whatsapp-templates.ts
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildTemplatePayload,
  sendBookingConfirmedWhatsApp,
  sendDriverDetailsWhatsApp,
  sendDriverOnTheWayWhatsApp,
  sendReviewRequestWhatsApp,
  sendAirportPickupWhatsApp,
  sendDriverArrivedWhatsApp,
  airportPickupLinkPath,
  shortTripDate,
  templateParam,
  tripWhen,
  whatsAppRecipient,
  whatsAppTemplateDefinitions,
} from "../workers/addresses/src/whatsapp-templates";

const root = path.resolve(import.meta.dirname, "..");

function memoryKv(): KVNamespace {
  const map = new Map<string, string>();
  return {
    async get(key: string, type?: string) {
      const v = map.get(key);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    },
    async put(key: string, value: string) {
      map.set(key, value);
    },
    async delete(key: string) {
      map.delete(key);
    },
  } as unknown as KVNamespace;
}

type Call = { url: string; body?: Record<string, unknown> };

function fake360(statuses: Record<string, string>, calls: Call[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url.includes("/v1/configs/templates")) {
      return new Response(
        JSON.stringify({ waba_templates: Object.entries(statuses).map(([name, status]) => ({ name, status, language: "en_GB" })) }),
        { status: 200 },
      );
    }
    if (url.endsWith("/messages")) {
      return new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
}

// Number handling
assert.equal(whatsAppRecipient("07377 515059"), "447377515059");
assert.equal(whatsAppRecipient("+44 7377 515059"), "447377515059");
assert.equal(whatsAppRecipient("0044 7377 515059"), "447377515059");
assert.equal(whatsAppRecipient("087 123 4567"), "353871234567");
assert.equal(whatsAppRecipient("+353 87 123 4567"), "353871234567");
assert.equal(whatsAppRecipient("028 9602 2952"), "", "landlines are not WhatsApp recipients");
assert.equal(whatsAppRecipient(""), "");
console.log("OK  UK and Irish mobiles map to WhatsApp numbers; landlines skipped");

// Parameters
assert.equal(templateParam("  12 Main St,\nLisburn  "), "12 Main St, Lisburn");
assert.equal(templateParam(""), "-");
assert.equal(shortTripDate("2026-10-31"), "Sat 31 Oct");
assert.equal(tripWhen("2026-10-31", "05:30"), "Sat 31 Oct at 05:30");
const payload = buildTemplatePayload("mat_booking_confirmed", ["Sarah", ""], "abc") as {
  template: { components: Array<{ type: string; parameters: Array<{ text: string }> }> };
};
assert.equal(payload.template.components[0].parameters[1].text, "-");
assert.equal(payload.template.components[1].type, "button");
console.log("OK  template parameters are single-line and never empty");

// Definitions match the senders' parameter counts and stay non-promotional where UTILITY.
const defs = whatsAppTemplateDefinitions();
const varCount = (name: string) => {
  const body = defs.find((d) => d.name === name)!.components.find((c) => c.type === "BODY") as { text: string };
  return new Set(body.text.match(/\{\{\d+\}\}/g)).size;
};
assert.equal(varCount("mat_booking_confirmed"), 5);
assert.equal(varCount("mat_driver_on_the_way"), 3);
assert.equal(varCount("mat_driver_details"), 5);
assert.equal(varCount("mat_review_request"), 2);
assert.equal(varCount("mat_airport_pickup"), 4);
assert.equal(varCount("mat_driver_arrived"), 2);
assert.equal(varCount("mat_driver_arrived_airport"), 3);
for (const def of defs.filter((d) => d.category === "UTILITY")) {
  const text = JSON.stringify(def.components);
  assert.doesNotMatch(text, /review|discount|offer|% off|promo/i, `${def.name} must stay non-promotional`);
}
for (const def of defs) {
  const body = def.components.find((c) => c.type === "BODY") as { text: string };
  assert.doesNotMatch(body.text, /^\{\{|\}\}$/, `${def.name} body must not start or end with a variable`);
}
console.log("OK  template definitions match sender parameters");

async function main() {
  // Not approved → nothing sent.
  {
    const calls: Call[] = [];
    const env = { D360_API_KEY: "k", TRACKING_STORE: memoryKv() };
    const r = await sendDriverOnTheWayWhatsApp(env, { jobKey: "t1", customerName: "Sarah Jones", mobile: "07377515059", pickupLabel: "Lisburn", tripTime: "05:30" }, fake360({ mat_driver_on_the_way: "pending" }, calls));
    assert.equal(r.sent, false);
    assert.equal(calls.filter((c) => c.url.endsWith("/messages")).length, 0);
  }
  console.log("OK  pending templates never send");

  // Approved → sends once, correct payload; second call is a no-op.
  {
    const calls: Call[] = [];
    const env = { D360_API_KEY: "k", TRACKING_STORE: memoryKv() };
    const f = fake360({ mat_booking_confirmed: "APPROVED" }, calls);
    const input = {
      paymentReference: "SUMUP-1",
      customerReference: "MAT-1042",
      customerName: "Sarah Jones",
      mobile: "07377 515059",
      tripDate: "2026-10-31",
      tripTime: "05:30",
      pickupLabel: "12 Main Street, Lisburn",
      dropoffLabel: "Belfast International Airport",
      manageToken: "a".repeat(48),
    };
    const first = await sendBookingConfirmedWhatsApp(env, input, f);
    assert.equal(first.sent, true);
    const second = await sendBookingConfirmedWhatsApp(env, input, f);
    assert.equal(second.sent, false);
    const sends = calls.filter((c) => c.url.endsWith("/messages"));
    assert.equal(sends.length, 1, "idempotent per booking");
    const body = sends[0].body as { to: string; template: { name: string; components: Array<{ parameters: Array<{ text: string }> }> } };
    assert.equal(body.to, "447377515059");
    assert.equal(body.template.name, "mat_booking_confirmed");
    assert.deepEqual(
      body.template.components[0].parameters.map((p) => p.text),
      ["Sarah", "MAT-1042", "Sat 31 Oct at 05:30", "12 Main Street, Lisburn", "Belfast International Airport"],
    );
    assert.equal(body.template.components[1].parameters[0].text, "a".repeat(48));
  }
  console.log("OK  approved booking confirmation sends once with the right details");

  // Kill switch.
  {
    const calls: Call[] = [];
    const env = { D360_API_KEY: "k", TRACKING_STORE: memoryKv(), WHATSAPP_TEMPLATES_ENABLED: "false" };
    const r = await sendReviewRequestWhatsApp(env, { jobKey: "t2", customerName: "Sam", mobile: "07377515059", tripDate: "2026-10-31" }, fake360({ mat_review_request: "approved" }, calls));
    assert.equal(r.sent, false);
    assert.equal(calls.filter((c) => c.url.endsWith("/messages")).length, 0);
  }
  console.log("OK  WHATSAPP_TEMPLATES_ENABLED=false stops all template messages");

  // Driver details: partial reg only, never full reg.
  {
    const calls: Call[] = [];
    const env = { D360_API_KEY: "k", TRACKING_STORE: memoryKv() };
    await sendDriverDetailsWhatsApp(env, {
      jobKey: "t3:driver@example.com",
      customerName: "Sarah",
      mobile: "07377515059",
      tripDate: "2026-10-31",
      tripTime: "05:30",
      driverName: "John Smith",
      driverMobile: "07700 900123",
      carColour: "Silver",
      carMake: "Skoda",
      carModel: "Octavia",
      registration: "CR66 ABC",
    }, fake360({ mat_driver_details: "approved" }, calls));
    const sent = JSON.stringify(calls.find((c) => c.url.endsWith("/messages"))?.body);
    assert.match(sent, /John/);
    assert.doesNotMatch(sent, /Smith/, "driver surname not shared");
    assert.match(sent, /CR66 \*\*\*/);
    assert.doesNotMatch(sent, /CR66 ABC/, "full registration never shared");
  }
  console.log("OK  driver details share first name, mobile and partial reg only");

  // No mobile → skipped without calling 360dialog.
  {
    const calls: Call[] = [];
    const env = { D360_API_KEY: "k", TRACKING_STORE: memoryKv() };
    const r = await sendDriverOnTheWayWhatsApp(env, { jobKey: "t4", mobile: "" }, fake360({ mat_driver_on_the_way: "approved" }, calls));
    assert.equal(r.sent, false);
    assert.equal(calls.length, 0);
  }
  console.log("OK  bookings without a usable mobile are skipped");

  // Airport pickup: directions + map button (free Long Stay page, Express map, else airport guide).
  {
    assert.equal(airportPickupLinkPath({ airportCode: "BFS", access: "free" }), "pickup/belfast-international-long-stay/");
    assert.equal(airportPickupLinkPath({ airportCode: "BHD", access: "free" }), "pickup/belfast-city-long-stay/");
    assert.equal(
      airportPickupLinkPath({ airportCode: "BFS", access: "express", mapImageUrl: "https://www.myairporttaxini.co.uk/maps/belfast-international-pick-up-drop-off.jpg" }),
      "maps/belfast-international-pick-up-drop-off.jpg",
    );
    assert.equal(airportPickupLinkPath({ airportCode: "BHD", access: "meet-greet" }), "airports/belfast-city/");
    const calls: Call[] = [];
    const env = { D360_API_KEY: "k", TRACKING_STORE: memoryKv() };
    const r = await sendAirportPickupWhatsApp(env, {
      jobKey: "t5",
      customerName: "Sarah Jones",
      mobile: "07377515059",
      tripDate: "2026-10-31",
      tripTime: "14:30",
      airportName: "Belfast International Airport",
      directions: "Please make your way to the Long Stay Car Park\nFree Pick-Up Location.",
      linkPath: "pickup/belfast-international-long-stay/",
    }, fake360({ mat_airport_pickup: "approved" }, calls));
    assert.equal(r.sent, true);
    const body = calls.find((c) => c.url.endsWith("/messages"))?.body as {
      template: { components: Array<{ parameters: Array<{ text: string }> }> };
    };
    assert.equal(body.template.components[0].parameters[1].text, "Sat 31 Oct at 14:30");
    assert.doesNotMatch(body.template.components[0].parameters[3].text, /\n/);
    assert.equal(body.template.components[1].parameters[0].text, "pickup/belfast-international-long-stay/");
  }
  console.log("OK  airport pickup message carries directions and the map link");

  // Driver arrived: airport version has where-to-go + map; home version is short.
  {
    const calls: Call[] = [];
    const env = { D360_API_KEY: "k", TRACKING_STORE: memoryKv() };
    const f = fake360({ mat_driver_arrived: "approved", mat_driver_arrived_airport: "approved" }, calls);
    await sendDriverArrivedWhatsApp(env, {
      jobKey: "a1",
      customerName: "Sarah",
      mobile: "07377515059",
      pickupLabel: "Belfast City Airport",
      airport: { airportName: "George Best Belfast City Airport", directions: "Please make your way to the Long Stay Car Park Free Pick-Up Location.", linkPath: "pickup/belfast-city-long-stay/" },
    }, f);
    await sendDriverArrivedWhatsApp(env, { jobKey: "a2", customerName: "Sam", mobile: "07377515059", pickupLabel: "12 Main Street, Lisburn" }, f);
    const sends = calls.filter((c) => c.url.endsWith("/messages")).map((c) => c.body as { template: { name: string; components: Array<{ parameters: Array<{ text: string }> }> } });
    assert.equal(sends[0].template.name, "mat_driver_arrived_airport");
    assert.equal(sends[0].template.components[1].parameters[0].text, "pickup/belfast-city-long-stay/");
    assert.equal(sends[1].template.name, "mat_driver_arrived");
    assert.equal(sends[1].template.components.length, 1, "home arrival has no button");
  }
  console.log("OK  driver arrived sends the airport map, or a short notice for other pickups");

  // Wiring: every send sits next to its email and never blocks it.
  const read = (p: string) => fs.readFileSync(path.join(root, "workers/addresses/src", p), "utf8");
  assert.match(read("finalize-paid-checkout.ts"), /sendBookingConfirmedWhatsApp\(/);
  assert.match(read("journey-handlers.ts"), /sendDriverOnTheWayWhatsApp\(/);
  assert.match(read("customer-driver-details.ts"), /sendDriverDetailsWhatsApp\(/);
  assert.match(read("review-request-handlers.ts"), /sendReviewRequestWhatsApp\(/);
  assert.match(read("index.ts"), /isWhatsAppTemplatesPath\(url\.pathname\)/);
  assert.match(read("airport-pickup-reminder-handlers.ts"), /sendAirportPickupWhatsApp\(/);
  assert.match(read("journey-handlers.ts"), /sendDriverArrivedWhatsApp\(/);
  assert.match(read("booking-job-handlers.ts"), /customerMobile: accepted\.customerMobile/);
  assert.match(read("driver-assignment-handlers.ts"), /customerMobile: record\.customerMobile/);
  console.log("OK  template sends are wired into all four customer messages");

  console.log("\nAll WhatsApp template checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
