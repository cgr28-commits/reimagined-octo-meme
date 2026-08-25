export type DriverVehicleProfile = {
  profileKey: string;
  displayName: string;
  email: string;
  /** Driver mobile for customer WhatsApp details (not shown as email to customers). */
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
  registration: string;
  driverName?: string;
  /** Revealed to the customer only after Driver on the way is recorded. */
  mobile?: string;
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

export function driverProfileComplete(profile: DriverVehicleProfile): boolean {
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
    `You do not need a login or access key. When you are assigned a job, we will email you the trip details and your pay for that journey.\n\n` +
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
              <p style="margin:0 0 16px;">You do not need a login or access key. When you are assigned a job, we will email you the trip details and your pay for that journey.</p>
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

export function toCustomerVehicleDetails(
  profile: DriverVehicleProfile,
): CustomerVehicleDetails {
  return {
    make: profile.make.trim(),
    model: profile.model.trim(),
    colour: profile.colour.trim(),
    registration: profile.registration.trim().toUpperCase(),
    driverName: profile.displayName,
    mobile: profile.mobile?.trim() || undefined,
  };
}
