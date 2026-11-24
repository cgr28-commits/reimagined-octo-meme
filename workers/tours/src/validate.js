import { AVAILABILITY_SOURCE, FEATURE_GATES, FORBIDDEN_REFERENCES, FORBIDDEN_WORDING, GATE_NAMES, GUIDING_CLAIM, MANDATORY, MANDATORY_LAUNCH_GATES, OPERATING_MODELS, SCHEMA, VARIANT_KINDS, WORDING } from "./constants.js";
import { profitability } from "./profitability.js";
import { seedSettings } from "./seed.js";

const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const isInt = (x) => Number.isInteger(x);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_STRING = 2000;
const MAX_DEPTH = 12;
const MAX_ARRAY = 500;

/** Effective cruise return buffer. Owner/engine can only ever ADD time; nothing here can go below the minimums. */
export function effectiveReturnBufferMinutes(settings, scope, engineContingencyMinutes = 0) {
  const mandatory = settings.mandatory.cruise.returnBufferMinutes;
  if (scope === "belfastOnly") return mandatory.belfastOnly;
  if (scope === "longDistance") {
    const configured = settings.commercial.cruise.trafficContingencyMinimumMinutes.value;
    const engine = Number.isFinite(engineContingencyMinutes) ? engineContingencyMinutes : 0;
    return mandatory.longDistance + Math.max(configured, engine); // engine can raise, never lower, the configured minimum
  }
  throw new Error("Unknown cruise scope");
}

/** Which gates block launch. Feature gates only block while their feature is ENABLED. Pure; assumes a validated shape. */
export function launchReadiness(settings) {
  const gates = settings.gates;
  const open = (name) => gates[name]?.verified === true;
  const c = settings.commercial;
  const cruiseInUse = c.tours.some((t) => t.cruise && (t.active || t.bookable || t.variants.some((v) => v.active || v.bookable)));
  const featureEnabled = {
    advertisingApproval: c.advertising.tourAdsEnabled === true || c.advertising.externalConversionsEnabled === true,
    guidingQualifications: c.wording.guidingClaimsAllowed === true,
    harbourPickupAccess: cruiseInUse,
    routingProvider: c.itinerary.smartItineraryBuilderEnabled === true,
  };
  const mandatoryGatesClosed = MANDATORY_LAUNCH_GATES.filter((g) => !open(g));
  const features = Object.fromEntries(Object.entries(FEATURE_GATES).map(([gate, meta]) => [gate, { feature: meta.feature, requirement: meta.mandatory ? "mandatory-when-used" : "optional", enabled: featureEnabled[gate], verified: open(gate), blocking: featureEnabled[gate] && !open(gate) }]));
  const blockingFeatures = Object.keys(features).filter((g) => features[g].blocking);
  return { launchReady: mandatoryGatesClosed.length === 0 && blockingFeatures.length === 0, mandatoryGatesClosed, blockingFeatures, features };
}

export function validate(settings) {
  const errors = [];
  const warnings = [];
  const err = (path, code, message) => errors.push({ path, code, message });
  const warn = (path, code, message) => warnings.push({ path, code, message });

  if (!isObj(settings)) return { ok: false, errors: [{ path: "", code: "type", message: "Settings must be an object." }], warnings };

  // ---- structure: unknown or missing fields are rejected ----
  const template = seedSettings();
  const shape = (tpl, actual, path, depth = 0) => {
    if (depth > MAX_DEPTH) return err(path, "depth", "Too deeply nested.");
    if (Array.isArray(tpl)) {
      if (!Array.isArray(actual)) return err(path, "type", "Must be a list.");
      if (actual.length > MAX_ARRAY) err(path, "size", `Too many entries (max ${MAX_ARRAY}).`);
      return undefined;
    }
    if (isObj(tpl)) {
      if (!isObj(actual)) return err(path, "type", "Must be an object.");
      for (const key of Object.keys(actual)) if (!(key in tpl)) err(`${path}.${key}`, "unknown-field", "Unknown field.");
      for (const key of Object.keys(tpl)) {
        if (!(key in actual)) err(`${path}.${key}`, "missing-field", "Required field is missing.");
        else shape(tpl[key], actual[key], `${path}.${key}`, depth + 1);
      }
    }
    return undefined;
  };
  for (const key of Object.keys(settings)) if (!(key in template)) err(key, "unknown-field", "Unknown field.");
  for (const key of Object.keys(template)) {
    if (!(key in settings)) err(key, "missing-field", "Required field is missing.");
    else shape(template[key], settings[key], key, 0);
  }
  // Element shapes for lists.
  const elementShape = (list, allowed, path) => {
    if (!Array.isArray(list)) return;
    list.forEach((item, i) => {
      if (!isObj(item)) return err(`${path}[${i}]`, "type", "Must be an object.");
      for (const key of Object.keys(item)) if (!allowed.includes(key)) err(`${path}[${i}].${key}`, "unknown-field", "Unknown field.");
    });
  };
  if (errors.length) return finish(errors, warnings); // later rules assume the shape

  // ---- forbidden content anywhere in the document ----
  const scan = (value, path, depth = 0) => {
    if (depth > MAX_DEPTH) return;
    if (typeof value === "string") {
      if (value.length > MAX_STRING) err(path, "too-long", `Text longer than ${MAX_STRING} characters.`);
      for (const re of FORBIDDEN_REFERENCES) if (re.test(value)) err(path, "forbidden-reference", "References airport pricing configuration or a production resource.");
      for (const re of FORBIDDEN_WORDING) if (re.test(value)) err(path, "forbidden-wording", "7-seater, fleet or similar wording is not allowed (maximum four passengers).");
      return;
    }
    if (Array.isArray(value)) return value.forEach((v, i) => scan(v, `${path}[${i}]`, depth + 1));
    if (isObj(value)) {
      for (const [k, v] of Object.entries(value)) {
        for (const re of FORBIDDEN_REFERENCES) if (re.test(k)) err(`${path}.${k}`, "forbidden-reference", "Field name references airport pricing configuration or a production resource.");
        for (const re of FORBIDDEN_WORDING) if (re.test(k)) err(`${path}.${k}`, "forbidden-wording", "7-seater, fleet or similar wording is not allowed.");
        scan(v, `${path}.${k}`, depth + 1);
      }
    }
  };
  scan(settings, "");

  if (settings.schema !== SCHEMA) err("schema", "schema", `schema must be ${SCHEMA}.`);

  // ---- MANDATORY safety / security / capacity (cannot be loosened) ----
  const m = settings.mandatory;
  if (!isInt(m.capacity.maxPassengers) || m.capacity.maxPassengers < 1 || m.capacity.maxPassengers > MANDATORY.maxPassengers) err("mandatory.capacity.maxPassengers", "mandatory-capacity", `Maximum passengers must be a whole number from 1 to ${MANDATORY.maxPassengers}.`);
  for (const scope of ["belfastOnly", "longDistance"]) {
    const v = m.cruise.returnBufferMinutes[scope];
    if (!isInt(v) || v < MANDATORY.returnBufferMinutes[scope]) err(`mandatory.cruise.returnBufferMinutes.${scope}`, "mandatory-cruise-buffer", `Return buffer cannot be below ${MANDATORY.returnBufferMinutes[scope]} minutes.`);
  }
  if (m.cruise.allAboardTimeCustomerConfirmed !== true) err("mandatory.cruise.allAboardTimeCustomerConfirmed", "mandatory-cruise", "The all-aboard time must always be customer-confirmed, never inferred.");
  if (m.cruise.engineMayReduceTrafficContingency !== false) err("mandatory.cruise.engineMayReduceTrafficContingency", "mandatory-cruise", "The itinerary engine may never reduce the traffic contingency.");
  if (m.pickup.outsideNorthernIrelandAllowed !== false) err("mandatory.pickup.outsideNorthernIrelandAllowed", "mandatory-pickup", "No pick-ups outside Northern Ireland.");
  for (const key of ["ownerOnly", "mobilityPreferencesConsentRequired", "mobilityPreferencesExcludedFromAnalyticsAndAds"]) if (m.security[key] !== true) err(`mandatory.security.${key}`, "mandatory-security", "This security protection cannot be switched off.");
  if (m.drivers.cruiseToursNeedExtraDriverApproval !== true) err("mandatory.drivers.cruiseToursNeedExtraDriverApproval", "mandatory-drivers", "Cruise tours always need extra driver approval.");
  if (m.drivers.automaticSubcontractingAllowed !== false) err("mandatory.drivers.automaticSubcontractingAllowed", "mandatory-drivers", "No automatic subcontracting.");

  // ---- commercial leaves (provisional unless the owner confirms) ----
  const c = settings.commercial;
  const leafCheck = (leaf, path, { kind, min = 0, max = Infinity, nullable = true, enumValues }) => {
    if (!isObj(leaf) || !("value" in leaf) || typeof leaf.provisional !== "boolean" || Object.keys(leaf).length !== 2) return err(path, "leaf", "Must be { value, provisional }.");
    const val = leaf.value;
    if (val === null) return nullable ? undefined : err(path, "required", "A value is required.");
    if (kind === "int" && (!isInt(val) || val < min || val > max)) err(path, "range", `Must be a whole number from ${min} to ${max === Infinity ? "any" : max}.`);
    if (kind === "num" && (typeof val !== "number" || !Number.isFinite(val) || val < min || val > max)) err(path, "range", `Must be a number from ${min} to ${max === Infinity ? "any" : max}.`);
    if (kind === "enum" && !enumValues.includes(val)) err(path, "enum", `Must be one of ${enumValues.join(", ")}.`);
    if (kind === "text" && (typeof val !== "string" || !val.trim())) err(path, "text", "Must be text.");
    return undefined;
  };
  const f = c.finance;
  leafCheck(f.marginFloorPercent, "commercial.finance.marginFloorPercent", { kind: "num", min: 0, max: 100, nullable: false });
  leafCheck(f.paidDriverHourlyPence, "commercial.finance.paidDriverHourlyPence", { kind: "int", min: 1 });
  leafCheck(f.subcontractorOwnVehicleCeilingPercent, "commercial.finance.subcontractorOwnVehicleCeilingPercent", { kind: "num", min: 0, max: 100 });
  leafCheck(f.subcontractorSuppliedVehicleFeePercent, "commercial.finance.subcontractorSuppliedVehicleFeePercent", { kind: "num", min: 0, max: 100 });
  leafCheck(f.vehicleRunningCostPencePerMile, "commercial.finance.vehicleRunningCostPencePerMile", { kind: "num", min: 0 });
  leafCheck(f.paymentProcessingFeePercent, "commercial.finance.paymentProcessingFeePercent", { kind: "num", min: 0, max: 100 });
  leafCheck(f.paymentProcessingFeeFixedPence, "commercial.finance.paymentProcessingFeeFixedPence", { kind: "int", min: 0 });
  leafCheck(f.administrativeCostPencePerBooking, "commercial.finance.administrativeCostPencePerBooking", { kind: "int", min: 0 });
  leafCheck(f.advertisingAcquisitionCostPence, "commercial.finance.advertisingAcquisitionCostPence", { kind: "int", min: 0 });
  leafCheck(f.selfDrivingHourlyEarningsTargetPence, "commercial.finance.selfDrivingHourlyEarningsTargetPence", { kind: "int", min: 0 });
  elementShape(f.marginOverrides, ["tourId", "variantId", "model", "reason", "recordedAt"], "commercial.finance.marginOverrides");

  const cr = c.cruise;
  leafCheck(cr.trafficContingencyMinimumMinutes, "commercial.cruise.trafficContingencyMinimumMinutes", { kind: "int", min: 1, max: 600, nullable: false });
  if (isInt(cr.trafficContingencyMinimumMinutes.value) && cr.trafficContingencyMinimumMinutes.value < 30) warn("commercial.cruise.trafficContingencyMinimumMinutes", "below-provisional", "Below the provisional 30-minute traffic contingency. Confirm this is intended.");
  if (cr.port !== "belfast-harbour") err("commercial.cruise.port", "port", "Belfast Harbour is the only approved port. Further ports need separate owner approval.");
  if (typeof cr.engineMayIncreaseTrafficContingency !== "boolean") err("commercial.cruise.engineMayIncreaseTrafficContingency", "type", "Must be true or false.");
  leafCheck(cr.accessChargePence, "commercial.cruise.accessChargePence", { kind: "int", min: 0 });
  leafCheck(cr.pickupInstructions, "commercial.cruise.pickupInstructions", { kind: "text" });
  for (const key of ["terminals", "meetingPoints"]) {
    cr[key].forEach((item, i) => { if (typeof item !== "string" || !item.trim()) err(`commercial.cruise.${key}[${i}]`, "text", "Must be text."); });
  }

  const cx = c.cancellation;
  leafCheck(cx.fullRefundHoursBefore, "commercial.cancellation.fullRefundHoursBefore", { kind: "int", min: 0, max: 720, nullable: false });
  leafCheck(cx.partialRefundHoursBefore, "commercial.cancellation.partialRefundHoursBefore", { kind: "int", min: 0, max: 720, nullable: false });
  leafCheck(cx.partialRefundPercent, "commercial.cancellation.partialRefundPercent", { kind: "num", min: 0, max: 100 });
  if (isInt(cx.fullRefundHoursBefore.value) && isInt(cx.partialRefundHoursBefore.value) && cx.fullRefundHoursBefore.value < cx.partialRefundHoursBefore.value) err("commercial.cancellation", "tiers", "The full-refund window cannot be shorter than the partial-refund window.");

  const q = c.quotes;
  leafCheck(q.validityDays, "commercial.quotes.validityDays", { kind: "int", min: 1, max: 90, nullable: false });
  leafCheck(q.availabilityHoldHours, "commercial.quotes.availabilityHoldHours", { kind: "int", min: 1, max: 168, nullable: false });
  leafCheck(q.paymentMode, "commercial.quotes.paymentMode", { kind: "enum", enumValues: ["full"], nullable: false });
  if (isInt(q.validityDays.value) && isInt(q.availabilityHoldHours.value) && q.availabilityHoldHours.value > q.validityDays.value * 24) err("commercial.quotes", "hold", "The availability hold cannot outlast the quote validity.");

  const av = c.availability;
  if (av.source !== AVAILABILITY_SOURCE) err("commercial.availability.source", "availability-source", "WP-B1 accepts synthetic staging availability fixtures only. No live production availability.");
  leafCheck(av.minTourHours, "commercial.availability.minTourHours", { kind: "num", min: 0.5, max: 24, nullable: false });
  leafCheck(av.maxWorkingDayHours, "commercial.availability.maxWorkingDayHours", { kind: "num", min: 1, max: 24, nullable: false });
  leafCheck(av.positioningBufferMinutes, "commercial.availability.positioningBufferMinutes", { kind: "int", min: 0 });
  leafCheck(av.restBreakMinutes, "commercial.availability.restBreakMinutes", { kind: "int", min: 0 });
  if (typeof av.minTourHours.value === "number" && typeof av.maxWorkingDayHours.value === "number") {
    if (av.minTourHours.value > av.maxWorkingDayHours.value) err("commercial.availability", "hours", "The minimum tour length cannot exceed the maximum working day.");
    if (av.maxWorkingDayHours.value > 11) warn("commercial.availability.maxWorkingDayHours", "above-provisional", "Above the provisional 11-hour working day. Confirm this is safe and lawful.");
  }
  av.syntheticFixture.forEach((day, i) => {
    const p = `commercial.availability.syntheticFixture[${i}]`;
    if (!isObj(day) || !DATE.test(day.date) || !["open", "blocked"].includes(day.status) || day.synthetic !== true) err(p, "fixture", "Fixtures must be { date: YYYY-MM-DD, status: open|blocked, synthetic: true }.");
  });
  av.blackoutDates.forEach((d, i) => { if (!DATE.test(d)) err(`commercial.availability.blackoutDates[${i}]`, "date", "Must be YYYY-MM-DD."); });
  av.daysOff.forEach((d, i) => { if (!isInt(d) || d < 0 || d > 6) err(`commercial.availability.daysOff[${i}]`, "weekday", "Must be 0 (Sunday) to 6 (Saturday)."); });
  av.seasons.forEach((s, i) => { if (!isObj(s) || typeof s.name !== "string" || !DATE.test(s.from) || !DATE.test(s.to)) err(`commercial.availability.seasons[${i}]`, "season", "Must be { name, from, to }."); });

  const pk = c.pickup;
  pk.includedZones.forEach((z, i) => { if (typeof z !== "string" || !z.trim()) err(`commercial.pickup.includedZones[${i}]`, "text", "Must be text."); });
  elementShape(pk.manualSupplements, ["zone", "pence", "note"], "commercial.pickup.manualSupplements");
  pk.manualSupplements.forEach((s, i) => { if (!isObj(s) || typeof s.zone !== "string" || !isInt(s.pence) || s.pence < 0) err(`commercial.pickup.manualSupplements[${i}]`, "supplement", "Must be { zone, pence (whole pence, 0 or more), note }."); });

  elementShape(c.vehicles, ["id", "label", "maxPassengers", "luggageRules", "manualReviewWhenUncertain"], "commercial.vehicles");
  const vehicleIds = new Set();
  c.vehicles.forEach((v, i) => {
    const p = `commercial.vehicles[${i}]`;
    if (typeof v.id !== "string" || !v.id || vehicleIds.has(v.id)) err(`${p}.id`, "id", "Needs a unique id.");
    vehicleIds.add(v.id);
    if (!isInt(v.maxPassengers) || v.maxPassengers < 1 || v.maxPassengers > MANDATORY.maxPassengers) err(`${p}.maxPassengers`, "mandatory-capacity", `A vehicle can carry at most ${MANDATORY.maxPassengers} passengers.`);
    if (!Array.isArray(v.luggageRules)) return err(`${p}.luggageRules`, "type", "Must be a list.");
    v.luggageRules.forEach((r, j) => {
      if (!isObj(r) || !isInt(r.passengers) || r.passengers < 1 || r.passengers > MANDATORY.maxPassengers || !isInt(r.suitcases) || r.suitcases < 0 || !isInt(r.cabinBags) || r.cabinBags < 0) err(`${p}.luggageRules[${j}]`, "luggage", "Must be { passengers 1-4, suitcases, cabinBags } as whole numbers.");
    });
    return undefined;
  });

  const dr = c.drivers;
  for (const model of OPERATING_MODELS) if (typeof dr.models[model] !== "boolean") err(`commercial.drivers.models.${model}`, "type", "Must be true or false.");
  if (!OPERATING_MODELS.some((model) => dr.models[model] === true)) err("commercial.drivers.models", "models", "At least one operating model must be enabled.");
  elementShape(dr.approvedDrivers, ["id", "label", "models", "cruiseApproved", "insuranceVerified", "licenceVerified"], "commercial.drivers.approvedDrivers");
  dr.approvedDrivers.forEach((d, i) => {
    const p = `commercial.drivers.approvedDrivers[${i}]`;
    if (!isObj(d) || typeof d.id !== "string" || !Array.isArray(d.models) || !d.models.every((x) => OPERATING_MODELS.includes(x))) return err(p, "driver", "Must be { id, label, models, cruiseApproved, insuranceVerified, licenceVerified }.");
    if (d.cruiseApproved && !(d.insuranceVerified === true && d.licenceVerified === true)) err(`${p}.cruiseApproved`, "cruise-driver", "Cruise approval needs verified insurance and licence.");
    return undefined;
  });

  const rt = c.retention;
  leafCheck(rt.savedItineraryDays, "commercial.retention.savedItineraryDays", { kind: "int", min: 1, max: 365, nullable: false });
  leafCheck(rt.enquiryDays, "commercial.retention.enquiryDays", { kind: "int", min: 1, max: 3650 });
  leafCheck(rt.bookingDays, "commercial.retention.bookingDays", { kind: "int", min: 1, max: 3650 });

  elementShape(c.content.photoLibrary, ["id", "alt", "licence", "credit"], "commercial.content.photoLibrary");
  c.content.photoLibrary.forEach((ph, i) => {
    if (!isObj(ph) || !["id", "alt", "licence", "credit"].every((k) => typeof ph[k] === "string" && ph[k].trim())) err(`commercial.content.photoLibrary[${i}]`, "photo", "Needs id, alt text, licence and credit.");
  });
  if (c.content.reviews.source !== "google-reviews-integration") err("commercial.content.reviews.source", "reviews", "Reviews come from the verified Google Reviews integration only.");
  if (c.content.reviews.distinguishAirportAndTourReviews !== true) err("commercial.content.reviews.distinguishAirportAndTourReviews", "reviews", "Airport and tour reviews must stay distinct.");

  // ---- launch gates stay closed until evidence is recorded ----
  const gates = settings.gates;
  for (const name of GATE_NAMES) {
    const g = gates[name];
    if (!isObj(g) || typeof g.verified !== "boolean" || !(g.evidenceRef === null || typeof g.evidenceRef === "string") || Object.keys(g).length !== 2) {
      err(`gates.${name}`, "gate", "Must be { verified, evidenceRef }.");
      continue;
    }
    if (g.verified && !(typeof g.evidenceRef === "string" && g.evidenceRef.trim().length >= 3)) err(`gates.${name}`, "gate-evidence", "A gate can only be opened with a recorded evidence reference.");
  }
  const gateOpen = (name) => gates[name]?.verified === true;
  const mandatoryGatesOpen = MANDATORY_LAUNCH_GATES.every(gateOpen);

  // ---- advertising and wording ----
  const ad = c.advertising;
  if (ad.googleAdsApiEnabled !== false) err("commercial.advertising.googleAdsApiEnabled", "ads", "The direct Google Ads API integration stays disabled.");
  if (ad.excludeFromAirportConversions !== true) err("commercial.advertising.excludeFromAirportConversions", "ads", "Tours must stay excluded from airport conversions.");
  if ((ad.tourAdsEnabled || ad.externalConversionsEnabled) && !gateOpen("advertisingApproval")) err("commercial.advertising", "gate-closed", "Tour ads and conversions stay off until the advertisingApproval gate is verified.");
  if (c.wording.driverTerm !== WORDING.driverTerm) err("commercial.wording.driverTerm", "wording", `Use "${WORDING.driverTerm}".`);
  if (c.wording.guidingClaimsAllowed && !gateOpen("guidingQualifications")) err("commercial.wording.guidingClaimsAllowed", "gate-closed", "Guiding claims stay off until the guidingQualifications gate is verified.");
  if (!c.wording.guidingClaimsAllowed) {
    const guiding = (value, path) => {
      if (typeof value === "string") return GUIDING_CLAIM.test(value) ? err(path, "guiding-claim", `No professional-guiding claims. Use "${WORDING.driverTerm}".`) : undefined;
      if (Array.isArray(value)) return value.forEach((v, i) => guiding(v, `${path}[${i}]`));
      if (isObj(value)) return Object.entries(value).forEach(([k, v]) => (k === "driverTerm" ? undefined : guiding(v, `${path}.${k}`)));
      return undefined;
    };
    guiding(c, "commercial");
  }

  if (typeof c.itinerary.smartItineraryBuilderEnabled !== "boolean") err("commercial.itinerary.smartItineraryBuilderEnabled", "type", "Must be true or false.");
  else if (c.itinerary.smartItineraryBuilderEnabled && !gateOpen("routingProvider")) err("commercial.itinerary.smartItineraryBuilderEnabled", "gate-closed", "The Smart Itinerary Builder needs the routingProvider gate (routing provider approval) to be verified.");

  // ---- tours ----
  elementShape(c.tours, Object.keys(template.commercial.tours[0]), "commercial.tours");
  const ids = new Set();
  const enabledModels = OPERATING_MODELS.filter((model) => dr.models[model]);
  const slugs = new Set();
  const unitChecks = (u, p, { isVariant }) => {
    leafCheck(u.provisionalPricePence, `${p}.provisionalPricePence`, { kind: "int", min: 1 });
    leafCheck(u.durationHours, `${p}.durationHours`, { kind: "num", min: 0.5, max: 24 });
    leafCheck(u.estimatedMiles, `${p}.estimatedMiles`, { kind: "num", min: 0 });
    leafCheck(u.homePositioningMiles, `${p}.homePositioningMiles`, { kind: "num", min: 0 });
    leafCheck(u.homePositioningHours, `${p}.homePositioningHours`, { kind: "num", min: 0, max: 24 });
    if (!(u.publishedDurationLabel === undefined || u.publishedDurationLabel === null || typeof u.publishedDurationLabel === "string")) err(`${p}.publishedDurationLabel`, "text", "Must be text or null.");
    for (const flag of ["active", "bookable", "instantBooking"]) if (typeof u[flag] !== "boolean") err(`${p}.${flag}`, "type", "Must be true or false.");
    if (!(u.publishedPricePence === null || (isInt(u.publishedPricePence) && u.publishedPricePence > 0))) err(`${p}.publishedPricePence`, "price", "Price must be a positive whole number of pence.");
    const dur = u.durationHours?.value;
    const pos = u.homePositioningHours?.value ?? 0;
    if (typeof dur === "number" && typeof av.minTourHours.value === "number" && typeof av.maxWorkingDayHours.value === "number") {
      if (dur < av.minTourHours.value || dur > av.maxWorkingDayHours.value) err(`${p}.durationHours`, "duration-bounds", "Tour length must sit between the minimum tour length and the maximum working day.");
      else if (dur + pos > av.maxWorkingDayHours.value) err(`${p}.homePositioningHours`, "duration-bounds", "Tour length plus home-to-home positioning exceeds the maximum working day.");
    }
    
    if (u.bookable && !(mandatoryGatesOpen && u.provisionalPricePence.value !== null)) err(`${p}.bookable`, "gate-closed", "Not bookable until every mandatory launch prerequisite is verified and its price is set.");
    if ((u.bookable || u.active) && isVariant === "cruise" && !gateOpen("harbourPickupAccess")) err(`${p}.${u.bookable ? "bookable" : "active"}`, "gate-closed", "Cruise tours need harbour pick-up approval (harbourPickupAccess) before they can be active or bookable. No other tour is affected.");
    if (u.instantBooking && !(u.bookable && gateOpen("pricingApproval"))) err(`${p}.instantBooking`, "gate-closed", "Instant booking needs a bookable tour and the pricingApproval gate.");

  };
  const checkProfit = (t, u, unitId, p) => {
    if (u.provisionalPricePence.value === null) return;
    for (const model of enabledModels) {
      const result = profitability(settings, t.id, model, unitId);
      const where = `${p}.profitability.${model}`;
      if (result.status === "unconfigured") warn(where, "unconfigured", `Profitability cannot be assessed yet: ${result.missing.length} input(s) unconfigured.`);
      if (result.status === "ok" && result.belowMarginFloor) {
        const override = f.marginOverrides.find((o) => o && o.tourId === t.id && o.model === model && (o.variantId ?? null) === unitId);
        if (!override || typeof override.reason !== "string" || override.reason.trim().length < 5) err(where, "margin-below-floor", `Margin ${result.marginPercent}% is below the ${f.marginFloorPercent.value}% floor for ${model}. Record an owner override with a reason to publish.`);
        else warn(where, "margin-override", "Below the margin floor: owner override recorded.");
      }
      if (result.status === "ok" && model === "owner" && result.belowHourlyEarningsTarget) warn(`${p}.profitability.owner`, "earnings-target", "Below the self-driving hourly earnings target.");
    }
  };
  c.tours.forEach((t, i) => {
    const p = `commercial.tours[${i}]`;
    if (typeof t.id !== "string" || !t.id || ids.has(t.id)) err(`${p}.id`, "id", "Needs a unique id.");
    ids.add(t.id);
    if (!(t.slug === null || (typeof t.slug === "string" && /^[a-z0-9-]+$/.test(t.slug)))) err(`${p}.slug`, "slug", "Slug must be lower-case letters, numbers and hyphens (existing URLs are preserved).");
    if (typeof t.slug === "string") {
      if (slugs.has(t.slug)) err(`${p}.slug`, "duplicate-product", "Another tour already uses this slug. Half-day and full-day options are variants of ONE tour, not separate products.");
      slugs.add(t.slug);
    }
    if (!(t.name === null || (typeof t.name === "string" && t.name.trim()))) err(`${p}.name`, "text", "Must be text.");
    if (typeof t.cruise !== "boolean") err(`${p}.cruise`, "type", "Must be true or false.");
    if (t.cruise ? !["unconfigured", "belfastOnly", "longDistance"].includes(t.cruiseScope) : t.cruiseScope !== null) err(`${p}.cruiseScope`, "cruise-scope", "Cruise tours need unconfigured, belfastOnly or longDistance; other tours need null.");
    leafCheck(t.includedHours, `${p}.includedHours`, { kind: "num", min: 0.5, max: 24 });
    leafCheck(t.extraHourPence, `${p}.extraHourPence`, { kind: "int", min: 0 });
    if (typeof t.provisional !== "boolean") err(`${p}.provisional`, "type", "Must be true or false.");
    if (t.active && t.cruise && t.cruiseScope === "unconfigured") err(`${p}.cruiseScope`, "cruise-scope", "An active cruise tour needs its scope set (belfastOnly or longDistance) so the right return buffer applies.");
    elementShape(t.variants, ["id", "kind", "publishedPricePence", "publishedDurationLabel", "provisionalPricePence", "durationHours", "estimatedMiles", "homePositioningMiles", "homePositioningHours", "active", "bookable", "instantBooking"], `${p}.variants`);
    const tag = t.cruise ? "cruise" : "tour";
    unitChecks(t, p, { isVariant: tag });
    if (t.variants.length) {
      // One product, several durations: tour-level figures stay empty so there is no ambiguity about which one applies.
      for (const key of ["provisionalPricePence", "durationHours", "estimatedMiles", "homePositioningMiles", "homePositioningHours"]) if (t[key]?.value !== null) err(`${p}.${key}`, "variant-level", "This tour has variants: set this figure on each variant, not on the tour.");
      if (t.bookable || t.instantBooking) err(`${p}.bookable`, "variant-level", "This tour has variants: bookability is set per variant.");
      const vIds = new Set();
      const kinds = new Set();
      t.variants.forEach((v, j) => {
        const vp = `${p}.variants[${j}]`;
        if (!isObj(v)) return;
        if (typeof v.id !== "string" || !v.id || vIds.has(v.id)) err(`${vp}.id`, "id", "Needs an id unique within the tour.");
        vIds.add(v.id);
        if (!VARIANT_KINDS.includes(v.kind)) err(`${vp}.kind`, "variant-kind", `Must be one of ${VARIANT_KINDS.join(", ")}.`);
        else if (kinds.has(v.kind)) err(`${vp}.kind`, "duplicate-variant", `The tour already has a ${v.kind} variant.`);
        kinds.add(v.kind);
        unitChecks(v, vp, { isVariant: tag });
        checkProfit(t, v, v.id, vp);
      });
      const prices = t.variants.map((v) => v.publishedPricePence).filter((x) => isInt(x));
      if (t.publishedPricePence !== null && prices.length === t.variants.length && prices.length && t.publishedPricePence !== Math.min(...prices)) err(`${p}.publishedPricePence`, "price", "The tour's published (from) price must equal its cheapest variant's published price.");
    } else {
      if (!(t.publishedPricePence === null || (isInt(t.publishedPricePence) && t.publishedPricePence > 0))) err(`${p}.publishedPricePence`, "price", "Price must be a positive whole number of pence.");
      checkProfit(t, t, null, p);
    }
  });
  f.marginOverrides.forEach((o, i) => {
    const p = `commercial.finance.marginOverrides[${i}]`;
    const tourOfOverride = c.tours.find((x) => isObj(o) && x.id === o.tourId);
    if (isObj(o) && o.variantId !== undefined && o.variantId !== null && !tourOfOverride?.variants.some((v) => v.id === o.variantId)) return err(p, "override", "variantId must be a variant of that tour.");
    if (!isObj(o) || !ids.has(o.tourId) || !OPERATING_MODELS.includes(o.model) || typeof o.reason !== "string" || o.reason.trim().length < 5 || typeof o.recordedAt !== "string" || Number.isNaN(Date.parse(o.recordedAt))) err(p, "override", "Must be { tourId (existing), model, reason (5+ characters), recordedAt (date-time) }.");
  });

  if (settings.publicLaunch.enabled !== false && !mandatoryGatesOpen) err("publicLaunch.enabled", "gate-closed", "Public launch stays off until every mandatory launch prerequisite is verified.");
  if (settings.publicLaunch.enabled === true && launchReadiness(settings).blockingFeatures.length) err("publicLaunch.enabled", "gate-closed", "Public launch is blocked: an enabled feature still has a closed gate.");
  if (typeof settings.publicLaunch.enabled !== "boolean") err("publicLaunch.enabled", "type", "Must be true or false.");

  return finish(errors, warnings);
}

function finish(errors, warnings) {
  return { ok: errors.length === 0, errors, warnings };
}

const REGIONS = ["belfast", "outside-belfast"];
const SCOPE_RANK = { belfastOnly: 1, longDistance: 2 };

/**
 * Itinerary-level validation of the applicable cruise return scope (pure; settings must already be valid).
 * The applicable scope is the tour's configured scope, raised to longDistance if any stop is outside Belfast. It is never
 * reduced: a long-distance tour with only Belfast stops still gets the long-distance buffer, and a Belfast-only tour whose
 * itinerary leaves Belfast is rejected (it needs a different, long-distance product).
 * itinerary = { tourId, stops: [{ id, region }], allAboardAt (ISO), allAboardConfirmedByCustomer, plannedPortReturnAt (ISO),
 *               engineContingencyMinutes? (engine may only increase) }
 */
export function validateCruiseItinerary(settings, itinerary) {
  const errors = [];
  const err = (path, code, message) => errors.push({ path, code, message });
  if (!isObj(itinerary)) return { ok: false, errors: [{ path: "", code: "type", message: "Itinerary must be an object." }] };
  const tour = settings.commercial.tours.find((t) => t.id === itinerary.tourId);
  if (!tour) return { ok: false, errors: [{ path: "tourId", code: "unknown-tour", message: "Unknown tour." }] };
  if (!tour.cruise) return { ok: true, errors: [], applicable: false }; // return buffers are a cruise-only rule
  if (!SCOPE_RANK[tour.cruiseScope]) err("tourId", "cruise-scope", "This cruise tour has no return scope configured (belfastOnly or longDistance).");
  if (!Array.isArray(itinerary.stops) || !itinerary.stops.length || !itinerary.stops.every((x) => isObj(x) && typeof x.id === "string" && REGIONS.includes(x.region))) err("stops", "stops", `Stops must be a non-empty list of { id, region: ${REGIONS.join(" | ")} }.`);
  if (itinerary.allAboardConfirmedByCustomer !== true) err("allAboardConfirmedByCustomer", "all-aboard", "The all-aboard time must be confirmed by the customer, never inferred.");
  const aboard = Date.parse(itinerary.allAboardAt);
  const back = Date.parse(itinerary.plannedPortReturnAt);
  if (Number.isNaN(aboard)) err("allAboardAt", "all-aboard", "allAboardAt must be a date-time.");
  if (Number.isNaN(back)) err("plannedPortReturnAt", "return-time", "plannedPortReturnAt must be a date-time.");
  if (errors.length) return { ok: false, errors };
  const leaves = Array.isArray(itinerary.stops) && itinerary.stops.some((x) => x.region === "outside-belfast");
  if (tour.cruiseScope === "belfastOnly" && leaves) err("stops", "scope-exceeded", "This itinerary leaves Belfast but the tour is configured Belfast-only. It needs a long-distance tour; the 60-minute buffer cannot be used.");
  const applicable = leaves || tour.cruiseScope === "longDistance" ? "longDistance" : "belfastOnly";
  const engine = itinerary.engineContingencyMinutes;
  if (!(engine === undefined || (typeof engine === "number" && Number.isFinite(engine) && engine >= 0))) err("engineContingencyMinutes", "engine", "Engine contingency must be a number of minutes (0 or more); it can only increase the buffer.");
  const needed = effectiveReturnBufferMinutes(settings, applicable, engine ?? 0);
  const available = Math.floor((aboard - back) / 60000);
  if (available < needed) err("plannedPortReturnAt", "return-buffer", `Return to port leaves ${available} minutes before all-aboard; ${applicable} requires at least ${needed}.`);
  return { ok: errors.length === 0, errors, applicable: true, applicableScope: applicable, requiredBufferMinutes: needed, availableBufferMinutes: available };
}
