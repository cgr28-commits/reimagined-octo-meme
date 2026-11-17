/**
 * Checks the Christmas homepage video date window (Europe/London, inclusive days).
 * Run: npx tsx scripts/check-christmas-video-schedule.ts
 */
import { CHRISTMAS_VIDEO, isChristmasVideoLive } from "../src/lib/seasonal";

const cases: [string, boolean][] = [
  ["2026-11-16T23:59:00Z", false], // 16 Nov, 23:59 London (GMT)
  ["2026-11-17T00:00:00Z", true], // first minute of 17 Nov London
  ["2026-12-25T12:00:00Z", true],
  ["2027-01-01T23:59:00Z", true], // last minute of 1 Jan London
  ["2027-01-02T00:00:00Z", false], // hidden from 2 Jan
  ["2027-06-01T12:00:00Z", false],
];

let failed = 0;
for (const [iso, expected] of cases) {
  const got = isChristmasVideoLive(new Date(iso));
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${iso}  live=${got}  expected=${expected}`);
}
if (isChristmasVideoLive(new Date("2026-12-25T12:00:00Z"), { ...CHRISTMAS_VIDEO, enabled: false })) {
  failed++;
  console.log("FAIL  enabled:false should hide the section");
} else console.log("PASS  enabled:false hides the section");
if (failed) process.exit(1);
