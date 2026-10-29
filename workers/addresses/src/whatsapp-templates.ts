/**
 * WhatsApp template messages (business-initiated) sent from the business number
 * alongside the existing customer emails:
 *
 *   mat_booking_confirmed  — after a paid booking is finalised
 *   mat_driver_on_the_way  — when the driver starts the journey (start_tracking)
 *   mat_driver_details     — when an assigned (non-owner) driver accepts
 *   mat_review_request     — with the delayed Google review request
 *   mat_airport_pickup     — with the journey-day airport collection email (~4h before):
 *                            where to meet the driver, plus a "View pickup map" button
 *   mat_journey_reminder   — with the journey reminder email (~4h before) for pickups that
 *                            aren't at an airport (airport collections get mat_airport_pickup)
 *   mat_tip_request        — journey completed and the customer didn't tip in person:
 *                            optional tip with a "Leave a tip" button (secure tip page)
 *   mat_driver_arrived     — driver taps Arrived at a home / hotel / station pickup
 *   mat_driver_arrived_airport — driver taps Arrived at an airport: where to go + map button
 *
 * Nothing is sent until Meta has APPROVED the template: the approved list is read
 * from 360dialog (cached). WHATSAPP_TEMPLATES_ENABLED="false" switches all of them
 * off. Every send is best-effort — it never blocks or fails the email path — and is
 * idempotent via a KV marker per template + job.
 *
 * GET /whatsapp/templates            — status of each template (approved / pending / missing)
 * GET /whatsapp/templates?submit=1   — submit any missing templates to Meta via 360dialog
 * (No key needed, like /whatsapp/connect: it can only ever submit these fixed templates.)
 */

import { D360_API_BASE, type WhatsAppCloudEnv } from "../shared/whatsapp-cloud";
import { formatPartialRegistration } from "../shared/partial-registration";
import { DEFAULT_GOOGLE_REVIEW_URL } from "../shared/google-business-profile";

export type WhatsAppTemplateEnv = WhatsAppCloudEnv & {
  TRACKING_STORE?: KVNamespace;
  /** "false" stops every template message (emails are unaffected). */
  WHATSAPP_TEMPLATES_ENABLED?: string;
  GOOGLE_REVIEW_URL?: string;
};

export type WhatsAppTemplateName =
  | "mat_booking_confirmed"
  | "mat_driver_on_the_way"
  | "mat_driver_details"
  | "mat_review_request"
  | "mat_airport_pickup"
  | "mat_journey_reminder"
  | "mat_tip_request"
  | "mat_driver_arrived"
  | "mat_driver_arrived_airport";

export const WHATSAPP_TEMPLATE_LANGUAGE = "en_GB";
const SITE = "https://www.myairporttaxini.co.uk";

type TemplateDefinition = {
  name: WhatsAppTemplateName;
  category: "UTILITY" | "MARKETING";
  components: Array<Record<string, unknown>>;
};

/** Exactly what is submitted to Meta. Keep wording in sync with the senders below. */
export function whatsAppTemplateDefinitions(reviewUrl: string = DEFAULT_GOOGLE_REVIEW_URL): TemplateDefinition[] {
  return [
    {
      name: "mat_booking_confirmed",
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text:
            "Hi {{1}}, your booking with My Airport Taxi NI is confirmed.\n\n" +
            "Reference: {{2}}\nPickup: {{3}}\nFrom: {{4}}\nTo: {{5}}\n\n" +
            "We will message you on the day when your driver is on the way. Reply here if anything changes.",
          example: {
            body_text: [["Sarah", "MAT-1042", "Sat 31 Oct at 05:30", "12 Main Street, Lisburn", "Belfast International Airport"]],
          },
        },
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "URL",
              text: "Manage booking",
              url: `${SITE}/manage-booking/?token={{1}}`,
              example: [`${SITE}/manage-booking/?token=abc123`],
            },
          ],
        },
      ],
    },
    {
      name: "mat_driver_on_the_way",
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text:
            "Hi {{1}}, your My Airport Taxi NI driver is now on the way to {{2}} for your {{3}} pickup. " +
            "Reply here if you need to reach us.",
          example: { body_text: [["Sarah", "12 Main Street, Lisburn", "05:30"]] },
        },
      ],
    },
    {
      name: "mat_driver_details",
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text:
            "Hi {{1}}, here are your driver details for your journey on {{2}}.\n\n" +
            "Driver: {{3}}\nMobile: {{4}}\nVehicle: {{5}}\n\n" +
            "Your driver will contact you on the day if needed.",
          example: { body_text: [["Sarah", "Sat 31 Oct at 05:30", "John", "07700 900123", "Silver Skoda Octavia, reg CR66 ***"]] },
        },
      ],
    },
    {
      name: "mat_review_request",
      category: "MARKETING",
      components: [
        {
          type: "BODY",
          text:
            "Hi {{1}}, thank you for travelling with My Airport Taxi NI on {{2}}. We hope your journey went well.\n\n" +
            "If you have a moment, a quick Google review would really help other travellers find us.",
          example: { body_text: [["Sarah", "Sat 31 Oct"]] },
        },
        {
          type: "BUTTONS",
          buttons: [{ type: "URL", text: "Leave a review", url: reviewUrl }],
        },
      ],
    },
    {
      name: "mat_tip_request",
      category: "UTILITY",
      components: [
        // Laid out like the owner's design: heading, the line, the softer line, the thank-you.
        { type: "HEADER", format: "TEXT", text: "Enjoyed your journey?" },
        {
          type: "BODY",
          text:
            "Hi {{1}} 💚\n\n" +
            "*Tips are never expected, but always greatly appreciated.*\n\n" +
            "_If you'd like to leave a little extra for your driver, it's a lovely way to say thank you._\n\n" +
            "*Thank you for supporting My Airport Taxi NI.*",
          example: { body_text: [["Sarah"]] },
        },
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "URL",
              text: "Leave a tip",
              url: `${SITE}/tip/?t={{1}}`,
              example: [`${SITE}/tip/?t=0123456789abcdef0123456789abcdef`],
            },
          ],
        },
      ],
    },
    {
      name: "mat_journey_reminder",
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text:
            "Hi {{1}}, just a reminder of your journey with My Airport Taxi NI on {{2}}.\n\n" +
            "Pickup: {{3}}\nDrop-off: {{4}}\n\n" +
            "Your driver will be with you at the pickup time. Reply here if anything has changed.",
          example: {
            body_text: [["Sarah", "Sat 31 Oct at 05:30", "12 Main Street, Lisburn", "Belfast International Airport"]],
          },
        },
      ],
    },
    {
      name: "mat_airport_pickup",
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text:
            "Hi {{1}}, your airport collection with My Airport Taxi NI is on {{2}}.\n\n" +
            "Where to meet your driver at {{3}}:\n{{4}}\n\n" +
            "Tap the button below for the pickup map. Reply here if you need us.",
          example: {
            body_text: [[
              "Sarah",
              "Sat 31 Oct at 14:30",
              "Belfast International Airport",
              "After collecting your baggage, please make your way to the airport's Drop-Off Zone, which is signposted outside the terminal. Once you are there, contact your driver.",
            ]],
          },
        },
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "URL",
              text: "View pickup map",
              url: `${SITE}/{{1}}`,
              example: [`${SITE}/maps/belfast-international-pick-up-drop-off.jpg`],
            },
          ],
        },
      ],
    },
    {
      name: "mat_driver_arrived",
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text: "Hi {{1}}, your My Airport Taxi NI driver has arrived at {{2}}. Reply here if you need us.",
          example: { body_text: [["Sarah", "12 Main Street, Lisburn"]] },
        },
      ],
    },
    {
      name: "mat_driver_arrived_airport",
      category: "UTILITY",
      components: [
        {
          type: "BODY",
          text:
            "Hi {{1}}, your My Airport Taxi NI driver has arrived at {{2}} and is ready to collect you.\n\n" +
            "{{3}}\n\nTap the button below for the map of where to go.",
          example: {
            body_text: [[
              "Sarah",
              "Belfast International Airport",
              "After collecting your baggage, please make your way to the airport's Drop-Off Zone, which is signposted outside the terminal. Once you are there, contact your driver.",
            ]],
          },
        },
        {
          type: "BUTTONS",
          buttons: [
            {
              type: "URL",
              text: "Where to go",
              url: `${SITE}/{{1}}`,
              example: [`${SITE}/maps/belfast-international-pick-up-drop-off.jpg`],
            },
          ],
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Formatting helpers (template parameters may not contain newlines or be empty)
// ---------------------------------------------------------------------------

export function templateParam(value: string | null | undefined, max = 700): string {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "-";
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

export function firstNameOf(name: string | null | undefined): string {
  const first = String(name ?? "").trim().split(/\s+/)[0] ?? "";
  return first || "there";
}

/** "2026-10-31" → "Sat 31 Oct"; anything else is returned trimmed. */
export function shortTripDate(date: string | null | undefined): string {
  const raw = String(date ?? "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return raw;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return raw;
  const weekday = d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const month = d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
  return `${weekday} ${d.getUTCDate()} ${month}`;
}

export function tripWhen(date: string | null | undefined, time: string | null | undefined): string {
  const day = shortTripDate(date);
  const at = String(time ?? "").trim();
  if (day && at) return `${day} at ${at}`;
  return day || at;
}

/**
 * Customer mobile → WhatsApp recipient digits. UK 07… → 447…, Irish 08x… → 3538x…,
 * 00-prefixed international kept. Returns "" when it can't be sure.
 */
export function whatsAppRecipient(mobile: string | null | undefined): string {
  let digits = String(mobile ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^44\d{10}$/.test(digits) || /^353\d{8,10}$/.test(digits)) return digits;
  if (/^07\d{9}$/.test(digits)) return `44${digits.slice(1)}`;
  if (/^08[3-9]\d{7}$/.test(digits)) return `353${digits.slice(1)}`;
  return "";
}

// ---------------------------------------------------------------------------
// Approved-template lookup (cached)
// ---------------------------------------------------------------------------

const STATUS_CACHE_KEY = "whatsapp:templates:status";
const STATUS_CACHE_SECONDS = 30 * 60;
const SUBMIT_COOLDOWN_KEY = "whatsapp:templates:submit-cooldown";
const SUBMIT_COOLDOWN_SECONDS = 120;
const SENT_MARKER_TTL_SECONDS = 60 * 60 * 24 * 400;

type TemplateStatusMap = Partial<Record<WhatsAppTemplateName, string>>;

async function fetchTemplateStatuses(apiKey: string, fetchImpl: typeof fetch): Promise<TemplateStatusMap | null> {
  try {
    const res = await fetchImpl(`${D360_API_BASE}/v1/configs/templates?limit=1000`, {
      headers: { "D360-API-KEY": apiKey },
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      waba_templates?: Array<{ name?: string; status?: string; language?: string }>;
    } | null;
    const out: TemplateStatusMap = {};
    for (const tpl of data?.waba_templates ?? []) {
      if (!tpl.name || !tpl.name.startsWith("mat_")) continue;
      if (tpl.language && tpl.language !== WHATSAPP_TEMPLATE_LANGUAGE) continue;
      out[tpl.name as WhatsAppTemplateName] = String(tpl.status ?? "unknown").toLowerCase();
    }
    return out;
  } catch {
    return null;
  }
}

export async function getTemplateStatuses(
  env: WhatsAppTemplateEnv,
  options: { refresh?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<TemplateStatusMap | null> {
  const apiKey = env.D360_API_KEY?.trim();
  if (!apiKey) return null;
  const store = env.TRACKING_STORE;
  if (store && !options.refresh) {
    const cached = await store.get<TemplateStatusMap>(STATUS_CACHE_KEY, "json").catch(() => null);
    if (cached) return cached;
  }
  const fresh = await fetchTemplateStatuses(apiKey, options.fetchImpl ?? fetch);
  if (fresh && store) {
    await store.put(STATUS_CACHE_KEY, JSON.stringify(fresh), { expirationTtl: STATUS_CACHE_SECONDS }).catch(() => {});
  }
  return fresh;
}

async function templateApproved(
  env: WhatsAppTemplateEnv,
  name: WhatsAppTemplateName,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  if (env.WHATSAPP_TEMPLATES_ENABLED?.trim().toLowerCase() === "false") return false;
  const statuses = await getTemplateStatuses(env, { fetchImpl });
  return statuses?.[name] === "approved";
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type TemplateSendResult =
  | { sent: true; messageId?: string }
  | { sent: false; reason: "disabled_or_not_approved" | "no_mobile" | "already_sent" | "no_store" | "send_failed"; error?: string };

export function buildTemplatePayload(
  name: WhatsAppTemplateName,
  bodyParams: string[],
  urlButtonParam?: string,
): Record<string, unknown> {
  const components: Array<Record<string, unknown>> = [
    { type: "body", parameters: bodyParams.map((text) => ({ type: "text", text: templateParam(text) })) },
  ];
  if (urlButtonParam) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: urlButtonParam }],
    });
  }
  return { type: "template", template: { name, language: { code: WHATSAPP_TEMPLATE_LANGUAGE }, components } };
}

async function sendTemplate(
  env: WhatsAppTemplateEnv,
  input: {
    name: WhatsAppTemplateName;
    jobKey: string;
    mobile: string | null | undefined;
    bodyParams: string[];
    urlButtonParam?: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<TemplateSendResult> {
  const store = env.TRACKING_STORE;
  if (!store) return { sent: false, reason: "no_store" };
  const to = whatsAppRecipient(input.mobile);
  if (!to) return { sent: false, reason: "no_mobile" };
  if (!(await templateApproved(env, input.name, fetchImpl))) return { sent: false, reason: "disabled_or_not_approved" };

  const markerKey = `whatsapp:tpl:${input.name}:${input.jobKey}`;
  if (await store.get(markerKey)) return { sent: false, reason: "already_sent" };

  const apiKey = env.D360_API_KEY?.trim();
  if (!apiKey) return { sent: false, reason: "disabled_or_not_approved" };
  try {
    const res = await fetchImpl(`${D360_API_BASE}/messages`, {
      method: "POST",
      headers: { "D360-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        ...buildTemplatePayload(input.name, input.bodyParams, input.urlButtonParam),
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; code?: number };
    } | null;
    if (!res.ok) {
      const error = data?.error?.message
        ? `${data.error.message}${data.error.code ? ` (code ${data.error.code})` : ""}`
        : `HTTP ${res.status}`;
      console.log(JSON.stringify({ event: "whatsapp_template_failed", template: input.name, phoneSuffix: to.slice(-4), error }));
      return { sent: false, reason: "send_failed", error };
    }
    await store.put(markerKey, new Date().toISOString(), { expirationTtl: SENT_MARKER_TTL_SECONDS });
    console.log(JSON.stringify({ event: "whatsapp_template_sent", template: input.name, phoneSuffix: to.slice(-4) }));
    return { sent: true, messageId: data?.messages?.[0]?.id };
  } catch (err) {
    return { sent: false, reason: "send_failed", error: err instanceof Error ? err.message : "send failed" };
  }
}

/** Never throws — template messages must not affect booking or email flows. */
async function safely(run: () => Promise<TemplateSendResult>): Promise<TemplateSendResult> {
  try {
    return await run();
  } catch (err) {
    return { sent: false, reason: "send_failed", error: err instanceof Error ? err.message : String(err) };
  }
}

export function sendBookingConfirmedWhatsApp(
  env: WhatsAppTemplateEnv,
  input: {
    paymentReference: string;
    customerReference?: string | null;
    customerName?: string | null;
    mobile?: string | null;
    tripDate?: string | null;
    tripTime?: string | null;
    pickupLabel?: string | null;
    dropoffLabel?: string | null;
    manageToken?: string | null;
  },
  fetchImpl?: typeof fetch,
): Promise<TemplateSendResult> {
  return safely(() =>
    sendTemplate(
      env,
      {
        name: "mat_booking_confirmed",
        jobKey: input.paymentReference,
        mobile: input.mobile,
        bodyParams: [
          firstNameOf(input.customerName),
          input.customerReference || input.paymentReference,
          tripWhen(input.tripDate, input.tripTime),
          input.pickupLabel ?? "",
          input.dropoffLabel ?? "",
        ],
        // The button needs a value; without a token the page asks for the booking details instead.
        urlButtonParam: input.manageToken?.trim() || "lookup",
      },
      fetchImpl,
    ),
  );
}

export function sendDriverOnTheWayWhatsApp(
  env: WhatsAppTemplateEnv,
  input: { jobKey: string; customerName?: string | null; mobile?: string | null; pickupLabel?: string | null; tripTime?: string | null },
  fetchImpl?: typeof fetch,
): Promise<TemplateSendResult> {
  return safely(() =>
    sendTemplate(
      env,
      {
        name: "mat_driver_on_the_way",
        jobKey: input.jobKey,
        mobile: input.mobile,
        bodyParams: [firstNameOf(input.customerName), input.pickupLabel ?? "", input.tripTime ?? ""],
      },
      fetchImpl,
    ),
  );
}

export function sendDriverDetailsWhatsApp(
  env: WhatsAppTemplateEnv,
  input: {
    jobKey: string;
    customerName?: string | null;
    mobile?: string | null;
    tripDate?: string | null;
    tripTime?: string | null;
    driverName?: string | null;
    driverMobile?: string | null;
    carColour?: string | null;
    carMake?: string | null;
    carModel?: string | null;
    registration?: string | null;
  },
  fetchImpl?: typeof fetch,
): Promise<TemplateSendResult> {
  const car = [input.carColour, input.carMake, input.carModel].map((v) => String(v ?? "").trim()).filter(Boolean).join(" ");
  const reg = formatPartialRegistration(input.registration);
  const vehicle = [car, reg ? `reg ${reg}` : ""].filter(Boolean).join(", ");
  return safely(() =>
    sendTemplate(
      env,
      {
        name: "mat_driver_details",
        jobKey: input.jobKey,
        mobile: input.mobile,
        bodyParams: [
          firstNameOf(input.customerName),
          tripWhen(input.tripDate, input.tripTime),
          firstNameOf(input.driverName) === "there" ? "Your driver" : firstNameOf(input.driverName),
          input.driverMobile ?? "",
          vehicle,
        ],
      },
      fetchImpl,
    ),
  );
}

export function sendReviewRequestWhatsApp(
  env: WhatsAppTemplateEnv,
  input: { jobKey: string; customerName?: string | null; mobile?: string | null; tripDate?: string | null },
  fetchImpl?: typeof fetch,
): Promise<TemplateSendResult> {
  return safely(() =>
    sendTemplate(
      env,
      {
        name: "mat_review_request",
        jobKey: input.jobKey,
        mobile: input.mobile,
        bodyParams: [firstNameOf(input.customerName), shortTripDate(input.tripDate) || "your recent trip"],
      },
      fetchImpl,
    ),
  );
}

/** Journey completed without an in-person tip: optional tip link (tip page token). */
export function sendTipRequestWhatsApp(
  env: WhatsAppTemplateEnv,
  input: { jobKey: string; customerName?: string | null; mobile?: string | null; tipToken: string },
  fetchImpl?: typeof fetch,
): Promise<TemplateSendResult> {
  return safely(() =>
    sendTemplate(
      env,
      {
        name: "mat_tip_request",
        jobKey: input.jobKey,
        mobile: input.mobile,
        bodyParams: [firstNameOf(input.customerName)],
        urlButtonParam: input.tipToken,
      },
      fetchImpl,
    ),
  );
}

/** Journey reminder (~4h before) for a pickup that isn't at an airport. */
export function sendJourneyReminderWhatsApp(
  env: WhatsAppTemplateEnv,
  input: {
    jobKey: string;
    customerName?: string | null;
    mobile?: string | null;
    tripDate?: string | null;
    tripTime?: string | null;
    pickupLabel?: string | null;
    dropoffLabel?: string | null;
  },
  fetchImpl?: typeof fetch,
): Promise<TemplateSendResult> {
  return safely(() =>
    sendTemplate(
      env,
      {
        name: "mat_journey_reminder",
        jobKey: input.jobKey,
        mobile: input.mobile,
        bodyParams: [
          firstNameOf(input.customerName),
          tripWhen(input.tripDate, input.tripTime),
          input.pickupLabel?.trim() || "your pickup address",
          input.dropoffLabel?.trim() || "your destination",
        ],
      },
      fetchImpl,
    ),
  );
}

/** Airport collection directions + map button (link from airportPickupLinkPath). */
export function sendAirportPickupWhatsApp(
  env: WhatsAppTemplateEnv,
  input: {
    jobKey: string;
    customerName?: string | null;
    mobile?: string | null;
    tripDate?: string | null;
    tripTime?: string | null;
    airportName?: string | null;
    directions: string;
    linkPath: string;
  },
  fetchImpl?: typeof fetch,
): Promise<TemplateSendResult> {
  return safely(() =>
    sendTemplate(
      env,
      {
        name: "mat_airport_pickup",
        jobKey: input.jobKey,
        mobile: input.mobile,
        bodyParams: [firstNameOf(input.customerName), tripWhen(input.tripDate, input.tripTime), input.airportName ?? "the airport", input.directions],
        urlButtonParam: input.linkPath,
      },
      fetchImpl,
    ),
  );
}

/**
 * Driver tapped Arrived. Airport pickups get the directions and the map of where to go
 * (Express map, else the airport guide); other pickups a short notice.
 */
export function sendDriverArrivedWhatsApp(
  env: WhatsAppTemplateEnv,
  input: {
    jobKey: string;
    customerName?: string | null;
    mobile?: string | null;
    pickupLabel?: string | null;
    airport?: { airportName: string; directions: string; linkPath: string } | null;
  },
  fetchImpl?: typeof fetch,
): Promise<TemplateSendResult> {
  if (input.airport) {
    const airport = input.airport;
    return safely(() =>
      sendTemplate(
        env,
        {
          name: "mat_driver_arrived_airport",
          jobKey: input.jobKey,
          mobile: input.mobile,
          bodyParams: [firstNameOf(input.customerName), airport.airportName, airport.directions],
          urlButtonParam: airport.linkPath,
        },
        fetchImpl,
      ),
    );
  }
  return safely(() =>
    sendTemplate(
      env,
      {
        name: "mat_driver_arrived",
        jobKey: input.jobKey,
        mobile: input.mobile,
        bodyParams: [firstNameOf(input.customerName), input.pickupLabel ?? "your pickup address"],
      },
      fetchImpl,
    ),
  );
}

const AIRPORT_GUIDE_PATHS: Record<string, string> = {
  BFS: "airports/belfast-international/",
  BHD: "airports/belfast-city/",
  DUB: "airports/dublin/",
  LDY: "airports/city-of-derry/",
};

/** Path after the site origin for the map button: the Express map image, else the airport guide. */
export function airportPickupLinkPath(input: {
  airportCode: string | null | undefined;
  access?: string | null;
  mapImageUrl?: string | null;
}): string {
  const code = String(input.airportCode ?? "").toUpperCase();
  const map = String(input.mapImageUrl ?? "").trim();
  if (map.startsWith(`${SITE}/`)) return map.slice(SITE.length + 1);
  return AIRPORT_GUIDE_PATHS[code] ?? "airports/";
}

// ---------------------------------------------------------------------------
// Setup / status endpoint
// ---------------------------------------------------------------------------

export function isWhatsAppTemplatesPath(pathname: string): boolean {
  return pathname === "/whatsapp/templates";
}

function plain(text: string, status: number): Response {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function handleWhatsAppTemplates(
  request: Request,
  env: WhatsAppTemplateEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const apiKey = env.D360_API_KEY?.trim();
  if (!apiKey) return plain("D360_API_KEY is not set, so templates cannot be managed.", 503);
  const url = new URL(request.url);
  const reviewUrl = env.GOOGLE_REVIEW_URL?.trim() || DEFAULT_GOOGLE_REVIEW_URL;
  const definitions = whatsAppTemplateDefinitions(reviewUrl);
  const lines: string[] = [];

  if (url.searchParams.get("submit") === "1") {
    if (env.TRACKING_STORE) {
      if (await env.TRACKING_STORE.get(SUBMIT_COOLDOWN_KEY)) return plain("Please wait two minutes and try again.", 429);
      await env.TRACKING_STORE.put(SUBMIT_COOLDOWN_KEY, "1", { expirationTtl: SUBMIT_COOLDOWN_SECONDS });
    }
    const existing = (await getTemplateStatuses(env, { refresh: true, fetchImpl })) ?? {};
    for (const def of definitions) {
      if (existing[def.name]) {
        lines.push(`${def.name}: already submitted (${existing[def.name]})`);
        continue;
      }
      try {
        const res = await fetchImpl(`${D360_API_BASE}/v1/configs/templates`, {
          method: "POST",
          headers: { "D360-API-KEY": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: def.name,
            category: def.category,
            language: WHATSAPP_TEMPLATE_LANGUAGE,
            components: def.components,
          }),
        });
        const text = await res.text();
        lines.push(res.ok ? `${def.name}: submitted ✅` : `${def.name}: not accepted (HTTP ${res.status}) ${text.slice(0, 400)}`);
      } catch (err) {
        lines.push(`${def.name}: error ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    lines.push("", "Meta usually reviews templates within 24 hours. Open this page again (without ?submit=1) to see the status.");
  }

  const statuses = (await getTemplateStatuses(env, { refresh: true, fetchImpl })) ?? {};
  const enabled = env.WHATSAPP_TEMPLATES_ENABLED?.trim().toLowerCase() !== "false";
  lines.unshift(
    `WhatsApp template messages: ${enabled ? "ON (approved templates send automatically)" : "OFF (WHATSAPP_TEMPLATES_ENABLED=false)"}`,
    "",
    ...definitions.map((def) => `${def.name} (${def.category}): ${statuses[def.name] ?? "not submitted"}`),
    "",
  );
  return plain(lines.join("\n"), 200);
}
