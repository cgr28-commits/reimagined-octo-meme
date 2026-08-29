/**
 * Owner/driver Arrived at Pickup → WhatsApp click-to-chat helpers.
 * Manual Send only — no WhatsApp Business API.
 */

export type ArrivalVehicleDetails = {
  colour: string;
  make: string;
  model: string;
  registration: string;
};

/** Belfast International, Belfast City, Dublin — airport pickup copy. */
export function isAirportPickupLabel(pickupLabel: string): boolean {
  const n = pickupLabel.trim().toLowerCase();
  if (!n) return false;

  if (n.includes("belfast international")) return true;
  if (n.includes("belfast city")) return true;
  if (n.includes("george best")) return true;
  if (n.includes("dublin airport")) return true;

  // Common short labels / codes on booking cards
  if (/\bbfs\b/.test(n) && (n.includes("airport") || n.includes("international") || n === "bfs")) {
    return true;
  }
  if (/\bbhd\b/.test(n) && (n.includes("airport") || n.includes("city") || n === "bhd")) {
    return true;
  }
  if (/\bdub\b/.test(n) && n.includes("airport")) return true;
  if (n === "bfs" || n === "bhd" || n === "dub") return true;

  return false;
}

/**
 * Pickup address for the active unfinished leg.
 * Return leg pickup is the original dropoff (airport ↔ address swap).
 */
export function activeLegPickupLabel(booking: {
  pickupLabel?: string;
  dropoffLabel?: string;
  returnJourney?: boolean;
  outboundJourneyStatus?: string;
  nextUnfinishedLegDate?: string;
  tripDate?: string;
  returnDate?: string;
}): string {
  if (!booking.returnJourney) {
    return booking.pickupLabel?.trim() || "";
  }

  const outboundDone = booking.outboundJourneyStatus === "completed";
  const nextIsReturn =
    Boolean(booking.nextUnfinishedLegDate?.trim()) &&
    booking.nextUnfinishedLegDate === (booking.returnDate || "").trim() &&
    booking.nextUnfinishedLegDate !== (booking.tripDate || "").trim();

  if (outboundDone || nextIsReturn) {
    return booking.dropoffLabel?.trim() || "";
  }

  return booking.pickupLabel?.trim() || "";
}

export function buildArrivedPickupWhatsAppMessage(options: {
  isAirportPickup: boolean;
  vehicle?: ArrivalVehicleDetails | null;
}): string {
  if (options.isAirportPickup) {
    const colour = options.vehicle?.colour?.trim() || "";
    const make = options.vehicle?.make?.trim() || "";
    const model = options.vehicle?.model?.trim() || "";
    const registration = options.vehicle?.registration?.trim().toUpperCase() || "";
    const vehicleLine =
      colour && make && model ? `🚘 Your vehicle: ${colour} ${make} ${model}` : "";
    const regLine = registration ? `Registration: ${registration}` : "";

    const lines = [
      "✈️ Your driver has arrived",
      "",
      "Your My Airport Taxi NI driver is at the agreed airport pickup point and ready to meet you.",
    ];
    if (vehicleLine || regLine) {
      lines.push("");
      if (vehicleLine) lines.push(vehicleLine);
      if (regLine) lines.push(regLine);
    }
    lines.push("");
    lines.push(
      "Please let us know when you’re making your way outside, so your driver can be ready for you.",
    );
    return lines.join("\n");
  }

  return [
    "🚕 Your driver has arrived",
    "",
    "Your My Airport Taxi NI driver is now at your pickup location and ready when you are.",
  ].join("\n");
}

/** Normalise UK/IE mobiles to WhatsApp international digits (no +). */
export function toWhatsAppDigits(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 10) return "";
  if (digits.startsWith("44") || digits.startsWith("353")) return digits;
  if (digits.startsWith("0")) return `44${digits.slice(1)}`;
  return digits;
}

export function buildArrivedPickupWhatsAppLink(
  customerMobile: string,
  message: string,
): string {
  const waNumber = toWhatsAppDigits(customerMobile);
  const text = encodeURIComponent(message);
  return waNumber ? `https://wa.me/${waNumber}?text=${text}` : `https://wa.me/?text=${text}`;
}

/**
 * Optional pre-filled WhatsApp for Driver on the way.
 * Manual Send only — does not automate WhatsApp Live Location.
 */
export function buildDriverOnTheWayWhatsAppMessage(options?: {
  driverFirstName?: string;
  vehicleColour?: string;
  partialRegistration?: string;
  driverMobile?: string;
  trackUrl?: string;
}): string {
  const driverFirst = options?.driverFirstName?.trim() || "";
  const colour = options?.vehicleColour?.trim() || "";
  const partialReg = options?.partialRegistration?.trim() || "";
  const mobile = options?.driverMobile?.trim() || "";
  const trackUrl = options?.trackUrl?.trim() || "";

  const lines = [
    "Hi, your My Airport Taxi NI driver is now on the way.",
    "",
  ];
  if (driverFirst) lines.push(`Driver: ${driverFirst}`);
  if (colour) lines.push(`Vehicle: ${colour}`);
  if (partialReg) lines.push(`Registration: ${partialReg}`);
  if (mobile) lines.push(`Driver mobile: ${mobile}`);
  if (driverFirst || colour || partialReg || mobile) lines.push("");
  if (trackUrl) {
    lines.push(`You can follow the journey using your live tracking link: ${trackUrl}`);
    lines.push("");
  }
  lines.push(
    "Your driver may also share their live location with you directly here on WhatsApp.",
  );
  return lines.join("\n");
}

export function buildDriverOnTheWayWhatsAppLink(
  customerMobile: string,
  options?: {
    driverFirstName?: string;
    vehicleColour?: string;
    partialRegistration?: string;
    driverMobile?: string;
    trackUrl?: string;
  },
): string {
  return buildArrivedPickupWhatsAppLink(
    customerMobile,
    buildDriverOnTheWayWhatsAppMessage(options),
  );
}
