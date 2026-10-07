/**
 * Manual WhatsApp voice follows the authenticated session.
 * Automatic emails stay in company voice for every operator.
 * Run: npx tsx scripts/check-driver-whatsapp-voice.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildArrivedPickupWhatsAppMessage,
  buildDriverOnTheWayWhatsAppMessage,
  resolveManualWhatsAppVoice,
} from "../shared/arrival-whatsapp";
import {
  buildDriverArrivedPickupEmail,
  buildDriverOnTheWayEmail,
} from "../shared/booking-notifications";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const OWNER_ON_THE_WAY =
  "Hi Alex, your driver is now on the way to your pickup location for your booked pickup time of 10:00. We may also share a live location with you here on WhatsApp.";
const DRIVER_ON_THE_WAY =
  "Hi Alex, I'm your driver for your My Airport Taxi NI booking. I'm on my way to your pickup location for your booked pickup time of 10:00. I may share my location with you here on WhatsApp.";
const DRIVER_ON_THE_WAY_NO_TIME =
  "Hi Alex, I'm your driver for your My Airport Taxi NI booking. I'm on my way to your pickup location. I may share my location with you here on WhatsApp.";
const OWNER_STREET = ["🚕 Your driver has arrived", "", "Your driver is now at your pickup location and ready when you are."].join("\n");
const DRIVER_STREET = "Hi Alex, I've arrived at your pickup location and I'm ready when you are.";

const secrets = [
  "Sam",
  "07700900999",
  "07700 900999",
  "AB12 CDE",
  "AB12CDE",
  "Silver",
  "Mercedes",
  "£80",
  "£45",
  "SumUp",
  "driver pay",
];

function assertNoSecrets(message: string, label: string) {
  for (const secret of secrets) {
    assert.equal(message.toLowerCase().includes(secret.toLowerCase()), false, `${label} includes ${secret}`);
  }
  assert.doesNotMatch(message, /Registration:|Your vehicle:|Vehicle:/i, label);
}

console.log("=== Owner WhatsApp stays company voice ===");
{
  const onTheWay = buildDriverOnTheWayWhatsAppMessage({
    customerName: "Alex Customer",
    bookedPickupTime: "10:00",
    authenticatedRole: "owner",
    voice: "driver",
    requestedVoice: "driver",
    driverFirstName: "Sam",
    driverMobile: "07700900999",
    vehicleColour: "Silver",
    partialRegistration: "AB12 CDE",
  });
  assert.equal(onTheWay, OWNER_ON_THE_WAY);
  const arrived = buildArrivedPickupWhatsAppMessage({
    customerName: "Alex Customer",
    isAirportPickup: false,
    authenticatedRole: "owner",
    voice: "driver",
    requestedVoice: "driver",
    vehicle: { colour: "Silver", make: "Mercedes", model: "E-Class", registration: "AB12 CDE" },
  });
  assert.equal(arrived, OWNER_STREET);
  assertNoSecrets(onTheWay, "owner on the way");
  assertNoSecrets(arrived, "owner arrived");
  console.log("OK  owner on-the-way and arrival stay your driver / we");
}

console.log("\n=== Additional-driver WhatsApp uses first person ===");
{
  const onTheWay = buildDriverOnTheWayWhatsAppMessage({
    customerName: "Alex Customer",
    bookedPickupTime: "10:00",
    authenticatedRole: "driver",
    voice: "company",
    requestedVoice: "owner",
    driverFirstName: "Sam",
    driverMobile: "07700900999",
    vehicleColour: "Silver",
    partialRegistration: "AB12 CDE",
  });
  assert.equal(onTheWay, DRIVER_ON_THE_WAY);
  assert.doesNotMatch(onTheWay, /I may also share my live location/);
  assert.match(onTheWay, /I may share my location with you here on WhatsApp/);
  const noTime = buildDriverOnTheWayWhatsAppMessage({
    customerName: "Alex Customer",
    bookedPickupTime: "",
    authenticatedRole: "driver",
  });
  assert.equal(noTime, DRIVER_ON_THE_WAY_NO_TIME);
  assert.doesNotMatch(noTime, /booked pickup time/);
  const arrived = buildArrivedPickupWhatsAppMessage({
    customerName: "Alex Customer",
    isAirportPickup: false,
    pickupLabel: "12 High Street, Ballyclare",
    authenticatedRole: "driver",
    voice: "company",
    vehicle: { colour: "Silver", make: "Mercedes", model: "E-Class", registration: "AB12 CDE" },
  });
  assert.equal(arrived, DRIVER_STREET);
  assertNoSecrets(onTheWay, "driver on the way");
  assertNoSecrets(arrived, "driver arrived");
  console.log("OK  portal driver says I'm your driver / I've arrived");
}

console.log("\n=== Airport arrival keeps the selected instructions in first person ===");
{
  const express = buildArrivedPickupWhatsAppMessage({
    customerName: "Alex Customer",
    isAirportPickup: true,
    airportCode: "BFS",
    airportAccessOption: "express",
    authenticatedRole: "driver",
    voice: "company",
  });
  assert.equal(
    express,
    "Hi Alex, I've arrived. Please make your way to Express Pick-Up and I'll meet you there.",
  );
  const bhdExpress = buildArrivedPickupWhatsAppMessage({
    customerName: "Alex Customer",
    isAirportPickup: true,
    airportCode: "BHD",
    airportAccessOption: "express",
    authenticatedRole: "driver",
  });
  assert.equal(bhdExpress, express);

  const free = buildArrivedPickupWhatsAppMessage({
    customerName: "Alex Customer",
    isAirportPickup: true,
    airportCode: "BFS",
    airportAccessOption: "free",
    authenticatedRole: "driver",
  });
  assert.equal(
    free,
    "Hi Alex, I've arrived. Please make your way to the Long Stay Car Park Free Pick-Up Location. Let me know when you're there and I'll head over to meet you. Please note there is a maximum stay of 10 minutes at the Free Pick-Up Location.",
  );
  const bhdFree = buildArrivedPickupWhatsAppMessage({
    customerName: "Alex Customer",
    isAirportPickup: true,
    airportCode: "BHD",
    airportAccessOption: "free",
    authenticatedRole: "driver",
  });
  assert.equal(bhdFree, free);
  assert.doesNotMatch(free, /Express Pick-Up/);

  const t1 = buildArrivedPickupWhatsAppMessage({
    customerName: "Alex Customer",
    isAirportPickup: true,
    airportCode: "DUB",
    dublinArrivalTerminal: "T1",
    authenticatedRole: "driver",
  });
  assert.equal(
    t1,
    "Hi Alex, I've arrived. Please make your way to the paid Pick-Up Location at Terminal 1. Let me know when you're there and I'll head over to meet you. Please note there is a maximum stay of 10 minutes at the Pick-Up Location.",
  );
  const t2 = buildArrivedPickupWhatsAppMessage({
    customerName: "Alex Customer",
    isAirportPickup: true,
    airportCode: "DUB",
    dublinArrivalTerminal: "T2",
    authenticatedRole: "driver",
  });
  assert.match(t2, /Terminal 2/);
  assert.match(t2, /I'll head over to meet you/);
  assert.doesNotMatch(t2, /Terminal 1/);
  assert.doesNotMatch(t1, /your driver can head over/);
  assertNoSecrets(express, "express");
  assertNoSecrets(free, "free");
  assertNoSecrets(t1, "t1");
  console.log("OK  Express, Free, Dublin T1 and T2 stay on the right instructions");
}

console.log("\n=== A request cannot choose the voice ===");
{
  assert.equal(
    resolveManualWhatsAppVoice({
      role: "owner",
      profileKey: "john-smith",
      voice: "driver",
      requestedVoice: "driver",
      driverName: "Sam",
    }),
    "company",
  );
  assert.equal(
    resolveManualWhatsAppVoice({
      role: "driver",
      profileKey: "",
      voice: "driver",
      requestedVoice: "driver",
    }),
    "company",
  );
  assert.equal(
    resolveManualWhatsAppVoice({
      role: "customer",
      profileKey: "john-smith",
      voice: "driver",
    }),
    "company",
  );
  assert.equal(
    resolveManualWhatsAppVoice({
      role: "driver",
      profileKey: "john-smith",
      voice: "company",
      requestedVoice: "owner",
      driverFirstName: "Sam",
    }),
    "driver",
  );
  assert.equal(
    buildDriverOnTheWayWhatsAppMessage({
      customerName: "Alex Customer",
      bookedPickupTime: "10:00",
      voice: "driver",
      requestedVoice: "driver",
      driverFirstName: "Sam",
    }),
    OWNER_ON_THE_WAY,
  );
  console.log("OK  voice follows the portal session, not a request field");
}

console.log("\n=== Automatic emails stay company voice for both operators ===");
{
  const ownerEmail = buildDriverOnTheWayEmail({
    customerName: "Alex Customer",
    bookedPickupTime: "10:00",
    driverFirstName: "Colin",
    driverMobile: "07700900111",
  });
  const driverEmail = buildDriverOnTheWayEmail({
    customerName: "Alex Customer",
    bookedPickupTime: "10:00",
    driverFirstName: "Sam",
    driverMobile: "07700900999",
    vehicleColour: "Silver",
    partialRegistration: "AB12 CDE",
  });
  assert.equal(ownerEmail.subject, driverEmail.subject);
  assert.equal(ownerEmail.text, driverEmail.text);
  assert.equal(ownerEmail.html, driverEmail.html);
  assert.match(ownerEmail.subject, /Your driver is on the way/);
  assert.match(ownerEmail.text, /your driver is now on the way/);
  assert.doesNotMatch(ownerEmail.text, /I'm your driver|I may share my location/);

  const ownerArrived = buildDriverArrivedPickupEmail({
    customerName: "Alex Customer",
    pickupLabel: "12 High Street",
    driverFirstName: "Colin",
  });
  const driverArrived = buildDriverArrivedPickupEmail({
    customerName: "Alex Customer",
    pickupLabel: "12 High Street",
    driverFirstName: "Sam",
    driverMobile: "07700900999",
  });
  assert.equal(ownerArrived.text, driverArrived.text);
  assert.match(ownerArrived.subject, /Your driver has arrived/);
  assert.match(ownerArrived.text, /your driver has arrived/);
  assert.doesNotMatch(ownerArrived.text, /I've arrived/);
  console.log("OK  emails still say your driver for owner and additional driver");
}

console.log("\n=== Dashboard and journey handler wiring ===");
{
  const driverPage = read("src/app/driver/DriverPageClient.tsx");
  const ownerPage = read("src/components/OwnerPaidBookingsPanel.tsx");
  const handler = read("workers/addresses/src/journey-handlers.ts");
  assert.match(driverPage, /isDriverPortalSessionToken\(driverKey\) \? "driver" : "owner"/);
  assert.match(ownerPage, /authenticatedRole: "owner"/);
  assert.match(handler, /resolveManualWhatsAppVoice/);
  assert.match(handler, /session\.profileKey/);
  const helper = handler.slice(
    handler.indexOf("async function manualCustomerWhatsAppMessage"),
    handler.indexOf("function jsonResponse"),
  );
  assert.doesNotMatch(helper, /body\./);
  assert.match(helper, /action !== "start_tracking" && action !== "arrived_pickup"/);
  const complete = handler.slice(
    handler.indexOf('if (action === "complete_journey" && journeyStatusOf(record) === "completed")'),
    handler.indexOf("const applied = applyJourneyAction"),
  );
  assert.doesNotMatch(complete, /customerWhatsAppMessage/);
  assert.match(handler, /buildDriverOnTheWayEmail/);
  assert.match(handler, /buildDriverArrivedPickupEmail/);
  console.log("OK  portal session selects the voice; Complete journey adds no status WhatsApp");
}

console.log("\nAll driver WhatsApp voice checks passed.");
