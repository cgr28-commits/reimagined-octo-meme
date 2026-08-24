import { OWNER_VEHICLE_PROFILE_KEY } from "../shared/driver-vehicle";
import {
  getDriverVehicleProfile,
  listOwnerVehicleProfileOptions,
} from "./driver-vehicle-store";

export type DriverAuthEnv = {
  DRIVER_ACCESS_KEY?: string;
  OWNER_ACCESS_KEY?: string;
  /** Display name for the driver key holder (default Driver). */
  DRIVER_NAME?: string;
  /** Comma-separated driver names available for assignment (default: DRIVER_NAME). */
  DRIVER_ROSTER?: string;
};

export type DriverAuthStatus = {
  hasDriverKey: boolean;
  hasOwnerKey: boolean;
};

export type DashboardRole = "owner" | "driver";

export type DriverSession =
  | { authorized: false }
  | { authorized: true; role: DashboardRole; driverName?: string; driverEmail?: string };

function normalizeKey(value: string): string {
  return value.replace(/^\uFEFF/, "").trim();
}

export function readProvidedDriverKey(request: Request): string {
  const headerKey = request.headers.get("X-Driver-Key") ?? "";
  const ownerKey = request.headers.get("X-Owner-Key") ?? "";
  const urlKey = new URL(request.url).searchParams.get("key") ?? "";
  return normalizeKey(headerKey || ownerKey || urlKey);
}

function ownerKey(env: DriverAuthEnv): string {
  return env.OWNER_ACCESS_KEY ? normalizeKey(env.OWNER_ACCESS_KEY) : "";
}

function driverKey(env: DriverAuthEnv): string {
  return env.DRIVER_ACCESS_KEY ? normalizeKey(env.DRIVER_ACCESS_KEY) : "";
}

function driverDisplayName(env: DriverAuthEnv): string {
  const explicit = env.DRIVER_NAME?.trim();
  if (explicit) {
    return explicit;
  }

  return "Driver";
}

export function listConfiguredDrivers(env: DriverAuthEnv): string[] {
  const roster = env.DRIVER_ROSTER?.trim();
  if (roster) {
    const names = roster
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length > 0) {
      return [...new Set(names)];
    }
  }

  return [driverDisplayName(env)];
}

export function isConfiguredDriver(env: DriverAuthEnv, driverName: string): boolean {
  const normalized = driverName.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return listConfiguredDrivers(env).some((name) => name.toLowerCase() === normalized);
}

/** @deprecated Prefer ownerKey / driverKey */
export function resolveDriverAccessKey(env: DriverAuthEnv): string {
  return ownerKey(env) || driverKey(env);
}

export function driverAuthStatus(env: DriverAuthEnv): DriverAuthStatus {
  return {
    hasDriverKey: Boolean(driverKey(env)),
    hasOwnerKey: Boolean(ownerKey(env)),
  };
}

export function resolveDriverSession(request: Request, env: DriverAuthEnv): DriverSession {
  const provided = readProvidedDriverKey(request);
  if (!provided) {
    return { authorized: false };
  }

  const expectedOwner = ownerKey(env);
  if (expectedOwner && provided === expectedOwner) {
    return { authorized: true, role: "owner" };
  }

  const expectedDriver = driverKey(env);
  if (expectedDriver && provided === expectedDriver) {
    return { authorized: true, role: "driver", driverName: driverDisplayName(env) };
  }

  return { authorized: false };
}

/**
 * Resolve the saved-driver identity when a deployment has no DRIVER_NAME.
 * One complete non-owner profile is unambiguous; multiple profiles fail closed.
 */
export async function resolveStoredDriverSession(
  request: Request,
  env: DriverAuthEnv,
  store?: KVNamespace,
): Promise<DriverSession> {
  const session = resolveDriverSession(request, env);
  if (
    !session.authorized ||
    session.role !== "driver" ||
    session.driverName !== "Driver" ||
    !store
  ) {
    return session;
  }

  const profiles = await listOwnerVehicleProfileOptions(store, []);
  const external = profiles.filter(
    (profile) =>
      profile.profileKey !== OWNER_VEHICLE_PROFILE_KEY &&
      profile.complete &&
      Boolean(profile.displayName.trim()),
  );
  if (external.length !== 1) {
    return session;
  }
  const saved = await getDriverVehicleProfile(store, external[0].profileKey);

  return {
    authorized: true,
    role: "driver",
    driverName: external[0].displayName.trim(),
    ...(saved?.email.trim() ? { driverEmail: saved.email.trim().toLowerCase() } : {}),
  };
}

export function driverAuthorized(request: Request, env: DriverAuthEnv): boolean {
  return resolveDriverSession(request, env).authorized;
}

export function ownerAuthorized(request: Request, env: DriverAuthEnv): boolean {
  const session = resolveDriverSession(request, env);
  if (session.authorized && session.role === "owner") {
    return true;
  }
  // When no separate OWNER_ACCESS_KEY is configured, the driver key is the admin key.
  if (!ownerKey(env) && session.authorized && session.role === "driver") {
    return true;
  }
  return false;
}

export function isDriverAuthConfigured(env: DriverAuthEnv): boolean {
  return Boolean(ownerKey(env) || driverKey(env));
}

export function sanitizeDriverJobForRole<T extends Record<string, unknown>>(
  job: T,
  role: DashboardRole,
): T {
  if (role === "owner") {
    return job;
  }

  const sanitized = { ...job };
  delete sanitized.paymentReference;
  delete sanitized.bookingReference;
  delete sanitized.amountPaidLabel;
  delete sanitized.bookingStatus;
  delete sanitized.refundAmountLabel;
  delete sanitized.customerMobile;
  delete sanitized.customerEmail;
  delete sanitized.driverLocationPointCount;
  delete sanitized.driverLocationRecordedFrom;
  delete sanitized.driverLocationRecordedTo;
  delete sanitized.driverPaymentStatus;
  delete sanitized.driverPaymentAmount;
  delete sanitized.driverPaymentDueAt;
  delete sanitized.driverPaymentSentAt;
  delete sanitized.driverPaymentHistory;
  delete sanitized.driverContactRevealedAt;
  // Drivers must never see what the customer paid.
  // Flight fields (flightNumber, flight, isAirportPickup, airportCode) are retained for drivers.
  return sanitized as T;
}
