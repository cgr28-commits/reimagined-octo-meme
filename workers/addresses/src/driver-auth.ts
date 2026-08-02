export type DriverAuthEnv = {
  DRIVER_ACCESS_KEY?: string;
  OWNER_ACCESS_KEY?: string;
};

export function resolveDriverAccessKey(env: DriverAuthEnv): string {
  return env.DRIVER_ACCESS_KEY?.trim() || env.OWNER_ACCESS_KEY?.trim() || "";
}

export function readProvidedDriverKey(request: Request): string {
  const headerKey = request.headers.get("X-Driver-Key")?.trim() ?? "";
  const ownerKey = request.headers.get("X-Owner-Key")?.trim() ?? "";
  const urlKey = new URL(request.url).searchParams.get("key")?.trim() ?? "";
  return headerKey || ownerKey || urlKey;
}

export function driverAuthorized(request: Request, env: DriverAuthEnv): boolean {
  const expected = resolveDriverAccessKey(env);
  if (!expected) {
    return false;
  }

  return readProvidedDriverKey(request) === expected;
}

export function isDriverAuthConfigured(env: DriverAuthEnv): boolean {
  return Boolean(resolveDriverAccessKey(env));
}
