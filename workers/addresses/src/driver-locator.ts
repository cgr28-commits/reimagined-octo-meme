/**
 * Find Your Driver — Worker routes + DriverLocator Durable Object.
 *
 * Isolated from the retired /track system: separate routes (/locator/*),
 * separate storage (one SQLite-backed Durable Object per booking leg, no KV
 * writes), separate customer secret. It only READS the existing booking job
 * (TRACKING_STORE KV) to check eligibility, assignment and cancellation.
 *
 * Off unless DRIVER_LOCATOR_MODE is set:
 *   unset / "off"  → every /locator/* route answers 404 (nothing reachable)
 *   "owner-test"   → only the owner key can share or create links (testing)
 *   "on"           → owner + assigned drivers who accepted the job
 *
 * Never logs tokens, link secrets, names or coordinates.
 */

import { corsHeaders } from "../shared/google-places";
import { buildAirportPickupInstruction } from "../shared/company-voice-journey";
import { isAirportPickupJob, journeyStatusOf, type TrackingJobRecord } from "../shared/tracking";
import {
  LOCATOR_HOME_PRIVACY_RADIUS_M,
  LOCATOR_JOB_RECHECK_MS,
  LOCATOR_MAX_SESSION_MS,
  LOCATOR_SERVER_MIN_INTERVAL_MS,
  LOCATOR_UPLOAD_RATE_PER_MINUTE,
  LOCATOR_VIEW_RATE_PER_MINUTE,
  buildCustomerView,
  buildLinkFragment,
  customerDriverDisplayName,
  generateLinkSecret,
  haversineMeters,
  locatorAirport,
  locatorWindow,
  parseLinkFragment,
  sanitizeMeetingNote,
  sha256Hex,
  timingSafeEqualHex,
  validateFix,
  type DriverLocatorStatus,
  type LocatorFix,
  type LocatorMeta,
  type LocatorPhase,
} from "../shared/driver-locator";
import { assertDriverCanOperateJob } from "./driver-assignment-utils";
import { resolveAuthorizedSession } from "./driver-portal-session";
import type { DriverAuthEnv, DriverSession } from "./driver-auth";
import { OPERATING_BASE } from "./operating-base";
import { getPaidBookingRecord, paidBookingStoreConfigured } from "./paid-booking-store";
import { getTrackingJob, isTrackingJobCancelled } from "./tracking-store";

export type DriverLocatorEnv = DriverAuthEnv & {
  TRACKING_STORE?: KVNamespace;
  DRIVER_LOCATOR?: DurableObjectNamespace;
  /** "off" (default) | "owner-test" | "on" */
  DRIVER_LOCATOR_MODE?: string;
};

export type LocatorMode = "off" | "owner-test" | "on";

export function locatorMode(env: { DRIVER_LOCATOR_MODE?: string; DRIVER_LOCATOR?: unknown }): LocatorMode {
  if (!env.DRIVER_LOCATOR) return "off";
  const raw = String(env.DRIVER_LOCATOR_MODE ?? "").trim().toLowerCase();
  return raw === "on" || raw === "owner-test" ? raw : "off";
}

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...SECURITY_HEADERS, ...corsHeaders(origin) },
  });
}

/* ------------------------------------------------------------------ */
/* Routing                                                             */
/* ------------------------------------------------------------------ */

const ROUTES = new Set([
  "driver/status",
  "driver/start",
  "driver/position",
  "driver/stop",
  "owner/link",
  "view",
]);

export function parseLocatorRoute(pathname: string): string | null {
  const match = /^\/(?:api\/)?locator\/([a-z/]+?)\/?$/.exec(pathname);
  return match && ROUTES.has(match[1]) ? match[1] : null;
}

export async function handleLocatorRequest(
  route: string,
  request: Request,
  env: DriverLocatorEnv,
  origin: string | null,
  siteOrigin: string,
): Promise<Response> {
  const mode = locatorMode(env);
  if (mode === "off") return json({ error: "Not found" }, 404, origin);
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);
  if (!env.TRACKING_STORE) return json({ error: "Not configured" }, 503, origin);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400, origin);
  }

  try {
    if (route === "view") return await handleView(body, env, origin);
    return await handleDriverRoute(route, request, body, env, origin, mode, siteOrigin);
  } catch (error) {
    // Durable Object / platform limit or outage: never leak details.
    console.error("Locator request failed", error instanceof Error ? error.name : "error");
    return json(
      { error: "Live location is temporarily unavailable. Use the meeting point instructions.", retryable: true },
      503,
      origin,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Driver / owner side                                                 */
/* ------------------------------------------------------------------ */

type Eligible = { ok: true; job: TrackingJobRecord; session: Extract<DriverSession, { authorized: true }> };
type Ineligible = { ok: false; status: number; error: string; code: string };

async function isCancelled(job: TrackingJobRecord, store: KVNamespace): Promise<boolean> {
  if (isTrackingJobCancelled(job)) return true;
  if (job.paymentReference && paidBookingStoreConfigured(store)) {
    const paid = await getPaidBookingRecord(store, job.paymentReference);
    if (paid?.status === "refunded" || paid?.status === "cancelled") return true;
  }
  return false;
}

function isCollected(job: TrackingJobRecord): boolean {
  const status = journeyStatusOf(job);
  return status === "en_route" || status === "arrived_destination" || status === "completed";
}

/** Server-side eligibility — the dashboard's buttons are never trusted. */
export async function checkEligibility(
  request: Request,
  body: Record<string, unknown>,
  env: DriverLocatorEnv,
  mode: LocatorMode,
  now = new Date(),
): Promise<Eligible | Ineligible> {
  const session = await resolveAuthorizedSession(request, env);
  if (!session.authorized) return { ok: false, status: 401, error: "Unauthorized", code: "unauthorized" };
  if (mode === "owner-test" && session.role !== "owner") {
    return { ok: false, status: 403, error: "Find Your Driver is in owner test mode", code: "owner_test_only" };
  }
  const jobToken = String(body.jobToken ?? "").trim();
  if (!/^[a-f0-9]{32}$/.test(jobToken)) return { ok: false, status: 400, error: "Missing booking", code: "bad_request" };
  const job = await getTrackingJob(env.TRACKING_STORE as KVNamespace, jobToken);
  if (!job) return { ok: false, status: 404, error: "Booking not found", code: "not_found" };
  const denied = assertDriverCanOperateJob(job, session);
  if (denied) return { ok: false, status: 403, error: denied, code: "not_assigned" };
  if (!isAirportPickupJob(job) || !locatorAirport(job.airportCode)) {
    return { ok: false, status: 409, error: "Only airport collections at BFS, BHD or DUB", code: "not_airport" };
  }
  if (await isCancelled(job, env.TRACKING_STORE as KVNamespace)) {
    return { ok: false, status: 410, error: "This booking has been cancelled", code: "cancelled" };
  }
  return { ok: true, job, session };
}

function stubFor(env: DriverLocatorEnv, jobToken: string): DurableObjectStub {
  const ns = env.DRIVER_LOCATOR as DurableObjectNamespace;
  return ns.get(ns.idFromName(`job:${jobToken}`));
}

async function callObject<T = Record<string, unknown>>(
  stub: DurableObjectStub,
  op: string,
  payload: Record<string, unknown> = {},
): Promise<{ status: number; body: T }> {
  const response = await stub.fetch("https://driver-locator/op", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, ...payload }),
  });
  return { status: response.status, body: (await response.json()) as T };
}

async function meetingInstructionFor(job: TrackingJobRecord, store: KVNamespace): Promise<string> {
  const paid = job.paymentReference && paidBookingStoreConfigured(store)
    ? await getPaidBookingRecord(store, job.paymentReference)
    : null;
  const p = paid as (Record<string, unknown> & { dublinArrivalTerminal?: string }) | null;
  const access =
    (job.journeyLeg === "return" ? p?.returnAirportAccessOption : p?.outboundAirportAccessOption) ??
    p?.airportAccessOption ??
    null;
  return (
    buildAirportPickupInstruction({
      isAirportPickup: true,
      pickupLabel: job.pickupLabel,
      airportCode: job.airportCode ?? null,
      airportAccessOption: (access as never) ?? null,
      dublinArrivalTerminal: p?.dublinArrivalTerminal ?? null,
    }) ?? "Please make your way to the agreed airport pickup point."
  );
}

/** True when a fix is inside the privacy zone around the operating base. */
export function insideHomePrivacyZone(fix: Pick<LocatorFix, "lat" | "lng" | "accuracy">): boolean {
  // Include the accuracy radius so a vague fix near home is also withheld.
  return (
    haversineMeters(fix.lat, fix.lng, OPERATING_BASE.lat, OPERATING_BASE.lng) - Math.min(fix.accuracy, 500) <=
    LOCATOR_HOME_PRIVACY_RADIUS_M
  );
}

async function handleDriverRoute(
  route: string,
  request: Request,
  body: Record<string, unknown>,
  env: DriverLocatorEnv,
  origin: string | null,
  mode: LocatorMode,
  siteOrigin: string,
): Promise<Response> {
  if (route === "owner/link") {
    const session = await resolveAuthorizedSession(request, env);
    if (!session.authorized || session.role !== "owner") {
      return json({ error: "Owner access required" }, 403, origin);
    }
  }
  if (route === "driver/status" && !body.jobToken) {
    // Dashboard probe: is Find Your Driver available to this signed-in user?
    const session = await resolveAuthorizedSession(request, env);
    if (!session.authorized) return json({ error: "Unauthorized" }, 401, origin);
    const allowed = mode === "on" || session.role === "owner";
    return json({ ok: true, enabled: allowed, mode, role: session.role }, 200, origin);
  }
  const eligible = await checkEligibility(request, body, env, mode);
  if (!eligible.ok) return json({ error: eligible.error, code: eligible.code }, eligible.status, origin);
  const { job, session } = eligible;
  const stub = stubFor(env, job.token);
  const window = locatorWindow(job.pickupAt);

  if (route === "driver/status") {
    const result = await callObject<DriverLocatorStatus>(stub, "status");
    return json({ ...result.body, enabled: true, window, mode }, result.status, origin);
  }

  if (route === "driver/stop") {
    const reason = body.reason === "collected" ? "collected" : "stopped";
    const result = await callObject(stub, "stop", { reason });
    return json(result.body, result.status, origin);
  }

  // Everything below needs the collection window to be open.
  if (window.state !== "open") {
    return json(
      {
        error: window.state === "too_early" ? "Sharing opens 60 minutes before the pickup time" : "This collection window has closed",
        code: window.state,
        window,
      },
      409,
      origin,
    );
  }
  if (isCollected(job)) {
    await callObject(stub, "stop", { reason: "collected" });
    return json({ error: "This passenger has already been collected", code: "collected" }, 409, origin);
  }

  if (route === "driver/start") {
    const airport = locatorAirport(job.airportCode)!;
    const result = await callObject(stub, "start", {
      meta: {
        version: 1,
        jobToken: job.token,
        pickupAt: job.pickupAt,
        opensAt: window.opensAt,
        closesAt: window.closesAt,
        airportCode: airport.code,
        driverDisplayName: customerDriverDisplayName(
          job.assignedDriverName,
          (job.assignmentStatus ?? "unassigned") === "accepted",
        ),
        meetingInstruction: await meetingInstructionFor(job, env.TRACKING_STORE as KVNamespace),
        phase: "sharing",
        jobCheckedAt: Date.now(),
      } satisfies LocatorMeta,
      by: session.role,
    });
    return json(result.body, result.status, origin);
  }

  if (route === "driver/position") {
    const valid = validateFix(body);
    if (!valid.ok) return json({ error: valid.error, code: "invalid_fix" }, 400, origin);
    const withheld = insideHomePrivacyZone(valid.fix);
    const result = await callObject(stub, "position", withheld ? { withheld: true } : { fix: valid.fix });
    return json(result.body, result.status, origin);
  }

  if (route === "owner/link") {
    const action = body.action === "revoke" ? "revoke" : "create";
    if (action === "revoke") {
      const result = await callObject(stub, "link-revoke");
      return json(result.body, result.status, origin);
    }
    const secret = generateLinkSecret();
    const result = await callObject(stub, "link-create", {
      linkHash: await sha256Hex(secret),
      expiresAt: Date.parse(window.closesAt),
      meetingNote: sanitizeMeetingNote(body.meetingNote),
      seed: {
        jobToken: job.token,
        pickupAt: job.pickupAt,
        opensAt: window.opensAt,
        closesAt: window.closesAt,
        airportCode: locatorAirport(job.airportCode)!.code,
        driverDisplayName: customerDriverDisplayName(
          job.assignedDriverName,
          (job.assignmentStatus ?? "unassigned") === "accepted",
        ),
        meetingInstruction: await meetingInstructionFor(job, env.TRACKING_STORE as KVNamespace),
      },
    });
    if (result.status !== 200) return json(result.body, result.status, origin);
    // The secret is returned once, to the owner only, and never stored in plain text.
    const fragment = buildLinkFragment(stub.id.toString(), secret);
    return json(
      { ok: true, fragment, url: `${siteOrigin.replace(/\/+$/, "")}/find-your-driver/#${fragment}`, expiresAt: window.closesAt },
      200,
      origin,
    );
  }

  return json({ error: "Not found" }, 404, origin);
}

/* ------------------------------------------------------------------ */
/* Customer side                                                       */
/* ------------------------------------------------------------------ */

const NOT_FOUND_VIEW = { error: "This link is not valid or has expired." };

async function handleView(body: Record<string, unknown>, env: DriverLocatorEnv, origin: string | null): Promise<Response> {
  const parsed = parseLinkFragment(String(body.link ?? ""));
  if (!parsed) return json(NOT_FOUND_VIEW, 404, origin);
  const ns = env.DRIVER_LOCATOR as DurableObjectNamespace;
  let id: DurableObjectId;
  try {
    id = ns.idFromString(parsed.objectId);
  } catch {
    return json(NOT_FOUND_VIEW, 404, origin);
  }
  const result = await callObject(ns.get(id), "view", { linkHash: await sha256Hex(parsed.secret) });
  return json(result.status === 200 ? result.body : NOT_FOUND_VIEW, result.status === 200 || result.status === 429 ? result.status : 404, origin);
}

/* ------------------------------------------------------------------ */
/* Durable Object                                                      */
/* ------------------------------------------------------------------ */

type ObjectEnv = { TRACKING_STORE?: KVNamespace };

function objectJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

class MinuteCounter {
  private windowStart = 0;
  private count = 0;
  hit(limit: number, now: number): boolean {
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.count = 0;
    }
    this.count += 1;
    return this.count <= limit;
  }
}

/**
 * One instance per booking leg ("job:<token>"). Storage (SQLite-backed) holds
 * at most two keys: "meta" and "pos" (latest fix). Rate counters live in memory
 * only, so throttled requests cost no storage writes.
 */
export class DriverLocator {
  private views = new MinuteCounter();
  private uploads = new MinuteCounter();
  private lastAcceptedAt = 0;
  private lastPingAt = 0;

  constructor(
    private state: DurableObjectState,
    private env: ObjectEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    let input: Record<string, unknown>;
    try {
      input = (await request.json()) as Record<string, unknown>;
    } catch {
      return objectJson({ error: "Bad request" }, 400);
    }
    return this.state.blockConcurrencyWhile(() => this.handle(input));
  }

  /** Window closed: delete everything this booking ever stored here. */
  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }

  private async meta(): Promise<LocatorMeta | null> {
    return (await this.state.storage.get<LocatorMeta>("meta")) ?? null;
  }

  private async setPhase(meta: LocatorMeta, phase: LocatorPhase, now: number): Promise<void> {
    meta.phase = phase;
    if (phase !== "sharing") meta.sharingStoppedAt = now;
    await this.state.storage.delete("pos");
    await this.state.storage.put("meta", meta);
  }

  private async ensureAlarm(closesAt: string): Promise<void> {
    const at = Date.parse(closesAt);
    if (!Number.isFinite(at)) return;
    const current = await this.state.storage.getAlarm();
    if (current !== at) await this.state.storage.setAlarm(at);
  }

  /** Notice cancellation / collection made elsewhere (at most every 5 min). */
  private async recheckJob(meta: LocatorMeta, now: number): Promise<void> {
    if (meta.phase === "collected" || meta.phase === "cancelled" || meta.phase === "expired") return;
    if (now - meta.jobCheckedAt < LOCATOR_JOB_RECHECK_MS || !this.env.TRACKING_STORE) return;
    const job = await getTrackingJob(this.env.TRACKING_STORE, meta.jobToken);
    meta.jobCheckedAt = now;
    if (!job || (await isCancelled(job, this.env.TRACKING_STORE))) {
      await this.setPhase(meta, "cancelled", now);
      return;
    }
    if (isCollected(job)) {
      await this.setPhase(meta, "collected", now);
      return;
    }
    await this.state.storage.put("meta", meta);
  }

  private expire(meta: LocatorMeta, now: number): boolean {
    const closes = Date.parse(meta.closesAt);
    const sessionOver =
      meta.phase === "sharing" && meta.sharingStartedAt !== undefined && now - meta.sharingStartedAt > LOCATOR_MAX_SESSION_MS;
    return (Number.isFinite(closes) && now > closes) || sessionOver;
  }

  private async handle(input: Record<string, unknown>): Promise<Response> {
    const op = String(input.op ?? "");
    const now = Date.now();
    const meta = await this.meta();

    if (meta && this.expire(meta, now) && meta.phase !== "expired") {
      await this.setPhase(meta, "expired", now);
    }

    switch (op) {
      case "status": {
        const pos = meta ? await this.state.storage.get<LocatorFix>("pos") : null;
        return objectJson({
          ok: true,
          phase: meta?.phase ?? "none",
          lastAcceptedAt: pos ? new Date(pos.at).toISOString() : this.lastPingAt ? new Date(this.lastPingAt).toISOString() : null,
          lastAccuracyM: pos?.accuracy ?? null,
          withheldNearBase: Boolean(this.lastPingAt && (!pos || this.lastPingAt > pos.at)),
          linkActive: Boolean(meta?.linkHash && !meta.linkRevokedAt && (meta.linkExpiresAt ?? 0) > now),
          linkExpiresAt: meta?.linkExpiresAt ? new Date(meta.linkExpiresAt).toISOString() : null,
        });
      }

      case "start": {
        const incoming = input.meta as LocatorMeta;
        if (meta && (meta.phase === "collected" || meta.phase === "cancelled" || meta.phase === "expired")) {
          return objectJson({ error: `This collection is ${meta.phase}`, code: meta.phase }, 409);
        }
        const next: LocatorMeta = {
          ...incoming,
          // Keep an existing customer link and owner note.
          linkHash: meta?.linkHash,
          linkCreatedAt: meta?.linkCreatedAt,
          linkExpiresAt: meta?.linkExpiresAt,
          linkRevokedAt: meta?.linkRevokedAt,
          meetingNote: meta?.meetingNote,
          phase: "sharing",
          sharingStartedAt: meta?.phase === "sharing" && meta.sharingStartedAt ? meta.sharingStartedAt : now,
          sharingStoppedAt: undefined,
          sharingBy: input.by === "owner" ? "owner" : "driver",
          jobCheckedAt: now,
        };
        await this.state.storage.put("meta", next);
        await this.ensureAlarm(next.closesAt);
        return objectJson({ ok: true, phase: "sharing", closesAt: next.closesAt });
      }

      case "position": {
        if (!meta || meta.phase !== "sharing") {
          return objectJson({ error: "Sharing is not active", code: meta?.phase ?? "not_started" }, 409);
        }
        if (!this.uploads.hit(LOCATOR_UPLOAD_RATE_PER_MINUTE, now)) {
          return objectJson({ ok: true, stored: false, throttled: true }, 429);
        }
        await this.recheckJob(meta, now);
        if (meta.phase !== "sharing") return objectJson({ error: `This collection is ${meta.phase}`, code: meta.phase }, 409);
        if (input.withheld === true) {
          // Near the driver's home: confirm it's alive, store nothing.
          this.lastPingAt = now;
          return objectJson({ ok: true, stored: false, withheld: true });
        }
        if (now - this.lastAcceptedAt < LOCATOR_SERVER_MIN_INTERVAL_MS) {
          return objectJson({ ok: true, stored: false, throttled: true });
        }
        const fix = input.fix as LocatorFix;
        await this.state.storage.put("pos", fix); // overwrites: latest position only
        this.lastAcceptedAt = now;
        return objectJson({ ok: true, stored: true, at: new Date(fix.at).toISOString() });
      }

      case "stop": {
        if (!meta) return objectJson({ ok: true, phase: "none" });
        const reason = input.reason === "collected" ? "collected" : "paused";
        if (meta.phase === "collected" || meta.phase === "cancelled" || meta.phase === "expired") {
          await this.state.storage.delete("pos");
          return objectJson({ ok: true, phase: meta.phase });
        }
        await this.setPhase(meta, reason, now);
        return objectJson({ ok: true, phase: reason });
      }

      case "link-create": {
        const seed = input.seed as Omit<LocatorMeta, "version" | "phase" | "jobCheckedAt">;
        const base: LocatorMeta = meta ?? { ...seed, version: 1, phase: "not_started", jobCheckedAt: now };
        if (base.phase === "collected" || base.phase === "cancelled" || base.phase === "expired") {
          return objectJson({ error: `This collection is ${base.phase}`, code: base.phase }, 409);
        }
        const next: LocatorMeta = {
          ...base,
          linkHash: String(input.linkHash),
          linkCreatedAt: now,
          linkExpiresAt: Number(input.expiresAt),
          linkRevokedAt: undefined,
          meetingNote: String(input.meetingNote ?? "") || undefined,
        };
        await this.state.storage.put("meta", next);
        await this.ensureAlarm(next.closesAt);
        return objectJson({ ok: true });
      }

      case "link-revoke": {
        if (meta?.linkHash) {
          meta.linkRevokedAt = now;
          delete meta.linkHash;
          await this.state.storage.put("meta", meta);
        }
        return objectJson({ ok: true, linkActive: false });
      }

      case "view": {
        // Same generic answer for every failure so links can't be probed.
        if (!meta?.linkHash || meta.linkRevokedAt || (meta.linkExpiresAt ?? 0) < now) {
          return objectJson({ error: "not found" }, 404);
        }
        if (!timingSafeEqualHex(String(input.linkHash ?? ""), meta.linkHash)) {
          return objectJson({ error: "not found" }, 404);
        }
        if (!this.views.hit(LOCATOR_VIEW_RATE_PER_MINUTE, now)) {
          return objectJson({ error: "Too many requests", retryAfterMs: 20_000 }, 429);
        }
        await this.recheckJob(meta, now);
        const pos = meta.phase === "sharing" ? await this.state.storage.get<LocatorFix>("pos") : null;
        return objectJson(buildCustomerView(meta, pos ?? null, now));
      }

      default:
        return objectJson({ error: "Unknown operation" }, 400);
    }
  }
}
