import assert from "node:assert/strict";
import { defaultOwnerPricingSettings, validateOwnerPricingInput } from "../shared/owner-pricing-config";
import { airportPickupOffers, buildMeetGreetOfferEmail, verifyMeetGreetPayment, type MeetGreetUpgrade } from "../shared/meet-greet-upgrade";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import { MeetGreetCoordinator, confirmMeetGreetWebhook, handleMeetGreetUpgrade } from "../workers/addresses/src/meet-greet-upgrade-handlers";
import { getPaidBookingRecord, savePaidBookingRecord } from "../workers/addresses/src/paid-booking-store";
import { saveOwnerPricingSettings } from "../workers/addresses/src/owner-pricing-store";
const now = new Date();
const booking: PaidBookingRecord = { paymentReference: "ORIGINAL-PAYMENT", customerReference: "MAT-1234", checkoutId: "original-checkout", amount: 100, amountPaidLabel: "£100.00", currency: "GBP", customerName: "Test Customer", customerEmail: "customer@example.com", mobileNumber: "07700900123", pickupLabel: "Belfast International Airport", dropoffLabel: "Belfast City Hall", tripLabel: "Airport pickup", tripDate: "2027-02-01", tripTime: "12:00", returnJourney: false, isAirportTrip: true, airportCode: "BFS", isFromAirport: true, vehicle: "Standard Saloon (1–4 passengers)", status: "confirmed", calendarEventIds: [], createdAt: new Date(now.getTime() - 31 * 60_000).toISOString() };
const pricing = defaultOwnerPricingSettings();
pricing.meetGreetEmail = { enabled: { BFS: true, BHD: false, DUB: false }, enabledSince: { BFS: new Date(now.getTime() - 3600_000).toISOString() } };
assert.equal(airportPickupOffers(booking, pricing, now).length, 1);
assert.equal(airportPickupOffers({ ...booking, createdAt: new Date(now.getTime() - 29 * 60_000).toISOString() }, pricing, now).length, 0);
assert.equal(airportPickupOffers({ ...booking, status: "cancelled" }, pricing, now).length, 0);
assert.equal(airportPickupOffers({ ...booking, outboundAirportAccessOption: "meet-greet" }, pricing, now).length, 0);
assert.equal(airportPickupOffers({ ...booking, vehicle: "Executive Saloon (1–4 passengers)" }, pricing, now).length, 0);
assert.equal(airportPickupOffers({ ...booking, pickupLabel: "Belfast City Airport", airportCode: "BHD" }, pricing, now).length, 0);
assert.equal(airportPickupOffers({ ...booking, pickupLabel: booking.dropoffLabel, dropoffLabel: booking.pickupLabel, isFromAirport: false }, pricing, now).length, 0);
const returnPickup = { ...booking, pickupLabel: "Belfast City Hall", dropoffLabel: "Belfast International Airport", isFromAirport: false, returnJourney: true, returnDate: "2027-02-04", returnTime: "15:00" };
assert.equal(airportPickupOffers(returnPickup, pricing, now)[0].leg, "return");
assert.equal(airportPickupOffers({ ...returnPickup, cancelledLegs: ["return"] }, pricing, now).length, 0);
assert.equal(airportPickupOffers(booking, { ...pricing, meetGreetEmail: { enabled: { BFS: true, BHD: false, DUB: false }, enabledSince: { BFS: now.toISOString() } } }, now).length, 0);
assert.equal(validateOwnerPricingInput({ ...pricing, meetGreetEmail: { enabled: { BFS: "true" } } }).ok, false);

const kvData = new Map<string, string>();
const store = { async get(key: string, type?: string) { const value = kvData.get(key); return value == null ? null : type === "json" ? JSON.parse(value) : value; }, async put(key: string, value: string) { kvData.set(key, value); }, async list({ prefix = "" } = {}) { return { keys: [...kvData.keys()].filter(x => x.startsWith(prefix)).map(name => ({ name })), list_complete: true }; } } as unknown as KVNamespace;
const doData = new Map<string, unknown>(); let tail = Promise.resolve();
const state = { storage: { async get(key: string) { return structuredClone(doData.get(key)); }, async put(key: string, value: unknown) { doData.set(key, structuredClone(value)); }, async setAlarm(value: number) { doData.set("alarm", value); } }, blockConcurrencyWhile<T>(fn: () => Promise<T>) { const result = tail.then(fn); tail = result.then(() => {}, () => {}); return result; } } as unknown as DurableObjectState;
let checkoutCount = 0; let paid = false; let checkoutRef = ""; let charge = 15; const emails: Array<{ subject: string; html: string; text: string }> = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("api.resend.com")) { emails.push(JSON.parse(String(init?.body))); return Response.json({ id: `email-${emails.length}` }); }
  if (url.endsWith("/checkouts") && init?.method === "POST") { checkoutCount++; const body = JSON.parse(String(init.body)); assert.match(body.description, /MAT-1234/); assert.match(body.return_url, /workers\.dev\/payments\/webhook/); checkoutRef = body.checkout_reference; charge = body.amount; return Response.json({ id: "upgrade-checkout", hosted_checkout_url: "https://pay.sumup.com/example" }); }
  if (url.endsWith("/checkouts/upgrade-checkout")) return Response.json({ id: "upgrade-checkout", status: paid ? "PAID" : "PENDING", amount: charge, currency: "GBP", checkout_reference: checkoutRef, transactions: paid ? [{ status: "SUCCESSFUL", transaction_code: "MG-TRANSACTION", id: "txn-upgrade" }] : [] });
  throw new Error(`Unexpected network request: ${url}`);
};
async function main() {
  try {
    await savePaidBookingRecord(store, booking);
    const stored = await saveOwnerPricingSettings(store, pricing);
    // Preserve fixture activation time rather than using today's toggle transition.
    kvData.set("owner:pricing-settings", JSON.stringify({ ...stored.settings, meetGreetEmail: pricing.meetGreetEmail }));
    const env = { TRACKING_STORE: store, SUMUP_API_KEY: "test-key", SUMUP_MERCHANT_CODE: "test-merchant", RESEND_API_KEY: "test-mail-key" };
    const coordinator = new MeetGreetCoordinator(state, env);
    const action = (body: object) => coordinator.fetch(new Request("https://internal/action", { method: "POST", body: JSON.stringify(body) }));
    await action({ action: "queue", paymentReference: booking.paymentReference });
    assert.ok((doData.get("alarm") as number) >= Date.now() + 29 * 60_000);
    doData.set("dueAt", Date.now() - 1);
    await coordinator.alarm();
    const offer = (doData.get("offers") as MeetGreetUpgrade[])[0]; assert.ok(offer.offeredAt); assert.equal(emails.length, 1);
    assert.match(emails[0].text, /name board|name.*board/); assert.match(emails[0].html, /MAT-1234/); assert.match(emails[0].html, /logo\.png/); assert.doesNotMatch(emails[0].subject + emails[0].text + emails[0].html, /Colin|\boffer\b/i);
    await coordinator.alarm(); assert.equal(emails.length, 1, "offer is sent once");
    const requests = await Promise.all([action({ action: "checkout", token: offer.token, apiOrigin: "https://test.workers.dev" }), action({ action: "checkout", token: offer.token, apiOrigin: "https://test.workers.dev" })]);
    assert.equal(checkoutCount, 1, "repeat clicks reuse checkout"); assert.ok(requests.every(r => r.ok));
    assert.equal((await getPaidBookingRecord(store, booking.paymentReference))?.airportAccessOption, undefined, "unpaid checkout never changes service");
    const issued = (doData.get("offers") as MeetGreetUpgrade[])[0];
    assert.equal(verifyMeetGreetPayment(issued, { id: issued.checkoutId!, status: "PAID", amount: issued.amount + 1, currency: "GBP", checkout_reference: issued.checkoutReference }), false);
    paid = true;
    await Promise.all([action({ action: "confirm", token: offer.token }), action({ action: "confirm", token: offer.token })]);
    const updated = (await getPaidBookingRecord(store, booking.paymentReference))!;
    assert.equal(updated.paymentReference, booking.paymentReference); assert.equal(updated.checkoutId, "original-checkout");
    assert.equal(updated.amount, 115); assert.equal(updated.additionalPayments?.length, 1); assert.equal(updated.meetGreetUpgrades?.length, 1);
    assert.equal(updated.meetGreetUpgrades?.[0].transactionCode, "MG-TRANSACTION"); assert.equal(updated.airportAccessOption, "meet-greet");
    assert.equal(emails.length, 2); assert.match(emails[1].text, /Meet & Greet selected/); assert.match(emails[1].html, /Meet &amp; Greet selected/);
    const publicEnv = { ...env, MEET_GREET_COORDINATOR: { idFromName: () => "id", get: () => ({ fetch: (_: unknown, init: RequestInit) => action(JSON.parse(String(init.body))) }) } as unknown as DurableObjectNamespace };
    assert.equal(await confirmMeetGreetWebhook(publicEnv, "upgrade-checkout"), "done"); assert.equal(emails.length, 2);
    const publicStatus = await handleMeetGreetUpgrade(new Request(`https://test.workers.dev/meet-greet/status?t=${offer.token}`), publicEnv, "https://www.myairporttaxini.co.uk");
    assert.equal((await publicStatus.json()).state, "paid");
    assert.match(buildMeetGreetOfferEmail(offer, '<script>bad</script>').html, /&lt;script&gt;/);
    console.log("PASS: airport toggles, 30-minute timing, return collection, included/cancelled suppression, new-bookings-only, one email/checkout/top-up, authoritative payment evidence, linked original reference, updated confirmation, webhook and public paid status");
  } finally { globalThis.fetch = originalFetch; }
}
void main();
