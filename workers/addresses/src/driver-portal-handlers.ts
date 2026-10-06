import { corsHeaders } from "../shared/google-places";
import {
  driverPortalSessionCookie,
  exchangeDriverPortalLink,
} from "./driver-portal-session";

type Env = {
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
