export type DriverVehicleProfile = {
  profileKey: string;
  displayName: string;
  make: string;
  model: string;
  colour: string;
  registration: string;
  updatedAt: string;
};

export type CustomerVehicleDetails = {
  make: string;
  model: string;
  colour: string;
  registration: string;
  driverName?: string;
};

export const OWNER_VEHICLE_PROFILE_KEY = "owner";

export function vehicleProfileKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

export function vehicleProfileComplete(
  profile: Pick<DriverVehicleProfile, "make" | "model" | "colour" | "registration">,
): boolean {
  return [profile.make, profile.model, profile.colour, profile.registration].every(
    (value) => Boolean(value?.trim()),
  );
}

export function toCustomerVehicleDetails(
  profile: DriverVehicleProfile,
): CustomerVehicleDetails {
  return {
    make: profile.make.trim(),
    model: profile.model.trim(),
    colour: profile.colour.trim(),
    registration: profile.registration.trim().toUpperCase(),
    driverName: profile.displayName,
  };
}
