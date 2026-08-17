/** Business/account holder profile — separate from driver journey profiles. */

export type OwnerAccountProfile = {
  /** Always "owner" — stable primary key for the account holder. */
  profileKey: "owner";
  displayName: string;
  email: string;
  mobile?: string;
  make: string;
  model: string;
  colour: string;
  registration: string;
  updatedAt: string;
};

export const OWNER_ACCOUNT_PROFILE_KEY = "owner" as const;

export function ownerAccountProfileComplete(
  profile: Pick<
    OwnerAccountProfile,
    "displayName" | "email" | "make" | "model" | "colour" | "registration"
  >,
): boolean {
  return [
    profile.displayName,
    profile.email,
    profile.make,
    profile.model,
    profile.colour,
    profile.registration,
  ].every((value) => Boolean(value?.trim()));
}
