/** Fictional, read-only staging records in the EXISTING KV schema. Never bind production KV. */
import type { TrackingJobRecord } from '../../shared/tracking';
import { paidBookingRefKey } from '../../shared/paid-booking-record';
export async function stagingStore(seed: string) {
  const data = new Map<string, string>();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
  const future = new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10);
  const sessions: Record<string, string> = {};
  for (const profile of ['owner', 'other', 'empty']) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${seed}:${profile}`));
    const token = 'dps_' + [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('');
    sessions[profile] = token;
    data.set(`driver-portal-session:${token}`, JSON.stringify({ profileKey: profile, driverName: profile === 'empty' ? 'Empty sample' : 'Colin (sample)', expiresAt: new Date(Date.now() + 3600000).toISOString() }));
  }
  const specs = [
    ['outbound', 'owner', today, '10:30', 'accepted'],
    ['arrival', 'owner', today, '14:30', 'accepted'],
    ['return', 'owner', future, '12:00', 'accepted'],
    ['cancelled', 'owner', today, '16:00', 'accepted'],
    ['other', 'other', today, '17:00', 'accepted'],
    ['unassigned', '', today, '18:00', 'unassigned'],
    ['legacy', '', today, '19:00', 'accepted'],
    ['missing-flight', 'owner', today, '20:00', 'pending'],
  ];
  for (const [id, profile, date, time, status] of specs) {
    const reference = `fixture-payment-${id}`;
    const job = {
      token: `staging-${id}`, customerReference: `MAT-STAGE-${id.toUpperCase()}`,
      paymentReference: reference, customerName: `${id} (fictional)`, customerEmail: 'fixture@example.invalid', customerMobile: '07000000000',
      tripDate: date, tripTime: time, pickupAt: `${date}T${time}`, createdAt: new Date().toISOString(),
      pickupLabel: id === 'outbound' ? 'Titanic Belfast' : 'Belfast International Airport (BFS)',
      dropoffLabel: id === 'outbound' ? 'Belfast International Airport (BFS)' : 'Belfast City Hall',
      isAirportTrip: true, isFromAirport: id !== 'outbound', airportCode: 'BFS',
      flightNumber: id === 'arrival' ? 'EZY123' : undefined,
      journeyLeg: id === 'return' ? 'return' : 'outbound', journeyStatus: 'idle', sharingActive: false,
      assignedDriverProfileKey: profile || undefined, assignedDriverName: id === 'unassigned' ? undefined : 'Colin (sample)', assignmentStatus: status,
    } as TrackingJobRecord;
    data.set(`track:job:${job.token}`, JSON.stringify(job));
    data.set(`track:ref:${reference}`, JSON.stringify([job.token]));
    const dayKey = `track:day:${date}`;
    data.set(dayKey, JSON.stringify([...(JSON.parse(data.get(dayKey) || '[]')), job.token]));
    data.set(paidBookingRefKey(reference), JSON.stringify({ paymentReference: reference, customerReference: job.customerReference,
      status: id === 'cancelled' ? 'cancelled' : 'confirmed', passengers: 3, suitcases: 2, vehicle: 'estate',
      notes: 'Fictional test instruction: meet at the agreed pickup point.', amountPaidLabel: '£80', customerEmail: 'fixture@example.invalid',
      flightNumber: id === 'return' ? 'OUTBOUND-ONLY' : undefined, returnFlightNumber: id === 'return' ? 'RETURN123' : undefined,
      airportAccessOption: 'free', outboundAirportAccessOption: 'free', returnAirportAccessOption: 'express',
      dublinArrivalTerminal: 'T1', returnDublinArrivalTerminal: 'T2',
    }));
  }
  data.set(`driver-flight:BFS:${today}:EZY123`, JSON.stringify({
    flight: { flightNumber: 'EZY123', airline: 'Fictional example', departureAirport: 'LHR', arrivalAirport: 'BFS', airportCode: 'BFS', airportName: 'Belfast International', date: today, scheduledTime: '14:30', revisedTime: `${today}T15:15:00+01:00`, status: 'Delayed', delayMinutes: 45 },
    lastCheckedAt: new Date().toISOString(), message: 'Fictional staging flight — not a live airline update.',
  }));
  const store = {
    async get(key: string, type?: string) { const value = data.get(key); return value === undefined ? null : type === 'json' ? JSON.parse(value) : value; },
    async put() { throw new Error('Read-only staging database'); },
    async delete() { throw new Error('Read-only staging database'); },
    async list({ prefix = '', limit = 25, cursor = '0' } = {}) {
      const keys = [...data.keys()].filter(k => k.startsWith(prefix)).sort();
      const start = /^\d+$/.test(cursor) ? Number(cursor) : 0;
      return { keys: keys.slice(start, start + limit).map(name => ({ name })), list_complete: start + limit >= keys.length, cursor: String(start + limit) };
    },
  } as unknown as KVNamespace;
  return { store, sessions, data, today, future };
}
