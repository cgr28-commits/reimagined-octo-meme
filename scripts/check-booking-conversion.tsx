/** Conversion presentation + existing monetary invariants. No network or payment writes. */
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import BookingPaymentOptions from "../src/components/BookingPaymentOptions";
import QuoteReassurance from "../src/components/QuoteReassurance";
import { calculateDepositCashQuote, publicDepositCashOffer, PAYMENT_METHOD_DEPOSIT_CASH, PAYMENT_METHOD_FULL_ONLINE } from "../shared/deposit-cash";
import { isWithin24HoursOfPickup, remainingRefundableBalance } from "../shared/refund-ops";
Object.assign(globalThis, { React });
const settings = { enabled: true, percent: 20, minimumGbp: 15 };
for (const [total, deposit, cash, eligible] of [[68,15,53,true],[100,20,80,true],[190.4,38.4,152,true],[15,15,0,false],[10,10,0,false],[0,0,0,false]] as const) {
  const offer = publicDepositCashOffer(total, settings);
  assert.equal(offer.depositGbp, deposit); assert.equal(offer.cashDueGbp, cash); assert.equal(offer.eligible, eligible);
  assert.equal(Math.round((deposit+cash)*100), Math.round(total*100));
  const html = renderToStaticMarkup(<BookingPaymentOptions offer={offer} paymentMethod={PAYMENT_METHOD_DEPOSIT_CASH} cashAgreementAccepted={false} onPaymentMethodChange={()=>{}} onCashAgreementChange={()=>{}} />);
  if (eligible) {
    assert.match(html, /required=""/); assert.doesNotMatch(html, /checked=""/);
    assert.ok(html.includes(`£${deposit.toFixed(2)} today`)); assert.ok(html.includes(`£${cash.toFixed(2)} cash to your driver on pickup`));
    assert.doesNotMatch(html, /PAYMENT SUMMARY|Deposit \+ Cash selected/);
  } else assert.equal(html, "");
}
const full = renderToStaticMarkup(<BookingPaymentOptions offer={publicDepositCashOffer(68, settings)} paymentMethod={PAYMENT_METHOD_FULL_ONLINE} cashAgreementAccepted={false} onPaymentMethodChange={()=>{}} onCashAgreementChange={()=>{}} />);
assert.match(full, /£68\.00 today/); assert.match(full, /Nothing to pay on pickup/);
assert.doesNotMatch(full, /type="checkbox"|payable in cash only/);
assert.equal(publicDepositCashOffer(68, {...settings, enabled:false}).eligible, false);
assert.equal(calculateDepositCashQuote(100,{...settings,percent:30}).depositGbp,30);
assert.equal(calculateDepositCashQuote(68,{...settings,minimumGbp:25}).depositGbp,25);
const reassurance = renderToStaticMarkup(<QuoteReassurance depositAvailable />);
assert.match(reassurance, /100% Refund — Cancel 24\+ Hours Before Pickup/);
assert.match(reassurance, /Secure Your Booking with a Small Deposit/);
assert.doesNotMatch(renderToStaticMarkup(<QuoteReassurance />), /Small Deposit/);
for (const paid of [15,68]) assert.equal(remainingRefundableBalance(paid,0),paid);
assert.equal(isWithin24HoursOfPickup("2026-11-02","12:00",new Date("2026-11-01T12:00:00Z")),false);
assert.equal(isWithin24HoursOfPickup("2026-11-02","12:00",new Date("2026-11-01T12:00:01Z")),true);
assert.equal(isWithin24HoursOfPickup("2026-11-02","12:00",new Date("2026-11-01T11:59:59Z")),false);
console.log("PASS conversion amounts, low-total eligibility, settings, dynamic copy, acknowledgement markup and exact 24h refund boundary");
