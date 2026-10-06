/**
 * Owner can add a saved driver from the dashboard without DRIVER_ROSTER.
 * Create mode must not overwrite an existing profile.
 * Run: npx tsx scripts/check-add-driver.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assignmentIdentityFromProfile,
  buildDriverProfileConfirmationEmail,
  driverProfileComplete,
  savedProfileAssignmentDecision,
} from "../shared/driver-vehicle";
import { handleDriverVehicleProfilesRequest, handleDriverVehicleSaveRequest } from "../workers/addresses/src/driver-vehicle-handlers";
import {
  getDriverVehicleProfile,
  listOwnerVehicleProfileOptions,
} from "../workers/addresses/src/driver-vehicle-store";

const REQUIRED = "Name, email, mobile, make, model, colour, and registration are all required";
const NAME_EXISTS = "A driver with that name already exists. Edit the existing driver instead.";
const EMAIL_USED = "That email address is already used by another driver.";

function memoryKv() {
  const data = new Map<string, string>();
  const store = {
    async get(key: string, type?: string) {
      const raw = data.get(key);
      if (raw == null) return null;
      if (type === "json") return JSON.parse(raw) as unknown;
      return raw;
    },
    async put(key: string, value: string) {
      data.set(key, value);
    },
    async delete(key: string) {
      data.delete(key);
    },
  };
  return { data, store };
}

function envFor(store: ReturnType<typeof memoryKv>["store"]) {
  return {
    OWNER_ACCESS_KEY: "owner-secret",
    DRIVER_ACCESS_KEY: "driver-secret",
    DRIVER_NAME: "Pat Driver",
    DRIVER_ROSTER: "Pat Driver",
    TRACKING_STORE: store,
  } as Parameters<typeof handleDriverVehicleSaveRequest>[1];
}

function post(
  body: Record<string, unknown>,
  headers: Record<string, string> = { "X-Owner-Key": "owner-secret" },
) {
  return new Request("https://worker.test/driver/vehicle", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const john = {
  displayName: "John Smith",
  email: "John.Smith@Example.com",
  mobile: "07700 900111",
  make: "Skoda",
  model: "Superb",
  colour: "Black",
  registration: "ab12 cde",
};

const ownerProfile = {
  profile: "owner",
  displayName: "Chris Owner",
  email: "chris@example.com",
  mobile: "07700 900000",
  make: "Mercedes-Benz",
  model: "E-Class",
  colour: "Silver",
  registration: "own 1",
};

function keysOf(data: Map<string, string>): string[] {
  return [...data.keys()].sort();
}

void (async () => {
  console.log("=== 1. Owner creates a driver who is not on DRIVER_ROSTER ===");
  const { data, store } = memoryKv();
  const env = envFor(store);

  const ownerSaved = await handleDriverVehicleSaveRequest(post(ownerProfile), env, null);
  assert.equal(ownerSaved.status, 200);
  const ownerRaw = data.get("driver:vehicle:owner");
  assert.ok(ownerRaw);

  const created = await handleDriverVehicleSaveRequest(
    post({ createNew: true, profile: "owner", ...john }),
    env,
    null,
  );
  assert.equal(created.status, 200);
  const createdBody = (await created.json()) as {
    ok: boolean;
    complete: boolean;
    emailSent: boolean;
    emailWarning?: string;
    profile: {
      profileKey: string;
      displayName: string;
      email: string;
      mobile: string;
      make: string;
      model: string;
      colour: string;
      registration: string;
    };
  };
  assert.equal(createdBody.ok, true);
  assert.equal(createdBody.complete, true);
  assert.equal(createdBody.profile.profileKey, "john-smith");
  assert.equal(createdBody.profile.email, "john.smith@example.com");
  assert.equal(createdBody.profile.registration, "AB12 CDE");
  assert.equal(createdBody.emailSent, false);
  assert.ok(createdBody.emailWarning);
  assert.equal(data.get("driver:vehicle:owner"), ownerRaw, "Owner profile bytes unchanged");

  console.log("\n=== 2. Saved driver survives listing through the profile index ===");
  const listed = await listOwnerVehicleProfileOptions(store as never, []);
  const johnListed = listed.find((entry) => entry.profileKey === "john-smith");
  assert.ok(johnListed);
  assert.equal(johnListed.complete, true);
  assert.equal(johnListed.displayName, "John Smith");
  const ownerListed = listed.find((entry) => entry.profileKey === "owner");
  assert.ok(ownerListed);
  assert.equal(ownerListed.displayName, "Chris Owner");

  const profilesResponse = await handleDriverVehicleProfilesRequest(
    new Request("https://worker.test/driver/vehicle/profiles", {
      headers: { "X-Owner-Key": "owner-secret" },
    }),
    env,
    null,
  );
  assert.equal(profilesResponse.status, 200);
  const profilesBody = (await profilesResponse.json()) as {
    profiles: Array<{ profileKey: string; complete: boolean }>;
  };
  assert.ok(profilesBody.profiles.some((entry) => entry.profileKey === "john-smith" && entry.complete));
  assert.equal(env.DRIVER_ROSTER?.includes("John"), false);

  const reloaded = await getDriverVehicleProfile(store as never, "john-smith");
  assert.ok(reloaded);
  assert.equal(reloaded.email, "john.smith@example.com");
  assert.equal(reloaded.registration, "AB12 CDE");
  assert.equal(reloaded.mobile, "07700 900111");
  assert.equal(driverProfileComplete(reloaded), true);

  console.log("\n=== 3. Mobile and the other required fields are enforced ===");
  const beforeMissing = keysOf(data);
  const missingMobile = await handleDriverVehicleSaveRequest(
    post({
      createNew: true,
      displayName: "No Mobile",
      email: "nomobile@example.com",
      make: "Ford",
      model: "Focus",
      colour: "Blue",
      registration: "NM1 MOB",
    }),
    env,
    null,
  );
  assert.equal(missingMobile.status, 400);
  const missingBody = (await missingMobile.json()) as { error: string };
  assert.equal(missingBody.error, REQUIRED);
  assert.deepEqual(keysOf(data), beforeMissing);

  console.log("\n=== 4. Duplicate normalised name is rejected and does not overwrite ===");
  const johnRaw = data.get("driver:vehicle:john-smith");
  const duplicate = await handleDriverVehicleSaveRequest(
    post({
      createNew: true,
      profile: "someone-else",
      displayName: "  JOHN   SMITH ",
      email: "other.john@example.com",
      mobile: "07700 900222",
      make: "Audi",
      model: "A6",
      colour: "White",
      registration: "ZZ99 ZZZ",
    }),
    env,
    null,
  );
  assert.equal(duplicate.status, 409);
  const duplicateBody = (await duplicate.json()) as { error: string };
  assert.equal(duplicateBody.error, NAME_EXISTS);
  assert.equal(data.get("driver:vehicle:john-smith"), johnRaw);
  assert.equal(data.has("driver:vehicle:someone-else"), false);

  console.log("\n=== 5. Duplicate email belonging to another driver is rejected ===");
  const clash = await handleDriverVehicleSaveRequest(
    post({
      createNew: true,
      displayName: "Jane Jones",
      email: "JOHN.SMITH@example.com",
      mobile: "07700 900333",
      make: "Toyota",
      model: "Prius",
      colour: "Grey",
      registration: "JJ1 JJJ",
    }),
    env,
    null,
  );
  assert.equal(clash.status, 409);
  const clashBody = (await clash.json()) as { error: string };
  assert.equal(clashBody.error, EMAIL_USED);
  assert.equal(data.has("driver:vehicle:jane-jones"), false);
  assert.equal(data.get("driver:vehicle:john-smith"), johnRaw);

  const editClash = await handleDriverVehicleSaveRequest(
    post({
      profile: "john-smith",
      displayName: "John Smith",
      email: "chris@example.com",
      mobile: "07700 900111",
      make: "Skoda",
      model: "Superb",
      colour: "Black",
      registration: "AB12 CDE",
    }),
    env,
    null,
  );
  assert.equal(editClash.status, 409);
  assert.equal((await editClash.json() as { error: string }).error, EMAIL_USED);
  assert.equal(data.get("driver:vehicle:john-smith"), johnRaw);
  assert.equal(data.get("driver:vehicle:owner"), ownerRaw);

  console.log("\n=== 6. Editing the same driver with its existing email keeps the profile key ===");
  const edited = await handleDriverVehicleSaveRequest(
    post({
      profile: "john-smith",
      displayName: "John Smyth",
      email: "John.Smith@Example.com",
      mobile: "07700 900111",
      make: "Skoda",
      model: "Superb",
      colour: "Blue",
      registration: "ab12 cde",
    }),
    env,
    null,
  );
  assert.equal(edited.status, 200);
  const editedBody = (await edited.json()) as {
    profile: { profileKey: string; displayName: string; email: string; colour: string };
  };
  assert.equal(editedBody.profile.profileKey, "john-smith");
  assert.equal(editedBody.profile.displayName, "John Smyth");
  assert.equal(editedBody.profile.email, "john.smith@example.com");
  assert.equal(editedBody.profile.colour, "Blue");
  assert.equal(data.has("driver:vehicle:john-smyth"), false);
  const editedStored = await getDriverVehicleProfile(store as never, "john-smith");
  assert.equal(editedStored?.displayName, "John Smyth");
  assert.equal(editedStored?.profileKey, "john-smith");

  console.log("\n=== 7. A driver or non-owner cannot use createNew ===");
  const beforeUnauthorised = keysOf(data);
  const johnBeforeSession = data.get("driver:vehicle:john-smith");
  const asDriver = await handleDriverVehicleSaveRequest(
    post(
      {
        createNew: true,
        displayName: "New Driver",
        email: "new.driver@example.com",
        mobile: "07700 900444",
        make: "VW",
        model: "Passat",
        colour: "Black",
        registration: "ND1 NEW",
      },
      { "X-Driver-Key": "driver-secret" },
    ),
    env,
    null,
  );
  assert.equal(asDriver.status, 401);

  const asSession = await handleDriverVehicleSaveRequest(
    post(
      {
        createNew: true,
        displayName: "Session Driver",
        email: "session.driver@example.com",
        mobile: "07700 900555",
        make: "VW",
        model: "Golf",
        colour: "Red",
        registration: "SD1 NEW",
      },
      { "X-Owner-Key": "owner-secret", "X-Driver-Session": "portal-session" },
    ),
    env,
    null,
  );
  assert.equal(asSession.status, 401);
  assert.deepEqual(keysOf(data), beforeUnauthorised);
  assert.equal(data.get("driver:vehicle:john-smith"), johnBeforeSession);

  console.log("\n=== 8. The new driver is a complete assignable profile ===");
  const assignable = await getDriverVehicleProfile(store as never, "John Smith");
  assert.ok(assignable);
  assert.equal(driverProfileComplete(assignable), true);
  const decision = savedProfileAssignmentDecision({
    requestedProfileKey: "john-smith",
    loadedProfile: assignable,
    suppliedEmail: assignable.email,
  });
  assert.equal(decision.ok, true);
  const identity = assignmentIdentityFromProfile(assignable);
  assert.equal(identity.driverFirstName, "John Smyth");
  assert.equal(identity.driverEmail, "john.smith@example.com");
  assert.equal(identity.driverMobile, "07700 900111");
  assert.equal(identity.driverCarMake, "Skoda");
  assert.equal(identity.driverCarModel, "Superb");
  assert.equal(identity.driverCarColour, "Blue");
  assert.equal(identity.driverReg, "AB12 CDE");
  assert.equal(identity.driverProfileKey, "john-smith");

  const confirmation = buildDriverProfileConfirmationEmail(assignable, "My Airport Taxi NI");
  assert.match(confirmation.text, /do not need a password/i);
  assert.match(confirmation.text, /private link/i);
  assert.match(confirmation.text, /My Jobs/);
  assert.match(confirmation.text, /only your journeys/i);
  assert.doesNotMatch(confirmation.text + confirmation.html, /owner-secret|API key|SumUp|customer fare/i);

  console.log("\n=== 9. UI and save route keep create mode explicit ===");
  const root = process.cwd();
  const page = readFileSync(join(root, "src/app/driver/DriverPageClient.tsx"), "utf8");
  const api = readFileSync(join(root, "src/lib/tracking-api.ts"), "utf8");
  const handler = readFileSync(join(root, "workers/addresses/src/driver-vehicle-handlers.ts"), "utf8");
  assert.match(page, /\+ Add driver/);
  assert.match(page, /Save driver/);
  assert.match(page, /Cancel/);
  assert.match(page, /createNew: true/);
  assert.match(page, /Additional drivers \(optional\)/);
  assert.match(api, /createNew\?: boolean/);
  assert.match(handler, /createNew === true/);
  assert.match(handler, /ownerAuthorized/);
  assert.match(handler, /A driver with that name already exists/);
  assert.match(handler, /That email address is already used by another driver/);
  assert.match(handler, /Name, email, mobile, make, model, colour, and registration are all required/);
  assert.doesNotMatch(
    handler,
    /Name, email, make, model, colour, and registration are all required/,
  );
  assert.match(handler, /sendDriverProfileEmail/);

  const ownerNamed = await handleDriverVehicleSaveRequest(
    post({
      createNew: true,
      profile: "john-smith",
      displayName: "Owner",
      email: "new.owner@example.com",
      mobile: "07700 900999",
      make: "BMW",
      model: "5 Series",
      colour: "Black",
      registration: "OWN 2",
    }),
    env,
    null,
  );
  assert.equal(ownerNamed.status, 400);
  assert.match(
    ((await ownerNamed.json()) as { error: string }).error,
    /Owner profile is separate/,
  );
  assert.equal(data.get("driver:vehicle:owner"), ownerRaw);

  const ownerAfter = await getDriverVehicleProfile(store as never, "owner");
  assert.equal(ownerAfter?.displayName, "Chris Owner");
  assert.equal(ownerAfter?.email, "chris@example.com");
  assert.equal(ownerAfter?.registration, "OWN 1");
  assert.equal(data.get("driver:vehicle:owner"), ownerRaw);

  console.log("\nAll add-driver checks passed.");
})();
