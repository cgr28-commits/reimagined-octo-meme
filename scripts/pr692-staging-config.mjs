import assert from 'node:assert/strict';
export const RELEASE_SHA = 'df16c3530c9cdf575237e1ab87303b06807b0f4b';
export const STAGING_NAME = 'reimagined-octo-meme-pr692-staging';
export const ACCOUNT_ID = '36c5c88df4c1f0259413d555f2679f3c';
export const FORBIDDEN_IDS = ['53fa3cc2bd46436f90ae19200e599ea1', '869e2c2e02004d4a88c9cfbf563f1d6a'];
export const REQUIRED_SECRETS = ['CLOUDFLARE_API_TOKEN', 'SUMUP_API_KEY', 'SUMUP_MERCHANT_CODE', 'GOOGLE_PLACES_API_KEY', 'OWNER_ACCESS_KEY', 'QUOTE_RECEIPT_SECRET'].map(name => `PR692_STAGING_${name}`);
export function stagingConfig(trackingId, counterId, frontendOrigin) {
  const origin = new URL(frontendOrigin);
  assert.equal(origin.protocol, 'https:');
  assert.equal(origin.origin, frontendOrigin);
  assert.match(origin.hostname, /^matni-pr692-staging(?:-[a-z0-9-]+)?\.vercel\.app$/);
  for (const id of [trackingId, counterId]) {
    assert.match(id, /^[a-f0-9]{32}$/);
    assert.ok(!FORBIDDEN_IDS.includes(id), 'Production/shared-preview storage is forbidden');
  }
  assert.notEqual(trackingId, counterId);
  const classes = ['RefundCoordinator', 'QuoteLeadCoordinator', 'MeetGreetCoordinator', 'ConsentLedger'];
  return {
    name: STAGING_NAME, account_id: ACCOUNT_ID, main: 'src/staging-entry.ts',
    compatibility_date: '2025-08-01', workers_dev: true, routes: [],
    triggers: {crons: []}, observability: {enabled: false},
    kv_namespaces: [{binding:'TRACKING_STORE',id:trackingId},{binding:'BOOKING_COUNTER',id:counterId}],
    durable_objects: {bindings: classes.map(class_name => ({name: ({RefundCoordinator:'REFUND_COORDINATOR',QuoteLeadCoordinator:'QUOTE_LEAD_COORDINATOR',MeetGreetCoordinator:'MEET_GREET_COORDINATOR',ConsentLedger:'CONSENT_LEDGER'})[class_name],class_name}))},
    migrations: classes.map((name,i)=>({tag:`v${i+1}-${['refund-coordinator','quote-lead-coordinator','meet-greet-coordinator','consent-ledger'][i]}`,new_sqlite_classes:[name]})),
    vars: {STAGING_ENVIRONMENT: STAGING_NAME, STAGING_RELEASE_SHA: RELEASE_SHA, PUBLIC_SITE_ORIGIN:frontendOrigin},
  };
}
