/**
 * Production gates for Fonio voice tools.
 *
 * Quotation + address search can go live while booking/payment-link tools stay
 * off until VOICE_ENABLE_BOOKING_TOOLS is explicitly set on the Worker.
 */

export type VoiceBookingToolsEnv = {
  /** Set to "1" / "true" / "yes" only after booking-link + provisional tools are verified. */
  VOICE_ENABLE_BOOKING_TOOLS?: string;
};

export function voiceBookingToolsEnabled(env: VoiceBookingToolsEnv): boolean {
  return /^(1|true|yes)$/i.test(String(env.VOICE_ENABLE_BOOKING_TOOLS ?? "").trim());
}

export const VOICE_BOOKING_TOOLS_DISABLED_SAY =
  "I can get you a fixed price on this call, but I'm not sending booking or payment links just yet while we finish testing. Can I take your name and mobile so the team can text you the secure link shortly?";
