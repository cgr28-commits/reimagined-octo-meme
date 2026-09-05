/**
 * Owner-operated vs assigned-driver customer wording must be identical.
 * Run: npx tsx scripts/check-company-voice-journey-messages.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildDriverArrivedPickupEmail,
  buildDriverOnTheWayEmail,
} from "../shared/booking-notifications";
import {
  activeLegPickupLabel,
  activeLegPickupTime,
  buildArrivedPickupWhatsAppMessage,
  buildDriverOnTheWayWhatsAppMessage,
} from "../shared/arrival-whatsapp";
import {
  AIRPORT_PICKUP_COPY,
  FORBIDDEN_PERSONAL_VOICE_PATTERNS,
  buildAirportPickupInstruction,
  buildOnTheWayCompanyVoiceMessage,
  type CompanyVoiceJourneyBooking,
} from "../shared/company-voice-journey";
import {
  parseDublinArrivalTerminal,
  chooseDublinArrivalTerminal,
} from "../shared/dublin-arrival-terminal";

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`OK  ${label}`);
  } catch (error) {
    console.error(`FAIL  ${label}`);
    throw error;
  }
}

function assertNoPersonalVoice(content: string, label: string) {
  for (const pattern of FORBIDDEN_PERSONAL_VOICE_PATTERNS) {
    assert.doesNotMatch(content, pattern, `${label}: forbidden ${pattern}`);
  }
  assert.doesNotMatch(content, /\bI['’]m\b/, `${label}: first-person I'm`);
  assert.doesNotMatch(content, /\bmy vehicle\b|\bmy registration\b/i, `${label}: my vehicle/reg`);
}

function assertNoOperatorOrVehicleIdentity(
  content: string,
  label: string,
  secrets: string[],
) {
  assertNoPersonalVoice(content, label);
  for (const secret of secrets) {
    if (!secret.trim()) continue;
    assert.doesNotMatch(
      content,
      new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      `${label}: must not include ${secret}`,
    );
  }
}

type OperatorContext = {
  role: "owner-driver" | "assigned-driver";
  operatorName: string;
  operatorMobile: string;
  vehicleColour: string;
  vehicleMake: string;
  vehicleModel: string;
  registration: string;
};

const OWNER_OPERATOR: OperatorContext = {
  role: "owner-driver",
  operatorName: "Colin Owner",
  operatorMobile: "07700900111",
  vehicleColour: "Navy",
  vehicleMake: "Skoda",
  vehicleModel: "Superb",
  registration: "OWN1 REG",
};

const ASSIGNED_OPERATOR: OperatorContext = {
  role: "assigned-driver",
  operatorName: "Sam Assigned",
  operatorMobile: "07700900999",
  vehicleColour: "Silver",
  vehicleMake: "Mercedes",
  vehicleModel: "E-Class",
  registration: "AB12 CDE",
};

const BOOKING: CompanyVoiceJourneyBooking & {
  customerName: string;
  bookedPickupTime: string;
  pickupLabel: string;
  isAirportPickup: boolean;
  airportCode: "BFS";
  airportAccessOption: "express";
} = {
  customerName: "Alex Customer",
  bookedPickupTime: "10:00",
  pickupLabel: "Belfast International Airport",
  isAirportPickup: true,
  airportCode: "BFS",
  airportAccessOption: "express",
};

function operatorSecrets(operator: OperatorContext): string[] {
  return [
    operator.operatorName,
    "Colin",
    "Sam",
    operator.operatorMobile,
    operator.vehicleColour,
    operator.vehicleMake,
    operator.vehicleModel,
    operator.registration,
    operator.registration.replace(/\s+/g, ""),
  ];
}

function customerOutputsFor(operator: OperatorContext) {
  const onTheWayWhatsApp = buildDriverOnTheWayWhatsAppMessage({
    customerName: BOOKING.customerName,
    bookedPickupTime: BOOKING.bookedPickupTime,
    driverFirstName: operator.operatorName.split(/\s+/)[0],
    driverMobile: operator.operatorMobile,
    vehicleColour: operator.vehicleColour,
    partialRegistration: operator.registration,
  });
  const onTheWayEmail = buildDriverOnTheWayEmail({
    customerName: BOOKING.customerName,
    bookedPickupTime: BOOKING.bookedPickupTime,
    driverFirstName: operator.operatorName.split(/\s+/)[0],
    driverMobile: operator.operatorMobile,
    vehicleColour: operator.vehicleColour,
    partialRegistration: operator.registration,
  });
  const arrivedWhatsApp = buildArrivedPickupWhatsAppMessage({
    isAirportPickup: true,
    pickupLabel: BOOKING.pickupLabel,
    airportCode: BOOKING.airportCode,
    airportAccessOption: BOOKING.airportAccessOption,
    vehicle: {
      colour: operator.vehicleColour,
      make: operator.vehicleMake,
      model: operator.vehicleModel,
      registration: operator.registration,
    },
  });
  const arrivedEmail = buildDriverArrivedPickupEmail({
    customerName: BOOKING.customerName,
    bookedPickupTime: BOOKING.bookedPickupTime,
    pickupLabel: BOOKING.pickupLabel,
    isAirportPickup: true,
    airportCode: BOOKING.airportCode,
    airportAccessOption: BOOKING.airportAccessOption,
    driverFirstName: operator.operatorName.split(/\s+/)[0],
    driverMobile: operator.operatorMobile,
    vehicleColour: operator.vehicleColour,
    partialRegistration: operator.registration,
  });
  return { onTheWayWhatsApp, onTheWayEmail, arrivedWhatsApp, arrivedEmail };
}

console.log("=== Company-voice journey messages ===");

check("On-the-way WhatsApp uses the required company-voice sentence", () => {
  const expected =
    "Hi Alex, your driver is now on the way to your pickup location for your booked pickup time of 10:00. We may also share a live location with you here on WhatsApp.";
  assert.equal(buildOnTheWayCompanyVoiceMessage(BOOKING), expected);
  assert.equal(
    buildDriverOnTheWayWhatsAppMessage({
      customerName: BOOKING.customerName,
      bookedPickupTime: BOOKING.bookedPickupTime,
    }),
    expected,
  );
});

check("Owner-driver and assigned-driver produce identical customer wording", () => {
  const owner = customerOutputsFor(OWNER_OPERATOR);
  const assigned = customerOutputsFor(ASSIGNED_OPERATOR);

  assert.equal(owner.onTheWayWhatsApp, assigned.onTheWayWhatsApp);
  assert.equal(owner.onTheWayEmail.subject, assigned.onTheWayEmail.subject);
  assert.equal(owner.onTheWayEmail.text, assigned.onTheWayEmail.text);
  assert.equal(owner.onTheWayEmail.html, assigned.onTheWayEmail.html);
  assert.equal(owner.arrivedWhatsApp, assigned.arrivedWhatsApp);
  assert.equal(owner.arrivedEmail.subject, assigned.arrivedEmail.subject);
  assert.equal(owner.arrivedEmail.text, assigned.arrivedEmail.text);
  assert.equal(owner.arrivedEmail.html, assigned.arrivedEmail.html);
});

check("Customer outputs contain no owner or assigned-driver identity or vehicle details", () => {
  const owner = customerOutputsFor(OWNER_OPERATOR);
  const assigned = customerOutputsFor(ASSIGNED_OPERATOR);
  const secrets = [...operatorSecrets(OWNER_OPERATOR), ...operatorSecrets(ASSIGNED_OPERATOR)];
  const blobs = [
    owner.onTheWayWhatsApp,
    owner.onTheWayEmail.text,
    owner.onTheWayEmail.html,
    owner.arrivedWhatsApp,
    owner.arrivedEmail.text,
    owner.arrivedEmail.html,
    assigned.onTheWayWhatsApp,
    assigned.onTheWayEmail.text,
    assigned.onTheWayEmail.html,
    assigned.arrivedWhatsApp,
    assigned.arrivedEmail.text,
    assigned.arrivedEmail.html,
  ];
  for (const [index, blob] of blobs.entries()) {
    assertNoOperatorOrVehicleIdentity(blob, `output ${index}`, secrets);
  }
});

check("Airport pickup rules: BFS/BHD Express, Long Stay free, Dublin T1/T2/unknown", () => {
  const bfsExpress = buildAirportPickupInstruction({
    isAirportPickup: true,
    pickupLabel: "Belfast International Airport",
    airportCode: "BFS",
    airportAccessOption: "express",
  });
  const bfsFree = buildAirportPickupInstruction({
    isAirportPickup: true,
    pickupLabel: "Belfast International Airport",
    airportCode: "BFS",
    airportAccessOption: "free",
  });
  const bhdExpress = buildAirportPickupInstruction({
    isAirportPickup: true,
    pickupLabel: "George Best Belfast City Airport",
    airportCode: "BHD",
    airportAccessOption: "express",
  });
  const bhdFree = buildAirportPickupInstruction({
    isAirportPickup: true,
    pickupLabel: "George Best Belfast City Airport",
    airportCode: "BHD",
    airportAccessOption: "free",
  });
  const dubT1 = buildAirportPickupInstruction({
    isAirportPickup: true,
    pickupLabel: "Dublin Airport",
    airportCode: "DUB",
    dublinArrivalTerminal: "T1",
  });
  const dubT2 = buildAirportPickupInstruction({
    isAirportPickup: true,
    pickupLabel: "Dublin Airport",
    airportCode: "DUB",
    dublinArrivalTerminal: "T2",
  });
  const dubUnknown = buildAirportPickupInstruction({
    isAirportPickup: true,
    pickupLabel: "Dublin Airport",
    airportCode: "DUB",
  });
  const street = buildAirportPickupInstruction({
    isAirportPickup: false,
    pickupLabel: "25 Wanstead Park, Dundonald",
  });

  assert.equal(bfsExpress, AIRPORT_PICKUP_COPY.express);
  assert.equal(bhdExpress, AIRPORT_PICKUP_COPY.express);
  assert.doesNotMatch(String(bfsExpress), /waiting there|already/i);
  assert.equal(bfsFree, AIRPORT_PICKUP_COPY.bfsBhdFree);
  assert.equal(bhdFree, AIRPORT_PICKUP_COPY.bfsBhdFree);
  assert.match(String(bfsFree), /Long Stay Car Park Free Pick-Up Location/);
  assert.match(String(bfsFree), /maximum stay of 10 minutes/);
  assert.equal(dubT1, AIRPORT_PICKUP_COPY.dubT1);
  assert.equal(dubT2, AIRPORT_PICKUP_COPY.dubT2);
  assert.equal(dubUnknown, AIRPORT_PICKUP_COPY.dubUnknown);
  assert.match(String(dubT1), /Terminal 1/);
  assert.match(String(dubT2), /Terminal 2/);
  assert.match(String(dubUnknown), /needs confirmation/);
  assert.match(String(dubUnknown), /maximum stay of 10 minutes/);
  assert.equal(street, null);

  for (const copy of [bfsExpress, bfsFree, bhdExpress, bhdFree, dubT1, dubT2, dubUnknown]) {
    assert.doesNotMatch(String(copy), /My Airport Taxi NI driver/);
    assert.doesNotMatch(String(copy), /your My Airport Taxi NI driver/i);
  }

  const ownerAirport = buildArrivedPickupWhatsAppMessage({
    isAirportPickup: true,
    pickupLabel: "Belfast International Airport",
    airportCode: "BFS",
    airportAccessOption: "free",
    vehicle: {
      colour: OWNER_OPERATOR.vehicleColour,
      make: OWNER_OPERATOR.vehicleMake,
      model: OWNER_OPERATOR.vehicleModel,
      registration: OWNER_OPERATOR.registration,
    },
  });
  const assignedAirport = buildArrivedPickupWhatsAppMessage({
    isAirportPickup: true,
    pickupLabel: "Belfast International Airport",
    airportCode: "BFS",
    airportAccessOption: "free",
    vehicle: {
      colour: ASSIGNED_OPERATOR.vehicleColour,
      make: ASSIGNED_OPERATOR.vehicleMake,
      model: ASSIGNED_OPERATOR.vehicleModel,
      registration: ASSIGNED_OPERATOR.registration,
    },
  });
  assert.equal(ownerAirport, assignedAirport);
  assert.match(ownerAirport, /Long Stay Car Park Free Pick-Up Location/);
  assert.doesNotMatch(ownerAirport, /Express Pick-Up/);
  assert.doesNotMatch(ownerAirport, /My Airport Taxi NI driver/);
});

check("Dublin terminal parser never guesses and owner override wins", () => {
  assert.equal(parseDublinArrivalTerminal("1"), "T1");
  assert.equal(parseDublinArrivalTerminal("T2"), "T2");
  assert.equal(parseDublinArrivalTerminal("Terminal 1"), "T1");
  assert.equal(parseDublinArrivalTerminal("3"), null);
  assert.equal(parseDublinArrivalTerminal("Pier A"), null);
  assert.equal(parseDublinArrivalTerminal(""), null);
  assert.equal(
    chooseDublinArrivalTerminal({ stored: "T1", source: "owner", fromFlight: "T2" }),
    "T1",
  );
  assert.equal(
    chooseDublinArrivalTerminal({ stored: null, source: "unresolved", fromFlight: "2" }),
    "T2",
  );
});

check("Active-leg pickup time swaps on return like the pickup label", () => {
  const returnBooking = {
    pickupLabel: "Home",
    dropoffLabel: "Belfast International Airport",
    returnJourney: true,
    outboundJourneyStatus: "completed" as const,
    tripDate: "2026-09-10",
    tripTime: "08:00",
    returnDate: "2026-09-12",
    returnTime: "16:30",
    nextUnfinishedLegDate: "2026-09-12",
    nextUnfinishedLegTime: "16:30",
  };
  assert.equal(activeLegPickupLabel(returnBooking), "Belfast International Airport");
  assert.equal(activeLegPickupTime(returnBooking), "16:30");
  assert.equal(
    activeLegPickupTime({
      ...returnBooking,
      outboundJourneyStatus: "tracking",
      nextUnfinishedLegDate: "2026-09-10",
      nextUnfinishedLegTime: "08:00",
    }),
    "08:00",
  );
});

check("Owner and driver portals call the shared builders with booking fields only", () => {
  const owner = read("src/components/OwnerPaidBookingsPanel.tsx");
  const driver = read("src/app/driver/DriverPageClient.tsx");
  const handlers = read("workers/addresses/src/journey-handlers.ts");

  assert.match(owner, /buildDriverOnTheWayWhatsAppLink/);
  assert.match(owner, /customerName: booking\.customerName/);
  assert.match(owner, /bookedPickupTime: activeLegPickupTime\(booking\)/);
  assert.match(owner, /airportAccessOption: booking\.airportAccessOption/);
  assert.match(owner, /dublinArrivalTerminal: activeLegDublinArrivalTerminal\(booking\)/);
  assert.doesNotMatch(owner, /driverFirstName:|vehicleColour:|partialRegistration:/);
  assert.doesNotMatch(owner, /assignedDriverName\?\.trim\(\)\.split/);

  assert.match(driver, /buildDriverOnTheWayWhatsAppLink/);
  assert.match(driver, /customerName: job\.customerName/);
  assert.match(driver, /bookedPickupTime: job\.tripTime/);
  assert.match(driver, /airportAccessOption: job\.airportAccessOption/);
  assert.match(driver, /dublinArrivalTerminal: job\.dublinArrivalTerminal/);
  const driverOnTheWayCall = driver.slice(
    driver.indexOf("buildDriverOnTheWayWhatsAppLink(mobile, {"),
    driver.indexOf("buildDriverOnTheWayWhatsAppLink(mobile, {") + 280,
  );
  assert.match(driverOnTheWayCall, /customerName: job\.customerName/);
  assert.match(driverOnTheWayCall, /bookedPickupTime: job\.tripTime/);
  assert.doesNotMatch(driverOnTheWayCall, /driverFirstName:|vehicleColour:|partialRegistration:/);

  assert.match(handlers, /buildDriverOnTheWayEmail/);
  assert.match(handlers, /bookedPickupTime: job\.tripTime/);
  assert.doesNotMatch(handlers, /resolveAssignedDriverDetails|getDriverVehicleProfile/);
  assert.doesNotMatch(handlers, /driverFirstName: details|vehicleColour: details|partialRegistration: details/);
});

check("Shared company-voice module is synced to the worker", () => {
  assert.equal(
    read("shared/company-voice-journey.ts"),
    read("workers/addresses/shared/company-voice-journey.ts"),
  );
  assert.equal(
    read("shared/dublin-arrival-terminal.ts"),
    read("workers/addresses/shared/dublin-arrival-terminal.ts"),
  );
  assert.equal(read("shared/arrival-whatsapp.ts"), read("workers/addresses/shared/arrival-whatsapp.ts"));
  assert.equal(
    read("shared/booking-notifications.ts"),
    read("workers/addresses/shared/booking-notifications.ts"),
  );
});

console.log("\nAll company-voice journey message checks passed.");
