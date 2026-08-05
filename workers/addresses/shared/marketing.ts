export const MARKETING_CONSENT_VERSION = "August 2026";

export type MarketingOptInSource =
  | "paid-booking"
  | "booking-request"
  | "tour-enquiry"
  | "vehicle-enquiry";

export type MarketingSubscriber = {
  email: string;
  name?: string;
  optedInAt: string;
  source: MarketingOptInSource;
  consentVersion: string;
  unsubscribedAt?: string;
};

export type MarketingOptInFields = {
  marketingOptIn?: boolean;
  marketingOptInAt?: string;
  marketingConsentVersion?: string;
};

export function formatMarketingOptInLine(fields: MarketingOptInFields): string | null {
  if (!fields.marketingOptIn) {
    return null;
  }

  const when = fields.marketingOptInAt?.trim();
  const version = fields.marketingConsentVersion?.trim() || MARKETING_CONSENT_VERSION;
  return when
    ? `Marketing updates: opted in (${when}, consent ${version})`
    : `Marketing updates: opted in (consent ${version})`;
}
