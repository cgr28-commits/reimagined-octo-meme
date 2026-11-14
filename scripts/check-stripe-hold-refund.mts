/** Owner refund on an uncaptured Stripe hold releases it (mocked fetch). Run: npx tsx scripts/check-stripe-hold-refund.mts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { configureStripe } from "../workers/addresses/shared/stripe-payments";
import { processBookingRefundOrCancel } from "../workers/addresses/src/refund-handlers";
import { savePaidBookingRecord, getPaidBookingRecord } from "../workers/addresses/src/paid-booking-store";

const kv = new Map<string,string>();
const KV:any = { get: async (k:string, t?:any)=>{const v=kv.get(k); if(v==null) return null; return (t==="json"||t?.type==="json")?JSON.parse(v):v;}, put: async (k:string,v:string)=>{kv.set(k,v);}, delete: async (k:string)=>{kv.delete(k);}, list: async ()=>({keys:[...kv.keys()].map(name=>({name})),list_complete:true}) };
let piStatus = "requires_capture";
const calls:string[] = [];
(globalThis as any).fetch = async (url:any, init:any={}) => {
  const u = String(url); calls.push(`${init.method||"GET"} ${u.slice(0,120)}`);
  if (u.startsWith("https://api.stripe.com/v1/payment_intents/pi_hold1/cancel")) { piStatus="canceled"; return new Response(JSON.stringify({id:"pi_hold1",status:"canceled"})); }
  if (u.startsWith("https://api.stripe.com/v1/payment_intents/pi_hold1")) return new Response(JSON.stringify({id:"pi_hold1",status:piStatus,amount:3000,amount_capturable:piStatus==="requires_capture"?3000:0,amount_received:0,currency:"gbp",created:1,latest_charge:{id:"ch_1",amount_refunded:0}}));
  if (u.includes("api.sumup.com")) return new Response(JSON.stringify({error_code:"NOT_FOUND"}),{status:404});
  return new Response(JSON.stringify({ok:true}));
};
configureStripe({STRIPE_SECRET_KEY:"rk_live_x"});
const env:any = { TRACKING_STORE: KV, SUMUP_API_KEY: "sumup_x", SUMUP_MERCHANT_CODE: "M1", OWNER_ACCESS_KEY: "owner1", STRIPE_SECRET_KEY:"rk_live_x", PAYMENT_PROVIDER:"stripe" };
const record:any = { paymentReference:"matni-hold-1", checkoutId:"cs_live_hold1", transactionId:"pi_hold1", customerName:"Test", customerEmail:"t@example.com", amount:30, originalAmount:30, currency:"GBP", amountPaidLabel:"£30.00", status:"paid", paymentStatus:"paid", operationalStatus:"active", tripDate:"2026-11-06", tripTime:"14:00", pickupLabel:"A", dropoffLabel:"B", vehicle:"Saloon", tripLabel:"Address-to-address transfer — Saloon", customerReference:"MAT-9999", createdAt:new Date().toISOString(), paidAt:new Date().toISOString() };
await savePaidBookingRecord(KV, record);
const r = await processBookingRefundOrCancel(env, { paymentReference:"matni-hold-1", cancelBooking:true, refundFullRemaining:true, actionKind:"cancel_full_refund", reasonCategory:"other", ownerNotes:"Cancel", idempotencyKey:"k1", confirmOwnerKey:"owner1", initiatedBy:"owner" } as any);
assert.equal(r.ok, true, JSON.stringify(r));
assert.ok(calls.some((c) => c.includes("/payment_intents/pi_hold1/cancel")), "hold is released, not refunded");
assert.ok(!calls.some((c) => c.includes("/v1/refunds")), "no refund call on an uncaptured hold");
const after: any = await getPaidBookingRecord(KV, "matni-hold-1");
assert.equal(after?.status, "refunded");
assert.equal(after?.amountRefunded, 30);
// Durable Objects never run the Worker fetch handler, so they must set the Stripe key themselves.
for (const f of ["workers/addresses/src/refund-coordinator.ts", "workers/addresses/src/meet-greet-upgrade-handlers.ts"]) {
  assert.match(readFileSync(f, "utf8"), /constructor\([\s\S]{0,300}configureStripe\(env\)/, `${f} must call configureStripe(env)`);
}
console.log("stripe hold release via owner refund: OK");
