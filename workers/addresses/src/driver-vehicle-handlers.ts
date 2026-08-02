import {
  OWNER_VEHICLE_PROFILE_KEY,
  vehicleProfileComplete,
  type DriverVehicleProfile,
} from "../shared/driver-vehicle";
import {
  driverAuthorized,
  isConfiguredDriver,
  listConfiguredDrivers,
  resolveDriverSession,
  type DriverAuthEnv,
} from "./driver-auth";
import { corsHeaders } from "../shared/google-places";
import {
  getDriverVehicleProfile,
  normalizeVehicleProfileKey,
  saveDriverVehicleProfile,
} from "./driver-vehicle-store";
import { trackingStoreConfigured } from "./tracking-store";

type Env = DriverAuthEnv & {
  TRACKING_STORE?: KVNamespace;
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

function ownerProfileOptions(env: Env): Array<{ profileKey: string; displayName: string }> {
  return [
    { profileKey: OWNER_VEHICLE_PROFILE_KEY, displayName: "Owner" },
    ...listConfiguredDrivers(env).map((name) => ({
      profileKey: normalizeVehicleProfileKey(name),
      displayName: name,
    })),
  ];
}

function canAccessVehicleProfile(
  env: Env,
  session: ReturnType<typeof resolveDriverSession>,
  profileKey: string,
): boolean {
  if (!session.authorized) {
    return false;
  }

  if (session.role === "owner") {
    if (profileKey === OWNER_VEHICLE_PROFILE_KEY) {
      return true;
    }

    return listConfiguredDrivers(env).some(
      (name) => normalizeVehicleProfileKey(name) === profileKey,
    );
  }

  if (!session.driverName) {
    return false;
  }

  return normalizeVehicleProfileKey(session.driverName) === profileKey;
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

    if (isConfiguredDriver(env, trimmed)) {
      return normalizeVehicleProfileKey(trimmed);
    }

    return null;
  }

  if (!session.driverName) {
    return null;
  }

  return normalizeVehicleProfileKey(session.driverName);
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

  if (session.role === "owner") {
    return jsonResponse(
      {
        ok: true,
        profiles: ownerProfileOptions(env),
      },
      200,
      origin,
    );
  }

  return jsonResponse(
    {
      ok: true,
      profiles: [
        {
          profileKey: normalizeVehicleProfileKey(session.driverName ?? ""),
          displayName: session.driverName ?? "Driver",
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
  const profileKey = resolveRequestedProfileKey(env, session, url.searchParams.get("profile") ?? undefined);

  if (!profileKey || !canAccessVehicleProfile(env, session, profileKey)) {
    return jsonResponse({ error: "Unauthorized for this vehicle profile" }, 403, origin);
  }

  const profile = await getDriverVehicleProfile(env.TRACKING_STORE, profileKey);

  return jsonResponse(
    {
      ok: true,
      profile: profile ?? null,
      profileKey,
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

  const profileKey = resolveRequestedProfileKey(
    env,
    session,
    String(body.profile ?? body.profileKey ?? body.displayName ?? "").trim() || undefined,
  );

  if (!profileKey || !canAccessVehicleProfile(env, session, profileKey)) {
    return jsonResponse({ error: "Unauthorized for this vehicle profile" }, 403, origin);
  }

  const make = String(body.make ?? "").trim();
  const model = String(body.model ?? "").trim();
  const colour = String(body.colour ?? "").trim();
  const registration = String(body.registration ?? "").trim();

  if (!make || !model || !colour || !registration) {
    return jsonResponse(
      { error: "Make, model, colour, and registration are all required" },
      400,
      origin,
    );
  }

  const displayName =
    profileKey === OWNER_VEHICLE_PROFILE_KEY
      ? "Owner"
      : listConfiguredDrivers(env).find(
          (name) => normalizeVehicleProfileKey(name) === profileKey,
        ) ?? String(body.displayName ?? profileKey);

  const saved = await saveDriverVehicleProfile(env.TRACKING_STORE, {
    profileKey,
    displayName,
    make,
    model,
    colour,
    registration,
    updatedAt: new Date().toISOString(),
  });

  if (!vehicleProfileComplete(saved)) {
    return jsonResponse({ error: "Vehicle details could not be saved" }, 502, origin);
  }

  return jsonResponse({ ok: true, profile: saved }, 200, origin);
}
