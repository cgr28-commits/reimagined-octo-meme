import { corsHeaders } from "../shared/google-places";
import {
  driverPortalSessionCookie,
  exchangeDriverPortalLink,
  createDriverPortalLink,
} from "./driver-portal-session";

import { resolveDriverSession, type DriverAuthEnv } from "./driver-auth";
import { getOwnerAccountProfile } from "./owner-profile-store";
import { getDriverVehicleProfile } from "./driver-vehicle-store";

type Env = DriverAuthEnv & {
  TRACKING_STORE?: KVNamespace;
  SITE_URL?: string;
};

const DEFAULT_SITE_URL = "https://www.myairporttaxini.co.uk";

function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  extraHeaders?: HeadersInit,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(origin),
      ...extraHeaders,
    },
  });
}

export async function handleDriverPortalExchangeRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!env.TRACKING_STORE) {
    return jsonResponse({ error: "Driver portal is not configured" }, 503, origin);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  const access = String(body.access ?? body.token ?? "").trim();
  if (!access) {
    return jsonResponse({ error: "Missing access link" }, 400, origin);
  }

  const exchanged = await exchangeDriverPortalLink(env.TRACKING_STORE, access);
  if (!exchanged) {
    return jsonResponse({ error: "This My Jobs link is invalid or has already been used" }, 401, origin);
  }

  return jsonResponse(
    {
      ok: true,
      sessionToken: exchanged.sessionToken,
      driverName: exchanged.driverName,
      expiresAt: exchanged.expiresAt,
      jobsUrl: `${(env.SITE_URL?.trim() || DEFAULT_SITE_URL).replace(/\/$/, "")}/driver/`,
    },
    200,
    origin,
    {
      "Set-Cookie": driverPortalSessionCookie(exchanged.sessionToken),
    },
  );
}

/** Owner explicitly creates a fresh, scoped My Jobs link; this grants no admin rights. */
export async function handleDriverPortalInviteRequest(request: Request, env: Env, origin: string | null): Promise<Response> {
  const owner = resolveDriverSession(request, env);
  if (!owner.authorized || owner.role !== "owner" || request.headers.has("X-Driver-Session")) {
    return jsonResponse({ error: "Owner access required" }, 403, origin);
  }
  if (!env.TRACKING_STORE) return jsonResponse({ error: "Driver portal unavailable" }, 503, origin);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400, origin); }
  const key = typeof body.profileKey === "string" ? body.profileKey.trim().toLowerCase() : "owner";
  const profile = key === "owner" ? await getOwnerAccountProfile(env.TRACKING_STORE) : await getDriverVehicleProfile(env.TRACKING_STORE, key);
  if (!profile?.displayName) return jsonResponse({ error: "Save the driver's name and contact details in Profiles first." }, 422, origin);
  const access = await createDriverPortalLink(env.TRACKING_STORE, { profileKey: profile.profileKey, driverName: profile.displayName });
  return jsonResponse({ ok: true, access, driverName: profile.displayName }, 200, origin);
}
