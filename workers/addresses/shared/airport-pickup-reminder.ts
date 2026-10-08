/**
 * Compatibility exports for the two-hour journey reminder.
 * New callers should use shared/journey-reminder.ts.
 */

export {
  JOURNEY_REMINDER_LEAD_MS as AIRPORT_COLLECTION_LEAD_MS,
  JOURNEY_REMINDER_LEAD_MS as AIRPORT_PICKUP_REMINDER_LEAD_MS,
  JOURNEY_REMINDER_SUBJECT as AIRPORT_COLLECTION_EMAIL_SUBJECT,
  journeyReminderSendAt as airportCollectionSendAt,
  journeyReminderFirstName,
  buildJourneyReminderAirportInstructions as buildAirportPickupReminderDirections,
  evaluateJourneyReminder as evaluateAirportPickupReminder,
  type JourneyReminderInput as AirportPickupReminderInput,
  type JourneyReminderDecision as AirportPickupReminderDecision,
  type JourneyReminderSkipReason as AirportPickupReminderSkipReason,
} from "./journey-reminder";

import {
  buildJourneyReminderMessage,
  journeyReminderFirstName,
  resolveJourneyReminderContact,
  type JourneyReminderInput,
} from "./journey-reminder";
import { BUSINESS_NAME } from "./business-email";
import { FORBIDDEN_PERSONAL_VOICE_PATTERNS } from "./company-voice-journey";

export function airportPickupReminderGreeting(fullName: string | null | undefined): string {
  const first = journeyReminderFirstName(fullName);
  return first ? `Hi ${first},` : "Hi,";
}

export function buildAirportPickupReminderMessage(input: JourneyReminderInput): string {
  return buildJourneyReminderMessage(input, resolveJourneyReminderContact(input), "reminder");
}

export function airportPickupReminderUsesCompanyVoice(message: string): boolean {
  const prose = message.replace(/https:\/\/wa\.me\/\S+/g, " ");
  if (FORBIDDEN_PERSONAL_VOICE_PATTERNS.some((pattern) => pattern.test(prose))) return false;
  if (/\bcall me\b|\bmy car\b/i.test(prose)) return false;
  return /\byour driver\b/i.test(prose) && /\bwe\b/i.test(prose) && prose.includes(BUSINESS_NAME);
}
