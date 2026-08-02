export type DriverAuthEnv = {
  DRIVER_ACCESS_KEY?: string;
  OWNER_ACCESS_KEY?: string;
};

export type DriverAuthStatus = {
  hasDriverKey: boolean;
  hasOwnerKey: boolean;
};

function normalizeKey(value: string): string {
  return value.replace(/^\uFEFF/, "").trim();
}

function configuredKeys(env: DriverAuthEnv): string[] {
  const keys = [env.DRIVER_ACCESS_KEY, env.OWNER_ACCESS_KEY]
    .map((value) => (value ? normalizeKey(value) : ""))
    .filter(Boolean);

  return [...new Set(keys)];
}

export function readProvidedDriverKey(request: Request): string {
  const headerKey = request.headers.get("X-Driver-Key") ?? "";
  const ownerKey = request.headers.get("X-Owner-Key") ?? "";
  const urlKey = new URL(request.url).searchParams.get("key") ?? "";
  return normalizeKey(headerKey || ownerKey || urlKey);
}

/** @deprecated Prefer configuredKeys / driverAuthStatus */
export function resolveDriverAccessKey(env: DriverAuthEnv): string {
  return configuredKeys(env)[0] ?? "";
}

export function driverAuthStatus(env: DriverAuthEnv): DriverAuthStatus {
  return {
    hasDriverKey: Boolean(env.DRIVER_ACCESS_KEY?.trim()),
    hasOwnerKey: Boolean(env.OWNER_ACCESS_KEY?.trim()),
  };
}

export function driverAuthorized(request: Request, env: DriverAuthEnv): boolean {
  const keys = configuredKeys(env);
  if (keys.length === 0) {
    return false;
  }

  const provided = readProvidedDriverKey(request);
  if (!provided) {
    return false;
  }

  return keys.includes(provided);
}

export function isDriverAuthConfigured(env: DriverAuthEnv): boolean {
  return configuredKeys(env).length > 0;
}
