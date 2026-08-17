/**
 * Regression: driver profile must persist server-side across "logout/login" reloads.
 * Mirrors TRACKING_STORE keys used by workers/addresses/src/driver-vehicle-store.ts.
 * No SumUp / Resend / Calendar calls.
 */
import assert from "node:assert/strict";
import {
  OWNER_VEHICLE_PROFILE_KEY,
  driverProfileComplete,
  vehicleProfileKey,
  type DriverVehicleProfile,
} from "../shared/driver-vehicle";

const VEHICLE_PREFIX = "driver:vehicle:";
const VEHICLE_INDEX_KEY = "driver:vehicle-index";

function normalizeVehicleProfileKey(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase() === OWNER_VEHICLE_PROFILE_KEY) return OWNER_VEHICLE_PROFILE_KEY;
  return vehicleProfileKey(trimmed);
}

function createMemoryStore() {
  const data = new Map<string, string>();
  return {
    async getJson<T>(key: string): Promise<T | null> {
      const raw = data.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    async putJson(key: string, value: unknown): Promise<void> {
      data.set(key, JSON.stringify(value));
    },
  };
}

async function saveProfile(
  store: ReturnType<typeof createMemoryStore>,
  profile: DriverVehicleProfile,
): Promise<DriverVehicleProfile> {
  const profileKey = normalizeVehicleProfileKey(profile.profileKey);
  const saved: DriverVehicleProfile = {
    ...profile,
    profileKey,
    displayName: profile.displayName.trim(),
    email: profile.email.trim().toLowerCase(),
    mobile: profile.mobile?.trim() || undefined,
    make: profile.make.trim(),
    model: profile.model.trim(),
    colour: profile.colour.trim(),
    registration: profile.registration.trim().toUpperCase(),
    updatedAt: new Date().toISOString(),
  };
  await store.putJson(`${VEHICLE_PREFIX}${profileKey}`, saved);
  const index = (await store.getJson<string[]>(VEHICLE_INDEX_KEY)) ?? [];
  if (!index.includes(profileKey)) {
    await store.putJson(VEHICLE_INDEX_KEY, [...index, profileKey]);
  }
  return saved;
}

async function loadProfile(
  store: ReturnType<typeof createMemoryStore>,
  nameOrKey: string,
): Promise<DriverVehicleProfile | null> {
  const key = normalizeVehicleProfileKey(nameOrKey);
  if (!key) return null;
  const record = await store.getJson<DriverVehicleProfile>(`${VEHICLE_PREFIX}${key}`);
  if (!record) return null;
  return { ...record, profileKey: record.profileKey || key };
}

function shouldShowSetupPrompt(complete: boolean): boolean {
  return !complete;
}

/** What the dashboard form would bind after a successful GET. */
function prefillForm(profile: DriverVehicleProfile) {
  return {
    displayName: profile.displayName,
    email: profile.email,
    mobile: profile.mobile ?? "",
    make: profile.make,
    model: profile.model,
    colour: profile.colour,
    registration: profile.registration,
  };
}

async function run() {
  const store = createMemoryStore();

  // 1) create/save
  const saved = await saveProfile(store, {
    profileKey: "owner",
    displayName: "Chris",
    email: "chris@example.com",
    mobile: "07700900111",
    make: "Skoda",
    model: "Superb",
    colour: "Black",
    registration: "abc 1234",
    updatedAt: new Date().toISOString(),
  });
  assert.equal(saved.profileKey, "owner");
  assert.ok(driverProfileComplete(saved));

  // 2) reload / log out and back in (new reads only — no React/local state)
  const reloaded = await loadProfile(store, "owner");
  assert.ok(reloaded, "saved profile must be returned after reload");

  // 3) returned from storage
  assert.equal(reloaded.email, "chris@example.com");
  assert.equal(reloaded.make, "Skoda");
  assert.equal(reloaded.registration, "ABC 1234");

  // 4) fields pre-populated
  const form = prefillForm(reloaded);
  assert.equal(form.displayName, "Chris");
  assert.equal(form.mobile, "07700900111");
  assert.equal(form.registration, "ABC 1234");

  // 5) dashboard does not request setup again
  assert.equal(shouldShowSetupPrompt(driverProfileComplete(reloaded)), false);

  // 6) update persists after another reload
  await saveProfile(store, {
    ...reloaded,
    colour: "Silver",
    registration: "XYZ 9876",
  });
  const afterUpdate = await loadProfile(store, "owner");
  assert.ok(afterUpdate);
  assert.equal(afterUpdate.colour, "Silver");
  assert.equal(afterUpdate.registration, "XYZ 9876");
  assert.equal(afterUpdate.email, "chris@example.com");
  assert.equal(shouldShowSetupPrompt(driverProfileComplete(afterUpdate)), false);

  // Same key upsert — index has a single owner entry
  const index = (await store.getJson<string[]>(VEHICLE_INDEX_KEY)) ?? [];
  assert.equal(index.filter((key) => key === "owner").length, 1);

  // Named driver key normalization survives reload via display name lookup
  await saveProfile(store, {
    profileKey: "driver",
    displayName: "Driver",
    email: "driver@example.com",
    make: "Toyota",
    model: "Corolla",
    colour: "White",
    registration: "NIZ 1",
    updatedAt: new Date().toISOString(),
  });
  const byDisplayName = await loadProfile(store, "Driver");
  assert.ok(byDisplayName);
  assert.equal(byDisplayName.profileKey, "driver");
  assert.equal(byDisplayName.make, "Toyota");

  console.log("check-driver-profile-persist: ok");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
