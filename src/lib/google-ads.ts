/** Optional Google Ads conversion measurement (set via GitHub Actions secrets). */

export type GoogleAdsConfig = {
  adsId: string;
  conversionLabel: string;
  /** Combined send_to value: AW-XXXX/label */
  sendTo: string;
  enabled: boolean;
};

export function getGoogleAdsConfig(): GoogleAdsConfig {
  const adsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim() ?? "";
  const conversionLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL?.trim() ?? "";
  const sendTo = adsId && conversionLabel ? `${adsId}/${conversionLabel}` : "";
  return {
    adsId,
    conversionLabel,
    sendTo,
    enabled: Boolean(sendTo),
  };
}

export const BOOKING_CONFIRMED_PATH = "/booking-confirmed/";
