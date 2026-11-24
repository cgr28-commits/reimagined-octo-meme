/**
 * WP-B1 constants.
 *
 * MANDATORY constraints (safety, security, passenger capacity) live HERE, in code. The settings document can
 * only tighten them (never loosen them), and the validator rejects any document that tries.
 * PROVISIONAL commercial settings live in the settings document and the owner may change them.
 */
export const SCHEMA = "tour-settings/3"; // /3: smartItineraryBuilderEnabled, published duration labels, itinerary scope validation (/2: gate split, variants, positioning, vehicle-supply models)

export const MANDATORY = Object.freeze({
  /** Hard ceiling on passengers for every tour and every vehicle. */
  maxPassengers: 4,
  /** Minimum return buffers (minutes) before the ship's customer-confirmed all-aboard time. Owner can only raise. */
  returnBufferMinutes: Object.freeze({ belfastOnly: 60, longDistance: 90 }),
});

/** Provisional starting point only (owner configurable). Not a safety floor; see validate.js for how it is treated. */
export const DEFAULT_TRAFFIC_CONTINGENCY_MINUTES = 30;

/**
 * Launch gates. Every gate starts CLOSED (verified:false) and stays closed until the owner records evidence.
 *
 * MANDATORY launch prerequisites: must all be verified before any ordinary private-driver tour can be bookable
 * or the public launch switched on.
 * OPTIONAL feature gates: only block the specific feature they guard, and only while that feature is ENABLED.
 * With the feature off, a closed feature gate does not stop ordinary private-driver tours from launching.
 */
export const MANDATORY_LAUNCH_GATES = Object.freeze([
  "insuranceVerified",
  "licensingVerified",
  "cancellationLegalReview",
  "icoRegistrationOrExemption",
  "photoLicensing",
  "competitorBenchmark",
  "pricingApproval",
]);
export const FEATURE_GATES = Object.freeze({
  // Optional: only needed if the owner switches the feature on.
  advertisingApproval: Object.freeze({ feature: "tour advertising and external conversions", mandatory: false }),
  guidingQualifications: Object.freeze({ feature: "guiding claims in wording", mandatory: false }),
  // Mandatory, but ONLY for the area they guard: cruise tours (harbour) and the Smart Itinerary Builder (routing).
  harbourPickupAccess: Object.freeze({ feature: "cruise tours (Belfast Harbour pick-up)", mandatory: true }),
  routingProvider: Object.freeze({ feature: "Smart Itinerary Builder (routing)", mandatory: true }),
});
export const GATE_NAMES = Object.freeze([...MANDATORY_LAUNCH_GATES, ...Object.keys(FEATURE_GATES)]);

/** Operating models. Vehicle cost sits with the business except where a subcontractor brings their own vehicle. */
export const OPERATING_MODELS = Object.freeze(["owner", "paidDriver", "subcontractorOwnVehicle", "subcontractorSuppliedVehicle"]);
export const VARIANT_KINDS = Object.freeze(["half-day", "full-day"]);

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
