/** Quote links: changing the pickup date/time re-prices the quote (night/weekend surcharges). */
import assert from "node:assert/strict";
import {
  parseQuickQuoteSchedule,
  quickQuoteScheduleChanged,
  rescaleFareForSchedule,
  rescheduleQuickQuote,
} from "../workers/addresses/src/quick-quote-handlers";
import type { QuickQuoteRecord } from "../shared/quick-quote";

async function main() {
  // Thu 5 Nov 2026 14:00 (no surcharge) → 23:00 (10% night) and Sat (10% weekend).
  const rate = (date: string, time: string) => (date === "2026-11-07" || time >= "22:00" || time < "06:00" ? 0.1 : 0);
  const journey = { outboundDate: "2026-11-05", outboundTime: "14:00", returnJourney: false };
  assert.equal(rescaleFareForSchedule(100, journey, { outboundDate: "2026-11-05", outboundTime: "23:00" }, rate), 110);
  assert.equal(rescaleFareForSchedule(110, { ...journey, outboundTime: "23:00" }, { outboundDate: "2026-11-05", outboundTime: "14:00" }, rate), 100);
  assert.equal(rescaleFareForSchedule(100, journey, { outboundDate: "2026-11-06", outboundTime: "15:00" }, rate), 100);
  // Return: only the moved leg changes. Legs 1 + 1 → 1.1 + 1 = ×1.05.
  const ret = { ...journey, returnJourney: true, returnDate: "2026-11-06", returnTime: "12:00" };
  assert.equal(rescaleFareForSchedule(200, ret, { outboundDate: "2026-11-05", outboundTime: "23:00", returnDate: "2026-11-06", returnTime: "12:00" }, rate), 210);

  assert.deepEqual(parseQuickQuoteSchedule({ tripDate: "2026-11-05", tripTime: "23:00" }, false), { outboundDate: "2026-11-05", outboundTime: "23:00" });
  assert.ok("error" in parseQuickQuoteSchedule({ tripDate: "5/11", tripTime: "23:00" }, false));
  assert.ok("error" in parseQuickQuoteSchedule({ tripDate: "2026-11-05", tripTime: "25:00" }, false));

  const record: QuickQuoteRecord = {
    id: "abc",
    createdAt: "2026-10-29T00:00:00Z",
    expiresAt: null,
    status: "checkout_created",
    checkoutId: "old",
    paymentUrl: "https://pay.example/old",
    journey: {
      pickupAddress: "Dublin Airport",
      dropoffAddress: "Lisburn",
      airportCode: "DUB",
      fromAirport: true,
      returnJourney: false,
      outboundDate: "2026-11-05",
      outboundTime: "14:00",
      passengers: 2,
      suitcases: 2,
      expressDropOffFee: 0,
    },
    quotedAmount: 95,
    quotedAmountLabel: "£95",
    calculatedAmount: 100,
    discountType: "percent",
    discountValue: 5,
    discountAmount: 5,
    pricingSource: "owner-manual",
  };
  assert.equal(quickQuoteScheduleChanged(record.journey, { outboundDate: "2026-11-05", outboundTime: "14:00" }), false);
  assert.equal(quickQuoteScheduleChanged(record.journey, { outboundDate: "2026-11-05", outboundTime: "23:30" }), true);

  // Owner-set fare, default pricing (no store): weekday night surcharge applies at 23:30.
  const moved = await rescheduleQuickQuote(record, { outboundDate: "2026-11-05", outboundTime: "23:30" }, {} as never);
  assert.ok(moved.ok);
  if (moved.ok) {
    assert.equal(moved.record.journey.outboundTime, "23:30");
    assert.ok(moved.record.calculatedAmount! > 100, `night surcharge added (got ${moved.record.calculatedAmount})`);
    assert.equal(moved.record.discountType, "percent", "the quote's discount is kept");
    assert.equal(moved.record.quotedAmount, Math.round(moved.record.calculatedAmount! * 0.95 * 100) / 100);
    assert.equal(moved.record.checkoutId, undefined, "old payment session dropped");
    assert.equal(moved.record.status, "open");
    const back = await rescheduleQuickQuote(moved.record, { outboundDate: "2026-11-05", outboundTime: "14:00" }, {} as never);
    assert.ok(back.ok && back.record.calculatedAmount === 100 && back.record.quotedAmount === 95, "moving back restores the price");
  }
  console.log("All quote-link reschedule checks passed.");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
