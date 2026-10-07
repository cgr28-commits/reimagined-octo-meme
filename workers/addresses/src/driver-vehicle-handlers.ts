import {
  OWNER_VEHICLE_PROFILE_KEY,
  driverProfileComplete,
  buildDriverProfileConfirmationEmail,
  type DriverVehicleProfile,
} from "../shared/driver-vehicle";
import {
  driverAuthorized,
  listConfiguredDrivers,
  resolveDriverSession,
  type DriverAuthEnv,
} from "./driver-auth";
import { corsHeaders } from "../shared/google-places";
import {
  findSavedDriverProfileByEmail,
  getDriverVehicleProfile,
  listOwnerVehicleProfileOptions,
  normalizeVehicleProfileKey,
  saveDriverVehicleProfile,
} from "./driver-vehicle-store";
import { trackingStoreConfigured } from "./tracking-store";
import { trySendBrandedCustomerEmail, type WorkerEmailEnv } from "./worker-email";

type Env = DriverAuthEnv &
  WorkerEmailEnv & {
    TRACKING_STORE?: KVNamespace;
  };

const BUSINESS_NAME = "My Airport Taxi NI";

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

const REQUIRED_DRIVER_FIELDS_ERROR =
  "Name, email, mobile, make, model, colour, and registration are all required";
const DRIVER_NAME_EXISTS_ERROR =
  "A driver with that name already exists. Edit the existing driver instead.";
const DRIVER_EMAIL_IN_USE_ERROR = "That email address is already used by another driver.";
const OWNER_PROFILE_NAME_ERROR =
  "The Owner profile is separate. Choose a different driver name.";

async function emailUsedByAnotherDriver(
  store: KVNamespace,
  email: string,
  profileKey: string,
): Promise<boolean> {
  const match = await findSavedDriverProfileByEmail(store, email);
  if (match && match.profileKey !== profileKey) {
    return true;
  }

  if (profileKey === OWNER_VEHICLE_PROFILE_KEY) {
    return false;
  }

  const ownerProfile = await getDriverVehicleProfile(store, OWNER_VEHICLE_PROFILE_KEY);
  return ownerProfile?.email?.trim().toLowerCase() === email.trim().toLowerCase();
}

async function ownerCanAccessProfileKey(
  store: KVNamespace,
  env: Env,
  profileKey: string,
): Promise<boolean> {
  if (profileKey === OWNER_VEHICLE_PROFILE_KEY) {
    return true;
  }

  if (
    listConfiguredDrivers(env).some(
      (name) => normalizeVehicleProfileKey(name) === profileKey,
    )
  ) {
    return true;
  }

  // Allow access to any profile previously saved in KV (roster may have changed).
  const existing = await getDriverVehicleProfile(store, profileKey);
  return Boolean(existing);
}

function resolveRequestedProfileKey(
  env: Env,
  session: ReturnType<typeof resolveDriverSession>,
  requested?: string,
): string | null {
  if (!session.authorized) {
    return null;
  }

  if (session.role === "owner") {
    const trimmed = requested?.trim();
    if (!trimmed || trimmed.toLowerCase() === OWNER_VEHICLE_PROFILE_KEY) {
      return OWNER_VEHICLE_PROFILE_KEY;
    }
    return normalizeVehicleProfileKey(trimmed);
  }

  if (!session.driverName) {
    return null;
  }

  return normalizeVehicleProfileKey(session.driverName);
}

async function sendDriverProfileEmail(
  env: Env,
  profile: DriverVehicleProfile,
): Promise<{ sent: boolean; error?: string }> {
  const email = buildDriverProfileConfirmationEmail(profile, BUSINESS_NAME);
  return trySendBrandedCustomerEmail(env, {
    to: profile.email,
    toName: profile.displayName,
    subject: email.subject,
    body: email.text,
    htmlBody: email.html,
    ownerCopy: false,
  });
}

export async function handleDriverVehicleProfilesRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!driverAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  const session = resolveDriverSession(request, env);
  if (!session.authorized) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  if (session.role === "owner") {
    const profiles = await listOwnerVehicleProfileOptions(
      env.TRACKING_STORE,
      listConfiguredDrivers(env),
    );
    return jsonResponse({ ok: true, profiles }, 200, origin);
  }

  const profileKey = normalizeVehicleProfileKey(session.driverName ?? "");
  const saved = profileKey
    ? await getDriverVehicleProfile(env.TRACKING_STORE, profileKey)
    : null;

  return jsonResponse(
    {
      ok: true,
      profiles: [
        {
          profileKey: profileKey || "driver",
          displayName: saved?.displayName ?? session.driverName ?? "Driver",
          complete: saved ? driverProfileComplete(saved) : false,
        },
      ],
    },
    200,
    origin,
  );
}

export async function handleDriverVehicleGetRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  if (!driverAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  const session = resolveDriverSession(request, env);
  const url = new URL(request.url);
  const profileKey = resolveRequestedProfileKey(
    env,
    session,
    url.searchParams.get("profile") ?? undefined,
  );

  if (!profileKey || !session.authorized) {
    return jsonResponse({ error: "Unauthorized for this driver profile" }, 403, origin);
  }

  if (session.role === "owner") {
    const allowed = await ownerCanAccessProfileKey(env.TRACKING_STORE, env, profileKey);
    if (!allowed) {
      // Still allow GET for empty/new roster slots so the form can open blank.
      const rosterHit = listConfiguredDrivers(env).some(
        (name) => normalizeVehicleProfileKey(name) === profileKey,
      );
      if (!rosterHit && profileKey !== OWNER_VEHICLE_PROFILE_KEY) {
        return jsonResponse({ error: "Unauthorized for this driver profile" }, 403, origin);
      }
    }
  } else if (normalizeVehicleProfileKey(session.driverName ?? "") !== profileKey) {
    return jsonResponse({ error: "Unauthorized for this driver profile" }, 403, origin);
  }

  const profile = await getDriverVehicleProfile(env.TRACKING_STORE, profileKey);

  return jsonResponse(
    {
      ok: true,
      profile: profile ?? null,
      profileKey,
      complete: profile ? driverProfileComplete(profile) : false,
    },
    200,
    origin,
  );
}

export async function handleDriverVehicleSaveRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Live tracking is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const session = resolveDriverSession(request, env);
  const createNew = body.createNew === true;
  if (createNew) {
    // Real owner session only. DRIVER_ACCESS_KEY is not an owner session
    // when OWNER_ACCESS_KEY is absent.
    // A presented driver portal session is not an owner session.
    if (
      request.headers.get("X-Driver-Session")?.trim() ||
      !session.authorized ||
      session.role !== "owner"
    ) {
      return jsonResponse({ error: "Unauthorized — owner access required" }, 401, origin);
    }
  } else if (!session.authorized) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  const displayName = String(body.displayName ?? body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const mobile = String(body.mobile ?? body.phone ?? "").trim();
  const make = String(body.make ?? "").trim();
  const model = String(body.model ?? "").trim();
  const colour = String(body.colour ?? "").trim();
  const registration = String(body.registration ?? "").trim();

  let profileKey: string;

  if (createNew) {
    // Ignore any client-supplied profile key. The new key comes only from the name.
    profileKey = normalizeVehicleProfileKey(displayName);
    if (!profileKey) {
      return jsonResponse({ error: REQUIRED_DRIVER_FIELDS_ERROR }, 400, origin);
    }
    if (profileKey === OWNER_VEHICLE_PROFILE_KEY) {
      return jsonResponse({ error: OWNER_PROFILE_NAME_ERROR }, 400, origin);
    }

    const existing = await getDriverVehicleProfile(env.TRACKING_STORE, profileKey);
    if (existing) {
      return jsonResponse({ error: DRIVER_NAME_EXISTS_ERROR }, 409, origin);
    }
  } else {
    // Editing keeps the stable profile key. A display-name change must not mint a second profile.
    const requested = String(body.profile ?? body.profileKey ?? "").trim() || undefined;
    const resolved = resolveRequestedProfileKey(
      env,
      session,
      requested || displayName || undefined,
    );

    if (!resolved || !session.authorized) {
      return jsonResponse({ error: "Unauthorized for this driver profile" }, 403, origin);
    }

    profileKey = resolved;

    // Owner edits keep this stable key, including a roster slot that is not saved yet.
    // A driver may only update their own profile.
    if (
      session.role !== "owner" &&
      normalizeVehicleProfileKey(session.driverName ?? "") !== profileKey
    ) {
      return jsonResponse({ error: "Unauthorized for this driver profile" }, 403, origin);
    }
  }

  const resolvedDisplayName =
    displayName ||
    (profileKey === OWNER_VEHICLE_PROFILE_KEY
      ? "Owner"
      : listConfiguredDrivers(env).find(
          (name) => normalizeVehicleProfileKey(name) === profileKey,
        ) ?? profileKey);

  if (!email || !isValidEmail(email)) {
    return jsonResponse({ error: "A valid driver email address is required" }, 400, origin);
  }

  if (!resolvedDisplayName || !mobile || !make || !model || !colour || !registration) {
    return jsonResponse({ error: REQUIRED_DRIVER_FIELDS_ERROR }, 400, origin);
  }

  if (await emailUsedByAnotherDriver(env.TRACKING_STORE, email, profileKey)) {
    return jsonResponse({ error: DRIVER_EMAIL_IN_USE_ERROR }, 409, origin);
  }

  let saved: DriverVehicleProfile;
  try {
    saved = await saveDriverVehicleProfile(env.TRACKING_STORE, {
      profileKey,
      displayName: resolvedDisplayName,
      email,
      mobile,
      make,
      model,
      colour,
      registration,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Driver vehicle profile save failed", error);
    return jsonResponse({ error: "Could not save driver profile to storage" }, 502, origin);
  }

  // Confirm round-trip from KV so we never report success on a failed write.
  const confirmed = await getDriverVehicleProfile(env.TRACKING_STORE, saved.profileKey);
  if (!confirmed || !driverProfileComplete(confirmed)) {
    return jsonResponse(
      { error: "Driver profile was not persisted — please try saving again" },
      502,
      origin,
    );
  }

  const emailResult = await sendDriverProfileEmail(env, confirmed);

  return jsonResponse(
    {
      ok: true,
      profile: confirmed,
      complete: true,
      emailSent: emailResult.sent,
      ...(emailResult.error ? { emailWarning: emailResult.error } : {}),
    },
    200,
    origin,
  );
}
