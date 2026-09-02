/**
 * Ad Fraud monitoring — validation, hashing, scoring, wiring regressions.
 * Run: npx tsx scripts/check-ad-fraud-monitoring.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  anonymisedVisitorLabel,
  hashAdFraudIp,
  hashAdFraudVisitorId,
  isPaidAdAttribution,
  recomputeVisitorScore,
  scoreAdFraudVisitor,
  validateAdFraudIngestPayload,
  type AdFraudEventRecord,
} from "../shared/ad-fraud";
import { sanitizeAdsAttribution } from "../shared/ads-attribution";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function check(label: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`OK  ${label}`));
}

async function main() {
  await check("Event validation accepts known types and rejects unknown", () => {
    const ok = validateAdFraudIngestPayload({
      eventType: "quote_started",
      sessionId: "abcdefghijklmnop",
      landingPath: "/airports/belfast-international/",
    });
    assert.equal(ok.ok, true);

    const bad = validateAdFraudIngestPayload({ eventType: "purchase_conversion" });
    assert.equal(bad.ok, false);

    const paidMissing = validateAdFraudIngestPayload({ eventType: "paid_visit" });
    assert.equal(paidMissing.ok, false);

    const paidOk = validateAdFraudIngestPayload({
      eventType: "paid_visit",
      attribution: { gclid: "Cj0TEST", utm_source: "google", utm_medium: "cpc" },
      landingPath: "/",
    });
    assert.equal(paidOk.ok, true);
  });

  await check("Hash generation is irreversible and stable for same inputs", async () => {
    const salt = "test-salt-ad-fraud-123456";
    const a = await hashAdFraudVisitorId({
      salt,
      sessionId: "session-aaa",
      ipHash: "iphash1",
      userAgentNorm: "Chrome/Windows",
    });
    const b = await hashAdFraudVisitorId({
      salt,
      sessionId: "session-aaa",
      ipHash: "iphash1",
      userAgentNorm: "Chrome/Windows",
    });
    const c = await hashAdFraudVisitorId({
      salt,
      sessionId: "session-bbb",
      ipHash: "iphash1",
      userAgentNorm: "Chrome/Windows",
    });
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(anonymisedVisitorLabel(a), /^vis_[a-f0-9]+$/i);

    const ip = await hashAdFraudIp("203.0.113.10", salt);
    assert.ok(ip);
    assert.notEqual(ip, "203.0.113.10");
  });

  await check("Scoring: repeated visits without engagement elevate risk", () => {
    const low = scoreAdFraudVisitor({
      paidVisits24h: 3,
      paidVisits7d: 3,
      hasQuoteActivity: false,
      hasMeaningfulEngagement: false,
    });
    assert.equal(low.risk, "low");

    const medium = scoreAdFraudVisitor({
      paidVisits24h: 6,
      paidVisits7d: 6,
      hasQuoteActivity: false,
      hasMeaningfulEngagement: false,
    });
    assert.equal(medium.risk, "medium");

    const high = scoreAdFraudVisitor({
      paidVisits24h: 9,
      paidVisits7d: 12,
      hasQuoteActivity: false,
      hasMeaningfulEngagement: false,
    });
    assert.equal(high.risk, "high");
  });

  await check("Genuine customer activity reduces suspicion to normal", () => {
    const engaged = scoreAdFraudVisitor({
      paidVisits24h: 9,
      paidVisits7d: 12,
      hasQuoteActivity: true,
      hasMeaningfulEngagement: true,
    });
    assert.equal(engaged.risk, "normal");
  });

  await check("Two to three visits alone are not treated as fraud", () => {
    const mild = scoreAdFraudVisitor({
      paidVisits24h: 2,
      paidVisits7d: 2,
      hasQuoteActivity: false,
      hasMeaningfulEngagement: false,
    });
    assert.equal(mild.risk, "normal");
  });

  await check("Paid attribution detection covers gclid and UTM campaign traffic", () => {
    assert.equal(isPaidAdAttribution(sanitizeAdsAttribution({ gclid: "x" })), true);
    assert.equal(
      isPaidAdAttribution(
        sanitizeAdsAttribution({ utm_source: "google", utm_medium: "cpc", utm_campaign: "bfs" }),
      ),
      true,
    );
    assert.equal(isPaidAdAttribution(sanitizeAdsAttribution({ utm_source: "newsletter" })), false);
    assert.equal(isPaidAdAttribution(undefined), false);
  });

  await check("recomputeVisitorScore uses event timeline windows", () => {
    const now = Date.parse("2026-09-02T12:00:00.000Z");
    const events: AdFraudEventRecord[] = [];
    for (let i = 0; i < 6; i += 1) {
      events.push({
        id: `e${i}`,
        timestamp: new Date(now - i * 60 * 60 * 1000).toISOString(),
        eventType: "paid_visit",
        visitorHash: "abc",
      });
    }
    const scored = recomputeVisitorScore({ events }, now);
    assert.equal(scored.risk, "medium");
  });

  await check("Wiring: TrafficGuard untouched; Ad Fraud modules + admin auth present", () => {
    const layout = read("src/app/layout.tsx");
    assert.match(layout, /tg-g-026255-001/);
    assert.match(layout, /AdFraudMonitor/);
    assert.match(layout, /AdsAttributionCapture/);

    const index = read("workers/addresses/src/index.ts");
    assert.match(index, /handleAdFraudIngestRequest/);
    assert.match(index, /handleAdFraudAdminSummaryRequest/);
    assert.match(index, /AD_FRAUD_HASH_SALT/);
    assert.match(index, /runAdFraudRetentionCleanup/);

    const handlers = read("workers/addresses/src/ad-fraud-handlers.ts");
    assert.match(handlers, /ownerAuthorized/);
    assert.match(handlers, /CF-Connecting-IP/);
    assert.doesNotMatch(handlers, /blockingEnabled:\s*true/);

    const header = read("src/components/OwnerPortalHeader.tsx");
    assert.match(header, /\/admin\/ad-fraud\//);

    const privacy = read("src/lib/privacy.ts");
    assert.match(privacy, /advertising abuse/);
    assert.match(privacy, /90 days/);

    // Must not invent Google Ads conversion calls in fraud modules.
    const eventsClient = read("src/lib/ad-fraud-events.ts");
    assert.doesNotMatch(eventsClient, /send_to|trackPurchase|gtag\(/);
  });

  await check("Shared ad-fraud mirror stays in sync after sync:worker-shared", () => {
    const a = read("shared/ad-fraud.ts");
    const b = read("workers/addresses/shared/ad-fraud.ts");
    assert.equal(a, b);
  });

  console.log("\nAll Ad Fraud monitoring checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
