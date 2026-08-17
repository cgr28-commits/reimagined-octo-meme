/**
 * Owner account profile store — separate from driver vehicle profiles.
 * KV: owner:profile (primary). Migrates once from legacy driver:vehicle:owner.
 */

import {
  OWNER_ACCOUNT_PROFILE_KEY,
  ownerAccountProfileComplete,
  type OwnerAccountProfile,
} from "../shared/owner-profile";
import {
  OWNER_VEHICLE_PROFILE_KEY,
  type DriverVehicleProfile,
} from "../shared/driver-vehicle";

const OWNER_PROFILE_KEY = "owner:profile";
/** Legacy key used when owner details were stored as a driver vehicle profile. */
const LEGACY_OWNER_VEHICLE_KEY = `driver:vehicle:${OWNER_VEHICLE_PROFILE_KEY}`;
const OWNER_PROFILE_TTL = 60 * 60 * 24 * 365 * 5;

function normalizeOwnerProfile(
  record: Partial<OwnerAccountProfile> | null | undefined,
): OwnerAccountProfile | null {
  if (!record) {
    return null;
  }

  const profile: OwnerAccountProfile = {
    profileKey: OWNER_ACCOUNT_PROFILE_KEY,
    displayName: String(record.displayName ?? "").trim(),
    email: String(record.email ?? "").trim().toLowerCase(),
    make: String(record.make ?? "").trim(),
    model: String(record.model ?? "").trim(),
    colour: String(record.colour ?? "").trim(),
    registration: String(record.registration ?? "").trim().toUpperCase(),
    updatedAt: String(record.updatedAt ?? new Date(0).toISOString()),
    ...(String(record.mobile ?? "").trim()
      ? { mobile: String(record.mobile).trim() }
      : {}),
  };

  if (!profile.email && !ownerAccountProfileComplete(profile)) {
    return null;
  }

  return profile;
}

function fromLegacyDriverVehicle(
  legacy: DriverVehicleProfile | null,
): OwnerAccountProfile | null {
  if (!legacy) {
    return null;
  }
  return normalizeOwnerProfile({
    profileKey: OWNER_ACCOUNT_PROFILE_KEY,
    displayName: legacy.displayName,
    email: legacy.email,
    mobile: legacy.mobile,
    make: legacy.make,
    model: legacy.model,
    colour: legacy.colour,
    registration: legacy.registration,
    updatedAt: legacy.updatedAt,
  });
}

export async function getOwnerAccountProfile(
  store: KVNamespace,
): Promise<OwnerAccountProfile | null> {
  const primary = normalizeOwnerProfile(
    await store.get<OwnerAccountProfile>(OWNER_PROFILE_KEY, "json"),
  );
  if (primary && ownerAccountProfileComplete(primary)) {
    return primary;
  }

  // One-time migration from legacy driver:vehicle:owner
  const legacy = fromLegacyDriverVehicle(
    await store.get<DriverVehicleProfile>(LEGACY_OWNER_VEHICLE_KEY, "json"),
  );
  if (!legacy || !ownerAccountProfileComplete(legacy)) {
    return primary;
  }

  await store.put(OWNER_PROFILE_KEY, JSON.stringify(legacy), {
    expirationTtl: OWNER_PROFILE_TTL,
  });
  return legacy;
}

export async function saveOwnerAccountProfile(
  store: KVNamespace,
  input: Omit<OwnerAccountProfile, "profileKey" | "updatedAt"> & {
    updatedAt?: string;
  },
): Promise<OwnerAccountProfile> {
  const saved = normalizeOwnerProfile({
    profileKey: OWNER_ACCOUNT_PROFILE_KEY,
    displayName: input.displayName,
    email: input.email,
    mobile: input.mobile,
    make: input.make,
    model: input.model,
    colour: input.colour,
    registration: input.registration,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  });

  if (!saved || !ownerAccountProfileComplete(saved)) {
    throw new Error("Owner profile is incomplete");
  }

  saved.updatedAt = new Date().toISOString();

  await store.put(OWNER_PROFILE_KEY, JSON.stringify(saved), {
    expirationTtl: OWNER_PROFILE_TTL,
  });

  // Keep legacy key in sync so older code paths / customer vehicle lookup still work
  // if the owner also drives under the "owner" vehicle slot — but owner:profile is primary.
  const legacyMirror: DriverVehicleProfile = {
    profileKey: OWNER_VEHICLE_PROFILE_KEY,
    displayName: saved.displayName,
    email: saved.email,
    mobile: saved.mobile,
    make: saved.make,
    model: saved.model,
    colour: saved.colour,
    registration: saved.registration,
    updatedAt: saved.updatedAt,
  };
  await store.put(LEGACY_OWNER_VEHICLE_KEY, JSON.stringify(legacyMirror), {
    expirationTtl: OWNER_PROFILE_TTL,
  });

  return saved;
}

export { OWNER_PROFILE_KEY, LEGACY_OWNER_VEHICLE_KEY };
