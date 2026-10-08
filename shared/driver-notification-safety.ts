/**
 * Driver emails use the assignment that exists at dispatch, not the one that
 * was current when the email was queued. A message already accepted by the
 * email provider cannot be recalled.
 */

import { BUSINESS_NAME } from "./business-email";
import {
  journeyReminderDriverKey,
  resolveJourneyReminderContact,
  type JourneyReminderInput,
} from "./journey-reminder";
import type {
  AssignmentAuditEntry,
  DriverNotificationAuditEntry,
  TrackingJobRecord,
} from "./tracking";

const AUDIT_LIMIT = 40;

export type DriverEmailKind = "assignment_invite" | "journey_reminder";

export type DriverDispatchIntent = {
  kind: DriverEmailKind;
  assignmentVersion: number;
  driverEmail: string;
  acceptToken?: string;
};

export type LiveDriverAssignment = {
  assignmentVersion?: number | null;
  assignmentStatus?: string | null;
  assignedDriverEmail?: string | null;
  assignedDriverName?: string | null;
  acceptToken?: string | null;
};

export function assignmentVersionOf(version: number | null | undefined): number {
  const value = Number(version);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function noteAssignmentChange(
  job: TrackingJobRecord,
  input: {
    action: AssignmentAuditEntry["action"];
    at: string;
    driverName?: string | null;
    driverEmail?: string | null;
    profileKey?: string | null;
  },
): number {
  const assignmentVersion = assignmentVersionOf(job.assignmentVersion) + 1;
  job.assignmentVersion = assignmentVersion;
  const entry: AssignmentAuditEntry = {
    at: input.at,
    action: input.action,
    assignmentVersion,
    ...(input.driverName?.trim() ? { driverName: input.driverName.trim() } : {}),
    ...(input.driverEmail?.trim() ? { driverEmail: input.driverEmail.trim().toLowerCase() } : {}),
    ...(input.profileKey?.trim() ? { profileKey: input.profileKey.trim() } : {}),
  };
  job.assignmentAudit = [...(job.assignmentAudit ?? []), entry].slice(-AUDIT_LIMIT);
  return assignmentVersion;
}

export function noteDriverNotification(
  job: TrackingJobRecord,
  input: Omit<DriverNotificationAuditEntry, "assignmentVersion"> & { assignmentVersion?: number },
): void {
  const entry: DriverNotificationAuditEntry = {
    ...input,
    assignmentVersion: assignmentVersionOf(input.assignmentVersion ?? job.assignmentVersion),
    ...(input.driverEmail ? { driverEmail: input.driverEmail.trim().toLowerCase() } : {}),
  };
  job.driverNotificationAudit = [...(job.driverNotificationAudit ?? []), entry].slice(-AUDIT_LIMIT);
}

function sameEmail(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = String(left ?? "").trim().toLowerCase();
  const b = String(right ?? "").trim().toLowerCase();
  return Boolean(a) && a === b;
}

/**
 * Last check before a driver email is handed to the provider.
 * Assignment invites may go to the driver who is pending on this exact version.
 * Every other driver booking email requires that same driver to have accepted.
 */
export function driverDispatchDecision(
  live: LiveDriverAssignment,
  intent: DriverDispatchIntent,
): { allow: true } | { allow: false; reason: string } {
  const status = String(live.assignmentStatus ?? "unassigned").trim().toLowerCase() || "unassigned";
  if (intent.kind === "journey_reminder" && status === "unassigned") {
    return { allow: false, reason: "unassigned" };
  }
  if (intent.kind === "journey_reminder" && status !== "accepted") {
    return { allow: false, reason: "not_accepted" };
  }
  const email = String(intent.driverEmail ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return { allow: false, reason: "missing_driver_email" };
  if (assignmentVersionOf(live.assignmentVersion) !== assignmentVersionOf(intent.assignmentVersion)) {
    return { allow: false, reason: "stale_assignment" };
  }
  if (!sameEmail(live.assignedDriverEmail, email)) {
    return { allow: false, reason: "recipient_mismatch" };
  }
  if (intent.kind === "assignment_invite") {
    if (status !== "pending") return { allow: false, reason: "not_pending" };
    if (intent.acceptToken && String(live.acceptToken ?? "") !== intent.acceptToken) {
      return { allow: false, reason: "stale_accept_link" };
    }
    return { allow: true };
  }
  if (status !== "accepted") return { allow: false, reason: status === "unassigned" ? "unassigned" : "not_accepted" };
  return { allow: true };
}

export function customerDriverStillCurrent(driverKey: string, live: JourneyReminderInput): boolean {
  return journeyReminderDriverKey(resolveJourneyReminderContact(live)) === driverKey;
}

export function driverJourneyNoticeRecipient(
  job: Pick<TrackingJobRecord, "assignmentVersion" | "assignmentStatus" | "assignedDriverEmail" | "assignedDriverName" | "journeyDriverNoticeSentFor">,
): { allow: true; email: string; name: string; sentKey: string; assignmentVersion: number } | { allow: false; reason: string } {
  const decision = driverDispatchDecision(job, {
    kind: "journey_reminder",
    assignmentVersion: assignmentVersionOf(job.assignmentVersion),
    driverEmail: job.assignedDriverEmail ?? "",
  });
  if (!decision.allow) return decision;
  const email = String(job.assignedDriverEmail ?? "").trim().toLowerCase();
  const sentKey = `${assignmentVersionOf(job.assignmentVersion)}:${email}`;
  if (job.journeyDriverNoticeSentFor === sentKey) return { allow: false, reason: "already_sent" };
  return {
    allow: true,
    email,
    name: String(job.assignedDriverName ?? "").trim() || "Driver",
    sentKey,
    assignmentVersion: assignmentVersionOf(job.assignmentVersion),
  };
}

export function buildDriverJourneyNoticeEmail(input: {
  driverName: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  flightNumber?: string | null;
  customerFirstName?: string | null;
}): { subject: string; text: string; html: string } {
  const first = input.driverName.trim().split(/\s+/)[0] || "there";
  const customer = input.customerFirstName?.trim();
  const flight = input.flightNumber?.trim();
  const lines = [
    `Hi ${first},`,
    "",
    `You are the accepted driver for this ${BUSINESS_NAME} journey.`,
    "",
    `Date: ${input.tripDate}`,
    `Pickup time: ${input.tripTime}`,
    `Pickup: ${input.pickupLabel}`,
    `Destination: ${input.dropoffLabel}`,
    ...(flight ? [`Flight: ${flight}`] : []),
    ...(customer ? [`Customer first name: ${customer}`] : []),
    "",
    "Please use the pickup time above. This note is sent about two hours beforehand.",
    "",
    BUSINESS_NAME,
  ];
  const text = lines.join("\n");
  const html = `<!DOCTYPE html><html lang="en"><body style="font-family:Arial,sans-serif;color:#1a2b3c;">
<p>Hi ${escapeHtml(first)},</p>
<p>You are the accepted driver for this ${escapeHtml(BUSINESS_NAME)} journey.</p>
<p><strong>Date:</strong> ${escapeHtml(input.tripDate)}<br />
<strong>Pickup time:</strong> ${escapeHtml(input.tripTime)}<br />
<strong>Pickup:</strong> ${escapeHtml(input.pickupLabel)}<br />
<strong>Destination:</strong> ${escapeHtml(input.dropoffLabel)}
${flight ? `<br /><strong>Flight:</strong> ${escapeHtml(flight)}` : ""}
${customer ? `<br /><strong>Customer first name:</strong> ${escapeHtml(customer)}` : ""}</p>
<p>Please use the pickup time above. This note is sent about two hours beforehand.</p>
<p>${escapeHtml(BUSINESS_NAME)}</p>
</body></html>`;
  return {
    subject: `Your upcoming journey — ${BUSINESS_NAME}`,
    text,
    html,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
