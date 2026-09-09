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

console.log("=== Both vehicle images warm on quote mount ===");
{
  const showcase = read("src/components/QuoteResultShowcase.tsx");
  const preload = read("src/components/QuoteVehicleImagePreload.tsx");
  const card = read("src/components/QuoteCard.tsx");
  const nextConfig = read("next.config.ts");
  const images = read("src/lib/quote-vehicle-image.ts");
  assert.match(images, /QUOTE_SALOON_IMAGE/);
  assert.match(images, /QUOTE_ESTATE_IMAGE/);
  assert.match(images, /QUOTE_VEHICLE_IMAGES/);
  assert.match(preload, /QUOTE_VEHICLE_IMAGES/);
  assert.match(preload, /rel="preload"/);
  assert.match(preload, /new Image\(\)/);
  assert.doesNotMatch(preload, /quoteVehicleImageSrc/);
  assert.doesNotMatch(preload, /vehicleType/);
  assert.match(card, /<QuoteVehicleImagePreload \/>/);
  assert.doesNotMatch(card, /partySelectionReady[\s\S]{0,80}QuoteVehicleImagePreload/);
  assert.doesNotMatch(card, /QuoteVehicleImagePreload[\s\S]{0,80}partySelectionReady/);
  assert.match(showcase, /priority/);
  assert.match(showcase, /loading="eager"/);
  assert.match(showcase, /unoptimized/);
  assert.match(showcase, /key=\{vehicleImage\}/);
  assert.doesNotMatch(showcase, /priority=\{false\}/);
  assert.doesNotMatch(showcase, /selectVehicleForParty/);
  assert.match(nextConfig, /\/images\/vehicles\/:file\.webp/);
  assert.match(nextConfig, /max-age=604800/);
  const vercel = read("vercel.json");
  assert.match(vercel, /\/images\/vehicles\/:file\.webp/);
  assert.match(vercel, /max-age=604800/);
  console.log("OK  both Saloon and Estate images preload before party selection");
}

console.log("\n=== Pay does not preflight Smart Availability ===");
{
  const card = read("src/components/QuoteCard.tsx");
  const payHandler = card.slice(
    card.indexOf("async function handlePayNow()"),
    card.indexOf("function handleOpenPaymentAgain()"),
  );
  assert.doesNotMatch(payHandler, /applyCustomerSmartAvailabilityCheck/);
  assert.match(payHandler, /createPaymentCheckout\(/);
  assert.match(payHandler, /isPaymentSmartAvailabilityError/);
  assert.match(payHandler, /applyCustomerAvailabilityResult/);
  assert.match(card, /applyCustomerSmartAvailabilityCheck/);
  console.log("OK  Pay uses /payments availability; other booking paths keep the preflight");
}

console.log("\n=== /payments still blocks unavailable bookings before SumUp ===");
{
  const worker = read("workers/addresses/src/index.ts");
  const create = read("src/lib/create-payment.ts");
  const saveIdx = worker.indexOf("await timePaymentStage(\"persistMs\", () =>");
  const saveCallIdx = worker.indexOf("savePendingCheckout(paymentStore", saveIdx);
  const emailIdx = worker.indexOf("const sendOwnerAttemptEmail = async");
  const waitIdx = worker.indexOf("ctx?.waitUntil", emailIdx);
  const urlIdx = worker.indexOf("paymentUrl: checkout.paymentUrl", emailIdx);
  const createIdx = worker.indexOf("timePaymentStage(\"sumupCreateMs\"");
  const blockIdx = worker.lastIndexOf(
    "blockedCustomerSmartAvailabilityResponse",
    createIdx,
  );
  assert.ok(blockIdx >= 0 && blockIdx < createIdx, "availability gate runs before SumUp create");
  assert.match(worker, /alternativeTimes: publicGate\.alternativeTimes/);
  assert.match(worker, /toPublicCustomerSmartAvailability/);
  assert.match(worker, /code: "smart_availability_unavailable"/);
  assert.ok(saveCallIdx >= 0 && emailIdx > saveCallIdx);
  assert.ok(waitIdx > emailIdx);
  assert.ok(urlIdx > emailIdx);
  assert.match(worker, /bookingSaved: true/);
  assert.match(create, /code === "smart_availability_unavailable"/);
  assert.match(create, /alternativeTimes/);
  assert.doesNotMatch(create, /SUMUP_API_KEY|SUMUP_MERCHANT/);
  assert.doesNotMatch(worker, /console\.log\([^\n]*paymentUrl/);
  console.log("OK  Worker SA block includes customer alternatives; persist still gates the URL");
}

console.log("\n=== Stage-duration timings, no PII ===");
{
  const worker = read("workers/addresses/src/index.ts");
  const create = read("src/lib/create-payment.ts");
  const card = read("src/components/QuoteCard.tsx");
  for (const key of [
    "availabilityMs",
    "routeTokenMs",
    "routeResolveMs",
    "fareValidationMs",
    "sumupCreateMs",
    "persistMs",
    "ownerNotifyMs",
    "totalResponseMs",
  ]) {
    assert.match(worker, new RegExp(key));
    assert.match(create, new RegExp(key));
  }
  assert.doesNotMatch(worker, /markPayment\(/);
  assert.match(create, /clientFetchMs/);
  assert.match(card, /tapToRequestMs/);
  assert.match(card, /paymentsFetchMs/);
  assert.match(card, /responseToRedirectMs/);
  assert.match(card, /tapToNavigateMs/);
  assert.doesNotMatch(card, /console\.info\("\[payment-timing\]",[\s\S]{0,400}paymentUrl/);
  console.log("OK  timings are per-stage durations; logs omit payment URLs and PII");
}

console.log("\n=== Signed quote route token is issued and sent, never trusted raw ===");
{
  const quote = read("workers/addresses/src/quote-handlers.ts");
  const token = read("workers/addresses/src/quote-route-token.ts");
  const worker = read("workers/addresses/src/index.ts");
  const create = read("src/lib/create-payment.ts");
  const card = read("src/components/QuoteCard.tsx");
  const api = read("src/lib/quick-quote-api.ts");
  assert.match(token, /signQuoteRouteToken/);
  assert.match(token, /verifyQuoteRouteToken/);
  assert.match(token, /HMAC/);
  assert.match(quote, /routeMetricsSource === "worker"/);
  assert.match(quote, /quoteBody\.routeToken = await signQuoteRouteToken/);
  assert.match(api, /routeToken: payload\.routeToken\.trim\(\)/);
  assert.match(card, /setQuoteRouteToken\(result\.routeToken/);
  assert.match(card, /routeToken: quoteRouteToken\.trim\(\)/);
  assert.match(create, /routeToken: request\.routeToken\.trim\(\)/);
  assert.match(worker, /verifyQuoteRouteToken/);
  assert.match(worker, /signed_quote_token/);
  assert.match(worker, /resolveWorkerTripRouteMetricsForPayment/);
  assert.match(worker, /Never trust body\.routeMetrics/);
  assert.doesNotMatch(quote, /quoteBody\.[^\n]*QUOTE_ROUTE_TOKEN_SECRET/);
  assert.doesNotMatch(create, /QUOTE_ROUTE_TOKEN_SECRET|OWNER_ACCESS_KEY|HMAC/);
  assert.doesNotMatch(card, /QUOTE_ROUTE_TOKEN_SECRET|OWNER_ACCESS_KEY/);
  const tokenIdx = worker.indexOf("verifyQuoteRouteToken");
  const resolveIdx = worker.indexOf("resolveWorkerTripRouteMetricsForPayment", tokenIdx);
  const fareIdx = worker.indexOf("calculateAuthoritativeWebsiteQuote", resolveIdx);
  const saIdx = worker.indexOf("blockedCustomerSmartAvailabilityResponse", fareIdx);
  const sumupIdx = worker.indexOf("createSumUpHostedCheckout", saIdx);
  const persistIdx = worker.indexOf("savePendingCheckout(paymentStore", sumupIdx);
  const urlIdx = worker.indexOf("paymentUrl: checkout.paymentUrl", persistIdx);
  assert.ok(tokenIdx >= 0 && resolveIdx > tokenIdx, "token verify before full resolve fallback");
  assert.ok(fareIdx > resolveIdx, "fare still recalculated after route decision");
  assert.ok(saIdx > fareIdx && saIdx < sumupIdx, "Smart Availability still runs before SumUp");
  assert.ok(persistIdx > sumupIdx && urlIdx > persistIdx, "persist still gates paymentUrl");
  console.log("OK  signed route token is Worker-issued, Pay-sent, and fare/SA/SumUp order is unchanged");
}

console.log("\n=== Pay button immediate SumUp loading ===");
{
  const card = read("src/components/QuoteCard.tsx");
  const setLoading = card.indexOf("setPaymentLoading(true);");
  const validate = card.indexOf("if (!validateCheckoutRequiredFields())", setLoading);
  const checkout = card.indexOf("createPaymentCheckout(", setLoading);
  assert.ok(setLoading >= 0, "loading state is set");
  assert.ok(validate > setLoading, "loading starts before field validation");
  assert.ok(checkout > validate, "checkout starts after validation");
  assert.match(card, /Opening secure SumUp payment…/);
  assert.match(card, /aria-busy=\{paymentLoading\}/);
  assert.match(card, /if \(paymentLoading \|\| submitted \|\| paymentInFlightRef\.current\)/);
  console.log("OK  Pay tap shows SumUp loading immediately and blocks double taps");
}

console.log("\nAll quote/pay performance checks passed.");
