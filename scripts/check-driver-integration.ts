import assert from 'node:assert/strict';
import { previewRequest } from './driver-integration/preview-worker';
import { stagingStore } from './driver-integration/staging-store';
import { handleDriverJobsRequest, handlePersonalDriverFlight } from '../workers/addresses/src/tracking-handlers';
import { resolveAuthorizedSession } from '../workers/addresses/src/driver-portal-session';
import { filterJobsForSession, assertDriverCanOperateJob } from '../workers/addresses/src/driver-assignment-utils';
import type { TrackingJobRecord } from '../shared/tracking';
const seed = 'offline-test-only';
async function main() {
  globalThis.fetch = async () => { throw new Error('Unexpected external request'); };
  const { store, sessions, data, today } = await stagingStore(seed);
  const before = JSON.stringify([...data]);
  const env = { TRACKING_STORE: store, OWNER_ACCESS_KEY: 'test-admin' };
  const request = (path: string, token?: string, method = 'GET', body?: unknown) => new Request(`https://staging.invalid${path}`, { method, headers: { ...(token ? { 'X-Driver-Session': token } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  for (const token of [undefined, 'dps_invalid']) assert.equal((await handleDriverJobsRequest(request('/driver/jobs?scope=assigned-page', token), env, null)).status, 401);
  for (const [profile, expected] of [['owner', 5], ['other', 1], ['empty', 0]] as const) {
    const response = await handleDriverJobsRequest(request('/driver/jobs?scope=assigned-page', sessions[profile]), env, null);
    assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const { jobs } = await response.json() as { jobs: Array<Record<string, any>> };
    assert.equal(jobs.length, expected);
    assert.ok(jobs.every(job => !job.customerEmail && !job.paymentReference && !job.amountPaidLabel));
    if (profile === 'owner') {
      assert.ok(!jobs.some(job => ['staging-other', 'staging-unassigned', 'staging-legacy'].includes(job.token)));
      const returning = jobs.find(job => job.journeyLeg === 'return')!;
      assert.equal(returning.flightNumber, 'RETURN123'); assert.equal(returning.airportAccessOption, 'express'); assert.equal(returning.dublinArrivalTerminal, 'T2');
      assert.ok(returning.pickupDisplay?.includes('12:00'), 'Pickup time must survive the driver privacy filter');
      assert.equal(returning.passengers, 3); assert.equal(returning.suitcases, 2); assert.ok(returning.notes.includes('Fictional'));
      const cancelled = jobs.find(job => job.token === 'staging-cancelled')!;
      assert.equal(cancelled.bookingStatus, 'cancelled'); assert.deepEqual(cancelled.allowedJourneyActions, []);
      assert.equal(jobs.find(job => job.token === 'staging-missing-flight')!.customerMobile, undefined);
    }
  }
  const ownerResponse = await handleDriverJobsRequest(new Request(`https://staging.invalid/driver/jobs?date=${today}`, { headers: { 'X-Owner-Key': 'test-admin' } }), env, null);
  assert.equal(ownerResponse.status, 200); assert.equal((await ownerResponse.json() as any).jobs.length, 7);
  const raw = await store.get<TrackingJobRecord>('track:job:staging-other', 'json');
  assert.deepEqual(filterJobsForSession([raw!], { authorized: false }), []);
  assert.ok(assertDriverCanOperateJob(raw!, { authorized: true, role: 'driver', profileKey: 'owner', driverName: 'Colin (sample)' }));
  for (const token of ['staging-other', 'staging-unassigned', 'staging-legacy', 'does-not-exist']) assert.equal((await handlePersonalDriverFlight(request('/driver/flight', sessions.owner, 'POST', { token }), env, null)).status, 404);
  for (const token of ['staging-missing-flight', 'staging-cancelled']) {
    const result = await handlePersonalDriverFlight(request('/driver/flight', sessions.owner, 'POST', { token }), { ...env, DRIVER_FLIGHT_MONITOR_ENABLED: 'true' }, null);
    assert.equal(result.status, 200); assert.equal((await result.json() as any).flight, null);
  }
  const delay = await previewRequest(request('/driver/flight', sessions.owner, 'POST', { token: 'staging-arrival' }), seed);
  assert.equal((await delay!.json() as any).flight.delayMinutes, 45);
  for (const path of ['/driver/journey', '/driver/assignment', '/driver/portal/invite', '/driver/location']) assert.equal((await previewRequest(request(path, sessions.owner, 'POST', {}), seed))!.status, 403);
  assert.equal((await previewRequest(request('/driver/preview-session', undefined, 'POST', {}), seed))!.status, 403);
  const login = await previewRequest(new Request('https://staging.invalid/driver/preview-session', { method: 'POST', headers: { Origin: 'https://staging.invalid' }, body: '{"profile":"other"}' }), seed);
  assert.equal((await login!.json() as any).sessionToken, sessions.other);
  assert.equal(JSON.stringify([...data]), before, 'Reads must not mutate bookings, assignments or payments');
  data.set(`driver-portal-session:${sessions.owner}`, JSON.stringify({ profileKey: 'owner', expiresAt: '2000-01-01T00:00:00Z' }));
  assert.equal((await resolveAuthorizedSession(request('/driver/jobs', sessions.owner), env)).authorized, false);
  console.log('PASS: server authentication, expired/invalid sessions, same-name isolation, unassigned/legacy exclusion, owner visibility, return metadata, cancelled actions, pending privacy, missing flights, delayed fixture, no external calls, read-only storage and preview mutation denial.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
