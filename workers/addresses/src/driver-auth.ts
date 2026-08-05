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
  | { authorized: true; role: DashboardRole; driverName?: string };

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
  return env.DRIVER_NAME?.trim() || "Driver";
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

export function driverAuthorized(request: Request, env: DriverAuthEnv): boolean {
  return resolveDriverSession(request, env).authorized;
}

export function ownerAuthorized(request: Request, env: DriverAuthEnv): boolean {
  const session = resolveDriverSession(request, env);
  return session.authorized && session.role === "owner";
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
  delete sanitized.amountPaidLabel;
  delete sanitized.refundAmountLabel;
  delete sanitized.customerMobile;
  delete sanitized.customerEmail;
  delete sanitized.driverLocationPointCount;
  delete sanitized.driverLocationRecordedFrom;
  delete sanitized.driverLocationRecordedTo;
  // Flight fields (flightNumber, flight, isAirportPickup, airportCode) are retained for drivers.
  return sanitized as T;
}
