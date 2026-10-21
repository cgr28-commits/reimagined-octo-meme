# My Jobs web dashboard draft

This branch is for review. No production deployment, native app, subscription, SMS service, or flight-provider upgrade is included.

## Changes

- Personal My Jobs invitation access on `/driver/`; no shared driver-key form. Existing invitations in emails still work. New owner invitations use a URL fragment, which is removed before the dashboard opens.
- Owner dashboard has an “Open my driving jobs” button. It issues a driver-scoped session for the saved owner profile, with no administrator permissions. The owner profile must have a saved name and contact details.
- Personal sessions persist in Safari for up to 30 days. Home Screen instructions use a Safari bookmark to retain that browser session. Physical iPhone installation and persistence still need verification.
- Personal job lists paginate through all retained assigned journeys, with no future-date cutoff. Today, selected date and upcoming views remain available. Pending assignments are fetched across all dates.
- Newly confirmed outbound and return journeys default to the owner as an accepted driver. Existing assignments are preserved. Owner administration keeps assignment and booking tools; journey operation buttons are moved out of the owner view.
- Tracking records and their indexes survive until at least 45 days after pickup. Existing records are not bulk-migrated; records already expired cannot be recovered by this change.
- Drivers see the customer-facing booking number, not internal payment identifiers. Return legs remain distinguishable in sanitized responses.
- Personal GPS updates check current assignment rather than bypassing it through a journey session token. Stopping sharing also requires assignment authorization. Browser GPS still pauses when iOS suspends the page or locks the phone.

## Flight updates and cost gate

`DRIVER_FLIGHT_MONITOR_ENABLED` is deliberately absent/off. Do not set it to `true` until the existing AeroDataBox plan, allowance and cost limits have been verified with the owner. No provider account has been inspected or upgraded.

When enabled, an expanded flight panel checks every five minutes while visible, within two days of pickup. Server results are cached for five minutes. Responses match flight number, airport and travel date using the existing lookup. Provider status, revised arrival, landing time when marked arrived, delay minutes, cancellations and diversions are shown without modifying the booking. These are dashboard warnings, not background push/SMS alerts. Provider coverage and delivery are not guaranteed. Existing booking verification and owner-dashboard flight lookups are unchanged.

Provider field semantics were checked against https://doc.aerodatabox.com/docs/openapi-rapidapi-v1.yaml: revisedTime is actual/estimated arrival, runwayTime is actual/estimated runway movement. An actual landing label is only used once the provider marks the flight arrived.

## Validation

- Frontend static production export passed with existing repository warnings. The new removal of the owner journey renderer leaves an unused helper warning; no compile errors.
- Worker TypeScript check passed.
- Existing assigned-driver access, privacy/notification and owner-profile checks passed.
- New offline contract test covers 200/220-day outbound and return bookings, retention, owner default, idempotency after reassignment, private references, driver scope, one-use invitation exchange, owner-only invitation issuance, disabled flight no-network behavior, empty-page pagination and a 75-minute flight delay fixture.
- No live bookings, emails, payments or provider calls were used by tests.
- Browser UI verification could not run: Chromium was not installed and its download returned an invalid archive. No physical iPhone test has been performed.

Before release, test the personal invitation and Home Screen bookmark on an iPhone, and review how any existing future bookings should be migrated. Deploy Worker and frontend together after review; the new UI requires the new Worker routes.
