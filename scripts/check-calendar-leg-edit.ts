/**
 * Editing the outbound time of a return booking must only move the outbound
 * diary entry (Neill Thompson, Nov 2026: the return was dragged onto the
 * outbound date and vanished from its real day).
 */
import assert from "node:assert/strict";
import { calendarEventIdsForEdit } from "../shared/refund-leg-cancel";

// Older return booking: no per-leg map, events stored outbound then return.
assert.deepEqual(
  calendarEventIdsForEdit({ returnJourney: true, calendarEventIds: ["out1", "ret1"] }),
  { outbound: ["out1"], return: "ret1" },
);

// Newer return booking with per-leg map wins over list order.
assert.deepEqual(
  calendarEventIdsForEdit({
    returnJourney: true,
    calendarEventIds: ["ret2", "out2"],
    calendarEventIdsByLeg: { outbound: "out2", return: "ret2" },
  }),
  { outbound: ["out2"], return: "ret2" },
);

// Single journey: every event belongs to the outbound leg.
assert.deepEqual(
  calendarEventIdsForEdit({ returnJourney: false, calendarEventIds: ["a"] }),
  { outbound: ["a"], return: null },
);

// Return booking with only one stored event: treat it as outbound, never guess a return.
assert.deepEqual(
  calendarEventIdsForEdit({ returnJourney: true, calendarEventIds: ["only"] }),
  { outbound: ["only"], return: null },
);

// No events at all.
assert.deepEqual(calendarEventIdsForEdit({}), { outbound: [], return: null });

console.log("calendar leg edit checks passed");
