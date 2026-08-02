const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TIME_ZONE = "Europe/London";
const DEFAULT_TRANSFER_DURATION_MINUTES = 90;
const DEFAULT_TOUR_DURATION_HOURS = 8;
const BUSINESS_NAME = "My Airport Taxi NI";
const BUSINESS_WEBSITE = "https://www.myairporttaxini.co.uk";
const BUSINESS_LOGO_URL = `${BUSINESS_WEBSITE}/google-business-logo.png`;

export type TransferBookingEvent = {
  customerName: string;
  customerEmail?: string;
  mobileNumber?: string;
  tripLabel: string;
  pickupLabel: string;
  dropoffLabel: string;
  returnJourney: boolean;
  tripDate: string;
  tripTime: string;
  returnDate?: string;
  returnTime?: string;
  flightNumber?: string;
  passengers?: number;
  suitcases?: number;
  vehicle?: string;
  estimatedPrice?: string | null;
  isAirportTrip?: boolean;
  amountPaid?: string;
  paymentReference?: string;
  paid?: boolean;
  returnFlightNumber?: string;
};

export type TourBookingEvent = {
  customerName: string;
  customerEmail?: string;
  mobileNumber?: string;
  tourTitle: string;
  travelDate: string;
  groupSize?: number;
  pickupLocation?: string;
  notes?: string;
};

export type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
};

type CalendarEventInput = {
  summary: string;
  description: string;
  location?: string;
  startDateTime: string;
  endDateTime: string;
  attendeeEmail?: string;
};

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;

  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else {
    bytes = input;
  }

  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem.includes("\\n") ? pem.replace(/\\n/g, "\n") : pem;
  const b64 = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
}

export function parseServiceAccountJson(raw: string): GoogleServiceAccount {
  let cleaned = raw.trim().replace(/^\uFEFF/, "");

  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  const envPrefix = cleaned.match(/^GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON\s*=\s*/i);
  if (envPrefix) {
    cleaned = cleaned.slice(envPrefix[0].length).trim();
  }

  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    try {
      const unquoted = JSON.parse(cleaned);
      if (typeof unquoted === "string") {
        cleaned = unquoted.trim();
      }
    } catch {
      // Keep original string and try parsing as JSON below.
    }
  }

  cleaned = cleaned.replace(/^(?:false|null|true)\s*/i, "").trim();

  let parsed: Partial<GoogleServiceAccount>;
  try {
    parsed = JSON.parse(cleaned) as Partial<GoogleServiceAccount>;
  } catch (firstError) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      parsed = JSON.parse(cleaned.slice(start, end + 1)) as Partial<GoogleServiceAccount>;
    } else {
      throw firstError;
    }
  }

  if (!parsed.client_email?.trim() || !parsed.private_key?.trim()) {
    throw new Error("Invalid Google service account JSON");
  }

  return {
    client_email: parsed.client_email.trim(),
    private_key: parsed.private_key,
  };
}

export async function getGoogleAccessToken(
  serviceAccount: GoogleServiceAccount,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: CALENDAR_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );

  const unsigned = `${header}.${claim}`;
  const key = await importPrivateKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const jwt = `${unsigned}.${base64UrlEncode(signature)}`;

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google token exchange failed (${response.status})`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) {
    throw new Error("Google token response missing access_token");
  }

  return payload.access_token;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

function addMinutes(dateTimeLocal: string, minutes: number): string {
  const [datePart, timePart] = dateTimeLocal.split("T");
  if (!datePart || !timePart) {
    throw new Error(`Invalid datetime: ${dateTimeLocal}`);
  }

  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  if (
    [year, month, day, hour, minute].some((part) => !Number.isFinite(part))
  ) {
    throw new Error(`Invalid datetime: ${dateTimeLocal}`);
  }

  // Calendar arithmetic in UTC so Workers' UTC clock does not shift wall times.
  const totalMinutes = hour! * 60 + minute! + minutes;
  const date = new Date(Date.UTC(year!, month! - 1, day!, 0, totalMinutes));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${dateTimeLocal}`);
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

function buildTransferDescription(booking: TransferBookingEvent, message?: string): string {
  const header = [
    BUSINESS_NAME,
    BUSINESS_WEBSITE,
    `Logo: ${BUSINESS_LOGO_URL}`,
    "",
  ];

  if (message?.trim()) {
    return [...header, message.trim()].join("\n");
  }

  const lines = [
    ...header,
    `Trip: ${booking.tripLabel}`,
    `Pickup: ${booking.pickupLabel}`,
    `Drop-off: ${booking.dropoffLabel}`,
    booking.customerEmail ? `Email: ${booking.customerEmail}` : "",
    booking.mobileNumber ? `Mobile: ${booking.mobileNumber}` : "",
    booking.flightNumber ? `Flight for going: ${booking.flightNumber}` : "",
    booking.returnFlightNumber ? `Flight for collection: ${booking.returnFlightNumber}` : "",
    typeof booking.passengers === "number" ? `Passengers: ${booking.passengers}` : "",
    typeof booking.suitcases === "number" ? `Suitcases: ${booking.suitcases}` : "",
    booking.vehicle ? `Vehicle: ${booking.vehicle}` : "",
    booking.estimatedPrice ? `Estimated price: ${booking.estimatedPrice}` : "",
    booking.paid && booking.amountPaid ? `Amount paid: ${booking.amountPaid}` : "",
    booking.paid && booking.paymentReference
      ? `Payment reference: ${booking.paymentReference}`
      : "",
    booking.paid ? "Status: PAID (SumUp)" : "",
    "",
    `Source: ${BUSINESS_NAME} website booking`,
  ];

  return lines.filter(Boolean).join("\n");
}

function buildTourDescription(tour: TourBookingEvent, message?: string): string {
  const header = [
    BUSINESS_NAME,
    BUSINESS_WEBSITE,
    `Logo: ${BUSINESS_LOGO_URL}`,
    "",
  ];

  if (message?.trim()) {
    return [...header, message.trim()].join("\n");
  }

  const lines = [
    ...header,
    `Day trip: ${tour.tourTitle}`,
    tour.pickupLocation ? `Pickup: ${tour.pickupLocation}` : "",
    typeof tour.groupSize === "number" ? `Group size: ${tour.groupSize}` : "",
    tour.customerEmail ? `Email: ${tour.customerEmail}` : "",
    tour.mobileNumber ? `Mobile: ${tour.mobileNumber}` : "",
    tour.notes ? `Notes: ${tour.notes}` : "",
    "",
    `Source: ${BUSINESS_NAME} website booking`,
  ];

  return lines.filter(Boolean).join("\n");
}

function buildTransferSummary(booking: TransferBookingEvent, suffix = ""): string {
  const paidTag =
    booking.paid && booking.amountPaid ? ` [PAID ${booking.amountPaid}]` : "";
  return `${BUSINESS_NAME} — ${booking.tripLabel} — ${booking.customerName}${paidTag}${suffix}`;
}

export function buildTransferCalendarEvents(
  booking: TransferBookingEvent,
  message?: string,
): CalendarEventInput[] {
  if (!isValidDate(booking.tripDate) || !isValidTime(booking.tripTime)) {
    throw new Error("Transfer booking is missing a valid trip date/time");
  }

  const description = buildTransferDescription(booking, message);
  const outboundStart = `${booking.tripDate}T${booking.tripTime}`;
  const events: CalendarEventInput[] = [
    {
      summary: buildTransferSummary(booking),
      description,
      location: booking.pickupLabel,
      startDateTime: outboundStart,
      endDateTime: addMinutes(outboundStart, DEFAULT_TRANSFER_DURATION_MINUTES),
      attendeeEmail: booking.customerEmail?.trim() || undefined,
    },
  ];

  if (
    booking.returnJourney &&
    booking.returnDate &&
    booking.returnTime &&
    isValidDate(booking.returnDate) &&
    isValidTime(booking.returnTime)
  ) {
    const returnStart = `${booking.returnDate}T${booking.returnTime}`;
    events.push({
      summary: buildTransferSummary(booking, " (Return)"),
      description,
      location: booking.dropoffLabel,
      startDateTime: returnStart,
      endDateTime: addMinutes(returnStart, DEFAULT_TRANSFER_DURATION_MINUTES),
      attendeeEmail: booking.customerEmail?.trim() || undefined,
    });
  }

  return events;
}

export function buildTourCalendarEvents(
  tour: TourBookingEvent,
  message?: string,
): CalendarEventInput[] {
  if (!isValidDate(tour.travelDate)) {
    throw new Error("Tour booking is missing a valid travel date");
  }

  const startDateTime = `${tour.travelDate}T09:00`;
  return [
    {
      summary: `${BUSINESS_NAME} — ${tour.tourTitle} — ${tour.customerName}`,
      description: buildTourDescription(tour, message),
      location: tour.pickupLocation?.trim() || undefined,
      startDateTime,
      endDateTime: addMinutes(startDateTime, DEFAULT_TOUR_DURATION_HOURS * 60),
      attendeeEmail: tour.customerEmail?.trim() || undefined,
    },
  ];
}

function formatLondonDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * Fallback parser for plain booking emails when structured fields are absent.
 */
export function buildEventsFromBookingMessage(
  customerName: string,
  message: string,
): CalendarEventInput[] {
  const tripMatch = message.match(/^Trip:\s*(.+)$/m);
  const tourMatch = message.match(/^Day trip:\s*(.+)$/m);
  const pickupMatch = message.match(/^Pickup(?: location)?:\s*(.+)$/m);
  const dropoffMatch = message.match(/^Drop-off:\s*(.+)$/m);
  const outboundDate =
    message.match(/^(?:Outbound date|Date|Preferred date):\s*(\d{4}-\d{2}-\d{2})$/m)?.[1] ??
    "";
  const outboundTime =
    message.match(/^(?:Outbound time|Time):\s*(\d{2}:\d{2})$/m)?.[1] ?? "";
  const returnDate = message.match(/^Return date:\s*(\d{4}-\d{2}-\d{2})$/m)?.[1] ?? "";
  const returnTime = message.match(/^Return time:\s*(\d{2}:\d{2})$/m)?.[1] ?? "";
  const flightNumber = message.match(/^Flight number:\s*(.+)$/m)?.[1]?.trim() ?? "";

  if (tourMatch && isValidDate(outboundDate)) {
    return buildTourCalendarEvents(
      {
        customerName,
        tourTitle: tourMatch[1]!.trim(),
        travelDate: outboundDate,
        pickupLocation: pickupMatch?.[1]?.trim(),
      },
      message,
    );
  }

  if (isValidDate(outboundDate) && isValidTime(outboundTime)) {
    return buildTransferCalendarEvents(
      {
        customerName,
        tripLabel: tripMatch?.[1]?.trim() || "Transfer booking",
        pickupLabel: pickupMatch?.[1]?.trim() || "",
        dropoffLabel: dropoffMatch?.[1]?.trim() || "",
        returnJourney: Boolean(returnDate && returnTime),
        tripDate: outboundDate,
        tripTime: outboundTime,
        returnDate,
        returnTime,
        flightNumber,
      },
      message,
    );
  }

  // Last resort: create a short reminder event starting in one hour.
  const startDateTime = formatLondonDateTime(new Date(Date.now() + 60 * 60 * 1000));

  return [
    {
      summary: `${BUSINESS_NAME} — Website booking — ${customerName}`,
      description: message,
      startDateTime,
      endDateTime: addMinutes(startDateTime, DEFAULT_TRANSFER_DURATION_MINUTES),
    },
  ];
}

async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEventInput,
): Promise<void> {
  const body: Record<string, unknown> = {
    summary: event.summary,
    description: event.description,
    location: event.location,
    start: {
      dateTime: `${event.startDateTime}:00`,
      timeZone: TIME_ZONE,
    },
    end: {
      dateTime: `${event.endDateTime}:00`,
      timeZone: TIME_ZONE,
    },
    source: {
      title: BUSINESS_NAME,
      url: BUSINESS_WEBSITE,
    },
    colorId: "9",
    attachments: [
      {
        fileUrl: BUSINESS_LOGO_URL,
        title: BUSINESS_NAME,
        mimeType: "image/png",
        iconLink: BUSINESS_LOGO_URL,
      },
    ],
  };

  // Do not invite customers automatically — this is an owner-facing log only.
  void event.attendeeEmail;

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?supportsAttachments=true`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Calendar create failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

export async function logBookingsToGoogleCalendar(options: {
  serviceAccountJson: string;
  calendarId: string;
  customerName: string;
  message: string;
  booking?: TransferBookingEvent | null;
  tour?: TourBookingEvent | null;
}): Promise<number> {
  const serviceAccount = parseServiceAccountJson(options.serviceAccountJson);
  const accessToken = await getGoogleAccessToken(serviceAccount);

  let events: CalendarEventInput[];

  if (options.booking) {
    events = buildTransferCalendarEvents(options.booking, options.message);
  } else if (options.tour) {
    events = buildTourCalendarEvents(options.tour, options.message);
  } else {
    events = buildEventsFromBookingMessage(options.customerName, options.message);
  }

  for (const event of events) {
    await createCalendarEvent(accessToken, options.calendarId, event);
  }

  return events.length;
}
