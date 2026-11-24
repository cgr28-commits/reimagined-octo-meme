import { DEFAULT_TRAFFIC_CONTINGENCY_MINUTES, MANDATORY } from "../constants.js";
import { ATTRACTION_BY_ID, ATTRACTIONS, APPROVED_COMBOS, regionsAreApproved } from "./attractions.js";
import { ESTIMATOR, durationLabel, legEstimate, parseHM, toHM } from "./estimate.js";
import { ZONE_BY_ID } from "./zones.js";

/**
 * Deterministic itinerary engine (staging). Every safeguard is applied to every itinerary, generated or hand-edited:
 * 4 guests maximum, minimum tour and working-day limits, opening hours and closed days, approved combinations only,
 * and the cruise return buffers (60 / 90 minutes) which can be raised but never lowered. Customer duration and the driver's
 * total working time are separate: the driver figures include positioning from the routing anchor and are never public.
 */
export const RULES = Object.freeze({
  maxGuests: MANDATORY.maxPassengers,
  maxStops: 8,
  minTourMinutes: 240, // provisional: owner setting minTourHours 4
  maxWorkingMinutes: 660, // provisional: owner setting maxWorkingDayHours 11
  mealMinutes: 60,
  mealAfterMinutes: 330, // a plan longer than this with no food stop gets a meal break
  leaveTerminalMinutes: 30, // earliest start after the guest can leave the terminal
  returnBufferMinutes: MANDATORY.returnBufferMinutes,
  contingencyMinutes: DEFAULT_TRAFFIC_CONTINGENCY_MINUTES,
});

const issue = (code, severity, message, extra = {}) => ({ code, severity, message, ...extra });
const weekday = (date) => (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`).getUTCDay() : null);
const month = (date) => (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Number(date.slice(5, 7)) : null);

/** Cruise scope from the stops: any stop outside the Belfast area makes it a long-distance day (90-minute buffer). */
export function cruiseScopeFor(stopIds) {
  return stopIds.every((id) => ATTRACTION_BY_ID.get(id)?.belfastArea) ? "belfastOnly" : "longDistance";
}
/** The contingency can only be raised above the agreed minimum. */
export const effectiveContingency = (requested) => Math.max(DEFAULT_TRAFFIC_CONTINGENCY_MINUTES, Number.isFinite(requested) ? Math.round(requested) : 0);

/** Provisional price band (from the WP-B1 seed prices). Budgets never change it. */
export function priceBand(customerMinutes, cruiseScope) {
  if (cruiseScope === "belfastOnly") return customerMinutes <= 360 ? { pence: 29500, band: "cruise-express" } : null;
  if (cruiseScope === "longDistance") return customerMinutes <= 540 ? { pence: 49500, band: "cruise-causeway" } : null;
  if (customerMinutes <= 300) return { pence: 24500, band: "belfast-city" };
  if (customerMinutes <= 480) return { pence: 42500, band: "antrim-coast-full-day" };
  if (customerMinutes <= 540) return { pence: 44500, band: "full-day-classic" };
  return null;
}

/**
 * Build the day. input: { stopIds, date, startTime|startMinutes, pickupZoneId, dropoffZoneId?, guests, cruise?: {allAboard, canLeaveTerminal, confirmed},
 * availableMinutes?, contingencyMinutes?, anchor?, visitMinutes?: {id: minutes} }
 * Returns { ok, status, customer, driver, issues, cruise, price, estimator }. `driver` is OWNER ONLY: use publicView() before sending to a customer.
 */
export function buildSchedule(input) {
  const issues = [];
  const stopIds = Array.isArray(input.stopIds) ? input.stopIds : [];
  const stops = stopIds.map((id) => ATTRACTION_BY_ID.get(id));
  if (stops.some((s) => !s)) issues.push(issue("unknown-stop", "block", "One of the stops is not in our library."));
  if (stops.length === 0) issues.push(issue("no-stops", "block", "Add at least one stop."));
  if (stops.length > RULES.maxStops) issues.push(issue("too-many-stops", "block", `A day has up to ${RULES.maxStops} stops.`));
  if (new Set(stopIds).size !== stopIds.length) issues.push(issue("duplicate-stop", "block", "A stop appears twice."));
  const guests = Number(input.guests ?? 2);
  if (!Number.isInteger(guests) || guests < 1 || guests > RULES.maxGuests) issues.push(issue("guests", "block", `A private car takes up to ${RULES.maxGuests} guests.`));
  const pickup = ZONE_BY_ID.get(input.pickupZoneId || "belfast-centre");
  const dropoff = ZONE_BY_ID.get(input.dropoffZoneId || input.pickupZoneId || "belfast-centre");
  if (!pickup || !dropoff) issues.push(issue("zone", "block", "Choose a pick-up point in Northern Ireland."));
  const start = input.startMinutes ?? parseHM(input.startTime);
  if (!Number.isInteger(start)) issues.push(issue("start-time", "block", "Choose a start time."));
  const valid = stops.every(Boolean) && stops.length > 0 && stops.length <= RULES.maxStops && pickup && dropoff && Number.isInteger(start) && guests >= 1 && guests <= RULES.maxGuests;
  if (!valid) return { ok: false, status: "blocked", issues, estimator: ESTIMATOR.id };

  if (pickup.review || dropoff.review) issues.push(issue("zone-review", "warn", "We confirm any supplement for this pick-up point in your quote.", { review: true }));
  if (!regionsAreApproved(stops.map((s) => s.region))) issues.push(issue("combination", "block", "These places are too far apart to combine in one day. Remove one area."));

  const wd = weekday(input.date);
  const mo = month(input.date);
  const contingency = effectiveContingency(input.contingencyMinutes);
  const visit = (s) => Math.min(s.maxMinutes, Math.max(s.minMinutes, Math.round(input.visitMinutes?.[s.id] ?? s.minutes)));
  const hasFood = stops.some((s) => s.tags.includes("food"));
  const items = [];
  let t = start;
  let driving = 0;
  let stopTime = 0;
  let waiting = 0;
  let mealTime = 0;
  let prev = pickup;
  items.push({ type: "pickup", id: "pickup", name: pickup.label, startMinutes: t, minutes: 0 });
  stops.forEach((s, index) => {
    const leg = legEstimate(prev, s);
    t += leg.minutes + ESTIMATOR.stopOverheadMinutes;
    driving += leg.minutes;
    stopTime += ESTIMATOR.stopOverheadMinutes;
    const arrive = t;
    if (s.seasonMonths && mo !== null && (mo < s.seasonMonths[0] || mo > s.seasonMonths[1])) issues.push(issue("seasonal", "block", `${s.name} may be closed or limited at this time of year. Our guide is provisional and we confirm availability for your date in your quote.`, { stopId: s.id }));
    if (wd !== null && s.closedDays.includes(wd)) issues.push(issue("closed-day", "block", `${s.name} may not be open on this day of the week. Our guide is provisional and we confirm availability for your date in your quote.`, { stopId: s.id }));
    let begin = arrive;
    if (begin < s.open[0]) {
      const wait = s.open[0] - begin;
      if (wait > 20) issues.push(issue("opens-later", "warn", `${s.name} may not be open yet when you would arrive (about ${wait} minutes early on our provisional timings). Try reordering or starting later. We confirm opening times in your quote.`, { stopId: s.id }));
      waiting += wait;
      begin = s.open[0];
    }
    const minutes = visit(s);
    if (begin + minutes > s.open[1]) issues.push(issue("closes-early", "block", `${s.name} may close before this visit would finish on our provisional timings. Try an earlier start or a shorter day. We confirm opening times in your quote.`, { stopId: s.id }));
    items.push({ type: "stop", id: s.id, name: s.name, arriveMinutes: arrive, startMinutes: begin, minutes, driveMinutes: leg.minutes, ticketed: s.ticketed, ticketNote: s.ticketNote, mobility: s.mobility, blurb: s.blurb, tags: s.tags, minMinutes: s.minMinutes, maxMinutes: s.maxMinutes });
    t = begin + minutes;
    stopTime += minutes;
    prev = s;
    // Meal break: once, after the stop where the plan passes the threshold, only if no food stop was chosen.
    if (!hasFood && !items.some((i) => i.type === "meal") && index < stops.length - 1 && t - start >= RULES.mealAfterMinutes - 90) {
      items.push({ type: "meal", id: "meal", name: "Lunch break", startMinutes: t, minutes: RULES.mealMinutes, blurb: "Your driver can suggest places that suit you." });
      t += RULES.mealMinutes;
      mealTime += RULES.mealMinutes;
    }
  });
  const back = legEstimate(prev, dropoff);
  t += back.minutes;
  driving += back.minutes;
  items.push({ type: "dropoff", id: "dropoff", name: dropoff.label, startMinutes: t, minutes: 0, driveMinutes: back.minutes });
  const end = t;
  const customerMinutes = end - start;

  const anchor = input.anchor || pickup; // neutral in the browser; the Worker passes the real anchor (src/anchor.js)
  const positionOut = legEstimate(anchor, pickup).minutes;
  const positionBack = legEstimate(dropoff, anchor).minutes;
  const workingMinutes = positionOut + customerMinutes + contingency + positionBack;
  const driver = { positioningOutMinutes: positionOut, positioningBackMinutes: positionBack, workingMinutes, contingencyMinutes: contingency };

  if (customerMinutes < RULES.minTourMinutes) issues.push(issue("minimum-tour", "warn", "Our minimum tour is 4 hours, so we add time or a stop before quoting.", { review: true }));
  if (workingMinutes > RULES.maxWorkingMinutes) issues.push(issue("working-day", "block", "This day is too long for one driver. Remove a stop or shorten the visits.", { ownerOnly: true }));
  if (Number.isFinite(input.availableMinutes) && customerMinutes + contingency > input.availableMinutes) {
    issues.push(issue("too-long", "block", `This plan needs about ${durationLabel(customerMinutes + contingency)} including a ${contingency}-minute safety margin, but you have ${durationLabel(input.availableMinutes)}.`));
  }

  let cruise = null;
  if (input.cruise) {
    const allAboard = parseHM(input.cruise.allAboard);
    const canLeave = parseHM(input.cruise.canLeaveTerminal);
    const scope = cruiseScopeFor(stopIds);
    const buffer = RULES.returnBufferMinutes[scope];
    if (allAboard === null || input.cruise.confirmed !== true) issues.push(issue("cruise-details", "block", "Enter your cruise line's all-aboard time and confirm it comes from them."));
    else {
      const latestBack = allAboard - buffer - contingency;
      const earliestStart = canLeave === null ? null : canLeave + RULES.leaveTerminalMinutes;
      cruise = { scope, bufferMinutes: buffer, contingencyMinutes: contingency, allAboard: toHM(allAboard), latestBack: toHM(latestBack), earliestStart: earliestStart === null ? null : toHM(earliestStart), slackMinutes: latestBack - end };
      if (end > latestBack) issues.push(issue("cruise-buffer", "block", `This plan gets you back at ${toHM(end)}, but the latest safe return is ${toHM(latestBack)} (${buffer}-minute buffer plus ${contingency} minutes for traffic before your all-aboard time).`));
      if (earliestStart !== null && start < earliestStart) issues.push(issue("cruise-early", "block", `Your start time is earlier than ${toHM(earliestStart)}, which is 30 minutes after you can leave the terminal.`));
    }
    if (pickup.kind !== "harbour" || dropoff.kind !== "harbour") issues.push(issue("cruise-pickup", "warn", "Cruise days start and finish at Belfast Harbour. We confirm any other arrangement in your quote.", { review: true }));
  }

  const band = priceBand(customerMinutes, input.cruise ? cruiseScopeFor(stopIds) : null);
  const blocked = issues.some((i) => i.severity === "block");
  const slack = cruise ? cruise.slackMinutes : Number.isFinite(input.availableMinutes) ? input.availableMinutes - customerMinutes - contingency : null;
  const tight = slack !== null && slack < 30;
  const status = blocked ? "blocked" : issues.some((i) => i.severity === "warn") || tight ? "tight" : "fits";
  return {
    ok: !blocked,
    status,
    customer: { startMinutes: start, endMinutes: end, durationMinutes: customerMinutes, items, breakdown: { driving, stops: stopTime, meals: mealTime, waiting, contingency }, slackMinutes: slack },
    driver,
    issues,
    cruise,
    price: band ? { provisional: true, pence: band.pence, band: band.band, note: "Provisional staging price. Your final price is confirmed in a private quote." } : { provisional: true, pence: null, band: null, note: "We confirm the price for a day this long in your private quote." },
    reviewRequired: issues.some((i) => i.review === true),
    estimator: ESTIMATOR.id,
  };
}

/** Customer-safe view: drops everything about the driver's base and working time. */
export function publicView(result) {
  const { driver, ...rest } = result;
  void driver;
  return { ...rest, issues: result.issues.filter((i) => !i.ownerOnly).map(({ ownerOnly, ...i }) => (void ownerOnly, i)) };
}

// ------------------------------------------------------------------ ordering and suggestions
function permutations(list) {
  if (list.length <= 1) return [list];
  const out = [];
  list.forEach((item, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).forEach((rest) => out.push([item, ...rest])));
  return out;
}
/** Best visiting order: the permutation that ends earliest without a blocking issue (nearest-neighbour above 6 stops). */
export function bestOrder(stopIds, input) {
  const evaluate = (order) => buildSchedule({ ...input, stopIds: order });
  let candidates;
  if (stopIds.length <= 6) candidates = permutations(stopIds);
  else {
    const remaining = [...stopIds];
    const order = [remaining.shift()];
    while (remaining.length) {
      const last = ATTRACTION_BY_ID.get(order[order.length - 1]);
      remaining.sort((a, b) => legEstimate(last, ATTRACTION_BY_ID.get(a)).minutes - legEstimate(last, ATTRACTION_BY_ID.get(b)).minutes);
      order.push(remaining.shift());
    }
    candidates = [order];
  }
  let best = null;
  for (const order of candidates) {
    const r = evaluate(order);
    const key = [r.ok ? 0 : 1, r.customer ? r.customer.endMinutes : Infinity];
    if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && key[1] < best.key[1])) best = { order, result: r, key };
  }
  return best ? { stopIds: best.order, result: best.result } : { stopIds, result: evaluate(stopIds) };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PACE_MAX_STOPS = { relaxed: 4, balanced: 5, full: 7 };
const MOBILITY_OK = { any: ["level", "some-steps", "steep"], "avoid-steep": ["level", "some-steps"], "level-only": ["level"] };

/**
 * Personalised suggestions and Surprise Me. input: see buildSchedule plus { interests[], surprise, pace, mobility, budgetPence, availableMinutes, seed }.
 * Only owner-approved attractions in owner-approved combinations are ever used. Reshuffling is only limited by technical rate limits (none here).
 * A budget NEVER lowers a price or bypasses a warning: it only steers the choice toward shorter, lower-band days.
 */
export function suggest(input) {
  const rng = mulberry32(Number.isFinite(input.seed) ? input.seed : 1);
  const interests = new Set(Array.isArray(input.interests) ? input.interests : []);
  const pace = PACE_MAX_STOPS[input.pace] ? input.pace : "balanced";
  const mobilityOk = MOBILITY_OK[input.mobility] || MOBILITY_OK.any;
  const mo = month(input.date);
  const wd = weekday(input.date);
  const cruiseMode = Boolean(input.cruise);
  const base = { ...input, stopIds: undefined };
  const results = [];
  for (const combo of APPROVED_COMBOS) {
    let pool = ATTRACTIONS.filter((a) => combo.includes(a.region) && mobilityOk.includes(a.mobility));
    pool = pool.filter((a) => !(a.seasonMonths && mo !== null && (mo < a.seasonMonths[0] || mo > a.seasonMonths[1])) && !(wd !== null && a.closedDays.includes(wd)));
    if (cruiseMode && input.cruiseScope === "belfastOnly") pool = pool.filter((a) => a.belfastArea);
    if (pool.length === 0) continue;
    const scored = pool.map((a) => ({ a, score: (input.surprise ? rng() * 4 : [...interests].filter((i) => a.tags.includes(i)).length * 3 + a.priority * 0.6 + rng() * 0.8) })).sort((x, y) => y.score - x.score);
    const chosen = [];
    let total = 0;
    for (const { a, score } of scored) {
      if (chosen.length >= PACE_MAX_STOPS[pace]) break;
      if (!input.surprise && interests.size > 0 && score < 3 && chosen.length >= 2) continue;
      const trial = bestOrder([...chosen.map((c) => c.id), a.id], base);
      if (trial.result.ok && (!Number.isFinite(input.availableMinutes) || trial.result.customer.durationMinutes + effectiveContingency(input.contingencyMinutes) <= input.availableMinutes)) {
        chosen.push(a);
        total += score;
      }
    }
    if (chosen.length === 0) continue;
    let ordered = bestOrder(chosen.map((c) => c.id), base);
    // Budget: drop the lowest-scoring stop while the provisional band is above budget and the day stays at least the minimum tour.
    if (Number.isFinite(input.budgetPence)) {
      let ids = [...ordered.stopIds];
      while (ordered.result.price.pence !== null && ordered.result.price.pence > input.budgetPence && ids.length > 1) {
        const worst = ids.map((id) => ({ id, s: scored.find((x) => x.a.id === id)?.score ?? 0 })).sort((x, y) => x.s - y.s)[0];
        ids = ids.filter((id) => id !== worst.id);
        const next = bestOrder(ids, base);
        if (!next.result.ok || next.result.customer.durationMinutes < RULES.minTourMinutes) break;
        ordered = next;
      }
    }
    results.push({ combo, total, ...ordered });
  }
  results.sort((a, b) => b.total - a.total);
  const top = results.filter((r) => r.result.ok);
  if (top.length === 0) return { ok: false, message: "We couldn't build a day that fits. Try more time or fewer restrictions.", alternatives: [] };
  const pick = top[0];
  const budgetNote = Number.isFinite(input.budgetPence) && pick.result.price.pence !== null && pick.result.price.pence > input.budgetPence ? "The closest day we can build is above your budget. Budgets steer suggestions only and never change our prices." : null;
  return {
    ok: true,
    stopIds: pick.stopIds,
    regions: pick.combo,
    result: pick.result,
    budgetNote,
    why: [...interests].length ? `Chosen for ${[...interests].join(", ")}.` : "A balanced day across approved places.",
    alternatives: top.slice(1, 3).map((r) => ({ stopIds: r.stopIds, regions: r.combo })),
  };
}

/** Up to three sensible additions to an existing plan, best first. */
export function suggestAdditions(input, interests = []) {
  const current = Array.isArray(input.stopIds) ? input.stopIds : [];
  const wanted = new Set(interests);
  const out = [];
  for (const a of ATTRACTIONS) {
    if (current.includes(a.id)) continue;
    const trial = bestOrder([...current, a.id], input);
    if (!trial.result.ok) continue;
    out.push({ id: a.id, name: a.name, minutes: a.minutes, score: a.tags.filter((t) => wanted.has(t)).length * 3 + a.priority - (trial.result.customer.endMinutes - (buildSchedule(input).customer?.endMinutes ?? 0)) / 60, stopIds: trial.stopIds });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 3);
}
