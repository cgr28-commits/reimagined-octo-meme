/** Public feature settings, persisted alongside existing booking settings. */
export type SaveQuoteSettings = {
  enabled: boolean;
  popupEnabled: boolean;
  popupDelaySeconds: number;
  validityDays: number;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
};
export const DEFAULT_SAVE_QUOTE_SETTINGS: SaveQuoteSettings = {
  enabled: true, popupEnabled: true, popupDelaySeconds: 20,
  validityDays: 7, emailEnabled: true, whatsappEnabled: true,
};
export function normalizeSaveQuoteSettings(raw: unknown): SaveQuoteSettings {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<SaveQuoteSettings>;
  const integer = (n: unknown, fallback: number, min: number, max: number) =>
    typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : fallback;
  return {
    enabled: v.enabled ?? true, popupEnabled: v.popupEnabled ?? true,
    popupDelaySeconds: integer(v.popupDelaySeconds, 20, 5, 300),
    validityDays: integer(v.validityDays, 7, 1, 7),
    emailEnabled: v.emailEnabled ?? true, whatsappEnabled: v.whatsappEnabled ?? true,
  };
}
export function parseSaveQuoteSettings(raw: unknown): SaveQuoteSettings {
  const value = normalizeSaveQuoteSettings(raw);
  if (!raw || typeof raw !== "object" || Object.entries(value).some(([k,v]) => (raw as Record<string, unknown>)[k] !== v)) {
    throw new Error("Choose a delay of 5–300 seconds, validity of 1–7 days, and all four switches.");
  }
  return value;
}
