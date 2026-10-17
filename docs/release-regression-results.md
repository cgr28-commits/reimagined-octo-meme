# Isolated regression census — 17 October 2026

239 TS checks attempted: 200 pass, 39 non-passes also reproduced on remote main. No new non-pass relative to main. The separate 20-suite measurement runner and real workerd/SQLite test pass. Tests run with fictional/mocked providers, without credentials or unmocked HTTP/CLI access.

Do not describe this as a fully green repository. Review stale assertions and genuine baseline defects before release; live-data and historical-harness checks need isolated supported substitutes rather than production access. Pricing algorithms/configuration are unchanged by this branch.

| Check | Result | Comparison |
|---|---|---|
| `check-a2a-personalised-quote.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-a2a-roi-journeys.ts` | Pass | — |
| `check-a2a-scroll-flow.ts` | Pass | — |
| `check-ad-fraud-monitoring.ts` | Pass | — |
| `check-add-driver.ts` | Pass | — |
| `check-address-autocomplete-quality.ts` | Pass | — |
| `check-address-autocomplete-quota.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-address-space-typing.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-ads-click-id-retention.ts` | Pass | — |
| `check-airport-airport-access-fees.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-airport-fee-product-rules.ts` | Pass | — |
| `check-airport-fee-wording.ts` | Pass | — |
| `check-airport-fixed-costs.ts` | Pass | — |
| `check-airport-hero-images.ts` | Pass | — |
| `check-airport-pickup-destination-area.ts` | Pass | — |
| `check-airport-pickup-flight-required.ts` | Pass | — |
| `check-airport-pickup-reminder.ts` | Pass | — |
| `check-airport-pricing-revision.ts` | Pass | — |
| `check-airport-to-airport-pricing.ts` | Pass | — |
| `check-airport-weekend-premium.ts` | Pass | — |
| `check-amendment-accounting.ts` | Pass | — |
| `check-amendment-confirmation.ts` | Pass | — |
| `check-amendment-test-fixture.ts` | Pass | — |
| `check-amendment-topup.ts` | Pass | — |
| `check-approved-profitability-routes.ts` | Blocked: external data/runtime | Also fails/blocked on main |
| `check-arrived-pickup-whatsapp.ts` | Pass | — |
| `check-belfast-airport-distance-floor.ts` | Pass | — |
| `check-belfast-airport-island-lookup.ts` | Pass | — |
| `check-bfs-bhd-roi-instant-quote.ts` | Pass | — |
| `check-bfs-bhd-surcharge-waiver.ts` | Pass | — |
| `check-bhd-city-hall-34.ts` | Pass | — |
| `check-book-quote-mobile.ts` | Pass | — |
| `check-booking-amendment.ts` | Pass | — |
| `check-booking-confirmation-preview.ts` | Pass | — |
| `check-booking-request-validation.ts` | Pass | — |
| `check-bot-site-knowledge.ts` | Pass | — |
| `check-business-class-dublin-page.ts` | Pass | — |
| `check-business-class-minimum.ts` | Pass | — |
| `check-business-class-passenger-limit.ts` | Pass | — |
| `check-business-class-quote-mode.ts` | Pass | — |
| `check-business-class-quote-selector.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-cancellation-confirmation-email.ts` | Pass | — |
| `check-cancellation-refund-wording.ts` | Pass | — |
| `check-child-seats-booking-sumup.ts` | Pass | — |
| `check-company-voice-journey-messages.ts` | Pass | — |
| `check-consent-ledger.ts` | Pass | — |
| `check-conversion-tracking.ts` | Pass | — |
| `check-cork-transfer-pages.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-cruise-terminal-page.ts` | Pass | — |
| `check-customer-booking-reference.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-customer-confirm-email.ts` | Pass | — |
| `check-customer-payment-window.ts` | Pass | — |
| `check-customer-smart-availability.ts` | Pass | — |
| `check-daily-quote-report.ts` | Pass | — |
| `check-deferred-quote-flights.ts` | Pass | — |
| `check-demo-features.ts` | Pass | — |
| `check-deposit-cash.ts` | Pass | — |
| `check-desktop-homepage-layout.ts` | Pass | — |
| `check-destination-hero-images.ts` | Pass | — |
| `check-driver-on-the-way.ts` | Pass | — |
| `check-driver-pay-ledger.ts` | Pass | — |
| `check-driver-portal-access.ts` | Pass | — |
| `check-driver-portal-permissions.ts` | Pass | — |
| `check-driver-profile-persist.ts` | Pass | — |
| `check-driver-whatsapp-voice.ts` | Pass | — |
| `check-dublin-airport-fare-adjustment.ts` | Pass | — |
| `check-dublin-airport-label.ts` | Pass | — |
| `check-dublin-city-profitability.ts` | Pass | — |
| `check-dublin-enniskillen-corridors.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-email-logo.ts` | Pass | — |
| `check-emerge-belfast-page.ts` | Pass | — |
| `check-executive-multiplier.ts` | Pass | — |
| `check-express-drop-off.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-express-fare-display.ts` | Pass | — |
| `check-final-correction-pass.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-flight-number-overflow.ts` | Pass | — |
| `check-free-postcode-flow.ts` | Pass | — |
| `check-fresh-visit-address-reset.ts` | Pass | — |
| `check-global-pricing-routes.ts` | Pass | — |
| `check-google-ads-request-quote.ts` | Pass | — |
| `check-gps-ingestion.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-gps-session-cors.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-greater-belfast-area-classify.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-greater-belfast-ireland.ts` | Pass | — |
| `check-homepage-hero-copy.ts` | Pass | — |
| `check-homepage-hero-ctas.ts` | Pass | — |
| `check-homepage-mobile-quote-ui.ts` | Pass | — |
| `check-homepage-premium-cards.ts` | Pass | — |
| `check-ideal-postcodes.ts` | Blocked: external data/runtime | Also fails/blocked on main |
| `check-journey-evidence.ts` | Pass | — |
| `check-journey-reminders-and-city-map.ts` | Pass | — |
| `check-journey-tip.ts` | Pass | — |
| `check-journey-tracking.ts` | Pass | — |
| `check-landing-hero-media.ts` | Pass | — |
| `check-landing-quote-cta.ts` | Pass | — |
| `check-locations-crawl.ts` | Pass | — |
| `check-long-distance-tiers.ts` | Pass | — |
| `check-luggage-capacity-confirmation.ts` | Pass | — |
| `check-manual-meet-greet-email.ts` | Pass | — |
| `check-mark-external-refund.ts` | Pass | — |
| `check-max-4-passengers.ts` | Pass | — |
| `check-measurement-shutdown.ts` | Pass | — |
| `check-meet-greet-email-upgrade.ts` | Pass | — |
| `check-meet-greet.ts` | Pass | — |
| `check-minibus-availability.ts` | Pass | — |
| `check-minibus-personal-quote.ts` | Pass | — |
| `check-minimum-booking-notice.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-mobile-menu-scroll.ts` | Pass | — |
| `check-mobile-quote-autoscroll.ts` | Pass | — |
| `check-mobile-quote-step-scroll.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-mobile-quote-top-spacing.ts` | Pass | — |
| `check-ni-autocomplete-donaghadee.ts` | Pass | — |
| `check-ni-roi-address-filter.ts` | Pass | — |
| `check-night-weekend-surcharge.ts` | Pass | — |
| `check-no-floating-whatsapp.ts` | Pass | — |
| `check-no-public-from-prices.ts` | Pass | — |
| `check-open-website-payment-fares.ts` | Pass | — |
| `check-osrm-identifying-headers.ts` | Pass | — |
| `check-ots-pricing-daily.ts` | Blocked: external data/runtime | Also fails/blocked on main |
| `check-owner-availability-earned-revenue.ts` | Pass | — |
| `check-owner-availability-overflow.ts` | Pass | — |
| `check-owner-booking-availability.ts` | Pass | — |
| `check-owner-booking-calendar.ts` | Pass | — |
| `check-owner-daily-driver-layout.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-owner-dashboard-job-cleanup.ts` | Pass | — |
| `check-owner-dashboard-layout.ts` | Pass | — |
| `check-owner-dashboard-today-sections.ts` | Pass | — |
| `check-owner-default-driver.ts` | Pass | — |
| `check-owner-email-bcc.ts` | Pass | — |
| `check-owner-financial-summary.ts` | Pass | — |
| `check-owner-job-nav-links.ts` | Pass | — |
| `check-owner-jobs-profile-fix.ts` | Pass | — |
| `check-owner-mobile-ui.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-owner-no-availability.ts` | Pass | — |
| `check-owner-paid-bookings-ui.ts` | Pass | — |
| `check-owner-pricing.ts` | Pass | — |
| `check-owner-profile-persist.ts` | Pass | — |
| `check-owner-quick-quote-selectors.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-owner-safer-journey-buttons.ts` | Pass | — |
| `check-owner-upcoming-edit.ts` | Pass | — |
| `check-paid-booking-ads-conversion.ts` | Pass | — |
| `check-paid-booking-resend.ts` | Pass | — |
| `check-paid-checkout-recovery.ts` | Pass | — |
| `check-payment-placeid-route-resolve.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-personal-quote-codes.ts` | Pass | — |
| `check-place-display-address.ts` | Pass | — |
| `check-postcode-management.ts` | Pass | — |
| `check-postcode-pricing.ts` | Pass | — |
| `check-postcode-release-compatibility.ts` | Blocked: external data/runtime | Also fails/blocked on main |
| `check-pr435-price-consistency.ts` | Pass | — |
| `check-pre-xl-desktop-header.ts` | Pass | — |
| `check-premises-address-autocomplete.ts` | Pass | — |
| `check-pricing-benchmarks.ts` | Pass | — |
| `check-pricing-confirmation.ts` | Pass | — |
| `check-pricing-vehicle-quote-flow.ts` | Pass | — |
| `check-profitability-floor.ts` | Pass | — |
| `check-public-help-fabs.ts` | Pass | — |
| `check-public-minibus-capacity.ts` | Pass | — |
| `check-public-nav-no-landline.ts` | Pass | — |
| `check-quick-quote-checkout-expiry-hotfix.ts` | Pass | — |
| `check-quick-quote-knocknagoney-e2e.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-quick-quote-minibus-discount.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-quick-quote-roi-manual-price.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-quick-quote.ts` | Pass | — |
| `check-quote-airport-benefits.tsx` | Pass | — |
| `check-quote-authoritative-fare.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-quote-checkout-page.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-quote-datetime-overflow.ts` | Pass | — |
| `check-quote-daylight-contrast.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-quote-error-help-render.tsx` | Pass | — |
| `check-quote-error-help-start-new.ts` | Pass | — |
| `check-quote-flight-booking-stage.ts` | Pass | — |
| `check-quote-funnel-analytics.ts` | Pass | — |
| `check-quote-journey-direction.ts` | Pass | — |
| `check-quote-lead-email.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-quote-mode-config.ts` | Pass | — |
| `check-quote-party-selection.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-quote-path-fare-parity.ts` | Pass | — |
| `check-quote-pax-luggage.ts` | Pass | — |
| `check-quote-positioning-performance.ts` | Pass | — |
| `check-quote-receipt.ts` | Pass | — |
| `check-quote-required-fields.ts` | Pass | — |
| `check-quote-reveal-scroll.ts` | Pass | — |
| `check-quote-reveal-stability.ts` | Pass | — |
| `check-quote-routing-recovery.ts` | Pass | — |
| `check-quote-schedule-price-gate.ts` | Pass | — |
| `check-quote-selected-state.ts` | Pass | — |
| `check-quote-stats.ts` | Pass | — |
| `check-quote-step-highlight.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-quote-tool-ux.ts` | Pass | — |
| `check-quote-vehicle-fare-refresh.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-refund-leg-cancel.ts` | Pass | — |
| `check-refund-ops.ts` | Pass | — |
| `check-refund-prod-readiness.ts` | Pass | — |
| `check-refund-status-isolation.ts` | Pass | — |
| `check-refund-test-one-pound.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-refund-test-primary-tracking-mark.ts` | Pass | — |
| `check-refund-test-tracking-isolation.ts` | Pass | — |
| `check-refund-workflow-ui.ts` | Pass | — |
| `check-reopen-job.ts` | Pass | — |
| `check-restored-address-confirm.ts` | Pass | — |
| `check-restored-places-route-payment.ts` | Pass | — |
| `check-return-leg-tracking.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-return-offer-address-confirm.ts` | Pass | — |
| `check-return-offer-journey-ux.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-return-offer.ts` | Pass | — |
| `check-review-request.ts` | Pass | — |
| `check-save-to-contacts.ts` | Pass | — |
| `check-saved-quote-booking-suppression.ts` | Pass | — |
| `check-saved-quote.ts` | Pass | — |
| `check-served-airport-suggestions.ts` | Pass | — |
| `check-short-notice-alternative-time.ts` | Pass | — |
| `check-short-notice-inflight-payment.ts` | Pass | — |
| `check-short-notice-lead-expiry.ts` | Pass | — |
| `check-short-notice-minibus-booking.ts` | Pass | — |
| `check-short-notice-payment-email.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-short-notice-period-setting.ts` | Pass | — |
| `check-site-nav-scroll.ts` | Pass | — |
| `check-smart-ops.ts` | Pass | — |
| `check-start-new-quote.ts` | Pass | — |
| `check-sumup-booking-conversion.ts` | Pass | — |
| `check-sumup-payment-ux.ts` | Pass | — |
| `check-sumup-refund-reconcile.ts` | Pass | — |
| `check-sumup-transaction-metadata.ts` | Pass | — |
| `check-technical-seo.ts` | Pass | — |
| `check-time-confirm-scroll.ts` | Pass | — |
| `check-town-landing-pages.ts` | Pass | — |
| `check-tracking-diagnostic.ts` | Pass | — |
| `check-tracking-email-delivery.ts` | Pass | — |
| `check-transfer-legacy-redirects.ts` | Pass | — |
| `check-trip-route-fallback.ts` | Pass | — |
| `check-uk-time.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-universal-distance-pricing.ts` | Pass | — |
| `check-vehicle-selection.ts` | Pass | — |
| `check-vehicle-suitability-estate-uplift.ts` | Pass | — |
| `check-vito-group-pages.ts` | Pass | — |
| `check-whatsapp-row-external-refund.ts` | Existing assertion failure | Also fails/blocked on main |
| `check-worker-booking-endpoints.ts` | Pass | — |
| `check-york-street-autocomplete.ts` | Pass | — |
