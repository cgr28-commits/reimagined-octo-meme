export const PRIVACY_LAST_UPDATED = "August 2026";

export const PRIVACY_SECTIONS = [
  {
    title: "Who we are",
    content: [
      "My Airport Taxi NI provides pre-booked private airport transfers in Northern Ireland.",
      "Contact: bookings@myairporttaxini.co.uk · 028 9602 2952",
    ],
  },
  {
    title: "Information we collect",
    content: ["When you request a quote or make a booking, we may collect:"],
    list: [
      "Name, email address and mobile number",
      "Pickup and drop-off addresses",
      "Travel date, time and flight numbers (for airport journeys)",
      "Passenger and luggage details",
      "Payment confirmation details from SumUp (amount, transaction reference)",
      "Optional live location if you choose to share it on your tracking link",
    ],
  },
  {
    title: "How we use your information",
    content: ["We use your information to:"],
    list: [
      "Provide quotations and confirm bookings",
      "Process card payments via SumUp",
      "Send booking confirmations and invoices by email",
      "Contact you about your journey (including SMS/WhatsApp where agreed)",
      "Share live driver tracking links when applicable",
      "Log bookings in our business calendar",
      "Respond to enquiries and complaints",
    ],
  },
  {
    title: "Legal basis",
    content: [
      "We process personal data to perform our contract with you (your booking), for legitimate business interests (operating our service safely and efficiently), and where required to comply with law.",
    ],
  },
  {
    title: "Who we share data with",
    content: ["We may share limited data with trusted service providers, including:"],
    list: [
      "SumUp — card payment processing",
      "Cloudflare — website hosting and booking API",
      "Email delivery providers — sending confirmations",
      "Google — address lookup, maps and calendar logging where configured",
      "Flight data providers — verifying flight numbers you enter",
    ],
    footer: "We do not sell your personal data.",
  },
  {
    title: "Retention",
    content: [
      "Booking and payment records are kept as long as needed for customer service, accounting, tax and dispute resolution — typically up to 6 years where required.",
      "Live tracking data is stored temporarily and expires automatically.",
    ],
  },
  {
    title: "Your rights",
    content: [
      "Under UK GDPR you may request access, correction or deletion of your personal data, or object to certain processing. Contact us at bookings@myairporttaxini.co.uk.",
      "You may also complain to the Information Commissioner's Office (ICO).",
    ],
  },
  {
    title: "Cookies",
    content: [
      "This website uses essential browser storage to remember payment return state during checkout. We do not use third-party advertising or analytics cookies.",
    ],
  },
  {
    title: "Changes",
    content: [
      "We may update this policy from time to time. The date at the top of this page shows when it was last revised.",
    ],
  },
] as const;
