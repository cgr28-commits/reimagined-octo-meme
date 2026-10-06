import {
  createPortalToken,
  DRIVER_PORTAL_COOKIE,
  isPortalLinkToken,
  isPortalSessionToken,
  PORTAL_LINK_PREFIX,
  PORTAL_LINK_TTL_SECONDS,
  PORTAL_SESSION_PREFIX,
  PORTAL_SESSION_TTL_SECONDS,
} from "../shared/driver-portal-access";
import { resolveDriverSession, type DriverAuthEnv, type DriverSession } from "./driver-auth";

export type PortalIdentity = {
  profileKey: string;
  driverName: string;
};

type PortalLinkRecord = PortalIdentity & {
  expiresAt: string;
};

type PortalSessionRecord = PortalIdentity & {
  expiresAt: string;
};

function linkKey(token: string): string {
  return `driver-portal-link:${token.trim()}`;
}

function sessionKey(token: string): string {
  return `driver-portal-session:${token.trim()}`;
}

function stillValid(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  const time = Date.parse(expiresAt);
  return Number.isFinite(time) && time > Date.now();
}

export async function createDriverPortalLink(
  store: KVNamespace,
  identity: PortalIdentity,
): Promise<string> {
  const token = createPortalToken(PORTAL_LINK_PREFIX);
  const record: PortalLinkRecord = {
    profileKey: identity.profileKey.trim().toLowerCase(),
    driverName: identity.driverName.trim(),
    expiresAt: new Date(Date.now() + PORTAL_LINK_TTL_SECONDS * 1000).toISOString(),
  };
  await store.put(linkKey(token), JSON.stringify(record), {
    expirationTtl: PORTAL_LINK_TTL_SECONDS,
  });
  return token;
}

/**
 * Single-use exchange. The magic link is deleted before the session is returned.
 * A second use of the same link fails.
 */
export async function exchangeDriverPortalLink(
  store: KVNamespace,
  accessToken: string,
): Promise<{ sessionToken: string; driverName: string; profileKey: string; expiresAt: string } | null> {
  const token = accessToken.trim();
  if (!isPortalLinkToken(token)) {
    return null;
  }
  const record = await store.get<PortalLinkRecord>(linkKey(token), "json");
  await store.delete(linkKey(token));
  if (!record || !stillValid(record.expiresAt) || !record.profileKey?.trim()) {
    return null;
  }

  const sessionToken = createPortalToken(PORTAL_SESSION_PREFIX);
  const expiresAt = new Date(Date.now() + PORTAL_SESSION_TTL_SECONDS * 1000).toISOString();
  const session: PortalSessionRecord = {
    profileKey: record.profileKey.trim().toLowerCase(),
    driverName: record.driverName?.trim() || "Driver",
    expiresAt,
  };
  await store.put(sessionKey(sessionToken), JSON.stringify(session), {
    expirationTtl: PORTAL_SESSION_TTL_SECONDS,
  });
  return {
    sessionToken,
    driverName: session.driverName,
    profileKey: session.profileKey,
    expiresAt,
  };
}

export async function readDriverPortalSession(
  store: KVNamespace,
  sessionToken: string,
): Promise<PortalSessionRecord | null> {
  const token = sessionToken.trim();
  if (!isPortalSessionToken(token)) {
    return null;
  }
  const record = await store.get<PortalSessionRecord>(sessionKey(token), "json");
  if (!record || !stillValid(record.expiresAt) || !record.profileKey?.trim()) {
    return null;
  }
  return record;
}

export function driverPortalSessionCookie(sessionToken: string): string {
  return [
    `${DRIVER_PORTAL_COOKIE}=${encodeURIComponent(sessionToken)}`,
    "HttpOnly",
    "Secure",
    "SameSite=None",
    "Path=/",
    `Max-Age=${PORTAL_SESSION_TTL_SECONDS}`,
  ].join("; ");
}

function cookieValue(request: Request, name: string): string {
  const cookie = request.headers.get("Cookie") ?? "";
  const parts = cookie.split(";");
  for (const part of parts) {
    const [rawName, ...rest] = part.split("=");
    if (rawName?.trim() !== name) continue;
    try {
      return decodeURIComponent(rest.join("=").trim());
    } catch {
      return rest.join("=").trim();
    }
  }
  return "";
}

/**
 * A presented portal credential that fails must not fall through to an access key.
 * Header is preferred over the cookie. Keys are used only when neither is present.
 */
export async function resolveAuthorizedSession(
  request: Request,
  env: DriverAuthEnv & { TRACKING_STORE?: KVNamespace },
): Promise<DriverSession> {
  const header = request.headers.get("X-Driver-Session")?.trim() ?? "";
  const cookie = header ? "" : cookieValue(request, DRIVER_PORTAL_COOKIE);
  const presented = header || cookie;
  if (presented) {
    if (!env.TRACKING_STORE) {
      return { authorized: false };
    }
    const session = await readDriverPortalSession(env.TRACKING_STORE, presented);
    if (!session) {
      return { authorized: false };
    }
    return {
      authorized: true,
      role: "driver",
      driverName: session.driverName,
      profileKey: session.profileKey,
    };
  }
  return resolveDriverSession(request, env);
}
