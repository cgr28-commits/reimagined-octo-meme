/**
 * Owner-dashboard controls for messages sent after a journey is completed.
 * Tip payment and the public tip page are separate and stay available either way.
 */
import { DEFAULT_GOOGLE_REVIEW_URL } from "./google-business-profile";
import {
  ensureReviewRequestScheduled,
  isReviewRequestDue,
  type TrackingJobRecord,
} from "./tracking";

export const DEFAULT_POST_JOURNEY_DELAY_HOURS = 2;
export const MAX_POST_JOURNEY_DELAY_HOURS = 72;

export type PostJourneyRequestSettings = {
  /** Ask for an optional tip after the journey. Default off. */
  tipRequestsEnabled: boolean;
  /** Send one Google review invitation after the journey. Default on. */
  googleReviewRequestsEnabled: boolean;
  /** Hours after completion before the review invitation is due. Default 2. */
  delayHours: number;
  /** Google Business Profile "Write a review" link. */
  googleReviewUrl: string;
};

export type PostJourneySkipReason =
  | "disabled"
  | "not_completed"
  | "cancelled"
  | "duplicate"
  | "test_booking"
  | "opted_out";

export type AutomaticReviewPlan =
  | { action: "skip"; reason: PostJourneySkipReason }
  | { action: "wait"; dueAt: string }
  | { action: "send"; dueAt: string };

const REVIEW_HOSTS = new Set([
  "g.page",
  "www.google.com",
  "search.google.com",
  "maps.google.com",
  "maps.app.goo.gl",
]);

export function defaultPostJourneyRequestSettings(): PostJourneyRequestSettings {
  return {
    tipRequestsEnabled: false,
    googleReviewRequestsEnabled: true,
    delayHours: DEFAULT_POST_JOURNEY_DELAY_HOURS,
    googleReviewUrl: DEFAULT_GOOGLE_REVIEW_URL,
  };
}

/** Accept only an https Google "write a review" link. */
export function parseStoredGoogleReviewUrl(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value || value.includes("ChIJXXXXXXXX")) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!REVIEW_HOSTS.has(host)) return null;
  const path = `${url.pathname}${url.search}`.toLowerCase();
  const directReview = path.includes("review") || host === "search.google.com";
  if (!directReview) return null;
  url.hash = "";
  return url.toString();
}

function normalizeDelayHours(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(value)) return DEFAULT_POST_JOURNEY_DELAY_HOURS;
  const clamped = Math.min(MAX_POST_JOURNEY_DELAY_HOURS, Math.max(0, value));
  const halfHours = Math.round(clamped * 2) / 2;
  return halfHours;
}

export function normalizePostJourneyRequestSettings(raw: unknown): PostJourneyRequestSettings {
  const defaults = defaultPostJourneyRequestSettings();
  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    tipRequestsEnabled: body.tipRequestsEnabled === true,
    googleReviewRequestsEnabled: body.googleReviewRequestsEnabled === false ? false : true,
    delayHours:
      body.delayHours == null || body.delayHours === ""
        ? defaults.delayHours
        : normalizeDelayHours(body.delayHours),
    googleReviewUrl: parseStoredGoogleReviewUrl(body.googleReviewUrl) ?? defaults.googleReviewUrl,
  };
}

export function parsePostJourneyRequestSettingsInput(raw: unknown): PostJourneyRequestSettings {
  if (!raw || typeof raw !== "object") {
    throw new Error("Post-journey settings are missing.");
  }
  const body = raw as Record<string, unknown>;
  if (typeof body.tipRequestsEnabled !== "boolean" || typeof body.googleReviewRequestsEnabled !== "boolean") {
    throw new Error("Choose on or off for tip requests and Google review requests.");
  }
  const delayNumber =
    typeof body.delayHours === "number" ? body.delayHours : Number(String(body.delayHours ?? "").trim());
  if (
    !Number.isFinite(delayNumber) ||
    delayNumber < 0 ||
    delayNumber > MAX_POST_JOURNEY_DELAY_HOURS ||
    Math.abs(delayNumber * 2 - Math.round(delayNumber * 2)) > 1e-9
  ) {
    throw new Error("Post-journey delay must be between 0 and 72 hours, in half-hour steps.");
  }
  const googleReviewUrl = parseStoredGoogleReviewUrl(body.googleReviewUrl);
  if (!googleReviewUrl) {
    throw new Error("Enter the Google Business Profile review link, starting with https://.");
  }
  return {
    tipRequestsEnabled: body.tipRequestsEnabled,
    googleReviewRequestsEnabled: body.googleReviewRequestsEnabled,
    delayHours: delayNumber,
    googleReviewUrl,
  };
}

export function postJourneyDelayMs(settings: PostJourneyRequestSettings): number {
  return Math.round(normalizeDelayHours(settings.delayHours) * 60 * 60 * 1000);
}

/** True only when the owner has asked us to message the customer with a tip link. */
export function tipRequestShouldSend(
  settings: PostJourneyRequestSettings,
  tipDecision: string | undefined,
): boolean {
  return settings.tipRequestsEnabled === true && tipDecision === "no";
}

export function isPostJourneyTestBooking(input: {
  paymentReference?: string | null;
  token?: string | null;
  customerEmail?: string | null;
  customerName?: string | null;
  pickupLabel?: string | null;
  dropoffLabel?: string | null;
  isRefundTest?: boolean;
  isAmendmentTestFixture?: boolean;
}): boolean {
  if (input.isRefundTest === true || input.isAmendmentTestFixture === true) return true;
  const ref = String(input.paymentReference ?? "").trim().toLowerCase();
  const token = String(input.token ?? "").trim().toLowerCase();
  if (ref.startsWith("stg-test-") || token.startsWith("stg-test-")) return true;
  const email = String(input.customerEmail ?? "").trim().toLowerCase();
  if (email === "staging-test@example.com") return true;
  const name = String(input.customerName ?? "").trim().toLowerCase();
  if (name === "staging test") return true;
  const labels = [input.customerName, input.pickupLabel, input.dropoffLabel].join("\n");
  return /\[TEST\b/i.test(labels);
}

/**
 * One automatic review invitation. The same rules apply to every completed
 * journey: no score filter and no incentive. A journey already marked sent
 * is never selected again.
 */
export function planAutomaticReviewRequest(input: {
  settings: PostJourneyRequestSettings;
  nowMs: number;
  nowIso?: string;
  journeyStatus?: string;
  journeyCompletedAt?: string;
  reviewRequestScheduledAt?: string;
  reviewRequestDueAt?: string;
  reviewRequestSentAt?: string;
  refundedAt?: string;
  cancelled?: boolean;
  testBooking?: boolean;
  optedOut?: boolean;
}): AutomaticReviewPlan {
  if (!input.settings.googleReviewRequestsEnabled) {
    return { action: "skip", reason: "disabled" };
  }
  if (input.reviewRequestSentAt?.trim()) {
    return { action: "skip", reason: "duplicate" };
  }
  if (input.cancelled || input.refundedAt?.trim()) {
    return { action: "skip", reason: "cancelled" };
  }
  if (input.testBooking) {
    return { action: "skip", reason: "test_booking" };
  }
  if (input.optedOut) {
    return { action: "skip", reason: "opted_out" };
  }
  if (input.journeyStatus !== "completed") {
    return { action: "skip", reason: "not_completed" };
  }

  const delayMs = postJourneyDelayMs(input.settings);
  const nowIso = input.nowIso ?? new Date(input.nowMs).toISOString();
  const scheduled = ensureReviewRequestScheduled(
    {
      journeyStatus: "completed",
      journeyCompletedAt: input.journeyCompletedAt,
      reviewRequestScheduledAt: input.reviewRequestScheduledAt,
      reviewRequestDueAt: input.reviewRequestDueAt,
      reviewRequestSentAt: input.reviewRequestSentAt,
      refundedAt: input.refundedAt,
    } as TrackingJobRecord,
    delayMs,
    nowIso,
  );
  const dueAt = scheduled.reviewRequestDueAt?.trim() || "";
  if (!dueAt) return { action: "skip", reason: "not_completed" };
  if (!isReviewRequestDue(scheduled, delayMs, input.nowMs)) {
    return { action: "wait", dueAt };
  }
  return { action: "send", dueAt };
}
