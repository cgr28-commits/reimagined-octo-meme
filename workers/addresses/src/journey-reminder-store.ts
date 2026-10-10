/**
 * Owner-editable airport wording for the 2-hour journey reminder.
 * Blank fields keep the built-in airport instructions. No redeploy required.
 */

import {
  resolveJourneyReminderAirportCopy,
  type JourneyReminderAirportCopy,
} from "../shared/journey-reminder";

const KEY = "journey-reminder:airport-copy";
const TTL = 60 * 60 * 24 * 365 * 5;

export async function getJourneyReminderAirportCopy(
  store: KVNamespace,
): Promise<JourneyReminderAirportCopy> {
  const raw = await store.get<Partial<JourneyReminderAirportCopy>>(KEY, "json");
  return resolveJourneyReminderAirportCopy(raw);
}

export async function saveJourneyReminderAirportCopy(
  store: KVNamespace,
  input: Partial<JourneyReminderAirportCopy> | null | undefined,
): Promise<JourneyReminderAirportCopy> {
  const resolved = resolveJourneyReminderAirportCopy(input);
  await store.put(KEY, JSON.stringify(resolved), { expirationTtl: TTL });
  return resolved;
}
