import { formatPartialRegistration } from "./partial-registration";

export type DriverVehicleProfile = {
  profileKey: string;
  displayName: string;
  email: string;
  /** Driver mobile for assignment/ops — never included in customer email or WhatsApp copy. */
  mobile?: string;
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
  /** Privacy-safe partial registration only — never the full plate. */
  registration: string;
  /** First name only when provided. */
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

/** Profile ready to assign to a booking (includes contact details). */
export function driverProfileComplete(profile: DriverVehicleProfile): boolean {
  return (
    Boolean(profile.displayName?.trim()) &&
    Boolean(profile.email?.trim()) &&
    Boolean(profile.mobile?.trim()) &&
    vehicleProfileComplete(profile)
  );
}

/** Soft complete for vehicle-only checks (legacy); prefer driverProfileComplete for assign. */
export function driverProfileVehicleComplete(profile: DriverVehicleProfile): boolean {
  return (
    Boolean(profile.displayName?.trim()) &&
    Boolean(profile.email?.trim()) &&
    vehicleProfileComplete(profile)
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDriverProfileConfirmationEmail(
  profile: DriverVehicleProfile,
  businessName: string,
  _dashboardUrl?: string,
): { subject: string; text: string; html: string } {
  const name = profile.displayName.trim();
  const subject = `Your ${businessName} driver profile`;

  const text =
    `Hi ${name},\n\n` +
    `Your driver profile for ${businessName} has been saved:\n\n` +
    `Name: ${name}\n` +
    `Email: ${profile.email.trim()}\n` +
    (profile.mobile?.trim() ? `Mobile: ${profile.mobile.trim()}\n` : "") +
    `Vehicle: ${profile.colour.trim()} ${profile.make.trim()} ${profile.model.trim()}\n` +
    `Registration: ${profile.registration.trim().toUpperCase()}\n\n` +
    `You do not need a password. When you are assigned a job, we email you a private link to accept it and open My Jobs. That page shows only your journeys.\n\n` +
    `${businessName}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1a2b3c;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#0b1f33;padding:28px 32px;text-align:center;">
              <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#c9a227;font-weight:bold;">Driver profile saved</div>
              <div style="margin-top:8px;font-size:22px;line-height:1.35;color:#ffffff;font-weight:bold;">Hi ${escapeHtml(name)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-size:15px;line-height:1.7;color:#334155;">
              <p style="margin:0 0 16px;">Your driver profile for ${escapeHtml(businessName)} has been saved with the details below.</p>
              <p style="margin:0 0 16px;">You do not need a password. When you are assigned a job, we email you a private link to accept it and open My Jobs. That page shows only your journeys.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
                <tr><td style="padding:16px 24px;font-size:14px;line-height:1.8;color:#475569;">
                  <strong>Name:</strong> ${escapeHtml(name)}<br />
                  <strong>Email:</strong> ${escapeHtml(profile.email.trim())}<br />
                  ${
                    profile.mobile?.trim()
                      ? `<strong>Mobile:</strong> ${escapeHtml(profile.mobile.trim())}<br />`
                      : ""
                  }
                  <strong>Vehicle:</strong> ${escapeHtml(profile.colour.trim())} ${escapeHtml(profile.make.trim())} ${escapeHtml(profile.model.trim())}<br />
                  <strong>Registration:</strong> ${escapeHtml(profile.registration.trim().toUpperCase())}
                </td></tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export type SavedProfileAssignmentDecision =
  | { ok: true; profile: DriverVehicleProfile }
  | { ok: false; error: string };

/** Fields taken from the saved profile, not from the assignment request body. */
export function assignmentIdentityFromProfile(profile: DriverVehicleProfile): {
  driverFirstName: string;
  driverEmail: string;
  driverMobile: string;
  driverCarMake: string;
  driverCarModel: string;
  driverCarColour: string;
  driverReg: string;
  driverProfileKey: string;
} {
  return {
    driverFirstName: profile.displayName.trim(),
    driverEmail: profile.email.trim().toLowerCase(),
    driverMobile: profile.mobile?.trim() || "",
    driverCarMake: profile.make.trim(),
    driverCarModel: profile.model.trim(),
    driverCarColour: profile.colour.trim(),
    driverReg: profile.registration.trim().toUpperCase(),
    driverProfileKey: profile.profileKey,
  };
}

/**
 * A supplied profile key must belong to the same person as the supplied email.
 * A mismatch does not return a profile, so no My Jobs link can be minted for it.
 */
export function savedProfileAssignmentDecision(input: {
  requestedProfileKey: string;
  loadedProfile: DriverVehicleProfile | null;
  suppliedEmail: string;
}): SavedProfileAssignmentDecision {
  const requested = input.requestedProfileKey.trim();
  const profile = input.loadedProfile;
  if (!requested || !profile || profile.profileKey !== requested || !driverProfileComplete(profile)) {
    return {
      ok: false,
      error:
        "That saved driver profile could not be used for this assignment. No My Jobs link was created.",
    };
  }
  const supplied = input.suppliedEmail.trim().toLowerCase();
  const profileEmail = profile.email.trim().toLowerCase();
  if (!supplied || supplied !== profileEmail) {
    return {
      ok: false,
      error:
        "That email does not belong to the selected driver profile. No My Jobs link was created.",
    };
  }
  return { ok: true, profile };
}

/** Customer-facing vehicle card — partial registration only; never includes driver mobile. */
export function toCustomerVehicleDetails(
  profile: DriverVehicleProfile,
): CustomerVehicleDetails {
  const firstName = profile.displayName.trim().split(/\s+/)[0] || undefined;
  return {
    make: profile.make.trim(),
    model: profile.model.trim(),
    colour: profile.colour.trim(),
    registration: formatPartialRegistration(profile.registration),
    driverName: firstName,
  };
}
