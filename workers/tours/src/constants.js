/**
 * WP-B1 constants.
 *
 * MANDATORY constraints (safety, security, passenger capacity) live HERE, in code. The settings document can
 * only tighten them (never loosen them), and the validator rejects any document that tries.
 * PROVISIONAL commercial settings live in the settings document and the owner may change them.
 */
export const SCHEMA = "tour-settings/1";

export const MANDATORY = Object.freeze({
  /** Hard ceiling on passengers for every tour and every vehicle. */
  maxPassengers: 4,
  /** Minimum return buffers (minutes) before the ship's customer-confirmed all-aboard time. Owner can only raise. */
  returnBufferMinutes: Object.freeze({ belfastOnly: 60, longDistance: 90 }),
});

/** Provisional starting point only (owner configurable). Not a safety floor; see validate.js for how it is treated. */
export const DEFAULT_TRAFFIC_CONTINGENCY_MINUTES = 30;

/** Launch gates. Every gate starts CLOSED (verified:false) and stays closed until the owner records evidence. */
export const GATE_NAMES = Object.freeze([
  "insuranceVerified",
  "licensingVerified",
  "cancellationLegalReview",
  "icoRegistrationOrExemption",
  "harbourPickupAccess",
  "photoLicensing",
  "competitorBenchmark",
  "pricingApproval",
  "guidingQualifications",
  "advertisingApproval",
  "routingProvider",
]);

export const OPERATING_MODELS = Object.freeze(["owner", "paidDriver", "subcontractor"]);

/** Availability in WP-B1 is synthetic staging fixtures only: no production availability read or write. */
export const AVAILABILITY_SOURCE = "synthetic-staging-fixture";

/** Anything that references airport pricing configuration or production resources is rejected. */
export const FORBIDDEN_REFERENCES = [
  /airport[\s_-]*pricing/i,
  /pricing[\s_-]*config/i,
  /point[\s_-]*to[\s_-]*point/i,
  /myairporttaxini\.co\.uk/i,
  /36c5c88df4c1f0259413d555f2679f3c/i,
  /(^|[^a-z0-9])prod(uction)?[\s_-]*(availability|kv|worker|namespace)/i,
];

/** No 7-seater / fleet wording anywhere (maximum four passengers). */
export const FORBIDDEN_WORDING = [/\b7[\s-]*seat/i, /\bseven[\s-]*seat/i, /\bmpv\b/i, /\bminibus\b/i, /\bfleet\b/i, /\bpeople[\s-]*carrier\b/i];

export const WORDING = Object.freeze({ driverTerm: "private local driver" });
export const GUIDING_CLAIM = /\b(tour[\s-]*guide|driver[\s-]*guide|professional[\s-]*guid|qualified[\s-]*guide|blue[\s-]*badge)\b/i;
