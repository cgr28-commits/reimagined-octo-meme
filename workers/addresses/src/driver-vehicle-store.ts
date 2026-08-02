import {
  OWNER_VEHICLE_PROFILE_KEY,
  vehicleProfileComplete,
  vehicleProfileKey,
  type DriverVehicleProfile,
} from "../shared/driver-vehicle";

const VEHICLE_PREFIX = "driver:vehicle:";
const VEHICLE_TTL = 60 * 60 * 24 * 365 * 5;

function vehicleKey(profileKey: string): string {
  return `${VEHICLE_PREFIX}${profileKey}`;
}

export function normalizeVehicleProfileKey(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.toLowerCase() === OWNER_VEHICLE_PROFILE_KEY) {
    return OWNER_VEHICLE_PROFILE_KEY;
  }

  return vehicleProfileKey(trimmed);
}

export async function getDriverVehicleProfile(
  store: KVNamespace,
  profileNameOrKey: string,
): Promise<DriverVehicleProfile | null> {
  const key = normalizeVehicleProfileKey(profileNameOrKey);
  if (!key) {
    return null;
  }

  const record = await store.get<DriverVehicleProfile>(vehicleKey(key), "json");
  if (!record?.profileKey) {
    return null;
  }

  return record;
}

export async function saveDriverVehicleProfile(
  store: KVNamespace,
  profile: DriverVehicleProfile,
): Promise<DriverVehicleProfile> {
  const saved: DriverVehicleProfile = {
    ...profile,
    make: profile.make.trim(),
    model: profile.model.trim(),
    colour: profile.colour.trim(),
    registration: profile.registration.trim().toUpperCase(),
    updatedAt: new Date().toISOString(),
  };

  await store.put(vehicleKey(saved.profileKey), JSON.stringify(saved), {
    expirationTtl: VEHICLE_TTL,
  });

  return saved;
}

export async function resolveCustomerVisibleVehicle(
  store: KVNamespace,
  options: {
    trackingWindowOpen: boolean;
    sharingActive: boolean;
    driverName?: string;
  },
): Promise<DriverVehicleProfile | null> {
  if (!options.trackingWindowOpen || !options.sharingActive) {
    return null;
  }

  const driverName = options.driverName?.trim();
  if (!driverName) {
    return null;
  }

  const profile = await getDriverVehicleProfile(store, driverName);
  if (!profile || !vehicleProfileComplete(profile)) {
    return null;
  }

  return profile;
}
