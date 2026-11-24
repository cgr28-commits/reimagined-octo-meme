import { AVAILABILITY_SOURCE, DEFAULT_TRAFFIC_CONTINGENCY_MINUTES, GATE_NAMES, MANDATORY, SCHEMA, WORDING } from "./constants.js";

/** A commercial leaf: always carries its value and whether it is still provisional. Unknown inputs are null (unconfigured). */
export const leaf = (value, provisional = true) => ({ value, provisional });
const unconfigured = () => ({ value: null, provisional: true });

/**
 * Existing tours keep their slugs and published prices (URLs and "from" prices are never changed by WP-B1).
 * Agreed PROVISIONAL prices are seeded; costs, durations and mileage are genuinely unapproved and stay unconfigured.
 * A tour with half-/full-day options is ONE product with variants (same slug), never two products.
 */
const AGREED_PROVISIONAL_PRICE_PENCE = Object.freeze({
  "giants-causeway": 44500,
  "game-of-thrones": 44500,
  "antrim-coast:full-day": 42500,
  "belfast-city": 24500,
  "cruise-express": 29500,
  "cruise-causeway": 49500,
});
const priceLeaf = (key) => (AGREED_PROVISIONAL_PRICE_PENCE[key] ? leaf(AGREED_PROVISIONAL_PRICE_PENCE[key]) : unconfigured());

/** Agreed PROVISIONAL durations (hours). Antrim Coast 8h is the full-day variant; the half-day duration is not agreed. */
const AGREED_PROVISIONAL_DURATION_HOURS = Object.freeze({
  "giants-causeway": 9,
  "game-of-thrones": 9,
  "antrim-coast:full-day": 8,
  "belfast-city": 5,
  "cruise-express": 6,
  "cruise-causeway": 9,
});
const durationLeaf = (key) => (AGREED_PROVISIONAL_DURATION_HOURS[key] ? leaf(AGREED_PROVISIONAL_DURATION_HOURS[key]) : unconfigured());

/** Durations as currently published on the website (src/lib/tours.ts). Preserved verbatim; never changed by WP-B1. */
const PUBLISHED_DURATION = Object.freeze({
  "giants-causeway": "Full day (~8 hours)",
  "belfast-city": "Half day (~4 hours)",
  "game-of-thrones": "Full day (~8 hours)",
  "antrim-coast": "Half or full day (~4–8 hours)",
  "antrim-coast:half-day": "Half day (~4 hours)",
  "antrim-coast:full-day": "Full day (~8 hours)",
});

function seedUnit(key) {
  return {
    publishedDurationLabel: PUBLISHED_DURATION[key] ?? null,
    provisionalPricePence: priceLeaf(key),
    durationHours: durationLeaf(key),
    estimatedMiles: unconfigured(),
    homePositioningMiles: unconfigured(), // home (Glengormley) to first pick-up and last drop-off back home
    homePositioningHours: unconfigured(),
  };
}

const CRUISE_SCOPE = Object.freeze({ "cruise-express": "belfastOnly", "cruise-causeway": "longDistance" });

/** An empty tour of the current shape (used by migration for owner-added tours). */
export function blankTour() {
  return { id: "", slug: null, name: null, cruise: false, cruiseScope: null, publishedPricePence: null, ...seedUnit("none"), includedHours: unconfigured(), extraHourPence: unconfigured(), variants: [], active: false, bookable: false, instantBooking: false, provisional: true };
}
export function blankVariant() {
  return { id: "", kind: "half-day", publishedPricePence: null, ...seedUnit("none"), active: false, bookable: false, instantBooking: false };
}

function seedTours() {
  const existing = [
    { id: "giants-causeway", slug: "giants-causeway", publishedPricePence: 39500 },
    { id: "belfast-city", slug: "belfast-city", publishedPricePence: 19500 },
    { id: "game-of-thrones", slug: "game-of-thrones", publishedPricePence: 39500 },
    {
      id: "antrim-coast",
      slug: "antrim-coast",
      publishedPricePence: 19500, // "from" price, equals the cheapest variant
      variants: [
        { id: "half-day", kind: "half-day", publishedPricePence: 19500 }, // half-day provisional price is not agreed: unconfigured
        { id: "full-day", kind: "full-day", publishedPricePence: 39500 },
      ],
    },
  ];
  const cruise = [
    { id: "cruise-express", slug: null, name: "Cruise Express" },
    { id: "cruise-causeway", slug: null, name: "Cruise Causeway" },
  ];
  return [...existing, ...cruise].map((tour) => {
    const variants = (tour.variants ?? []).map((v) => ({
      id: v.id,
      kind: v.kind,
      publishedPricePence: v.publishedPricePence,
      ...seedUnit(`${tour.id}:${v.id}`),
      active: false,
      bookable: false,
      instantBooking: false,
    }));
    // With variants the tour-level figures stay empty; only the published "from" duration label lives on the tour.
    const unit = variants.length ? { ...seedUnit(`${tour.id}:none`), publishedDurationLabel: PUBLISHED_DURATION[tour.id] ?? null } : seedUnit(tour.id);
    return {
      id: tour.id,
      slug: tour.slug,
      name: tour.name ?? null,
      cruise: tour.id.startsWith("cruise-"),
      cruiseScope: CRUISE_SCOPE[tour.id] ?? null, // Cruise Express Belfast-only, Cruise Causeway long-distance (owner decision)
      publishedPricePence: tour.publishedPricePence ?? null, // existing published price, preserved
      ...unit, // with variants, these tour-level figures stay unconfigured: each variant carries its own
      includedHours: unconfigured(),
      extraHourPence: unconfigured(),
      variants,
      active: false,
      bookable: false,
      instantBooking: false,
      provisional: true,
    };
  });
}

/** Synthetic staging availability fixtures only (WP-B1 never reads or writes production availability). */
function syntheticAvailability() {
  const days = [];
  for (let i = 1; i <= 14; i += 1) days.push({ date: `2027-03-${String(i).padStart(2, "0")}`, status: i % 7 === 0 ? "blocked" : "open", synthetic: true });
  return days;
}

export function seedSettings() {
  return {
    schema: SCHEMA,
    mandatory: {
      capacity: { maxPassengers: MANDATORY.maxPassengers },
      cruise: {
        returnBufferMinutes: { belfastOnly: MANDATORY.returnBufferMinutes.belfastOnly, longDistance: MANDATORY.returnBufferMinutes.longDistance },
        allAboardTimeCustomerConfirmed: true,
        engineMayReduceTrafficContingency: false,
      },
      pickup: { outsideNorthernIrelandAllowed: false },
      security: { ownerOnly: true, mobilityPreferencesConsentRequired: true, mobilityPreferencesExcludedFromAnalyticsAndAds: true },
      drivers: { cruiseToursNeedExtraDriverApproval: true, automaticSubcontractingAllowed: false },
    },
    commercial: {
      finance: {
        marginFloorPercent: leaf(20),
        paidDriverHourlyPence: leaf(1800),
        subcontractorOwnVehicleCeilingPercent: leaf(60), // subcontractor brings their own vehicle: payout covers vehicle and time
        subcontractorSuppliedVehicleFeePercent: unconfigured(), // subcontractor drives a supplied vehicle (we also bear vehicle cost)
        vehicleRunningCostPencePerMile: leaf(38), // provisional £0.38/mile
        paymentProcessingFeePercent: unconfigured(),
        paymentProcessingFeeFixedPence: unconfigured(),
        administrativeCostPencePerBooking: unconfigured(),
        advertisingAcquisitionCostPence: unconfigured(),
        selfDrivingHourlyEarningsTargetPence: unconfigured(),
        marginOverrides: [],
      },
      tours: seedTours(),
      cruise: {
        port: "belfast-harbour",
        trafficContingencyMinimumMinutes: leaf(DEFAULT_TRAFFIC_CONTINGENCY_MINUTES),
        engineMayIncreaseTrafficContingency: true,
        terminals: [],
        meetingPoints: [],
        accessChargePence: unconfigured(),
        pickupInstructions: unconfigured(),
      },
      cancellation: {
        fullRefundHoursBefore: leaf(48),
        partialRefundHoursBefore: leaf(24),
        partialRefundPercent: leaf(50, false), // agreed 50% tier between the partial and full windows
        ownerDiscretionForExceptionalRefunds: true,
        cruiseScheduleChangesAssessedIndividually: true,
      },
      quotes: { validityDays: leaf(7), availabilityHoldHours: leaf(24), paymentMode: leaf("full"), ownerIssuedQuotesOnly: true },
      availability: {
        source: AVAILABILITY_SOURCE,
        minTourHours: leaf(4),
        maxWorkingDayHours: leaf(11),
        positioningBufferMinutes: unconfigured(),
        restBreakMinutes: unconfigured(),
        seasons: [],
        daysOff: [],
        blackoutDates: [],
        syntheticFixture: syntheticAvailability(),
      },
      pickup: {
        includedZones: ["greater-belfast", "belfast-international-airport", "belfast-city-airport", "belfast-harbour"],
        manualSupplements: [],
        accessChargesSeparate: true,
      },
      vehicles: [],
      drivers: { models: { owner: true, paidDriver: false, subcontractorOwnVehicle: false, subcontractorSuppliedVehicle: false }, approvedDrivers: [] },
      retention: { savedItineraryDays: leaf(30), enquiryDays: unconfigured(), bookingDays: unconfigured() },
      content: { photoLibrary: [], reviews: { source: "google-reviews-integration", distinguishAirportAndTourReviews: true, approvedReviewIds: [] } },
      advertising: { tourAdsEnabled: false, externalConversionsEnabled: false, googleAdsApiEnabled: false, excludeFromAirportConversions: true },
      wording: { driverTerm: WORDING.driverTerm, guidingClaimsAllowed: false },
      itinerary: { reservedForWpB4b: true, smartItineraryBuilderEnabled: false },
    },
    gates: Object.fromEntries(GATE_NAMES.map((name) => [name, { verified: false, evidenceRef: null }])),
    publicLaunch: { enabled: false },
  };
}
