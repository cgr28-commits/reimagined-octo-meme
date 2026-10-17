/** Privacy regression: all browser/external effects are in-memory mocks. */
import assert from "node:assert/strict";
import { consent, memoryStorage } from "./measurement-test-helpers";
import {
  COOKIE_CONSENT_KEY,
  readMeasurementConsent,
  writeCookieConsent,
  hasMarketingCookieConsent,
  flushConsentWithdrawals,
} from "../src/lib/cookie-consent";
import {
  applyConsentDefault,
  updateGoogleConsent,
  trackPurchase,
  trackRequestQuoteConversion,
  trackBookingRequestSubmitted,
} from "../src/lib/google-ads-client";
import { maybeRecordPaidAdVisit } from "../src/lib/ad-fraud-events";
import { readFileSync } from "node:fs";
async function main() {
  const local = memoryStorage(),
    session = memoryStorage(),
    calls: unknown[][] = [],
    events = new EventTarget();
  let beacons = 0;
  Object.assign(globalThis, {
    window: globalThis,
    localStorage: local,
    sessionStorage: session,
    location: {
      search: "?gclid=TEST-ONLY",
      pathname: "/",
      hostname: "audit.invalid",
    },
    dataLayer: [],
    gtag: (...x: unknown[]) => calls.push(x),
    dispatchEvent: events.dispatchEvent.bind(events),
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { cookie: "", referrer: "" },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      userAgent: "audit",
      sendBeacon: () => {
        beacons++;
        return true;
      },
    },
  });
  globalThis.fetch = async () => new Response('{"ok":true}', { status: 200 });
  for (const state of [undefined, consent(false), consent(true)]) {
    local.clear();
    session.clear();
    calls.length = 0;
    beacons = 0;
    if (state) local.setItem(COOKIE_CONSENT_KEY, JSON.stringify(state));
    applyConsentDefault();
    updateGoogleConsent(state?.advertising === true);
    const accepted = state?.advertising === true;
    assert.equal(
      trackRequestQuoteConversion({ value: 50, transactionId: "TEST-Q" }),
      accepted,
    );
    assert.equal(
      trackBookingRequestSubmitted({ value: 50, bookingReference: "TEST-B" }),
      accepted,
    );
    assert.equal(
      trackPurchase({ value: 50, transactionId: "TEST-P" }),
      false,
      "purchase always server-only",
    );
    maybeRecordPaidAdVisit();
    assert.equal(beacons, accepted ? 1 : 0);
    if (!accepted) {
      assert.equal(session.length, 0);
      assert.deepEqual(local.keys(), state ? [COOKIE_CONSENT_KEY] : []);
    }
    const last = calls.filter((c) => c[0] === "consent").at(-1)![2] as Record<
      string,
      string
    >;
    assert.equal(last.ad_personalization, "denied");
  }
  local.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consent()));
  writeCookieConsent("rejected");
  assert.equal(hasMarketingCookieConsent(), false);
  assert.equal(await flushConsentWithdrawals(), true);
  writeCookieConsent("accepted", false);
  assert.equal(readMeasurementConsent()?.analytics, false);
  assert.equal(readMeasurementConsent()?.advertising, true);
  const expired = {
    ...consent(),
    expiresAt: new Date(Date.now() - 1).toISOString(),
  };
  local.setItem(COOKIE_CONSENT_KEY, JSON.stringify(expired));
  assert.equal(readMeasurementConsent(), undefined);
  local.setItem(COOKIE_CONSENT_KEY, "accepted");
  assert.equal(
    readMeasurementConsent(),
    undefined,
    "legacy consent is not a grant",
  );
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.doesNotMatch(layout, /src="https:\/\/(p\.)?tgtag/);
  console.log(
    "PASS accept/decline/undecided, separate purposes, withdrawal, expiry, legacy re-consent, optional storage, fraud gating, server-only purchase",
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
