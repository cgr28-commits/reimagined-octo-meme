import { AVAILABILITY_SOURCE, DEFAULT_TRAFFIC_CONTINGENCY_MINUTES, GATE_NAMES, MANDATORY, SCHEMA, WORDING } from "./constants.js";

/** A commercial leaf: always carries its value and whether it is still provisional. Unknown inputs are null (unconfigured). */
export const leaf = (value, provisional = true) => ({ value, provisional });
const unconfigured = () => ({ value: null, provisional: true });

/** The four existing tours keep their slugs and published prices; the two cruise products are unnamed placeholders. */
function seedTours() {
  const existing = [
    { id: "giants-causeway", slug: "giants-causeway", publishedPricePence: 39500 },
    { id: "belfast-city", slug: "belfast-city", publishedPricePence: 19500 },
    { id: "game-of-thrones", slug: "game-of-thrones", publishedPricePence: 39500 },
    { id: "antrim-coast", slug: "antrim-coast", publishedPricePence: 19500 },
  ];
  const cruise = [{ id: "cruise-product-1", slug: null }, { id: "cruise-product-2", slug: null }];
  return [...existing, ...cruise].map((tour) => ({
    id: tour.id,
    slug: tour.slug,
    name: null,
    cruise: tour.id.startsWith("cruise-"),
    cruiseScope: tour.id.startsWith("cruise-") ? "unconfigured" : null, // "belfastOnly" | "longDistance" once the owner sets it
    publishedPricePence: tour.publishedPricePence ?? null, // existing published price, preserved, never changed by WP-B1
    provisionalPricePence: unconfigured(), // the six approved provisional prices are mapped to tours by the owner
    durationHours: unconfigured(),
    estimatedMiles: unconfigured(),
    includedHours: unconfigured(),
    extraHourPence: unconfigured(),
    active: false,
    bookable: false,
    instantBooking: false,
    provisional: true,
  }));
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
        subcontractorCostCeilingPercent: leaf(60),
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
        partialRefundPercent: unconfigured(),
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
      drivers: { models: { owner: true, paidDriver: false, subcontractor: false }, approvedDrivers: [] },
      retention: { savedItineraryDays: leaf(30), enquiryDays: unconfigured(), bookingDays: unconfigured() },
      content: { photoLibrary: [], reviews: { source: "google-reviews-integration", distinguishAirportAndTourReviews: true, approvedReviewIds: [] } },
      advertising: { tourAdsEnabled: false, externalConversionsEnabled: false, googleAdsApiEnabled: false, excludeFromAirportConversions: true },
      wording: { driverTerm: WORDING.driverTerm, guidingClaimsAllowed: false },
      itinerary: { reservedForWpB4b: true },
    },
    gates: Object.fromEntries(GATE_NAMES.map((name) => [name, { verified: false, evidenceRef: null }])),
    publicLaunch: { enabled: false },
  };
}
