/** Request-local failure marker, keyed by the storage wrapper; contains no identifiers. */
const unavailable = new WeakSet<object>();
export function markMeasurementUnavailable(store: object): void { unavailable.add(store); }
export function measurementUnavailable(store: object): boolean { return unavailable.has(store); }
