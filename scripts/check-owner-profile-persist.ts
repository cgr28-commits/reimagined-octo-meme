/**
 * Regression: OWNER account profile persists across logout/login.
 * Primary KV key: owner:profile (separate from driver:vehicle:*).
 * Also verifies one-time migration from legacy driver:vehicle:owner.
 */
import assert from "node:assert/strict";
import {
  OWNER_ACCOUNT_PROFILE_KEY,
  ownerAccountProfileComplete,
  type OwnerAccountProfile,
} from "../shared/owner-profile";

const OWNER_PROFILE_KEY = "owner:profile";
const LEGACY_OWNER_VEHICLE_KEY = "driver:vehicle:owner";

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
    has(key: string): boolean {
      return data.has(key);
    },
  };
}

type Store = ReturnType<typeof createMemoryStore>;

function normalize(input: Partial<OwnerAccountProfile>): OwnerAccountProfile | null {
  const profile: OwnerAccountProfile = {
    profileKey: OWNER_ACCOUNT_PROFILE_KEY,
    displayName: String(input.displayName ?? "").trim(),
    email: String(input.email ?? "").trim().toLowerCase(),
    make: String(input.make ?? "").trim(),
    model: String(input.model ?? "").trim(),
    colour: String(input.colour ?? "").trim(),
    registration: String(input.registration ?? "").trim().toUpperCase(),
    updatedAt: String(input.updatedAt ?? new Date().toISOString()),
    ...(String(input.mobile ?? "").trim() ? { mobile: String(input.mobile).trim() } : {}),
  };
  if (!ownerAccountProfileComplete(profile)) {
    return null;
  }
  return profile;
}

async function saveOwner(
  store: Store,
  input: Omit<OwnerAccountProfile, "profileKey" | "updatedAt">,
): Promise<OwnerAccountProfile> {
  const saved = normalize({ ...input, profileKey: OWNER_ACCOUNT_PROFILE_KEY });
  assert.ok(saved, "owner profile incomplete");
  saved.updatedAt = new Date().toISOString();
  await store.putJson(OWNER_PROFILE_KEY, saved);
  await store.putJson(LEGACY_OWNER_VEHICLE_KEY, { ...saved, profileKey: "owner" });
  return saved;
}

async function loadOwner(store: Store): Promise<OwnerAccountProfile | null> {
  const rawPrimary = await store.getJson<OwnerAccountProfile>(OWNER_PROFILE_KEY);
  const primary = normalize(rawPrimary ?? {});
  if (primary && ownerAccountProfileComplete(primary)) {
    return primary;
  }

  const legacy = await store.getJson<{
    displayName?: string;
    email?: string;
    mobile?: string;
    make?: string;
    model?: string;
    colour?: string;
    registration?: string;
    updatedAt?: string;
  }>(LEGACY_OWNER_VEHICLE_KEY);

  const migrated = normalize({
    profileKey: OWNER_ACCOUNT_PROFILE_KEY,
    displayName: legacy?.displayName,
    email: legacy?.email,
    mobile: legacy?.mobile,
    make: legacy?.make,
    model: legacy?.model,
    colour: legacy?.colour,
    registration: legacy?.registration,
    updatedAt: legacy?.updatedAt,
  });
  if (!migrated) {
    return primary;
  }
  await store.putJson(OWNER_PROFILE_KEY, migrated);
  return migrated;
}

function shouldAskSetup(complete: boolean): boolean {
  return !complete;
}

function prefill(profile: OwnerAccountProfile) {
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

  // 1) Save owner profile
  const saved = await saveOwner(store, {
    displayName: "Chris Owner",
    email: "chris@myairporttaxini.co.uk",
    mobile: "07700900111",
    make: "Skoda",
    model: "Superb",
    colour: "Black",
    registration: "abc 1234",
  });
  assert.equal(saved.profileKey, "owner");
  assert.ok(store.has(OWNER_PROFILE_KEY), "must store under owner:profile");

  // 2) Reload page — fresh read, no React/localStorage state
  let loaded = await loadOwner(store);
  assert.ok(loaded);

  // 3–4) Log out / log back in — another fresh read from the same server store
  loaded = await loadOwner(store);

  // 5) Owner profile returned
  assert.ok(loaded);
  assert.equal(loaded.email, "chris@myairporttaxini.co.uk");

  // 6) Fields pre-populated
  const form = prefill(loaded);
  assert.equal(form.displayName, "Chris Owner");
  assert.equal(form.registration, "ABC 1234");
  assert.equal(form.make, "Skoda");

  // 7) Dashboard does not ask for setup again
  assert.equal(shouldAskSetup(ownerAccountProfileComplete(loaded)), false);

  // 8) Update profile
  await saveOwner(store, {
    displayName: loaded.displayName,
    email: loaded.email,
    mobile: loaded.mobile,
    make: loaded.make,
    model: loaded.model,
    colour: "Silver",
    registration: "XYZ 9876",
  });

  // 9–10) Reload/login again — updated owner profile persists
  const afterUpdate = await loadOwner(store);
  assert.ok(afterUpdate);
  assert.equal(afterUpdate.colour, "Silver");
  assert.equal(afterUpdate.registration, "XYZ 9876");
  assert.equal(afterUpdate.email, "chris@myairporttaxini.co.uk");
  assert.equal(shouldAskSetup(ownerAccountProfileComplete(afterUpdate)), false);

  // Owner model stays separate from driver profiles
  await store.putJson("driver:vehicle:driver", {
    profileKey: "driver",
    displayName: "Driver",
    email: "driver@example.com",
    make: "Toyota",
    model: "Corolla",
    colour: "White",
    registration: "NIZ 1",
    updatedAt: new Date().toISOString(),
  });
  const ownerAgain = await loadOwner(store);
  assert.equal(ownerAgain?.displayName, "Chris Owner");
  assert.notEqual(ownerAgain?.make, "Toyota");

  // Migration: legacy-only store still restores owner profile into owner:profile
  const legacyOnly = createMemoryStore();
  await legacyOnly.putJson(LEGACY_OWNER_VEHICLE_KEY, {
    profileKey: "owner",
    displayName: "Legacy Owner",
    email: "legacy@example.com",
    make: "BMW",
    model: "5 Series",
    colour: "Blue",
    registration: "LEG 1",
    updatedAt: new Date().toISOString(),
  });
  const migrated = await loadOwner(legacyOnly);
  assert.ok(migrated);
  assert.equal(migrated.displayName, "Legacy Owner");
  assert.ok(legacyOnly.has(OWNER_PROFILE_KEY), "migration writes owner:profile");

  console.log("check-owner-profile-persist: ok");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
