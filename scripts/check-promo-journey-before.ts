import assert from "node:assert/strict";
import {
  DEFAULT_PROMO_SETTINGS, normalizePromoSettings, publicPromoConfig, promoBlackoutFor, promoBlackoutMessage,
  promoExcludedRanges, validatePromoSettingsInput,
} from "../shared/promo-code";

let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); console.log(`✓ ${name}`); } catch (e) { failed++; console.error(`✗ ${name}\n  ${(e as Error).message}`); }
}
const stored = normalizePromoSettings({ enabled: true, blackoutDates: [{ from: "2026-12-18", to: "2027-01-03", label: "Christmas" }] });
const ranges = promoExcludedRanges(stored);
check("existing stored settings (no field) default to journeys before 1 June 2027", () => {
  assert.equal(stored.journeyBefore, "2027-06-01");
  assert.equal(publicPromoConfig(stored).journeyBefore, "2027-06-01");
});
check("31 May 2027 allowed, 1 June 2027 and later refused", () => {
  assert.equal(promoBlackoutFor(["2027-05-31"], ranges), null);
  assert.ok(promoBlackoutFor(["2027-06-01"], ranges));
  assert.ok(promoBlackoutFor(["2028-02-01"], ranges));
});
check("a return leg after the cutoff is refused", () => {
  assert.ok(promoBlackoutFor(["2027-05-30", "2027-06-02"], ranges));
});
check("old cutoff of 17 Dec is gone: 20 Jan 2027 is fine; Christmas, Easter, Garth Brooks still excluded", () => {
  const s = normalizePromoSettings({ blackoutDates: DEFAULT_PROMO_SETTINGS.blackoutDates });
  const r = promoExcludedRanges(s);
  assert.equal(promoBlackoutFor(["2027-01-20"], r), null);
  assert.ok(promoBlackoutFor(["2026-12-25"], r));
  assert.ok(promoBlackoutFor(["2027-03-30"], r));
  assert.ok(promoBlackoutFor(["2027-05-22"], r));
});
check("customer message names the date", () => {
  const hit = promoBlackoutFor(["2027-06-10"], ranges)!;
  assert.match(promoBlackoutMessage(hit), /only apply to journeys before 1 Jun 2027/);
});
check("owner can change or clear the date", () => {
  assert.deepEqual(validatePromoSettingsInput({ journeyBefore: "2027-07-01" }), { ok: true, settings: { journeyBefore: "2027-07-01" } });
  assert.deepEqual(validatePromoSettingsInput({ journeyBefore: null }), { ok: true, settings: { journeyBefore: null } });
  assert.equal(validatePromoSettingsInput({ journeyBefore: "soon" }).ok, false);
  assert.equal(promoExcludedRanges(normalizePromoSettings({ journeyBefore: null, blackoutDates: [] })).length, 0);
});
if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nAll promo journey-before checks passed");
