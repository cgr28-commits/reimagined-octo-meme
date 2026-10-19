import { resolveBookingsApiUrl } from "@/lib/worker-api";

export type DesktopEnquiry = { name: string; email: string; message: string; journey: string };

export function validateDesktopEnquiry(input: DesktopEnquiry): string | null {
  if (input.name.trim().length < 2 || input.name.trim().length > 80) return "Enter your name (2–80 characters).";
  if (input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) return "Enter a valid email address.";
  if (input.message.length > 2000) return "Keep your message under 2,000 characters.";
  if (!input.journey.trim()) return "Please generate your journey quote first.";
  return null;
}

/** Existing owner-inbox route. No booking payload, payment, calendar or new endpoint. */
export async function sendDesktopQuoteEnquiry(input: DesktopEnquiry, request: typeof fetch = fetch): Promise<string> {
  const error = validateDesktopEnquiry(input);
  if (error) throw new Error(error);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await request(resolveBookingsApiUrl(), {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ customerName: input.name.trim(), sendEmail: true,
        message: ["DESKTOP QUOTE ENQUIRY — not a confirmed booking", `Customer: ${input.name.trim()}`, `Reply email: ${input.email.trim()}`, input.journey,
          `Message: ${input.message.trim() || "No additional message."}`, "Please reply to the customer email above. No booking or payment has been made."].join("\n\n") }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true || result?.emailSent !== true) {
      throw new Error("We couldn't confirm your email was sent. Please try again or contact us using the details below.");
    }
    return typeof result.bookingReference === "string" ? result.bookingReference : "";
  } finally { clearTimeout(timeout); }
}
