/**
 * Owner Google-review channels.
 * Email is sent by the Worker. WhatsApp is a manual wa.me prefill.
 * SMS stays hidden until a real review SMS sender exists.
 * Unused Twilio environment variables must not turn the SMS channel on.
 */

export type GoogleReviewRequestChannel = "email" | "whatsapp" | "sms";

export const GOOGLE_REVIEW_SMS_CHANNEL_ENABLED = false;

export function googleReviewRequestChannels(options: {
  hasUsableEmail: boolean;
  hasUsableMobile: boolean;
}): GoogleReviewRequestChannel[] {
  const channels: GoogleReviewRequestChannel[] = [];
  if (options.hasUsableEmail) channels.push("email");
  if (options.hasUsableMobile) channels.push("whatsapp");
  if (GOOGLE_REVIEW_SMS_CHANNEL_ENABLED && options.hasUsableMobile) {
    channels.push("sms");
  }
  return channels;
}
