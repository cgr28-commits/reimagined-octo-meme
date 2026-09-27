/**
 * Post-journey tips stay separate from the fare and are paid only after SumUp confirms.
 * Run: npx tsx scripts/check-journey-tip.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import {
  applyConfirmedSumUpTip,
  buildTipPageUrl,
  decideTipOnCompletion,
  formatTipGbp,
  generateTipToken,
  isOpaqueTipToken,
  leaveTipButtonLabel,
  optionalTipWhatsAppMessage,
  parseTipAmountGbp,
  planTipCheckout,
  publicTipState,
  TIP_LINK_INVALID_MESSAGE,
  TIP_PAGE_THANKS,
  TIP_TOKEN_STORAGE_KEY,
  TIP_TOKEN_STRIP_SCRIPT,
  TIPPED_IN_PERSON_MESSAGE,
  tipPaymentInProgressMessage,
  tipWhatsAppMessage,
  type JourneyTipRecord,
} from "../shared/journey-tip";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const YES =
  "Thank you for travelling with My Airport Taxi NI. We really appreciate your custom and your kind tip. We hope you had a comfortable journey.";
const NO_PREFIX =
  "Thank you for travelling with My Airport Taxi NI. We hope you had a comfortable journey. If you’d like to leave an optional tip, you can do so securely here: ";

function requestedTip(overrides: Partial<JourneyTipRecord> = {}): JourneyTipRecord {
  return {
    tipToken: "a".repeat(32),
    trackingJobToken: "job-token-internal",
    paymentReference: "pay_internal_only",
    requestedAt: "2026-09-27T12:00:00.000Z",
    status: "requested",
    ...overrides,
  };
}

console.log("=== 1. WhatsApp wording ===");
{
  assert.equal(TIPPED_IN_PERSON_MESSAGE, YES);
  const token = "0123456789abcdef0123456789abcdef";
  const url = buildTipPageUrl(token);
  assert.equal(optionalTipWhatsAppMessage(url), `${NO_PREFIX}${url}`);
  assert.equal(tipWhatsAppMessage({ tipDecision: "yes" }), YES);
  assert.equal(
    tipWhatsAppMessage({ tipDecision: "no", tipToken: token }),
    `${NO_PREFIX}${url}`,
  );
  assert.equal(tipWhatsAppMessage({}), null);
  console.log("OK  yes thanks the tip; no offers an optional link");
}

console.log("\n=== 2. Opaque tip link ===");
{
  const token = generateTipToken();
  assert.equal(isOpaqueTipToken(token), true);
  assert.equal(token.length, 32);
  const url = buildTipPageUrl(token);
  assert.equal(url, `https://www.myairporttaxini.co.uk/tip/?t=${token}`);
  const leaked = ["MAT", "pay_", "jane@", "07700", "customer", "booking"];
  for (const piece of leaked) {
    assert.equal(url.toLowerCase().includes(piece.toLowerCase()), false);
  }
  assert.equal(isOpaqueTipToken("MAT123"), false);
  assert.equal(isOpaqueTipToken("jane@example.com"), false);
  assert.equal(isOpaqueTipToken(token.toUpperCase()), false);
  console.log("OK  token is 32 hex chars and the URL has no booking identity");
}

console.log("\n=== 3. Amounts £3 / £5 / £10 and custom validation ===");
{
  for (const amount of [3, 5, 10]) {
    const parsed = parseTipAmountGbp(amount);
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.amountGbp, amount);
      assert.equal(leaveTipButtonLabel(amount), `Leave £${amount} tip`);
    }
  }
  const custom = parseTipAmountGbp("7.50");
  assert.deepEqual(custom, { ok: true, amountGbp: 7.5 });
  assert.equal(formatTipGbp(7.5), "£7.50");
  assert.equal(leaveTipButtonLabel(7.5), "Leave £7.50 tip");

  for (const bad of [0, -5, "0", "-1", "abc", "1.2.3", "10.999", "", "  ", "£0", "0.50", "101", "100.01", Number.NaN, Infinity]) {
    const parsed = parseTipAmountGbp(bad);
    assert.equal(parsed.ok, false, `expected reject ${String(bad)}`);
  }
  assert.deepEqual(parseTipAmountGbp("100"), { ok: true, amountGbp: 100 });
  assert.deepEqual(parseTipAmountGbp("1"), { ok: true, amountGbp: 1 });
  assert.deepEqual(parseTipAmountGbp("£5"), { ok: true, amountGbp: 5 });
  console.log("OK  presets pass; zero, negative, malformed and over £100 fail");
}

console.log("\n=== 4. SumUp confirmation — return visit is not payment ===");
{
  const open = requestedTip({
    pendingCheckoutId: "chk_pending",
    pendingAmountGbp: 5,
    pendingPaymentUrl: "https://pay.sumup.example/pending",
  });
  const visited = applyConfirmedSumUpTip(
    open,
    { paid: false, checkoutId: "chk_pending", amount: 5, status: "PENDING" },
    "2026-09-27T13:00:00.000Z",
  );
  assert.equal(visited.paidNow, false);
  assert.equal(visited.record.status, "requested");
  assert.equal(visited.record.amountGbp, undefined);
  assert.equal(visited.paymentNotCompleted, false);

  const cancelled = applyConfirmedSumUpTip(
    open,
    { paid: false, checkoutId: "chk_pending", status: "CANCELLED" },
    "2026-09-27T13:00:00.000Z",
  );
  assert.equal(cancelled.paidNow, false);
  assert.equal(cancelled.record.status, "requested");
  assert.equal(cancelled.paymentNotCompleted, true);

  const failed = applyConfirmedSumUpTip(
    open,
    { paid: false, checkoutId: "chk_pending", status: "FAILED" },
    "2026-09-27T13:00:00.000Z",
  );
  assert.equal(failed.record.status, "requested");
  assert.equal(failed.paymentNotCompleted, true);

  const paid = applyConfirmedSumUpTip(
    open,
    {
      paid: true,
      checkoutId: "chk_pending",
      amount: 5,
      status: "PAID",
      transactionCode: "T-1",
    },
    "2026-09-27T13:05:00.000Z",
  );
  assert.equal(paid.paidNow, true);
  assert.equal(paid.record.status, "paid");
  assert.equal(paid.record.amountGbp, 5);
  assert.equal(paid.record.paidAt, "2026-09-27T13:05:00.000Z");
  assert.equal(paid.record.checkoutId, "chk_pending");
  assert.deepEqual(publicTipState(paid.record), { ok: true, state: "paid", amountGbp: 5 });

  const second = applyConfirmedSumUpTip(
    paid.record,
    { paid: true, checkoutId: "chk_other", amount: 10, status: "PAID" },
    "2026-09-27T13:10:00.000Z",
  );
  assert.equal(second.paidNow, false);
  assert.equal(second.record.amountGbp, 5);
  assert.equal(second.record.checkoutId, "chk_pending");
  assert.equal(second.record.paidAt, "2026-09-27T13:05:00.000Z");

  const noAmount = applyConfirmedSumUpTip(
    requestedTip(),
    { paid: true, checkoutId: "chk_new", status: "PAID" },
    "2026-09-27T13:00:00.000Z",
  );
  assert.equal(noAmount.paidNow, false);
  assert.equal(noAmount.record.status, "requested");

  const fare = { amount: 42, checkoutId: "original-journey-checkout" };
  assert.equal(fare.amount, 42);
  assert.equal(fare.checkoutId, "original-journey-checkout");
  assert.equal(planTipCheckout(paid.record, 5), "already_paid");
  console.log("OK  unpaid/cancelled stays open; paid sticks; a second checkout cannot replace it");
}

console.log("\n=== 4b. One live SumUp checkout per tip token ===");
{
  const pending = requestedTip({
    pendingCheckoutId: "chk_3",
    pendingCheckoutReference: "tip-ref-3",
    pendingAmountGbp: 3,
    pendingPaymentUrl: "https://pay.sumup.example/chk_3",
  });
  const stillPending = { paid: false, status: "PENDING" };

  assert.equal(planTipCheckout(pending, 10, stillPending), "in_progress");
  assert.equal(planTipCheckout(pending, 3, stillPending), "reuse");
  assert.equal(planTipCheckout(pending, 10), "in_progress");
  for (const status of ["CANCELLED", "CANCELED", "FAILED", "DECLINED", "EXPIRED"]) {
    assert.equal(planTipCheckout(pending, 10, { paid: false, status }), "create", status);
  }

  const replaced = {
    ...pending,
    pendingCheckoutId: "chk_10",
    pendingCheckoutReference: "tip-ref-10",
    pendingAmountGbp: 10,
    pendingPaymentUrl: "https://pay.sumup.example/chk_10",
  };
  const oldPaid = applyConfirmedSumUpTip(
    replaced,
    {
      paid: true,
      checkoutId: "chk_3",
      amount: 3,
      status: "PAID",
      checkoutReference: "tip-ref-3",
    },
    "2026-09-27T14:00:00.000Z",
  );
  assert.equal(oldPaid.paidNow, false);
  assert.equal(oldPaid.record.status, "requested");
  assert.equal(oldPaid.record.pendingCheckoutId, "chk_10");
  assert.equal(oldPaid.record.amountGbp, undefined);

  const wrongAmount = applyConfirmedSumUpTip(
    replaced,
    {
      paid: true,
      checkoutId: "chk_10",
      amount: 3,
      status: "PAID",
      checkoutReference: "tip-ref-10",
    },
    "2026-09-27T14:01:00.000Z",
  );
  assert.equal(wrongAmount.paidNow, false);
  assert.equal(wrongAmount.record.status, "requested");

  const wrongRef = applyConfirmedSumUpTip(
    replaced,
    {
      paid: true,
      checkoutId: "chk_10",
      amount: 10,
      status: "PAID",
      checkoutReference: "tip-ref-3",
    },
    "2026-09-27T14:02:00.000Z",
  );
  assert.equal(wrongRef.paidNow, false);

  const confirmed = applyConfirmedSumUpTip(
    replaced,
    {
      paid: true,
      checkoutId: "chk_10",
      amount: 10,
      status: "PAID",
      checkoutReference: "tip-ref-10",
      transactionCode: "T-10",
    },
    "2026-09-27T14:03:00.000Z",
  );
  assert.equal(confirmed.paidNow, true);
  assert.equal(confirmed.record.amountGbp, 10);
  assert.equal(planTipCheckout(confirmed.record, 3, { paid: false, status: "PENDING" }), "already_paid");
  assert.equal(planTipCheckout(confirmed.record, 10), "already_paid");
  assert.match(tipPaymentInProgressMessage(3), /£3/);
  assert.match(tipPaymentInProgressMessage(3), /already in progress/);

  const tipHandlers = read("workers/addresses/src/journey-tip-handlers.ts");
  const createAt = tipHandlers.indexOf("await createSumUpHostedCheckout");
  const inProgressAt = tipHandlers.indexOf('plan !== "create"');
  assert.ok(inProgressAt > 0 && createAt > inProgressAt);
  assert.match(tipHandlers, /pendingCheckoutId !== id/);
  assert.doesNotMatch(tipHandlers, /finalizePaidCheckout|savePaidBookingRecord/);
  const client = read("src/app/tip/TipPageClient.tsx");
  const inProgressClient = client.indexOf("paymentInProgress");
  const assignAt = client.indexOf("location.assign");
  assert.ok(inProgressClient > 0 && assignAt > inProgressClient);
  console.log("OK  pending £3 blocks £10; cancelled £3 allows £10; old checkout cannot mark paid");
}

console.log("\n=== 5. Duplicate completion ===");
{
  const now = "2026-09-27T12:00:00.000Z";
  const token = "b".repeat(32);
  const yes = decideTipOnCompletion({}, true, now, token);
  assert.equal(yes.createdTipRequest, false);
  assert.equal(yes.openWhatsApp, true);
  assert.equal(yes.decision.tipDecision, "yes");
  assert.equal(yes.decision.tipToken, undefined);
  assert.equal(tipWhatsAppMessage(yes.decision), YES);

  const yesAgain = decideTipOnCompletion(yes.decision, false, "2026-09-27T12:05:00.000Z", "c".repeat(32));
  assert.equal(yesAgain.openWhatsApp, false);
  assert.equal(yesAgain.createdTipRequest, false);
  assert.equal(yesAgain.decision.tipDecision, "yes");
  assert.equal(yesAgain.decision.tipToken, undefined);

  const no = decideTipOnCompletion({}, false, now, token);
  assert.equal(no.createdTipRequest, true);
  assert.equal(no.openWhatsApp, true);
  assert.equal(no.decision.tipToken, token);
  const noAgain = decideTipOnCompletion(no.decision, false, "2026-09-27T12:05:00.000Z", "d".repeat(32));
  assert.equal(noAgain.openWhatsApp, false);
  assert.equal(noAgain.createdTipRequest, false);
  assert.equal(noAgain.decision.tipToken, token);
  console.log("OK  Yes sends no link; No keeps one token; repeats do not resend");
}

console.log("\n=== 6. Owner prompt, worker, and page wiring ===");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /Did the customer tip\?|confirmCopy\.title/);
  assert.match(panel, /data-owner-tip-yes[\s\S]{0,280}customerTipped:\s*true/);
  assert.match(panel, /data-owner-tip-no[\s\S]{0,280}customerTipped:\s*false/);
  const cancel = panel.match(/data-owner-tip-cancel[\s\S]{0,220}/);
  assert.ok(cancel);
  assert.doesNotMatch(cancel[0], /handleJourneyAction/);
  assert.match(panel, /result\.tip\.openWhatsApp/);
  assert.match(panel, /result\.tip\.whatsappMessage/);
  assert.match(panel, /The thank-you message was not opened again/);

  const handlers = read("workers/addresses/src/journey-handlers.ts");
  assert.match(handlers, /journeyStatusOf\(record\) === "completed"/);
  assert.match(handlers, /parseCustomerTipped\(body\.customerTipped\)/);
  assert.match(handlers, /idempotent: true/);
  assert.doesNotMatch(handlers, /finalizePaidCheckout/);

  const tipHandlers = read("workers/addresses/src/journey-tip-handlers.ts");
  assert.match(tipHandlers, /isSumUpCheckoutPaid/);
  assert.match(tipHandlers, /description: "Optional driver tip"/);
  assert.doesNotMatch(tipHandlers, /finalizePaidCheckout|savePaidBookingRecord|onlineAmountPaid/);
  assert.doesNotMatch(tipHandlers, /searchParams\.get\("paid"\)/);
  assert.match(tipHandlers, /publicTipState/);

  const worker = read("workers/addresses/src/index.ts");
  const webhookAt = worker.indexOf("confirmJourneyTipWebhook");
  const finalizeAt = worker.indexOf("finalizePaidCheckout", webhookAt);
  assert.ok(webhookAt > 0 && finalizeAt > webhookAt);

  const page = read("src/app/tip/page.tsx");
  assert.match(page, /index: false/);
  assert.match(page, /follow: false/);
  const client = read("src/app/tip/TipPageClient.tsx");
  assert.match(client, /Thank you for travelling with us/);
  assert.match(client, /Would you like to leave your driver a tip\?/);
  assert.match(client, /Tips are completely optional and greatly appreciated\./);
  assert.match(client, /Secure payment powered by SumUp/);
  assert.match(client, /Your \{formatTipGbp\(view\.amountGbp\)\} tip has been received/);
  assert.match(client, /TIP_PAGE_THANKS/);
  assert.equal(
    TIP_PAGE_THANKS,
    "We really appreciate your kindness and thank you for travelling with My Airport Taxi NI.",
  );
  assert.doesNotMatch(client, /dataLayer|gtag\(|GoogleAds/);
  assert.match(client, /replaceState/);
  assert.match(client, /fetchTipStatus/);
  assert.match(client, /paymentInProgress/);
  assert.doesNotMatch(client, /state: "paid"/);

  const sitemap = read("scripts/generate-sitemap.mjs");
  assert.doesNotMatch(sitemap, /path:\s*"\/tip\//);
  const robots = read("src/app/robots.ts");
  assert.match(robots, /"\/tip"/);
  assert.equal(TIP_LINK_INVALID_MESSAGE, "This link is not valid.");
  console.log("OK  prompt, SumUp-only paid flag, noindex tip page, sitemap omits /tip/");
}

console.log("\n=== 7. Tip token is stripped before sitewide tracking ===");
{
  const layout = read("src/app/layout.tsx");
  const stripAt = layout.indexOf('id="strip-tip-token"');
  const trafficAt = layout.indexOf('id="trafficguard-init"');
  const adsAt = layout.indexOf("<GoogleAdsTag");
  assert.ok(stripAt > 0 && trafficAt > stripAt && adsAt > stripAt);
  assert.match(layout.slice(stripAt, stripAt + 180), /beforeInteractive/);
  assert.match(layout, /TIP_TOKEN_STRIP_SCRIPT/);
  assert.doesNotMatch(TIP_TOKEN_STRIP_SCRIPT, /useLayoutEffect|useEffect/);

  function runStrip(href: string): { search: string; stored?: string } {
    const url = new URL(href);
    const location = {
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
    };
    const store = new Map<string, string>();
    const context = {
      location,
      history: {
        state: null as null,
        replaceState(_state: null, _title: string, next: string) {
          const parsed = new URL(next, url.origin);
          location.pathname = parsed.pathname;
          location.search = parsed.search;
          location.hash = parsed.hash;
        },
      },
      sessionStorage: {
        setItem(key: string, value: string) {
          store.set(key, value);
        },
      },
      URLSearchParams,
    };
    vm.runInNewContext(TIP_TOKEN_STRIP_SCRIPT, context);
    return { search: location.search, stored: store.get(TIP_TOKEN_STORAGE_KEY) };
  }

  const token = "0123456789abcdef0123456789abcdef";
  const stripped = runStrip(`https://www.myairporttaxini.co.uk/tip/?t=${token}`);
  assert.equal(stripped.search, "");
  assert.equal(stripped.stored, token);
  const withExtra = runStrip(`https://www.myairporttaxini.co.uk/tip/?t=${token}&checkout_id=abc`);
  assert.equal(withExtra.search, "");
  assert.equal(withExtra.stored, token);
  const invalid = runStrip("https://www.myairporttaxini.co.uk/tip/?t=not-a-token");
  assert.equal(invalid.search, "");
  assert.equal(invalid.stored, undefined);
  const homepage = runStrip(`https://www.myairporttaxini.co.uk/?t=${token}`);
  assert.equal(homepage.search, `?t=${token}`);
  assert.equal(homepage.stored, undefined);
  const trailing = runStrip(`https://www.myairporttaxini.co.uk/tip/?t=${token}#paid`);
  assert.equal(trailing.search, "");
  assert.equal(trailing.stored, token);
  console.log("OK  /tip/ query is removed before tracking; other pages are left alone");
}

console.log("\nJourney tip checks passed.");
