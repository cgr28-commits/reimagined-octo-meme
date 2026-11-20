/**
 * Post-journey tip and Google review switches.
 * Run: npx tsx scripts/check-post-journey-requests.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildGoogleReviewRequestEmail } from "../shared/booking-notifications";
import { DEFAULT_GOOGLE_REVIEW_URL } from "../shared/google-business-profile";
import { decideTipOnCompletion, generateTipToken } from "../shared/journey-tip";
import {
  defaultPostJourneyRequestSettings,
  isPostJourneyTestBooking,
  normalizePostJourneyRequestSettings,
  parsePostJourneyRequestSettingsInput,
  planAutomaticReviewRequest,
  postJourneyDelayMs,
  tipRequestShouldSend,
  type PostJourneyRequestSettings,
} from "../shared/post-journey-requests";
import {
  getBookingSettings,
  updateCardBalanceDepositSettings,
  updatePostJourneyRequestSettings,
} from "../workers/addresses/src/booking-settings-store";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

class MemoryKv {
  private data = new Map<string, string>();
  async get(key: string, type?: string): Promise<unknown> {
    const raw = this.data.get(key);
    if (raw == null) return null;
    return type === "json" ? JSON.parse(raw) : raw;
  }
  async put(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

const COMPLETED = "2026-08-17T12:00:00.000Z";
const TWO_HOURS = 2 * 60 * 60 * 1000;

function settings(overrides: Partial<PostJourneyRequestSettings> = {}): PostJourneyRequestSettings {
  return { ...defaultPostJourneyRequestSettings(), ...overrides };
}

function plan(
  overrides: Partial<Parameters<typeof planAutomaticReviewRequest>[0]> = {},
  requestSettings = settings(),
) {
  return planAutomaticReviewRequest({
    settings: requestSettings,
    nowMs: Date.parse(COMPLETED),
    nowIso: COMPLETED,
    journeyStatus: "completed",
    journeyCompletedAt: COMPLETED,
    ...overrides,
  });
}

async function main() {
  console.log("=== 1. Defaults ===");
  {
    const defaults = defaultPostJourneyRequestSettings();
    assert.equal(defaults.tipRequestsEnabled, false);
    assert.equal(defaults.googleReviewRequestsEnabled, true);
    assert.equal(defaults.delayHours, 2);
    assert.equal(defaults.googleReviewUrl, DEFAULT_GOOGLE_REVIEW_URL);
    assert.equal(postJourneyDelayMs(defaults), TWO_HOURS);
    const missing = normalizePostJourneyRequestSettings(undefined);
    assert.deepEqual(missing, defaults);
    console.log("OK  tips off, reviews on, 2 hours, Business Profile review link");
  }

  console.log("\n=== 2. Toggle combinations ===");
  {
    const cases: Array<[Partial<PostJourneyRequestSettings>, boolean, boolean]> = [
      [{}, false, true],
      [{ tipRequestsEnabled: true, googleReviewRequestsEnabled: false }, true, false],
      [{ tipRequestsEnabled: false, googleReviewRequestsEnabled: true }, false, true],
      [{ tipRequestsEnabled: false, googleReviewRequestsEnabled: false }, false, false],
      [{ tipRequestsEnabled: true, googleReviewRequestsEnabled: true }, true, true],
    ];
    for (const [overrides, tipSend, reviewSend] of cases) {
      const next = settings(overrides);
      assert.equal(tipRequestShouldSend(next, "no"), tipSend);
      assert.equal(tipRequestShouldSend(next, "yes"), false);
      const review = plan({ nowMs: Date.parse(COMPLETED) + TWO_HOURS }, next);
      assert.equal(review.action, reviewSend ? "send" : "skip");
      if (!reviewSend) assert.equal(review.action === "skip" && review.reason, "disabled");
    }
    console.log("OK  each switch acts on its own message");
  }

  console.log("\n=== 3. Persistence ===");
  {
    const store = new MemoryKv() as unknown as KVNamespace;
    const initial = await getBookingSettings(store);
    assert.equal(initial.postJourneyRequests.tipRequestsEnabled, false);
    assert.equal(initial.postJourneyRequests.googleReviewRequestsEnabled, true);
    assert.equal(initial.postJourneyRequests.delayHours, 2);
    assert.equal(initial.postJourneyRequests.googleReviewUrl, DEFAULT_GOOGLE_REVIEW_URL);

    const saved = await updatePostJourneyRequestSettings(store, {
      tipRequestsEnabled: true,
      googleReviewRequestsEnabled: false,
      delayHours: 4,
      googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
    });
    assert.equal(saved.postJourneyRequests.tipRequestsEnabled, true);
    assert.equal(saved.postJourneyRequests.googleReviewRequestsEnabled, false);
    assert.equal(saved.postJourneyRequests.delayHours, 4);

    await updateCardBalanceDepositSettings(store, { enabled: false });
    const kept = await getBookingSettings(store);
    assert.equal(kept.cardBalanceDeposit.enabled, false);
    assert.equal(kept.postJourneyRequests.tipRequestsEnabled, true);
    assert.equal(kept.postJourneyRequests.delayHours, 4);
    assert.equal(kept.postJourneyRequests.googleReviewUrl, DEFAULT_GOOGLE_REVIEW_URL);

    await assert.rejects(
      () =>
        updatePostJourneyRequestSettings(store, {
          tipRequestsEnabled: true,
          googleReviewRequestsEnabled: true,
          delayHours: 2,
          googleReviewUrl: "http://example.com/review",
        }),
      /Google Business Profile review link/,
    );
    const unchanged = await getBookingSettings(store);
    assert.equal(unchanged.postJourneyRequests.googleReviewUrl, DEFAULT_GOOGLE_REVIEW_URL);
    assert.equal(unchanged.postJourneyRequests.tipRequestsEnabled, true);

    const parsed = parsePostJourneyRequestSettingsInput({
      tipRequestsEnabled: false,
      googleReviewRequestsEnabled: true,
      delayHours: 0.5,
      googleReviewUrl: "https://g.page/r/CbzkRdTv-0hNEBM/review",
    });
    assert.equal(parsed.delayHours, 0.5);
    assert.equal(parsed.googleReviewUrl, DEFAULT_GOOGLE_REVIEW_URL);
    console.log("OK  settings survive another save, and a bad link is refused");
  }

  console.log("\n=== 4. Timing ===");
  {
    const waiting = plan({ nowMs: Date.parse(COMPLETED) + 60 * 60 * 1000 });
    assert.equal(waiting.action, "wait");
    if (waiting.action !== "wait") throw new Error("expected wait");
    assert.equal(Date.parse(waiting.dueAt) - Date.parse(COMPLETED), TWO_HOURS);

    const due = plan({
      nowMs: Date.parse(COMPLETED) + TWO_HOURS,
      reviewRequestScheduledAt: COMPLETED,
      reviewRequestDueAt: waiting.dueAt,
    });
    assert.equal(due.action, "send");

    const later = settings({ delayHours: 4 });
    const fourHours = plan({ nowMs: Date.parse(COMPLETED) + TWO_HOURS }, later);
    assert.equal(fourHours.action, "wait");
    if (fourHours.action !== "wait") throw new Error("expected wait");
    assert.equal(Date.parse(fourHours.dueAt) - Date.parse(COMPLETED), 4 * 60 * 60 * 1000);
    console.log("OK  2 hour default, custom delay, and due time");
  }

  console.log("\n=== 5. Idempotency and exclusions ===");
  {
    const first = plan();
    assert.equal(first.action, "wait");
    if (first.action !== "wait") throw new Error("expected wait");
    const second = plan({
      nowMs: Date.parse(COMPLETED) + 5 * 60 * 1000,
      reviewRequestScheduledAt: COMPLETED,
      reviewRequestDueAt: first.dueAt,
    });
    assert.equal(second.action, "wait");
    if (second.action !== "wait") throw new Error("expected wait");
    assert.equal(second.dueAt, first.dueAt);

    const sent = plan({
      nowMs: Date.parse(COMPLETED) + 24 * 60 * 60 * 1000,
      reviewRequestScheduledAt: COMPLETED,
      reviewRequestDueAt: first.dueAt,
      reviewRequestSentAt: "2026-08-17T14:00:00.000Z",
    });
    assert.deepEqual(sent, { action: "skip", reason: "duplicate" });

    const dueMs = Date.parse(COMPLETED) + TWO_HOURS;
    assert.equal(plan({ nowMs: dueMs, cancelled: true }).action, "skip");
    assert.equal(plan({ nowMs: dueMs, refundedAt: COMPLETED }).reason, "cancelled");
    assert.equal(plan({ nowMs: dueMs, testBooking: true }).reason, "test_booking");
    assert.equal(plan({ nowMs: dueMs, optedOut: true }).reason, "opted_out");
    assert.equal(plan({ nowMs: dueMs, journeyStatus: "en_route" }).reason, "not_completed");

    assert.equal(isPostJourneyTestBooking({ paymentReference: "stg-test-123" }), true);
    assert.equal(isPostJourneyTestBooking({ isRefundTest: true }), true);
    assert.equal(isPostJourneyTestBooking({ customerEmail: "staging-test@example.com" }), true);
    assert.equal(isPostJourneyTestBooking({ customerName: "Sarah Jones", customerEmail: "sarah@example.co.uk" }), false);
    console.log("OK  one invitation, then skip; cancelled, test, and opted-out stay out");
  }

  console.log("\n=== 6. Neutral review copy, tip payment unchanged ===");
  {
    const email = buildGoogleReviewRequestEmail({ customerName: "Sarah Jones" }, DEFAULT_GOOGLE_REVIEW_URL);
    assert.match(email.text, /honest review/i);
    assert.match(email.text, /g\.page\/r\/CbzkRdTv-0hNEBM\/review/);
    assert.doesNotMatch(email.text, /discount|voucher|free journey|5-star only|only if you enjoyed/i);
    assert.doesNotMatch(email.html, /discount|voucher|5-star only/i);

    const decided = decideTipOnCompletion({}, false, COMPLETED, generateTipToken());
    assert.equal(decided.decision.tipDecision, "no");
    assert.equal(decided.createdTipRequest, true);
    assert.equal(tipRequestShouldSend(settings(), "no"), false);
    assert.equal(tipRequestShouldSend(settings({ tipRequestsEnabled: true }), "no"), true);
    console.log("OK  review asks everyone equally; turning tips off does not remove the tip record");
  }

  console.log("\n=== 7. Wiring ===");
  {
    const journey = read("workers/addresses/src/journey-handlers.ts");
    assert.match(journey, /tipRequestShouldSend/);
    assert.match(journey, /attachTipDecision/);
    assert.match(journey, /googleReviewRequestsEnabled/);
    const review = read("workers/addresses/src/review-request-handlers.ts");
    assert.match(review, /planAutomaticReviewRequest/);
    assert.match(review, /isMarketingOptedOut/);
    assert.match(review, /isPostJourneyTestBooking/);
    const panel = read("src/components/OwnerPostJourneyRequestSettings.tsx");
    assert.match(panel, /Tip request/);
    assert.match(panel, /Google review request/);
    assert.match(panel, /data-owner-post-journey-requests/);
    console.log("OK  dashboard, tip send, and review send use the saved switches");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
