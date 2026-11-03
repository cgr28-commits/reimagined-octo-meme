/** Unit checks for shared/stripe-payments.ts (no network: fetch is mocked). Run: npm run check:stripe-payments */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import * as sp from "../shared/stripe-payments";

// form encoding
assert.equal(sp.encodeStripeForm({a:1,b:{c:"x y",d:[{e:2}]},u:undefined}), "a=1&b%5Bc%5D=x%20y&b%5Bd%5D%5B0%5D%5Be%5D=2");
// return url placeholder
assert.equal(sp.withStripeSessionPlaceholder("https://www.myairporttaxini.co.uk/booking-confirmed/"), "https://www.myairporttaxini.co.uk/booking-confirmed/?checkout_id={CHECKOUT_SESSION_ID}");
assert.equal(sp.withStripeSessionPlaceholder("https://x.co/b/?a=1"), "https://x.co/b/?a=1&checkout_id={CHECKOUT_SESSION_ID}");
// ids
assert.ok(sp.isStripeCheckoutId("cs_test_a1B2")); assert.ok(!sp.isStripeCheckoutId("1234-abcd"));
assert.ok(sp.isStripePaymentIntentId("pi_3Abc")); assert.ok(!sp.isStripePaymentIntentId("TXN123"));
// holds
const now = new Date("2026-11-03T12:00:00Z");
assert.equal(sp.shouldUseStripeHold({enabled:true,lastPickupAt:new Date("2026-11-05T12:00:00Z"),now}), true);
assert.equal(sp.shouldUseStripeHold({enabled:true,lastPickupAt:new Date("2026-11-10T12:00:00Z"),now}), false);
assert.equal(sp.shouldUseStripeHold({enabled:false,lastPickupAt:new Date("2026-11-05T12:00:00Z"),now}), false);
assert.equal(sp.shouldUseStripeHold({enabled:true,lastPickupAt:null,now}), false);
const cap = sp.stripeHoldCaptureAt({lastPickupAt:new Date("2026-11-05T12:00:00Z"),captureBefore:new Date("2026-11-10T12:00:00Z"),authorisedAt:now});
assert.equal(cap.toISOString(),"2026-11-05T15:00:00.000Z");
const cap2 = sp.stripeHoldCaptureAt({lastPickupAt:new Date("2026-11-09T23:00:00Z"),captureBefore:new Date("2026-11-10T00:00:00Z"),authorisedAt:now});
assert.equal(cap2.toISOString(),"2026-11-09T12:00:00.000Z");
// mapping
const base = {id:"cs_test_1",object:"checkout.session",status:"complete",payment_status:"unpaid",amount_total:4550,currency:"gbp",client_reference_id:"MAT-1",created:1762171200,expires_at:0} as any;
const held = sp.mapStripeSessionToCheckout({...base,payment_intent:{id:"pi_1",status:"requires_capture",created:1762171300,latest_charge:{id:"ch_1",payment_method_details:{card:{capture_before:1762776000}}}}});
assert.equal(held.status,"PAID"); assert.equal(held.amount,45.5); assert.equal(held.currency,"GBP");
assert.equal(held.transaction_id,"pi_1"); assert.equal(held.checkout_reference,"MAT-1");
assert.equal(held.stripeHold?.paymentIntentId,"pi_1"); assert.ok(held.stripeHold?.captureBefore);
const open = sp.mapStripeSessionToCheckout({...base,status:"open",payment_intent:null});
assert.equal(open.status,"PENDING"); assert.equal(open.transaction_id,undefined);
const paid = sp.mapStripeSessionToCheckout({...base,payment_status:"paid",payment_intent:{id:"pi_2",status:"succeeded",created:1}});
assert.equal(paid.status,"PAID"); assert.equal(paid.stripeHold,undefined);
assert.equal(sp.mapStripeSessionToCheckout({...base,status:"expired"}).status,"EXPIRED");
// webhook
const secret="whsec_test"; const payload=JSON.stringify({id:"evt_1",type:"checkout.session.completed",livemode:false,data:{object:{id:"cs_test_1",object:"checkout.session"}}});
const t=Math.floor(Date.now()/1000); const sig=createHmac("sha256",secret).update(`${t}.${payload}`).digest("hex");
const ev = await sp.verifyStripeWebhook({payload,signatureHeader:`t=${t},v1=${sig}`,secret}); assert.equal(ev.id,"evt_1");
await assert.rejects(sp.verifyStripeWebhook({payload:payload+" ",signatureHeader:`t=${t},v1=${sig}`,secret}));
await assert.rejects(sp.verifyStripeWebhook({payload,signatureHeader:`t=${t-1000},v1=${sig}`,secret}));
await assert.rejects(sp.verifyStripeWebhook({payload,signatureHeader:null,secret}));
// refund routing on a hold (mock fetch)
sp.configureStripe({STRIPE_SECRET_KEY:"sk_test_x"});
const calls:string[]=[];
(globalThis as any).fetch = async (url:string, init:any) => { calls.push(`${init.method} ${url.replace("https://api.stripe.com/v1","")} ${init.body??""}`);
  if (url.includes("/payment_intents/pi_h?")) return new Response(JSON.stringify({id:"pi_h",status:"requires_capture",amount:5000,amount_capturable:5000,amount_received:0,currency:"gbp",created:1}));
  return new Response(JSON.stringify({id:"pi_h",status:"ok",amount:1000,currency:"gbp"}));
};
const full = await sp.refundStripePayment("pi_h"); assert.ok(calls.at(-1)!.includes("/payment_intents/pi_h/cancel")); assert.equal(full.refundedAmount,50);
const part = await sp.refundStripePayment("pi_h", 20); assert.ok(calls.at(-1)!.includes("/capture amount_to_capture=3000"), calls.at(-1)); assert.equal(part.refundedAmount,20);
console.log("stripe-payments unit checks passed", calls.length, "mock calls");
