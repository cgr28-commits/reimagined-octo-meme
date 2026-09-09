/**
 * Quote vehicle-image preload + Pay Securely → SumUp critical-path checks.
 * Run: npx tsx scripts/check-quote-pay-perf.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== Vehicle image preload / eager result ===");
{
  const showcase = read("src/components/QuoteResultShowcase.tsx");
  const preload = read("src/components/QuoteVehicleImagePreload.tsx");
  const card = read("src/components/QuoteCard.tsx");
  const nextConfig = read("next.config.ts");
  const images = read("src/lib/quote-vehicle-image.ts");
  assert.match(images, /quote-saloon\.webp/);
  assert.match(images, /quote-estate\.webp/);
  assert.match(showcase, /priority/);
  assert.match(showcase, /loading="eager"/);
  assert.match(showcase, /unoptimized/);
  assert.doesNotMatch(showcase, /priority=\{false\}/);
  assert.match(preload, /rel="preload"/);
  assert.match(preload, /quoteVehicleImageSrc/);
  assert.match(preload, /preload\(/);
  assert.match(card, /QuoteVehicleImagePreload/);
  assert.match(card, /partySelectionReady \? \(/);
  assert.match(nextConfig, /\/images\/vehicles\/:file\.webp/);
  assert.match(nextConfig, /max-age=604800/);
  const vercel = read("vercel.json");
  assert.match(vercel, /\/images\/vehicles\/:file\.webp/);
  assert.match(vercel, /max-age=604800/);
  assert.doesNotMatch(showcase, /selectVehicleForParty/);
  console.log("OK  selected vehicle image preloads; result image is eager; cache scoped to webp");
}

console.log("\n=== Pay button immediate SumUp loading ===");
{
  const card = read("src/components/QuoteCard.tsx");
  const setLoading = card.indexOf("setPaymentLoading(true);");
  const validate = card.indexOf("if (!validateCheckoutRequiredFields())", setLoading);
  const availability = card.indexOf("applyCustomerSmartAvailabilityCheck", setLoading);
  assert.ok(setLoading >= 0, "loading state is set");
  assert.ok(validate > setLoading, "loading starts before field validation");
  assert.ok(availability > setLoading, "loading starts before availability await");
  assert.match(card, /Opening secure SumUp payment…/);
  assert.match(card, /aria-busy=\{paymentLoading\}/);
  assert.match(card, /if \(paymentLoading \|\| submitted \|\| paymentInFlightRef\.current\)/);
  console.log("OK  Pay tap shows SumUp loading immediately and blocks double taps");
}

console.log("\n=== Worker critical path vs owner email ===");
{
  const worker = read("workers/addresses/src/index.ts");
  const create = read("src/lib/create-payment.ts");
  const saveIdx = worker.indexOf("await savePendingCheckout(env.TRACKING_STORE");
  const emailIdx = worker.indexOf("const sendOwnerAttemptEmail = async");
  const waitIdx = worker.indexOf("ctx?.waitUntil", emailIdx);
  const savedIdx = worker.indexOf("bookingSaved: true", saveIdx);
  assert.ok(saveIdx >= 0 && emailIdx > saveIdx);
  assert.ok(waitIdx > emailIdx);
  assert.ok(savedIdx > saveIdx);
  assert.match(worker, /payment_checkout_timings/);
  assert.match(worker, /markPayment\("sumupCreateMs"\)/);
  assert.match(worker, /markPayment\("persistMs"\)/);
  assert.doesNotMatch(create, /SUMUP_API_KEY|SUMUP_MERCHANT/);
  assert.match(create, /clientFetchMs/);
  assert.match(create, /ownerAttemptEmailSent\?: boolean/);
  assert.doesNotMatch(create, /if \(result\.ownerAttemptEmailSent\)/);
  console.log("OK  owner email is waitUntil; persist + bookingSaved still gate the URL");
}

console.log("\nAll quote/pay performance checks passed.");
