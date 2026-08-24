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
  getDriverVehicleProfile,
  listOwnerVehicleProfileOptions,
  normalizeVehicleProfileKey,
  saveDriverVehicleProfile,
} from "./driver-vehicle-store";
import { getOwnerAccountProfile } from "./owner-profile-store";
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

  let profile = await getDriverVehicleProfile(env.TRACKING_STORE, profileKey);

  // Owner account is the primary driver — fall back when vehicle mirror is empty.
  if (
    !profile &&
    session.role === "owner" &&
    profileKey === OWNER_VEHICLE_PROFILE_KEY
  ) {
    const ownerAccount = await getOwnerAccountProfile(env.TRACKING_STORE);
    if (ownerAccount) {
      profile = {
        profileKey: OWNER_VEHICLE_PROFILE_KEY,
        displayName: ownerAccount.displayName,
        email: ownerAccount.email,
        mobile: ownerAccount.mobile,
        make: ownerAccount.make,
        model: ownerAccount.model,
        colour: ownerAccount.colour,
        registration: ownerAccount.registration,
        updatedAt: ownerAccount.updatedAt,
      };
    }
  }

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

  if (!driverAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }

  const session = resolveDriverSession(request, env);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const requested =
    String(body.profile ?? body.profileKey ?? "").trim() ||
    String(body.displayName ?? body.name ?? "").trim() ||
    undefined;

  const profileKey = resolveRequestedProfileKey(env, session, requested);

  if (!profileKey || !session.authorized) {
    return jsonResponse({ error: "Unauthorized for this driver profile" }, 403, origin);
  }

  if (session.role === "owner") {
    const rosterHit = listConfiguredDrivers(env).some(
      (name) => normalizeVehicleProfileKey(name) === profileKey,
    );
    const existing = await getDriverVehicleProfile(env.TRACKING_STORE, profileKey);
    if (!rosterHit && profileKey !== OWNER_VEHICLE_PROFILE_KEY && !existing) {
      // Owner may create a new named profile (upsert) — allowed; falls through.
    }
  } else if (normalizeVehicleProfileKey(session.driverName ?? "") !== profileKey) {
    return jsonResponse({ error: "Unauthorized for this driver profile" }, 403, origin);
  }

  const displayName = String(body.displayName ?? body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const mobile = String(body.mobile ?? body.phone ?? "").trim();
  const make = String(body.make ?? "").trim();
  const model = String(body.model ?? "").trim();
  const colour = String(body.colour ?? "").trim();
  const registration = String(body.registration ?? "").trim();

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

  if (!make || !model || !colour || !registration) {
    return jsonResponse(
      { error: "Name, email, make, model, colour, and registration are all required" },
      400,
      origin,
    );
  }

  let saved: DriverVehicleProfile;
  try {
    saved = await saveDriverVehicleProfile(env.TRACKING_STORE, {
      profileKey,
      displayName: resolvedDisplayName,
      email,
      mobile: mobile || undefined,
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
