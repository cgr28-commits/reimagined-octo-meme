/**
 * Offline checks for Arrived at Pickup → WhatsApp click-to-chat.
 * Run: npx tsx scripts/check-arrived-pickup-whatsapp.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  activeLegPickupLabel,
  buildArrivedPickupWhatsAppLink,
  buildArrivedPickupWhatsAppMessage,
  isAirportPickupLabel,
  toWhatsAppDigits,
} from "../shared/arrival-whatsapp";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("=== 1. Airport pickup detection ===");
{
  assert.equal(isAirportPickupLabel("Belfast International Airport"), true);
  assert.equal(isAirportPickupLabel("George Best Belfast City Airport"), true);
  assert.equal(isAirportPickupLabel("Dublin Airport"), true);
  assert.equal(isAirportPickupLabel("BFS"), true);
  assert.equal(isAirportPickupLabel("25 Wanstead Park, Dundonald"), false);
  console.log("OK  BFS/BHD/DUB detected; street addresses not");
}

console.log("\n=== 2. Message templates (company voice, no vehicle) ===");
{
  const street = buildArrivedPickupWhatsAppMessage({ isAirportPickup: false });
  assert.match(street, /🚕 Your driver has arrived/);
  assert.match(street, /Your driver is now at your pickup location/);
  assert.doesNotMatch(street, /My Airport Taxi NI driver/);
  assert.doesNotMatch(street, /Driver:|Colin|Chris|Registration:|Your vehicle:/);

  const airport = buildArrivedPickupWhatsAppMessage({
    isAirportPickup: true,
    pickupLabel: "Belfast International Airport",
    airportCode: "BFS",
    airportAccessOption: "free",
    vehicle: {
      colour: "Black",
      make: "Mercedes-Benz",
      model: "E-Class",
      registration: "ABC 1234",
    },
  });
  assert.match(airport, /✈️ Airport Pick-Up/);
  assert.doesNotMatch(airport, /Your driver has arrived/);
  assert.match(airport, /Long Stay Car Park Free Pick-Up Location/);
  assert.match(airport, /Please let us know when you're there so your driver can head over to meet you/);
  assert.match(airport, /maximum stay of 10 minutes/);
  assert.doesNotMatch(airport, /My Airport Taxi NI driver|waiting there|already waiting/);
  assert.doesNotMatch(airport, /Driver:|Colin|Chris|Mercedes|ABC 1234|Your vehicle:|Registration:/);
  console.log("OK  Street + airport templates; no driver name or vehicle");
}

console.log("\n=== 3. Mobile → wa.me + active leg pickup ===");
{
  assert.equal(toWhatsAppDigits("07700 900123"), "447700900123");
  const link = buildArrivedPickupWhatsAppLink(
    "07700900123",
    buildArrivedPickupWhatsAppMessage({ isAirportPickup: false }),
  );
  assert.match(link, /^https:\/\/wa\.me\/447700900123\?text=/);
  assert.match(decodeURIComponent(link), /🚕 Your driver has arrived/);

  assert.equal(
    activeLegPickupLabel({
      pickupLabel: "Home",
      dropoffLabel: "Belfast International Airport",
      returnJourney: true,
      outboundJourneyStatus: "completed",
    }),
    "Belfast International Airport",
  );
  assert.equal(
    activeLegPickupLabel({
      pickupLabel: "Home",
      dropoffLabel: "Belfast International Airport",
      returnJourney: true,
      outboundJourneyStatus: "tracking",
    }),
    "Home",
  );
  console.log("OK  WhatsApp digits + return-leg pickup swap");
}

console.log("\n=== 4. Owner panel wires existing arrived_pickup + WhatsApp ===");
{
  const panel = read("src/components/OwnerPaidBookingsPanel.tsx");
  assert.match(panel, /buildArrivedPickupWhatsAppLink/);
  assert.match(panel, /airportAccessOption: booking\.airportAccessOption/);
  assert.match(panel, /activeLegPickupLabel/);
  assert.doesNotMatch(panel, /resolveArrivalVehicleForBooking/);
  assert.match(panel, /Driver arrived|OWNER_PRIMARY_JOURNEY_BUTTON_LABELS/);
  assert.doesNotMatch(panel, /fetchOwnerAccountProfile/);
  assert.doesNotMatch(panel, /fetchDriverVehicle/);
  assert.match(panel, /postJourneyAction/);
  assert.match(panel, /retryArrivalNotification/);
  // All three primary journey CTAs stay visible until Complete job.
  assert.match(panel, /ownerUpcomingPrimaryJourneyActions/);
  assert.match(panel, /OWNER_PRIMARY_JOURNEY_BUTTON_LABELS/);
  const shared = read("shared/upcoming-jobs.ts");
  assert.match(
    shared,
    /return \["start_tracking", "arrived_pickup", "complete_journey"\]/,
  );
  assert.match(panel, /Open WhatsApp arrival message/);
  assert.doesNotMatch(panel, /WHATSAPP_BUSINESS_API_TOKEN/);
  console.log("OK  Extends existing arrival action; click-to-chat only");
}

console.log("\n=== 5. Backend allows Arrived from idle/stopped + idempotent storage ===");
{
  const tracking = read("workers/addresses/shared/tracking.ts");
  assert.match(tracking, /if \(!next\.arrivedPickupAt\)/);
  assert.match(tracking, /arrivedPickupAt = atIso/);
  assert.match(
    tracking,
    /case "idle":[\s\S]*arrived_pickup[\s\S]*case "stopped":[\s\S]*arrived_pickup/,
  );
  const handlers = read("workers/addresses/src/journey-handlers.ts");
  assert.match(handlers, /alreadyArrived/);
  assert.match(handlers, /idempotent: true/);
  assert.match(handlers, /sendArrivalNotificationIfNeeded/);
  const paid = read("workers/addresses/src/paid-booking-handlers.ts");
  assert.match(paid, /outboundJourneyStatus/);
  assert.match(paid, /returnJourneyStatus/);
  assert.match(paid, /job = returnJob/);
  console.log("OK  Arrival allowed from idle; stored per tracking job; idempotent");
}

console.log("\n=== 6. Action label ===");
{
  const api = read("src/lib/tracking-api.ts");
  assert.match(api, /arrived_pickup:\s*"🚕 Arrived at Pickup"/);
  console.log("OK  Journey action label updated");
}

console.log("\nAll arrived-pickup WhatsApp checks passed.");
