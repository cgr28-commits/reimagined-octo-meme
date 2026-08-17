import {
  OWNER_VEHICLE_PROFILE_KEY,
  driverProfileComplete,
  vehicleProfileComplete,
  vehicleProfileKey,
  type DriverVehicleProfile,
} from "../shared/driver-vehicle";
import {
  getOwnerAccountProfile,
} from "./owner-profile-store";
import {
  ownerAccountProfileComplete,
} from "../shared/owner-profile";

const VEHICLE_PREFIX = "driver:vehicle:";
const VEHICLE_INDEX_KEY = "driver:vehicle-index";
/** Retain driver profiles for operational use (5 years). */
const VEHICLE_TTL = 60 * 60 * 24 * 365 * 5;

export type VehicleProfileListItem = {
  profileKey: string;
  displayName: string;
  complete: boolean;
};

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

async function readProfileIndex(store: KVNamespace): Promise<string[]> {
  const raw = await store.get<string[]>(VEHICLE_INDEX_KEY, "json");
  if (!Array.isArray(raw)) {
    return [];
  }
  return [...new Set(raw.map((entry) => String(entry ?? "").trim()).filter(Boolean))];
}

async function writeProfileIndex(store: KVNamespace, keys: string[]): Promise<void> {
  const unique = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
  await store.put(VEHICLE_INDEX_KEY, JSON.stringify(unique), {
    expirationTtl: VEHICLE_TTL,
  });
}

async function rememberProfileKey(store: KVNamespace, profileKey: string): Promise<void> {
  const key = profileKey.trim();
  if (!key) {
    return;
  }
  const existing = await readProfileIndex(store);
  if (existing.includes(key)) {
    return;
  }
  await writeProfileIndex(store, [...existing, key]);
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
  if (!record) {
    return null;
  }

  // Accept legacy records that were stored without profileKey on the JSON body.
  const profileKey = record.profileKey?.trim() || key;
  const normalized: DriverVehicleProfile = {
    ...record,
    profileKey,
    displayName: record.displayName?.trim() || profileKey,
    email: record.email?.trim() || "",
    make: record.make?.trim() || "",
    model: record.model?.trim() || "",
    colour: record.colour?.trim() || "",
    registration: record.registration?.trim() || "",
    updatedAt: record.updatedAt || new Date(0).toISOString(),
    ...(record.mobile?.trim() ? { mobile: record.mobile.trim() } : {}),
  };

  if (!normalized.email && !vehicleProfileComplete(normalized)) {
    return null;
  }

  return normalized;
}

export async function saveDriverVehicleProfile(
  store: KVNamespace,
  profile: DriverVehicleProfile,
): Promise<DriverVehicleProfile> {
  const profileKey = normalizeVehicleProfileKey(profile.profileKey);
  if (!profileKey) {
    throw new Error("Missing profile key");
  }

  const saved: DriverVehicleProfile = {
    ...profile,
    profileKey,
    displayName: profile.displayName.trim() || profileKey,
    email: profile.email.trim().toLowerCase(),
    mobile: profile.mobile?.trim() || undefined,
    make: profile.make.trim(),
    model: profile.model.trim(),
    colour: profile.colour.trim(),
    registration: profile.registration.trim().toUpperCase(),
    updatedAt: new Date().toISOString(),
  };

  await store.put(vehicleKey(saved.profileKey), JSON.stringify(saved), {
    expirationTtl: VEHICLE_TTL,
  });
  await rememberProfileKey(store, saved.profileKey);

  return saved;
}

/**
 * Merge env roster names with profiles already saved in KV so reloads always
 * surface previously saved drivers even if DRIVER_ROSTER changed.
 */
export async function listOwnerVehicleProfileOptions(
  store: KVNamespace,
  rosterNames: string[],
): Promise<VehicleProfileListItem[]> {
  const indexed = await readProfileIndex(store);
  const byKey = new Map<string, VehicleProfileListItem>();

  byKey.set(OWNER_VEHICLE_PROFILE_KEY, {
    profileKey: OWNER_VEHICLE_PROFILE_KEY,
    displayName: "Owner",
    complete: false,
  });

  for (const name of rosterNames) {
    const key = normalizeVehicleProfileKey(name);
    if (!key || key === OWNER_VEHICLE_PROFILE_KEY) {
      continue;
    }
    byKey.set(key, {
      profileKey: key,
      displayName: name.trim(),
      complete: false,
    });
  }

  for (const key of indexed) {
    if (!byKey.has(key)) {
      byKey.set(key, {
        profileKey: key,
        displayName: key === OWNER_VEHICLE_PROFILE_KEY ? "Owner" : key,
        complete: false,
      });
    }
  }

  const items = [...byKey.values()];
  await Promise.all(
    items.map(async (item) => {
      const saved = await getDriverVehicleProfile(store, item.profileKey);
      if (saved) {
        item.displayName =
          saved.displayName?.trim() ||
          (item.profileKey === OWNER_VEHICLE_PROFILE_KEY ? "Owner" : item.displayName);
        item.complete = driverProfileComplete(saved);
      }

      // Owner account profile is the default journey driver — treat it as complete
      // for the owner slot even if only owner:profile exists (mirror may lag).
      if (item.profileKey === OWNER_VEHICLE_PROFILE_KEY && !item.complete) {
        const ownerAccount = await getOwnerAccountProfile(store);
        if (
          ownerAccount &&
          ownerAccountProfileComplete(ownerAccount) &&
          vehicleProfileComplete(ownerAccount)
        ) {
          item.displayName = ownerAccount.displayName?.trim() || "Owner";
          item.complete = true;
        }
      }
    }),
  );

  return items.sort((left, right) => {
    if (left.profileKey === OWNER_VEHICLE_PROFILE_KEY) return -1;
    if (right.profileKey === OWNER_VEHICLE_PROFILE_KEY) return 1;
    return left.displayName.localeCompare(right.displayName);
  });
}

function ownerAccountAsDriverVehicle(
  owner: NonNullable<Awaited<ReturnType<typeof getOwnerAccountProfile>>>,
): DriverVehicleProfile {
  return {
    profileKey: OWNER_VEHICLE_PROFILE_KEY,
    displayName: owner.displayName,
    email: owner.email,
    mobile: owner.mobile,
    make: owner.make,
    model: owner.model,
    colour: owner.colour,
    registration: owner.registration,
    updatedAt: owner.updatedAt,
  };
}

/**
 * Vehicle details for the customer tracking page while live sharing is on.
 * Prefers the active/assigned driver's saved vehicle profile; if that is the
 * owner (or missing), falls back to the Owner account profile so the business
 * owner does not need a duplicate driver profile entry.
 */
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
  if (driverName) {
    const key = normalizeVehicleProfileKey(driverName);
    const profile = await getDriverVehicleProfile(store, driverName);
    if (profile && vehicleProfileComplete(profile)) {
      return profile;
    }

    // Named non-owner driver without a complete profile: do not invent owner vehicle.
    if (key && key !== OWNER_VEHICLE_PROFILE_KEY) {
      return null;
    }
  }

  const ownerVehicle = await getDriverVehicleProfile(store, OWNER_VEHICLE_PROFILE_KEY);
  if (ownerVehicle && vehicleProfileComplete(ownerVehicle)) {
    return ownerVehicle;
  }

  const ownerAccount = await getOwnerAccountProfile(store);
  if (
    ownerAccount &&
    ownerAccountProfileComplete(ownerAccount) &&
    vehicleProfileComplete(ownerAccount)
  ) {
    return ownerAccountAsDriverVehicle(ownerAccount);
  }

  return null;
}
