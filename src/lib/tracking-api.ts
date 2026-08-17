import {
  DEMO_DRIVER_KEY,
  DEMO_DRIVER_NAME,
  DEMO_OWNER_KEY,
  enrichDemoJobForOwner,
  getDemoDriverJobs,
  getDemoDriverPendingJobs,
  getDemoDriverStatus,
  getDemoDriverUpcomingJobs,
  getDemoDriverVehicle,
  getDemoDriverVehicleProfiles,
  getDemoOwnerJobs,
  getDemoOwnerLocationHistory,
  getDemoOwnerPendingJobs,
  getDemoOwnerStatus,
  getDemoOwnerUpcomingJobs,
  getDemoOwnerVehicle,
  getDemoOwnerVehicleProfiles,
  getDemoTrackResponse,
  isDemoDriverKey,
  isDemoOwnerKey,
  isDemoTrackToken,
  sanitizeDemoJobForDriver,
} from "@/lib/tracking-demo";

const DEFAULT_WORKER_BASE = "https://reimagined-octo-meme.cgr28.workers.dev";

function resolveWorkerBaseUrl(): string {
  const bookingsUrl = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (!bookingsUrl) {
    return DEFAULT_WORKER_BASE;
  }

  try {
    const parsed = new URL(bookingsUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
      return DEFAULT_WORKER_BASE;
    }

    return bookingsUrl.replace(/\/bookings\/?$/i, "");
  } catch {
    return DEFAULT_WORKER_BASE;
  }
}

const WORKER_BASE = resolveWorkerBaseUrl();

function driverQueryKey(url: URL, driverKey: string): void {
  url.searchParams.set("key", driverKey.trim());
}

function driverPostHeaders(driverKey: string): HeadersInit {
  const trimmed = driverKey.trim();
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Driver-Key": trimmed,
  };
}

export type DriverStatusResponse = {
  ok: boolean;
  authConfigured: boolean;
  hasDriverKey?: boolean;
  hasOwnerKey?: boolean;
  role?: "owner" | "driver";
  driverName?: string;
  availableDrivers?: string[];
  worker: string;
  error?: string;
};

export async function fetchDriverStatus(driverKey: string): Promise<DriverStatusResponse> {
  if (isDemoDriverKey(driverKey)) {
    return getDemoDriverStatus();
  }

  if (isDemoOwnerKey(driverKey)) {
    return getDemoOwnerStatus();
  }

  const url = new URL(`${WORKER_BASE}/driver/status`);
  driverQueryKey(url, driverKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as DriverStatusResponse | null;
  if (!payload) {
    throw new Error(`Driver access check failed (${response.status})`);
  }

  return payload;
}

export async function verifyDriverAccessKey(
  driverKey: string,
): Promise<{ ok: boolean; message?: string }> {
  if (isDemoDriverKey(driverKey) || isDemoOwnerKey(driverKey)) {
    return { ok: true };
  }

  const status = await fetchDriverStatus(driverKey);
  if (status.ok) {
    return { ok: true };
  }

  return {
    ok: false,
    message: status.error ?? "Driver key was not accepted.",
  };
}

export type TrackingWindow = {
  open: boolean;
  opensAt: string;
  closesAt: string;
  pickupAt: string;
  reason?: "too_early" | "too_late" | "open";
  opensAtDisplay?: string;
  closesAtDisplay?: string;
};

export type TrackLocation = {
  lat: number;
  lng: number;
  updatedAt: string;
};

export type CustomerVehicleDetails = {
  make: string;
  model: string;
  colour: string;
  registration: string;
  driverName?: string;
};

export type DriverVehicleProfile = {
  profileKey: string;
  displayName: string;
  email: string;
  mobile?: string;
  make: string;
  model: string;
  colour: string;
  registration: string;
  updatedAt: string;
};

export type PublicTrackResponse = {
  ok: true;
  customerName: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  pickupAt: string;
  pickupDisplay: string;
  trackingWindow: TrackingWindow;
  sharingActive: boolean;
  customerSharingActive: boolean;
  journeyStatus?: JourneyStatus;
  journeyStatusLabel?: string;
  bookingReference?: string;
  driver: TrackLocation | null;
  customer?: TrackLocation | null;
  vehicle?: CustomerVehicleDetails;
  trackUrl: string;
};

export type JourneyStatus =
  | "idle"
  | "tracking"
  | "arrived_pickup"
  | "en_route"
  | "arrived_destination"
  | "completed"
  | "stopped";

export type JourneyAction =
  | "start_tracking"
  | "arrived_pickup"
  | "start_journey"
  | "arrived_destination"
  | "complete_journey"
  | "stop_tracking";

export const JOURNEY_ACTION_LABELS: Record<JourneyAction, string> = {
  start_tracking: "Start tracking",
  arrived_pickup: "Arrived at pickup",
  start_journey: "Start journey",
  arrived_destination: "Arrived at destination",
  complete_journey: "Complete journey",
  stop_tracking: "Stop tracking",
};

export type DriverFlight = {
  flightNumber: string;
  airline: string;
  date: string;
  scheduledTime: string;
  scheduledTimeLabel: string;
  airportCode: string;
  airportName: string;
  departureAirport: string;
  arrivalAirport: string;
  status?: string;
};

export type JobAssignmentStatus = "unassigned" | "pending" | "accepted" | "declined";

export type DriverLocationPoint = {
  lat: number;
  lng: number;
  recordedAt: string;
  driverName?: string;
  accuracyMeters?: number;
  speedMps?: number;
  headingDegrees?: number;
};

export type DriverJob = PublicTrackResponse & {
  token: string;
  customerMobile?: string;
  customerEmail?: string;
  paymentReference?: string;
  amountPaidLabel?: string;
  bookingStatus?: "confirmed" | "refunded";
  refundAmountLabel?: string;
  activeDriverName?: string;
  assignedDriverName?: string;
  assignedDriverMobile?: string;
  assignedDriverCarMake?: string;
  assignedDriverCarModel?: string;
  assignedDriverCarColour?: string;
  assignedDriverReg?: string;
  driverPayAmount?: string;
  assignmentStatus?: JobAssignmentStatus;
  assignedAt?: string;
  acceptedAt?: string;
  declinedAt?: string;
  driverLocationPointCount?: number;
  driverLocationRecordedFrom?: string;
  driverLocationRecordedTo?: string;
  journeyStatus?: JourneyStatus;
  journeyStatusLabel?: string;
  allowedJourneyActions?: JourneyAction[];
  trackingStartedAt?: string;
  arrivedPickupAt?: string;
  journeyStartedAt?: string;
  arrivedDestinationAt?: string;
  journeyCompletedAt?: string;
  isAirportPickup?: boolean;
  flightNumber?: string | null;
  airportCode?: string | null;
  journeyLeg?: "outbound" | "return" | null;
  flight?: DriverFlight | null;
};

export type DriverJobsResponse = {
  ok: true;
  scope?: string;
  date: string;
  role?: "owner" | "driver";
  driverName?: string;
  jobs: DriverJob[];
};

export type DriverBookingUpdateInput = {
  token: string;
  tripDate?: string;
  tripTime?: string;
  pickupLabel?: string;
  dropoffLabel?: string;
  customerMobile?: string;
  flightNumber?: string;
};

export type DriverBookingUpdateResponse = {
  ok: true;
  job: DriverJob;
  warnings?: string[];
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: unknown }).error)
        : "Request failed";
    throw new Error(message);
  }

  return payload as T;
}

export async function fetchPublicTrack(token: string): Promise<PublicTrackResponse> {
  if (isDemoTrackToken(token)) {
    return getDemoTrackResponse(token);
  }

  const response = await fetch(`${WORKER_BASE}/track/${encodeURIComponent(token)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  return parseJsonResponse<PublicTrackResponse>(response);
}

export async function fetchDriverJobs(
  driverKey: string,
  options?: {
    date?: string;
    scope?: "date" | "upcoming" | "pending";
    days?: number;
  },
): Promise<DriverJobsResponse> {
  if (isDemoDriverKey(driverKey)) {
    if (options?.scope === "upcoming") {
      return getDemoDriverUpcomingJobs();
    }
    if (options?.scope === "pending") {
      return getDemoDriverPendingJobs();
    }
    return getDemoDriverJobs(options?.date);
  }

  if (isDemoOwnerKey(driverKey)) {
    if (options?.scope === "upcoming") {
      return getDemoOwnerUpcomingJobs();
    }
    if (options?.scope === "pending") {
      return getDemoOwnerPendingJobs();
    }
    return getDemoOwnerJobs(options?.date);
  }

  const url = new URL(`${WORKER_BASE}/driver/jobs`);
  driverQueryKey(url, driverKey);
  if (options?.scope === "upcoming" || options?.scope === "pending") {
    url.searchParams.set("scope", options.scope);
    if (options.days) {
      url.searchParams.set("days", String(options.days));
    }
  } else if (options?.date) {
    url.searchParams.set("date", options.date);
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  return parseJsonResponse<DriverJobsResponse>(response);
}

export async function updateDriverBooking(
  driverKey: string,
  input: DriverBookingUpdateInput,
): Promise<DriverBookingUpdateResponse> {
  if (isDemoDriverKey(driverKey)) {
    const jobs = getDemoDriverUpcomingJobs().jobs;
    const job = jobs.find((entry) => entry.token === input.token);
    if (!job) {
      throw new Error("Job not found");
    }

    return {
      ok: true,
      job: sanitizeDemoJobForDriver({
        ...job,
        tripDate: input.tripDate ?? job.tripDate,
        tripTime: input.tripTime ?? job.tripTime,
        pickupLabel: input.pickupLabel ?? job.pickupLabel,
        dropoffLabel: input.dropoffLabel ?? job.dropoffLabel,
        flightNumber: input.flightNumber ?? job.flightNumber,
      }),
    };
  }

  if (isDemoOwnerKey(driverKey)) {
    const jobs = getDemoOwnerUpcomingJobs().jobs;
    const job = jobs.find((entry) => entry.token === input.token);
    if (!job) {
      throw new Error("Job not found");
    }

    return {
      ok: true,
      job: enrichDemoJobForOwner({
        ...job,
        tripDate: input.tripDate ?? job.tripDate,
        tripTime: input.tripTime ?? job.tripTime,
        pickupLabel: input.pickupLabel ?? job.pickupLabel,
        dropoffLabel: input.dropoffLabel ?? job.dropoffLabel,
        customerMobile: input.customerMobile ?? job.customerMobile,
        flightNumber: input.flightNumber ?? job.flightNumber,
      }),
    };
  }

  const response = await fetch(
    `${WORKER_BASE}/driver/bookings/update?key=${encodeURIComponent(driverKey.trim())}`,
    {
      method: "POST",
      headers: driverPostHeaders(driverKey),
      body: JSON.stringify(input),
    },
  );

  return parseJsonResponse<DriverBookingUpdateResponse>(response);
}

export async function setDriverSharing(
  driverKey: string,
  token: string,
  active: boolean,
): Promise<{ ok: true; trackUrl: string }> {
  if (isDemoDriverKey(driverKey) && isDemoTrackToken(token)) {
    const trackUrl = getDemoTrackResponse(token).trackUrl;
    return { ok: true, trackUrl };
  }

  const response = await fetch(`${WORKER_BASE}/driver/sharing?key=${encodeURIComponent(driverKey)}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Driver-Key": driverKey,
    },
    body: JSON.stringify({ token, active }),
  });

  return parseJsonResponse<{ ok: true; trackUrl: string }>(response);
}

export type JourneyTransitionResponse = {
  ok: true;
  token: string;
  journeyStatus: JourneyStatus;
  journeyStatusLabel: string;
  allowedActions: JourneyAction[];
  sharingActive: boolean;
  trackUrl: string;
  trackingStartedAt?: string;
  arrivedPickupAt?: string;
  journeyStartedAt?: string;
  arrivedDestinationAt?: string;
  journeyCompletedAt?: string;
  trackingStoppedAt?: string;
  trackingSession?: { sessionToken: string; expiresAt: string };
};

export async function postJourneyAction(
  accessKey: string,
  token: string,
  action: JourneyAction,
): Promise<JourneyTransitionResponse> {
  if (isDemoDriverKey(accessKey) || isDemoOwnerKey(accessKey)) {
    const trackUrl = isDemoTrackToken(token)
      ? getDemoTrackResponse(token).trackUrl
      : `https://www.myairporttaxini.co.uk/track/?id=${encodeURIComponent(token)}`;
    return {
      ok: true,
      token,
      journeyStatus: action === "complete_journey" ? "completed" : action === "stop_tracking" ? "stopped" : "tracking",
      journeyStatusLabel: "Demo journey",
      allowedActions: [],
      sharingActive: action !== "complete_journey" && action !== "stop_tracking",
      trackUrl,
      trackingSession:
        action === "complete_journey" || action === "stop_tracking"
          ? undefined
          : { sessionToken: "demo-session", expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    };
  }

  const response = await fetch(
    `${WORKER_BASE}/driver/journey?key=${encodeURIComponent(accessKey.trim())}`,
    {
      method: "POST",
      headers: driverPostHeaders(accessKey),
      body: JSON.stringify({ token, action }),
    },
  );

  return parseJsonResponse<JourneyTransitionResponse>(response);
}

export async function fetchJourneySession(
  accessKey: string,
  token: string,
): Promise<{ ok: true; sessionToken: string; expiresAt: string }> {
  if (isDemoDriverKey(accessKey) || isDemoOwnerKey(accessKey)) {
    return {
      ok: true,
      sessionToken: "demo-session",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
  }

  const response = await fetch(
    `${WORKER_BASE}/driver/journey/session?key=${encodeURIComponent(accessKey.trim())}`,
    {
      method: "POST",
      headers: driverPostHeaders(accessKey),
      body: JSON.stringify({ token }),
    },
  );

  return parseJsonResponse<{ ok: true; sessionToken: string; expiresAt: string }>(response);
}

export type JourneyEvidencePack = {
  businessName: string;
  disclaimer: string;
  bookingReference: string;
  paymentReference?: string;
  amountPaid?: string;
  paymentStatus?: string;
  customerName: string;
  customerMobile?: string;
  customerEmail?: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  pickupDisplay: string;
  flightNumber?: string;
  journeyStatus: JourneyStatus;
  journeyStatusLabel: string;
  trackingStartedAt?: string;
  arrivedPickupAt?: string;
  journeyStartedAt?: string;
  arrivedDestinationAt?: string;
  journeyCompletedAt?: string;
  trackingStoppedAt?: string;
  durationMinutes?: number;
  pointCount: number;
  recordedFrom?: string;
  recordedTo?: string;
  trackUrl: string;
  points: DriverLocationPoint[];
};

export async function fetchJourneyEvidence(
  ownerKey: string,
  token: string,
): Promise<{ ok: true; evidence: JourneyEvidencePack }> {
  if (isDemoOwnerKey(ownerKey)) {
    const history = getDemoOwnerLocationHistory(token);
    return {
      ok: true,
      evidence: {
        businessName: "My Airport Taxi NI",
        disclaimer:
          "Automatically generated journey record from the booking system. Intended as supporting operational evidence; it does not guarantee the outcome of any payment dispute.",
        bookingReference: "DEMO-REF",
        paymentReference: "DEMO-REF",
        amountPaid: "£1.00",
        paymentStatus: "confirmed",
        customerName: "Demo Customer",
        pickupLabel: "Demo pickup",
        dropoffLabel: "Demo drop-off",
        tripDate: new Date().toISOString().slice(0, 10),
        tripTime: "10:00",
        pickupDisplay: "Demo pickup time",
        journeyStatus: "completed",
        journeyStatusLabel: "Journey completed",
        pointCount: history.count,
        points: history.points,
        trackUrl: `https://www.myairporttaxini.co.uk/track/?id=${token}`,
      },
    };
  }

  const url = new URL(`${WORKER_BASE}/driver/journey/evidence`);
  driverQueryKey(url, ownerKey);
  url.searchParams.set("token", token);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  return parseJsonResponse<{ ok: true; evidence: JourneyEvidencePack }>(response);
}

export async function ensurePaidBookingTracking(
  ownerKey: string,
  paymentReference: string,
): Promise<{ ok: true; alreadyExisted: boolean; token: string; trackUrl: string }> {
  if (isDemoOwnerKey(ownerKey)) {
    return {
      ok: true,
      alreadyExisted: true,
      token: "demo-token",
      trackUrl: "https://www.myairporttaxini.co.uk/track/?id=demo-token",
    };
  }

  const response = await fetch(
    `${WORKER_BASE}/paid-bookings/ensure-tracking?key=${encodeURIComponent(ownerKey.trim())}`,
    {
      method: "POST",
      headers: driverPostHeaders(ownerKey),
      body: JSON.stringify({ paymentReference }),
    },
  );

  return parseJsonResponse<{
    ok: true;
    alreadyExisted: boolean;
    token: string;
    trackUrl: string;
  }>(response);
}

export async function fetchDriverVehicleProfiles(
  accessKey: string,
): Promise<Array<{ profileKey: string; displayName: string; complete?: boolean }>> {
  if (isDemoOwnerKey(accessKey)) {
    return getDemoOwnerVehicleProfiles();
  }

  if (isDemoDriverKey(accessKey)) {
    return getDemoDriverVehicleProfiles();
  }

  const url = new URL(`${WORKER_BASE}/driver/vehicle/profiles`);
  driverQueryKey(url, accessKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = await parseJsonResponse<{
    ok: true;
    profiles: Array<{ profileKey: string; displayName: string; complete?: boolean }>;
  }>(response);
  return payload.profiles;
}

export async function fetchDriverVehicle(
  accessKey: string,
  profile?: string,
): Promise<DriverVehicleProfile | null> {
  if (isDemoOwnerKey(accessKey)) {
    return getDemoOwnerVehicle(profile);
  }

  if (isDemoDriverKey(accessKey)) {
    return getDemoDriverVehicle();
  }

  const url = new URL(`${WORKER_BASE}/driver/vehicle`);
  driverQueryKey(url, accessKey);
  if (profile?.trim()) {
    url.searchParams.set("profile", profile.trim());
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = await parseJsonResponse<{ ok: true; profile: DriverVehicleProfile | null }>(response);
  return payload.profile;
}

export async function saveDriverVehicle(
  accessKey: string,
  input: {
    profile?: string;
    displayName?: string;
    email: string;
    mobile?: string;
    make: string;
    model: string;
    colour: string;
    registration: string;
  },
): Promise<{ profile: DriverVehicleProfile; emailSent?: boolean; emailWarning?: string }> {
  if (isDemoOwnerKey(accessKey)) {
    return {
      profile: {
        ...getDemoOwnerVehicle(input.profile),
        email: input.email,
        mobile: input.mobile,
        make: input.make,
        model: input.model,
        colour: input.colour,
        registration: input.registration,
        displayName: input.displayName ?? getDemoOwnerVehicle(input.profile).displayName,
      },
      emailSent: false,
      emailWarning: "Demo mode — no email sent.",
    };
  }

  if (isDemoDriverKey(accessKey)) {
    return {
      profile: {
        ...getDemoDriverVehicle(),
        email: input.email,
        mobile: input.mobile,
        make: input.make,
        model: input.model,
        colour: input.colour,
        registration: input.registration,
        displayName: input.displayName ?? DEMO_DRIVER_NAME,
      },
      emailSent: false,
      emailWarning: "Demo mode — no email sent.",
    };
  }

  const response = await fetch(`${WORKER_BASE}/driver/vehicle?key=${encodeURIComponent(accessKey.trim())}`, {
    method: "POST",
    headers: driverPostHeaders(accessKey),
    body: JSON.stringify(input),
  });

  const payload = await parseJsonResponse<{
    ok: true;
    profile: DriverVehicleProfile;
    complete?: boolean;
    emailSent?: boolean;
    emailWarning?: string;
  }>(response);

  if (!payload.profile?.profileKey || !payload.profile.email) {
    throw new Error("Driver profile was not saved on the server");
  }

  return payload;
}

export async function fetchDriverRoster(ownerKey: string): Promise<string[]> {
  if (isDemoOwnerKey(ownerKey)) {
    return [...getDemoOwnerStatus().availableDrivers ?? []];
  }

  const url = new URL(`${WORKER_BASE}/driver/roster`);
  driverQueryKey(url, ownerKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const payload = await parseJsonResponse<{ ok: true; drivers: string[] }>(response);
  return payload.drivers;
}

export type AssignDriverDetails = {
  driverFirstName: string;
  driverEmail?: string;
  driverMobile?: string;
  driverCarMake?: string;
  driverCarModel?: string;
  driverCarColour?: string;
  driverReg?: string;
  driverPayAmount?: string;
};

export async function assignJobToDriver(
  ownerKey: string,
  token: string,
  driverNameOrDetails: string | AssignDriverDetails,
): Promise<{ ok: true; job: DriverJob; emailed?: boolean }> {
  const details: AssignDriverDetails =
    typeof driverNameOrDetails === "string"
      ? { driverFirstName: driverNameOrDetails }
      : driverNameOrDetails;
  const driverName = details.driverFirstName.trim();

  if (isDemoOwnerKey(ownerKey)) {
    const job =
      getDemoOwnerUpcomingJobs().jobs.find((entry) => entry.token === token) ??
      getDemoOwnerPendingJobs().jobs.find((entry) => entry.token === token) ??
      getDemoOwnerJobs().jobs.find((entry) => entry.token === token);

    if (!job) {
      throw new Error("Job not found");
    }

    return {
      ok: true,
      emailed: Boolean(details.driverEmail && details.driverPayAmount),
      job: enrichDemoJobForOwner({
        ...job,
        assignedDriverName: driverName,
        assignmentStatus: "pending",
        assignedAt: new Date().toISOString(),
      }),
    };
  }

  const response = await fetch(`${WORKER_BASE}/driver/assign?key=${encodeURIComponent(ownerKey.trim())}`, {
    method: "POST",
    headers: driverPostHeaders(ownerKey),
    body: JSON.stringify({
      token,
      driverName,
      driverFirstName: driverName,
      driverEmail: details.driverEmail?.trim() || undefined,
      driverMobile: details.driverMobile?.trim() || undefined,
      driverCarMake: details.driverCarMake?.trim() || undefined,
      driverCarModel: details.driverCarModel?.trim() || undefined,
      driverCarColour: details.driverCarColour?.trim() || undefined,
      driverReg: details.driverReg?.trim() || undefined,
      driverPayAmount: details.driverPayAmount?.trim() || undefined,
    }),
  });

  return parseJsonResponse<{ ok: true; job: DriverJob; emailed?: boolean }>(response);
}

export async function deassignJob(
  ownerKey: string,
  token: string,
): Promise<{ ok: true; job: DriverJob }> {
  if (isDemoOwnerKey(ownerKey)) {
    const job =
      getDemoOwnerUpcomingJobs().jobs.find((entry) => entry.token === token) ??
      getDemoOwnerPendingJobs().jobs.find((entry) => entry.token === token) ??
      getDemoOwnerJobs().jobs.find((entry) => entry.token === token);

    if (!job) {
      throw new Error("Job not found");
    }

    const cleared = { ...job };
    delete cleared.assignedDriverName;
    delete cleared.assignedAt;
    delete cleared.acceptedAt;
    delete cleared.declinedAt;

    return {
      ok: true,
      job: enrichDemoJobForOwner({
        ...cleared,
        assignmentStatus: "unassigned",
      }),
    };
  }

  const response = await fetch(`${WORKER_BASE}/driver/deassign?key=${encodeURIComponent(ownerKey.trim())}`, {
    method: "POST",
    headers: driverPostHeaders(ownerKey),
    body: JSON.stringify({ token }),
  });

  return parseJsonResponse<{ ok: true; job: DriverJob }>(response);
}

export async function respondToJobAssignment(
  driverKey: string,
  token: string,
  action: "accept" | "decline",
): Promise<{ ok: true; job: DriverJob }> {
  if (isDemoDriverKey(driverKey)) {
    const pending = getDemoDriverPendingJobs().jobs.find((entry) => entry.token === token);
    if (!pending) {
      throw new Error("This job is not awaiting your response");
    }

    if (action === "decline") {
      return {
        ok: true,
        job: sanitizeDemoJobForDriver({
          ...pending,
          assignmentStatus: "declined",
          declinedAt: new Date().toISOString(),
        }),
      };
    }

    return {
      ok: true,
      job: sanitizeDemoJobForDriver({
        ...pending,
        assignmentStatus: "accepted",
        acceptedAt: new Date().toISOString(),
      }),
    };
  }

  const response = await fetch(
    `${WORKER_BASE}/driver/assignment?key=${encodeURIComponent(driverKey.trim())}`,
    {
      method: "POST",
      headers: driverPostHeaders(driverKey),
      body: JSON.stringify({ token, action }),
    },
  );

  return parseJsonResponse<{ ok: true; job: DriverJob }>(response);
}

export async function fetchDriverLocationHistory(
  ownerKey: string,
  token: string,
): Promise<{
  ok: true;
  token: string;
  count: number;
  recordedFrom?: string;
  recordedTo?: string;
  points: DriverLocationPoint[];
}> {
  if (isDemoOwnerKey(ownerKey)) {
    return getDemoOwnerLocationHistory(token);
  }

  const url = new URL(`${WORKER_BASE}/driver/location-history`);
  driverQueryKey(url, ownerKey);
  url.searchParams.set("token", token);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  return parseJsonResponse<{
    ok: true;
    token: string;
    count: number;
    recordedFrom?: string;
    recordedTo?: string;
    points: DriverLocationPoint[];
  }>(response);
}

export async function postDriverLocation(
  driverKey: string,
  token: string,
  lat: number,
  lng: number,
  extras?: {
    sessionToken?: string;
    accuracy?: number;
    speed?: number;
    heading?: number;
  },
): Promise<void> {
  if (isDemoDriverKey(driverKey) || isDemoOwnerKey(driverKey)) {
    return;
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const sessionToken = extras?.sessionToken?.trim();
  if (sessionToken) {
    headers["X-Tracking-Session"] = sessionToken;
  } else {
    headers["X-Driver-Key"] = driverKey;
  }

  const url = sessionToken
    ? `${WORKER_BASE}/driver/location`
    : `${WORKER_BASE}/driver/location?key=${encodeURIComponent(driverKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      token,
      lat,
      lng,
      ...(sessionToken ? { sessionToken } : {}),
      ...(typeof extras?.accuracy === "number" ? { accuracy: extras.accuracy } : {}),
      ...(typeof extras?.speed === "number" ? { speed: extras.speed } : {}),
      ...(typeof extras?.heading === "number" ? { heading: extras.heading } : {}),
    }),
  });

  await parseJsonResponse<{ ok: true }>(response);
}

export async function setCustomerSharing(
  token: string,
  active: boolean,
): Promise<{ ok: true; customerSharingActive: boolean }> {
  if (isDemoTrackToken(token)) {
    return { ok: true, customerSharingActive: active };
  }

  const response = await fetch(`${WORKER_BASE}/track/sharing`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, active }),
  });

  return parseJsonResponse<{ ok: true; customerSharingActive: boolean }>(response);
}

export async function postCustomerLocation(
  token: string,
  lat: number,
  lng: number,
): Promise<void> {
  if (isDemoTrackToken(token)) {
    return;
  }

  const response = await fetch(`${WORKER_BASE}/track/location`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, lat, lng }),
  });

  await parseJsonResponse<{ ok: true }>(response);
}

export function buildWhatsAppTrackLink(trackUrl: string, customerName: string): string {
  const message = `Hi ${customerName}, you can follow your driver's live location here when they are on the way: ${trackUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

import { driverDisplayFirstName } from "../../shared/booking-job";
export { driverDisplayFirstName };

/** Customer-facing driver details for WhatsApp — first name only, never email. */
export function buildWhatsAppDriverDetailsLink(options: {
  customerName: string;
  customerMobile?: string;
  tripDate?: string;
  tripTime?: string;
  driverName?: string;
  driverMobile?: string;
  carMake?: string;
  carModel?: string;
  carColour?: string;
  reg?: string;
}): string {
  const vehicle = [options.carColour, options.carMake, options.carModel]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  const when = [options.tripDate, options.tripTime].filter(Boolean).join(" ");
  const driverFirst = driverDisplayFirstName(options.driverName);
  const lines = [
    `Hi ${options.customerName.trim() || "there"},`,
    "",
    when
      ? `Here are your driver details for ${when}:`
      : "Here are your driver details for your airport transfer:",
    driverFirst ? `Driver: ${driverFirst}` : null,
    options.driverMobile?.trim() ? `Mobile: ${options.driverMobile.trim()}` : null,
    vehicle ? `Vehicle: ${vehicle}` : null,
    options.reg?.trim() ? `Registration: ${options.reg.trim().toUpperCase()}` : null,
    "",
    "My Airport Taxi NI",
  ].filter((line): line is string => line !== null);

  const digits = (options.customerMobile ?? "").replace(/\D/g, "");
  const waNumber =
    digits.length >= 10
      ? digits.startsWith("44")
        ? digits
        : digits.startsWith("0")
          ? `44${digits.slice(1)}`
          : digits
      : "";

  const text = encodeURIComponent(lines.join("\n"));
  return waNumber ? `https://wa.me/${waNumber}?text=${text}` : `https://wa.me/?text=${text}`;
}
