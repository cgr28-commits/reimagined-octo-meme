/**
 * Quote journey + checkout UX: direction remap, copy, steps, return fields,
 * cancellation disclosure, payment consent.
 * Run: npx tsx scripts/check-quote-journey-ux-improvements.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  googleReviewsCanRender,
  GOOGLE_REVIEWS,
  GOOGLE_REVIEWS_ENABLEMENT_REQUIREMENTS,
  GOOGLE_REVIEWS_HEADING,
  KNOWN_GOOGLE_WRITE_REVIEW_URL,
} from "../src/lib/google-reviews";
import {
  QUOTE_ADDRESS_HELPER,
  QUOTE_ADDRESS_PLACEHOLDER,
  QUOTE_HOUSE_FLAT_LABEL,
  QUOTE_STEP_LABELS,
} from "../src/lib/quote-address-copy";
import { remapPlacesForJourneyIntent } from "../src/lib/quote-journey-remap";
import {
  emptySelectedPlace,
  quickSelectToPlace,
  type SelectedPlace,
} from "../src/lib/selected-place";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`fail - ${name}`);
    throw error;
  }
}

function localPlace(): SelectedPlace {
  return {
    placeId: "ChIJ-newtownabbey-home",
    formattedAddress: "12 Ballyduff Road, Newtownabbey BT36 6QD, UK",
    displayAddress: "12 Ballyduff Road, Newtownabbey BT36 6QD, UK",
    placeName: null,
    lat: 54.6872,
    lng: -5.9521,
    postalCode: "BT36 6QD",
    countryCode: "GB",
  };
}

function bfsPlace(): SelectedPlace {
  const place = quickSelectToPlace("BFS");
  assert.ok(place);
  return place;
}

check("Google reviews stay disabled until genuine data is supplied", () => {
  assert.equal(GOOGLE_REVIEWS.enabled, false);
  assert.equal(GOOGLE_REVIEWS.profileUrl, "");
  assert.equal(GOOGLE_REVIEWS.reviews.length, 0);
  assert.equal(googleReviewsCanRender(GOOGLE_REVIEWS), false);
  assert.equal(GOOGLE_REVIEWS_HEADING, "Trusted by airport-transfer customers");
  assert.ok(GOOGLE_REVIEWS_ENABLEMENT_REQUIREMENTS.length >= 4);
  assert.match(KNOWN_GOOGLE_WRITE_REVIEW_URL, /g\.page/);
  const page = read("src/app/page.tsx");
  assert.match(page, /<HeroSlideshow \/>/);
  assert.match(page, /<GoogleReviewsSection \/>/);
  assert.match(page, /<AirportsSection \/>/);
  assert.ok(
    page.indexOf("<GoogleReviewsSection />") > page.indexOf("<HeroSlideshow />") &&
      page.indexOf("<GoogleReviewsSection />") < page.indexOf("<AirportsSection />"),
  );
  const structured = read("src/lib/structured-data.ts");
  assert.doesNotMatch(structured, /aggregateRating|Review/);
  const reviewsComponent = read("src/components/GoogleReviewsSection.tsx");
  assert.doesNotMatch(reviewsComponent, /setInterval\(|<marquee|embla|swiper/i);
});

check("1. One-way airport drop-off keeps local pickup and BFS destination", () => {
  const home = localPlace();
  const bfs = bfsPlace();
  const result = remapPlacesForJourneyIntent({
    nextIntent: "to-airport",
    pickup: home,
    dropoff: bfs,
    pickupAddress: home.formattedAddress,
    dropoffAddress: bfs.formattedAddress,
  });
  assert.equal(result.pickup.placeId, home.placeId);
  assert.equal(result.dropoff.placeId, bfs.placeId);
  assert.equal(result.pickupNeedsReselect, false);
});

check("2. Airport collection keeps BFS pickup and local destination", () => {
  const home = localPlace();
  const bfs = bfsPlace();
  const result = remapPlacesForJourneyIntent({
    nextIntent: "from-airport",
    pickup: bfs,
    dropoff: home,
    pickupAddress: bfs.formattedAddress,
    dropoffAddress: home.formattedAddress,
  });
  assert.equal(result.pickup.placeId, bfs.placeId);
  assert.equal(result.dropoff.placeId, home.placeId);
  assert.equal(result.dropoffNeedsReselect, false);
});

check("3. Switching direction does not leave a stale airport in the local field", () => {
  const home = localPlace();
  const bfs = bfsPlace();
  const toFrom = remapPlacesForJourneyIntent({
    nextIntent: "from-airport",
    pickup: home,
    dropoff: bfs,
    pickupAddress: home.formattedAddress,
    dropoffAddress: bfs.formattedAddress,
  });
  assert.equal(toFrom.pickup.placeId, bfs.placeId);
  assert.equal(toFrom.dropoff.placeId, home.placeId);
  assert.notEqual(toFrom.pickupAddress, home.formattedAddress);

  const fromTo = remapPlacesForJourneyIntent({
    nextIntent: "to-airport",
    pickup: bfs,
    dropoff: home,
    pickupAddress: bfs.formattedAddress,
    dropoffAddress: home.formattedAddress,
  });
  assert.equal(fromTo.pickup.placeId, home.placeId);
  assert.equal(fromTo.dropoff.placeId, bfs.placeId);

  const toA2a = remapPlacesForJourneyIntent({
    nextIntent: "address-to-address",
    pickup: home,
    dropoff: bfs,
    pickupAddress: home.formattedAddress,
    dropoffAddress: bfs.formattedAddress,
  });
  assert.equal(toA2a.pickup.placeId, home.placeId);
  assert.equal(toA2a.dropoff.placeId, "");
  assert.equal(toA2a.dropoffNeedsReselect, true);

  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /remapPlacesForJourneyIntent/);
  assert.match(card, /clearStaleRouteAndPriceAfterAddressEdit\(\)/);
});

check("4. One-way bookings do not render return date/time controls", () => {
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /\{returnJourney \? \(/);
  assert.match(card, /id="returnDate"/);
  assert.match(card, /id="returnTime"/);
  assert.doesNotMatch(
    card,
    /returnJourney \? "grid-rows-\[1fr\]" : "grid-rows-\[0fr\]"/,
  );
});

check("5. Return bookings still require return date and time", () => {
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /Boolean\(returnDate && returnTime\)/);
  assert.match(card, /returnJourney && \(!returnDate \|\| !returnTime\)/);
  assert.match(card, /htmlFor="returnDate"/);
  assert.match(card, /htmlFor="returnTime"/);
  assert.match(card, /isReturnAfterOutbound/);
});

check("6. Back/edit navigation retains booking fields", () => {
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /handleEditBooking/);
  assert.match(card, /Back to travel details/);
  assert.match(card, /navigateQuoteStep\(2\)/);
});

check("7. Saved-quote restoration wiring remains", () => {
  const saved = read("src/app/quote/SavedQuoteCustomerClient.tsx");
  assert.match(saved, /fetchSavedQuote|saved quote/i);
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /readPrefillQuoteDraft|draft\.tripDate/);
});

check("8. Cancellation disclosure is collapsed and accessible", () => {
  const consent = read("src/components/BookingTermsConsent.tsx");
  assert.match(consent, /<details/);
  assert.match(consent, /<summary/);
  assert.match(consent, /Read the full cancellation and no-show policy/);
  assert.match(consent, /Cancel at least 24 hours before pickup: full refund/);
  assert.match(
    consent,
    /Less than 24 hours or a no-show: a charge of up to the booking price may apply/,
  );
  assert.match(consent, /The customer’s statutory rights are not affected/);
  assert.match(consent, /type="checkbox"/);
});

check("9. Payment stays disabled until required details and consent are complete", () => {
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /disabled=\{\s*paymentLoading \|\|\s*submitted \|\|\s*!termsAccepted/);
  assert.match(card, /!customerName\.trim\(\)/);
  assert.match(card, /!customerEmail\.trim\(\)/);
  assert.match(card, /!customerMobile\.trim\(\)/);
  assert.match(card, /!tripDetailsReady/);
  assert.match(card, /const \[marketingOptIn, setMarketingOptIn\] = useState\(false\)/);
});

check("Address wording and step labels are consistent", () => {
  assert.equal(QUOTE_ADDRESS_PLACEHOLDER, "Start typing your address or hotel");
  assert.match(QUOTE_ADDRESS_HELPER, /Select an address from the list/);
  assert.equal(
    QUOTE_HOUSE_FLAT_LABEL,
    "House/flat number — only if missing from the selected address",
  );
  assert.deepEqual([...QUOTE_STEP_LABELS], [
    "Your journey",
    "Price & travel",
    "Pay & confirm",
  ]);
  const progressive = read("src/components/QuoteProgressiveRoute.tsx");
  assert.match(progressive, /QUOTE_ADDRESS_PLACEHOLDER/);
  assert.match(progressive, /QUOTE_ADDRESS_HELPER/);
  const card = read("src/components/QuoteCard.tsx");
  assert.match(card, /QUOTE_STEP_LABELS\[0\]/);
  assert.match(card, /QUOTE_STEP_LABELS\[2\]/);
  assert.doesNotMatch(card, /Airport & address/);
  const address = read("src/components/AddressInput.tsx");
  assert.match(address, /QUOTE_HOUSE_FLAT_LABEL/);
});

check("Unsafe remap asks the customer to reselect", () => {
  const empty = emptySelectedPlace();
  const bfs = bfsPlace();
  const result = remapPlacesForJourneyIntent({
    nextIntent: "to-airport",
    pickup: bfs,
    dropoff: bfs,
    pickupAddress: bfs.formattedAddress,
    dropoffAddress: bfs.formattedAddress,
  });
  assert.equal(result.pickup.placeId, "");
  assert.equal(result.pickupNeedsReselect, true);
  assert.equal(result.dropoff.placeId, bfs.placeId);
  void empty;
});

console.log("\nQuote journey UX improvement checks passed.");
