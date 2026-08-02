import {
  driverNamesMatch,
  jobAssignmentStatus,
  type JobAssignmentStatus,
  type TrackingJobRecord,
} from "../shared/tracking";
import { enrichDriverJob } from "./driver-booking-handlers";
import {
  isConfiguredDriver,
  listConfiguredDrivers,
  ownerAuthorized,
  resolveDriverSession,
  type DashboardRole,
  type DriverAuthEnv,
} from "./driver-auth";
import { corsHeaders } from "../shared/google-places";
import {
  getTrackingJob,
  isTrackingJobCancelled,
  saveTrackingJob,
  trackingStoreConfigured,
} from "./tracking-store";

type Env = DriverAuthEnv & {
  TRACKING_STORE?: KVNamespace;
  AERODATABOX_RAPIDAPI_KEY?: string;
};

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function stopDriverSharing(record: TrackingJobRecord): void {
  record.sharingActive = false;
  delete record.driverLat;
  delete record.driverLng;
  delete record.driverUpdatedAt;
  delete record.activeDriverName;
}

function assignmentFields(record: TrackingJobRecord) {
  return {
    assignedDriverName: record.assignedDriverName,
    assignmentStatus: jobAssignmentStatus(record),
    assignedAt: record.assignedAt,
    acceptedAt: record.acceptedAt,
    declinedAt: record.declinedAt,
  };
}

export async function handleDriverRosterRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized — owner access required" }, 401, origin);
  }

  return jsonResponse(
    {
      ok: true,
      drivers: listConfiguredDrivers(env),
    },
    200,
    origin,
  );
}

export async function handleDriverAssignRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized — owner access required" }, 401, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const token = String(body.token ?? "").trim();
  const driverName = String(body.driverName ?? "").trim();

  if (!token || !driverName) {
    return jsonResponse({ error: "Missing token or driverName" }, 400, origin);
  }

  if (!isConfiguredDriver(env, driverName)) {
    return jsonResponse({ error: "Unknown driver — check DRIVER_ROSTER or DRIVER_NAME" }, 400, origin);
  }

  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }

  if (isTrackingJobCancelled(record)) {
    return jsonResponse({ error: "This booking has been cancelled" }, 409, origin);
  }

  const now = new Date().toISOString();
  record.assignedDriverName = driverName;
  record.assignmentStatus = "pending";
  record.assignedAt = now;
  delete record.acceptedAt;
  delete record.declinedAt;
  stopDriverSharing(record);

  await saveTrackingJob(env.TRACKING_STORE, record);

  const role: DashboardRole = "owner";
  const job = await enrichDriverJob(record, env, origin, role);

  return jsonResponse(
    {
      ok: true,
      job,
      ...assignmentFields(record),
    },
    200,
    origin,
  );
}

export async function handleDriverAssignmentResponseRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  const session = resolveDriverSession(request, env);
  if (!session.authorized || session.role !== "driver" || !session.driverName) {
    return jsonResponse({ error: "Unauthorized — driver access required" }, 401, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const token = String(body.token ?? "").trim();
  const action = String(body.action ?? "").trim().toLowerCase();

  if (!token || (action !== "accept" && action !== "decline")) {
    return jsonResponse({ error: "Missing token or invalid action (accept/decline)" }, 400, origin);
  }

  const record = await getTrackingJob(env.TRACKING_STORE, token);
  if (!record) {
    return jsonResponse({ error: "Job not found" }, 404, origin);
  }

  if (isTrackingJobCancelled(record)) {
    return jsonResponse({ error: "This booking has been cancelled" }, 409, origin);
  }

  if (jobAssignmentStatus(record) !== "pending") {
    return jsonResponse({ error: "This job is not awaiting your response" }, 409, origin);
  }

  if (!driverNamesMatch(record.assignedDriverName, session.driverName)) {
    return jsonResponse({ error: "This job is not assigned to you" }, 403, origin);
  }

  const now = new Date().toISOString();
  if (action === "accept") {
    record.assignmentStatus = "accepted";
    record.acceptedAt = now;
    delete record.declinedAt;
  } else {
    record.assignmentStatus = "declined";
    record.declinedAt = now;
    delete record.acceptedAt;
    stopDriverSharing(record);
  }

  await saveTrackingJob(env.TRACKING_STORE, record);

  const job = await enrichDriverJob(record, env, origin, "driver");

  return jsonResponse(
    {
      ok: true,
      action,
      job,
      ...assignmentFields(record),
    },
    200,
    origin,
  );
}

export type { JobAssignmentStatus };
