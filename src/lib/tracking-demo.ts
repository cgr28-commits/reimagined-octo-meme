import type { DriverJob, DriverJobsResponse, PublicTrackResponse } from "@/lib/tracking-api";
import { SITE } from "@/lib/data";
import { formatUkInstant } from "../../shared/uk-time";
import { sanitizeJobForDriver } from "../../shared/driver-job-sanitize";

export const DEMO_TRACK_TOKENS = ["demo-early", "demo-waiting", "demo-live"] as const;
export type DemoTrackToken = (typeof DEMO_TRACK_TOKENS)[number];

export const DEMO_DRIVER_KEY = "demo-driver-key";
export const DEMO_OWNER_KEY = "demo-owner-key";
export const DEMO_DRIVER_NAME = "Driver";
export const DEMO_ROSTER = ["Driver"] as const;

export function isDemoDriverKey(key: string): boolean {
  return key.trim() === DEMO_DRIVER_KEY;
}

export function isDemoOwnerKey(key: string): boolean {
  return key.trim() === DEMO_OWNER_KEY;
}

export function getDemoDriverStatus() {
  return {
    ok: true as const,
    authConfigured: true,
    role: "driver" as const,
    driverName: DEMO_DRIVER_NAME,
    worker: "demo",
  };
}

export function getDemoOwnerStatus() {
  return {
    ok: true as const,
    authConfigured: true,
    role: "owner" as const,
    availableDrivers: [...DEMO_ROSTER],
    worker: "demo",
  };
}

export function isDemoTrackToken(token: string): token is DemoTrackToken {
  return (DEMO_TRACK_TOKENS as readonly string[]).includes(token);
}

function londonParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const tripDate = `${get("year")}-${get("month")}-${get("day")}`;
  const tripTime = `${get("hour")}:${get("minute")}`;

  return {
    tripDate,
    tripTime,
    pickupAt: `${tripDate}T${tripTime}`,
    pickupDisplay: formatUkInstant(date, { withZoneLabel: true, includeYear: false }),
  };
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function formatWindowDisplay(iso: string): string {
  return formatUkInstant(iso, { withZoneLabel: true, includeYear: false });
}

function buildDemoResponse(
  token: DemoTrackToken,
  config: {
    customerName: string;
    pickupLabel: string;
    dropoffLabel: string;
    pickupDate: Date;
    sharingActive: boolean;
    customerSharingActive?: boolean;
    driver?: { lat: number; lng: number };
    customer?: { lat: number; lng: number };
    window: { open: boolean; reason: "too_early" | "too_late" | "open"; opensAt: Date; closesAt: Date };
  },
): PublicTrackResponse {
  const schedule = londonParts(config.pickupDate);
  const trackUrl = `${SITE.url}/track/?id=${encodeURIComponent(token)}`;
  const updatedAt = new Date().toISOString();

  return {
    ok: true,
    customerName: config.customerName,
    pickupLabel: config.pickupLabel,
    dropoffLabel: config.dropoffLabel,
    tripDate: schedule.tripDate,
    tripTime: schedule.tripTime,
    pickupAt: schedule.pickupAt,
    pickupDisplay: schedule.pickupDisplay,
    trackingWindow: {
      open: config.window.open,
      opensAt: config.window.opensAt.toISOString(),
      closesAt: config.window.closesAt.toISOString(),
      pickupAt: schedule.pickupAt,
      reason: config.window.reason,
      opensAtDisplay: formatWindowDisplay(config.window.opensAt.toISOString()),
      closesAtDisplay: formatWindowDisplay(config.window.closesAt.toISOString()),
    },
    sharingActive: config.sharingActive,
    customerSharingActive: Boolean(config.customerSharingActive),
    driver: config.driver
      ? {
          lat: config.driver.lat,
          lng: config.driver.lng,
          updatedAt,
        }
      : null,
    vehicle:
      config.sharingActive && config.window.open
        ? {
            make: "Mercedes-Benz",
            model: "E-Class",
            colour: "Black",
            registration: "ABC 1234",
            driverName: DEMO_DRIVER_NAME,
          }
        : undefined,
    customer: config.customer
      ? {
          lat: config.customer.lat,
          lng: config.customer.lng,
          updatedAt,
        }
      : null,
    trackUrl,
  };
}

export function getDemoTrackResponse(token: DemoTrackToken): PublicTrackResponse {
  const now = new Date();

  if (token === "demo-early") {
    const pickup = addMinutes(now, 24 * 60);
    const opensAt = addMinutes(pickup, -120);
    const closesAt = addMinutes(pickup, 90);

    return buildDemoResponse(token, {
      customerName: "Alex Demo",
      pickupLabel: "249 Rashee Road, Ballyclare",
      dropoffLabel: "Belfast International Airport (BFS)",
      pickupDate: pickup,
      sharingActive: false,
      window: { open: false, reason: "too_early", opensAt, closesAt },
    });
  }

  if (token === "demo-waiting") {
    const pickup = addMinutes(now, 45);
    const opensAt = addMinutes(pickup, -120);
    const closesAt = addMinutes(pickup, 90);

    return buildDemoResponse(token, {
      customerName: "Jamie Demo",
      pickupLabel: "Belfast International Airport (BFS)",
      dropoffLabel: "Holiday Inn Express, Belfast",
      pickupDate: pickup,
      sharingActive: false,
      window: { open: true, reason: "open", opensAt, closesAt },
    });
  }

  const pickup = addMinutes(now, 30);
  const opensAt = addMinutes(pickup, -120);
  const closesAt = addMinutes(pickup, 90);

  return buildDemoResponse(token, {
    customerName: "Sam Demo",
    pickupLabel: "Titanic Belfast",
    dropoffLabel: "Belfast International Airport (BFS)",
    pickupDate: pickup,
    sharingActive: true,
    customerSharingActive: true,
    driver: { lat: 54.5973, lng: -5.9301 },
    customer: { lat: 54.6035, lng: -5.9264 },
    window: { open: true, reason: "open", opensAt, closesAt },
  });
}

/** Strip owner-only fields so demo matches live driver API whitelist sanitisation. */
export function sanitizeDemoJobForDriver(job: DriverJob): DriverJob {
  return sanitizeJobForDriver(job as unknown as Record<string, unknown>) as DriverJob;
}

const DEMO_OWNER_FIELDS: Record<
  string,
  Pick<
    DriverJob,
    | "customerMobile"
    | "paymentReference"
    | "amountPaidLabel"
    | "driverLocationPointCount"
    | "driverLocationRecordedFrom"
    | "driverLocationRecordedTo"
  >
> = {
  "demo-live": {
    customerMobile: "+447700900123",
    paymentReference: "DEMO-MATNI-1001",
    amountPaidLabel: "£85.00",
    driverLocationPointCount: 142,
    driverLocationRecordedFrom: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    driverLocationRecordedTo: new Date().toISOString(),
  },
  "demo-waiting": {
    customerMobile: "+447700900456",
    paymentReference: "DEMO-MATNI-1002",
    amountPaidLabel: "£85.00",
  },
  "demo-future": {
    customerMobile: "+447700900789",
    paymentReference: "DEMO-MATNI-1003",
    amountPaidLabel: "£92.00",
  },
  "demo-pending": {
    customerMobile: "+447700900321",
    paymentReference: "DEMO-MATNI-1004",
    amountPaidLabel: "£78.00",
  },
  "demo-unassigned": {
    customerMobile: "+447700900111",
    paymentReference: "DEMO-MATNI-1005",
    amountPaidLabel: "£65.00",
  },
};

export function enrichDemoJobForOwner(job: DriverJob): DriverJob {
  return {
    ...job,
    ...(DEMO_OWNER_FIELDS[job.token] ?? {}),
  };
}

function demoOwnerJobsResponse(
  jobs: DriverJob[],
  scope: DriverJobsResponse["scope"],
  date: string,
): DriverJobsResponse {
  return {
    ok: true,
    scope,
    date,
    role: "owner",
    jobs: jobs.map(enrichDemoJobForOwner),
  };
}

function demoDriverJobsResponse(
  jobs: DriverJob[],
  scope: DriverJobsResponse["scope"],
  date: string,
): DriverJobsResponse {
  return {
    ok: true,
    scope,
    date,
    role: "driver",
    driverName: DEMO_DRIVER_NAME,
    jobs: jobs.map(sanitizeDemoJobForDriver),
  };
}

function acceptedAssignmentFields() {
  return {
    assignedDriverName: DEMO_DRIVER_NAME,
    assignmentStatus: "accepted" as const,
    assignedAt: new Date().toISOString(),
    acceptedAt: new Date().toISOString(),
    assignedDriverMobile: "+447700900999",
    assignedDriverCarMake: "Mercedes",
    assignedDriverCarModel: "E-Class",
    assignedDriverCarColour: "Silver",
    assignedDriverReg: "AB12 CDE",
    driverPayAmount: "£80",
  };
}

function buildDemoDriverJob(
  token: DemoTrackToken,
  extras: Partial<DriverJob> & {
    token: string;
  },
): DriverJob {
  const base = getDemoTrackResponse(token);
  const ownerExtras = DEMO_OWNER_FIELDS[extras.token] ?? DEMO_OWNER_FIELDS[token] ?? {};
  return {
    ...base,
    ...acceptedAssignmentFields(),
    bookingStatus: "confirmed",
    customerMobile: ownerExtras.customerMobile,
    bookingReference: ownerExtras.paymentReference,
    ...extras,
  };
}

export function getDemoDriverJobs(date?: string): DriverJobsResponse {
  const waiting = getDemoTrackResponse("demo-waiting");
  const responseDate = date ?? waiting.tripDate;

  const jobs = [
    buildDemoDriverJob("demo-live", {
      token: "demo-live",
      activeDriverName: DEMO_DRIVER_NAME,
      isAirportPickup: false,
      flightNumber: null,
      airportCode: null,
      flight: null,
    }),
    buildDemoDriverJob("demo-waiting", {
      token: "demo-waiting",
      isAirportPickup: true,
      flightNumber: "EZY123",
      airportCode: "BFS",
      flight: {
        flightNumber: "EZY123",
        airline: "easyJet",
        date: waiting.tripDate,
        scheduledTime: "14:30",
        scheduledTimeLabel: "14:30",
        airportCode: "BFS",
        airportName: "Belfast International",
        departureAirport: "London Gatwick",
        arrivalAirport: "Belfast International",
        status: "Estimated arrival",
      },
    }),
  ].filter((job) => !date || job.tripDate === date);

  return demoDriverJobsResponse(jobs, "date", responseDate);
}

export function getDemoDriverUpcomingJobs(): DriverJobsResponse {
  const todayJobs = getDemoDriverJobs().jobs;
  const futurePickup = addMinutes(new Date(), 3 * 24 * 60);
  const schedule = londonParts(futurePickup);
  const opensAt = addMinutes(futurePickup, -120);
  const closesAt = addMinutes(futurePickup, 90);

  const futureJob = buildDemoDriverJob("demo-waiting", {
    token: "demo-future",
    customerName: "Taylor Demo",
    pickupLabel: "Holiday Inn Express, Belfast",
    dropoffLabel: "Belfast International Airport (BFS)",
    tripDate: schedule.tripDate,
    tripTime: schedule.tripTime,
    pickupAt: schedule.pickupAt,
    pickupDisplay: schedule.pickupDisplay,
    isAirportPickup: false,
    flightNumber: null,
    airportCode: null,
    flight: null,
    trackingWindow: {
      open: false,
      opensAt: opensAt.toISOString(),
      closesAt: closesAt.toISOString(),
      pickupAt: schedule.pickupAt,
      reason: "too_early",
      opensAtDisplay: formatWindowDisplay(opensAt.toISOString()),
      closesAtDisplay: formatWindowDisplay(closesAt.toISOString()),
    },
    sharingActive: false,
    customerSharingActive: false,
    driver: null,
    customer: null,
    trackUrl: `${SITE.url}/track/?id=demo-future`,
  });

  return demoDriverJobsResponse(
    [...todayJobs, futureJob].sort((a, b) => a.pickupAt.localeCompare(b.pickupAt)),
    "upcoming",
    "upcoming",
  );
}

export function getDemoDriverPendingJobs(): DriverJobsResponse {
  return demoDriverJobsResponse([buildDemoPendingJobRaw()], "pending", "pending");
}

function buildDemoUnassignedJob(): DriverJob {
  const pickup = addMinutes(new Date(), 90);
  const schedule = londonParts(pickup);
  const opensAt = addMinutes(pickup, -120);
  const closesAt = addMinutes(pickup, 90);
  const early = getDemoTrackResponse("demo-early");

  return {
    ...early,
    token: "demo-unassigned",
    customerName: "Alex Demo",
    pickupLabel: "249 Rashee Road, Ballyclare",
    dropoffLabel: "Belfast International Airport (BFS)",
    tripDate: schedule.tripDate,
    tripTime: schedule.tripTime,
    pickupAt: schedule.pickupAt,
    pickupDisplay: schedule.pickupDisplay,
    assignmentStatus: "unassigned",
    bookingStatus: "confirmed",
    isAirportPickup: false,
    flightNumber: null,
    airportCode: null,
    flight: null,
    trackingWindow: {
      open: false,
      opensAt: opensAt.toISOString(),
      closesAt: closesAt.toISOString(),
      pickupAt: schedule.pickupAt,
      reason: "too_early",
      opensAtDisplay: formatWindowDisplay(opensAt.toISOString()),
      closesAtDisplay: formatWindowDisplay(closesAt.toISOString()),
    },
    sharingActive: false,
    customerSharingActive: false,
    driver: null,
    customer: null,
    trackUrl: `${SITE.url}/track/?id=demo-unassigned`,
  };
}

function buildDemoPendingJobRaw(): DriverJob {
  const futurePickup = addMinutes(new Date(), 5 * 24 * 60);
  const schedule = londonParts(futurePickup);
  const opensAt = addMinutes(futurePickup, -120);
  const closesAt = addMinutes(futurePickup, 90);

  return {
    ...getDemoTrackResponse("demo-waiting"),
    token: "demo-pending",
    customerName: "Jordan Demo",
    pickupLabel: "George Best Belfast City Airport (BHD)",
    dropoffLabel: "Grand Central Hotel, Belfast",
    tripDate: schedule.tripDate,
    tripTime: schedule.tripTime,
    pickupAt: schedule.pickupAt,
    pickupDisplay: schedule.pickupDisplay,
    assignedDriverName: DEMO_DRIVER_NAME,
    assignmentStatus: "pending",
    assignedAt: new Date().toISOString(),
    bookingStatus: "confirmed",
    customerMobile: DEMO_OWNER_FIELDS["demo-pending"]?.customerMobile,
    bookingReference: DEMO_OWNER_FIELDS["demo-pending"]?.paymentReference,
    assignedDriverMobile: "+447700900999",
    assignedDriverCarMake: "Mercedes",
    assignedDriverCarModel: "E-Class",
    assignedDriverCarColour: "Silver",
    assignedDriverReg: "AB12 CDE",
    driverPayAmount: "£80",
    isAirportPickup: true,
    flightNumber: "BA1234",
    airportCode: "BHD",
    flight: {
      flightNumber: "BA1234",
      airline: "British Airways",
      date: schedule.tripDate,
      scheduledTime: "11:20",
      scheduledTimeLabel: "11:20",
      airportCode: "BHD",
      airportName: "George Best Belfast City",
      departureAirport: "London Heathrow",
      arrivalAirport: "George Best Belfast City",
      status: "On time",
    },
    trackingWindow: {
      open: false,
      opensAt: opensAt.toISOString(),
      closesAt: closesAt.toISOString(),
      pickupAt: schedule.pickupAt,
      reason: "too_early",
      opensAtDisplay: formatWindowDisplay(opensAt.toISOString()),
      closesAtDisplay: formatWindowDisplay(closesAt.toISOString()),
    },
    sharingActive: false,
    customerSharingActive: false,
    driver: null,
    customer: null,
    trackUrl: `${SITE.url}/track/?id=demo-pending`,
  };
}

export function getDemoOwnerJobs(date?: string): DriverJobsResponse {
  const driverResponse = getDemoDriverJobs(date);
  const jobs = [...driverResponse.jobs, buildDemoUnassignedJob()].filter(
    (job) => !date || job.tripDate === date,
  );

  return demoOwnerJobsResponse(jobs, "date", driverResponse.date);
}

export function getDemoOwnerUpcomingJobs(): DriverJobsResponse {
  const driverResponse = getDemoDriverUpcomingJobs();
  return demoOwnerJobsResponse(driverResponse.jobs, "upcoming", "upcoming");
}

export function getDemoOwnerPendingJobs(): DriverJobsResponse {
  return demoOwnerJobsResponse([buildDemoPendingJobRaw()], "pending", "pending");
}

export function getDemoOwnerLocationHistory(token: string) {
  if (token !== "demo-live") {
    return { ok: true as const, token, count: 0, points: [] };
  }

  const coords = [
    { lat: 54.5973, lng: -5.9301 },
    { lat: 54.5981, lng: -5.9254 },
    { lat: 54.5992, lng: -5.9188 },
    { lat: 54.6015, lng: -5.9122 },
    { lat: 54.6035, lng: -5.9264 },
  ];

  const points = coords.map((point, index) => ({
    ...point,
    recordedAt: new Date(Date.now() - (coords.length - index) * 5 * 60 * 1000).toISOString(),
    driverName: DEMO_DRIVER_NAME,
  }));

  return {
    ok: true as const,
    token,
    count: points.length,
    recordedFrom: points[0]?.recordedAt,
    recordedTo: points[points.length - 1]?.recordedAt,
    points,
  };
}

export function getDemoOwnerVehicleProfiles() {
  return [
    { profileKey: "owner", displayName: "Owner", complete: true },
    ...DEMO_ROSTER.map((name) => ({
      profileKey: name.toLowerCase(),
      displayName: name,
      complete: true,
    })),
  ];
}

export function getDemoOwnerVehicle(profile?: string) {
  const key = (profile ?? "owner").trim().toLowerCase();
  const displayName =
    key === "owner"
      ? "Owner"
      : DEMO_ROSTER.find((name) => name.toLowerCase() === key) ?? profile ?? DEMO_DRIVER_NAME;

  return {
    profileKey: key === "owner" ? "owner" : displayName.toLowerCase(),
    displayName,
    email: `${String(displayName).toLowerCase().replace(/\s+/g, ".")}@example.com`,
    mobile: "07700900123",
    make: "Mercedes-Benz",
    model: "E-Class",
    colour: "Black",
    registration: "ABC 1234",
    updatedAt: new Date().toISOString(),
  };
}

export function getDemoDriverVehicleProfiles() {
  return [{ profileKey: DEMO_DRIVER_NAME.toLowerCase(), displayName: DEMO_DRIVER_NAME, complete: true }];
}

export function getDemoDriverVehicle() {
  return getDemoOwnerVehicle(DEMO_DRIVER_NAME);
}

export const DEMO_SCENARIOS = [
  {
    token: "demo-early" as const,
    title: "Too early",
    description: "Link saved in invoice — tracking opens on travel day.",
  },
  {
    token: "demo-waiting" as const,
    title: "Waiting for driver",
    description: "Airport pickup with live flight status — tracking window open.",
  },
  {
    token: "demo-live" as const,
    title: "Live map",
    description: "Driver is sharing location — customer sees the map.",
  },
] as const;
