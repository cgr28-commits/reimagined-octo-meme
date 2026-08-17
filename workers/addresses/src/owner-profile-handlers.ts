/**
 * Owner account profile API — separate from /driver/vehicle driver profiles.
 */

import {
  OWNER_ACCOUNT_PROFILE_KEY,
  ownerAccountProfileComplete,
} from "../shared/owner-profile";
import { corsHeaders } from "../shared/google-places";
import { ownerAuthorized, type DriverAuthEnv } from "./driver-auth";
import {
  getOwnerAccountProfile,
  saveOwnerAccountProfile,
} from "./owner-profile-store";
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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isOwnerProfilePath(pathname: string): boolean {
  return pathname === "/owner/profile" || pathname === "/api/owner/profile";
}

export async function handleOwnerProfileGetRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Storage is not configured" }, 503, origin);
  }
  if (!ownerAuthorized(request, env)) {
    return jsonResponse({ error: "Unauthorized — owner access required" }, 401, origin);
  }

  const profile = await getOwnerAccountProfile(env.TRACKING_STORE);

  return jsonResponse(
    {
      ok: true,
      profile: profile ?? null,
      profileKey: OWNER_ACCOUNT_PROFILE_KEY,
      complete: profile ? ownerAccountProfileComplete(profile) : false,
    },
    200,
    origin,
  );
}

export async function handleOwnerProfileSaveRequest(
  request: Request,
  env: Env,
  origin: string | null,
): Promise<Response> {
  if (!trackingStoreConfigured(env.TRACKING_STORE)) {
    return jsonResponse({ error: "Storage is not configured" }, 503, origin);
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

  const displayName = String(body.displayName ?? body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const mobile = String(body.mobile ?? body.phone ?? "").trim();
  const make = String(body.make ?? "").trim();
  const model = String(body.model ?? "").trim();
  const colour = String(body.colour ?? "").trim();
  const registration = String(body.registration ?? "").trim();

  if (!displayName) {
    return jsonResponse({ error: "Owner name is required" }, 400, origin);
  }
  if (!email || !isValidEmail(email)) {
    return jsonResponse({ error: "A valid owner email address is required" }, 400, origin);
  }
  if (!make || !model || !colour || !registration) {
    return jsonResponse(
      { error: "Make, model, colour, and registration are all required" },
      400,
      origin,
    );
  }

  let saved;
  try {
    saved = await saveOwnerAccountProfile(env.TRACKING_STORE, {
      displayName,
      email,
      mobile: mobile || undefined,
      make,
      model,
      colour,
      registration,
    });
  } catch (error) {
    console.error("Owner profile save failed", error);
    return jsonResponse({ error: "Could not save owner profile to storage" }, 502, origin);
  }

  const confirmed = await getOwnerAccountProfile(env.TRACKING_STORE);
  if (!confirmed || !ownerAccountProfileComplete(confirmed)) {
    return jsonResponse(
      { error: "Owner profile was not persisted — please try saving again" },
      502,
      origin,
    );
  }

  return jsonResponse(
    {
      ok: true,
      profile: confirmed,
      profileKey: OWNER_ACCOUNT_PROFILE_KEY,
      complete: true,
    },
    200,
    origin,
  );
}
