import { BUSINESS_LEGAL } from "@/lib/business-legal";

export const PRIVACY_LAST_UPDATED = "August 2026";

export const PRIVACY_SECTIONS = [
  {
    title: "Who we are",
    content: [
      `${BUSINESS_LEGAL.tradingName} provides pre-booked private airport transfers in ${BUSINESS_LEGAL.serviceArea}.`,
      `Contact: ${BUSINESS_LEGAL.email} · ${BUSINESS_LEGAL.phoneDisplay}`,
      `${BUSINESS_LEGAL.operatorNote}.`,
      BUSINESS_LEGAL.addressOnRequestNote,
    ],
  },
  {
    title: "Information we collect",
    content: ["When you request a quote or make a booking, we may collect:"],
    list: [
      "Name, email address and mobile number",
      "Pickup and drop-off addresses (including addresses you select via Google Places on our quote form)",
      "Travel date, time and flight numbers (for airport journeys)",
      "Passenger and luggage details",
      "Payment confirmation details from SumUp (amount, transaction reference)",
      "Optional live location if you choose to share it on your tracking link",
      "Marketing preferences if you opt in to receive updates (optional)",
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
      "Send occasional marketing emails if you have opted in (offers, travel tips and service news)",
    ],
  },
  {
    title: "Marketing emails",
    content: [
      "We only send marketing emails if you tick the optional marketing checkbox when booking or enquiring. This is separate from the terms you must accept to complete a booking.",
      "Marketing emails may include special offers, travel tips and news about our airport transfer and day trip services.",
      "You can withdraw consent at any time using our unsubscribe page or by emailing bookings@myairporttaxini.co.uk with the address you wish to remove.",
      "We do not sell your email address to third parties for their marketing.",
    ],
  },
  {
    title: "Legal basis",
    content: [
      "We process personal data to perform our contract with you (your booking), for legitimate business interests (operating our service safely and efficiently), and where required to comply with law.",
      "Marketing emails are sent only with your consent. You may withdraw consent at any time without affecting your booking.",
    ],
  },
  {
    title: "Who we share data with",
    content: ["We may share limited data with trusted service providers, including:"],
    list: [
      "SumUp — card payment processing",
      "Cloudflare — website hosting and booking API",
      "Email delivery providers — sending confirmations",
      "Google — address autocomplete (Google Places), maps, directions, and calendar logging where configured",
      "Flight data providers — verifying flight numbers you enter",
      "Meta Platforms, Inc. / WhatsApp — when you contact us or send booking messages via WhatsApp, message content and related contact details may be processed through Meta’s WhatsApp Business Platform and our WhatsApp Business provider",
    ],
    footer:
      "When our automated booking or messaging systems are connected to WhatsApp, booking and message information may be processed through Meta’s WhatsApp Business Platform and whichever WhatsApp Business provider we use. We do not sell your personal data.",
  },
  {
    title: "Google Places address search",
    content: [
      "When you type a pickup or drop-off address on our quote form, your search text is sent to Google Places so we can show address suggestions. If you select a suggestion, Google also returns place details (such as the formatted address and place identifier) that we use to quote and book your journey.",
      "Google processes those address searches under Google’s privacy policy. We only accept addresses you select from Google’s suggestions — free-typed text alone is not used as a confirmed booking address.",
      "When you book a cross-border or Republic of Ireland transfer, we process the selected place details to quote and fulfil your journey.",
    ],
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
      "This website uses essential browser storage to remember payment return state during checkout and to store your cookie preference.",
      "Optional Google Ads cookies are used only if you choose “Accept measurement cookies” on our consent banner. When accepted, we load the Google tag sitewide with Google Consent Mode so Google Ads may measure both successful quote requests and completed paid bookings, subject to that consent choice.",
      "The Google tag may set Google cookies used for conversion measurement. It is not used for general site analytics browsing tracking.",
      "With your consent, we may also send securely hashed booking contact details (such as email or phone) to Google as enhanced conversions to improve measurement accuracy. These details are hashed in the browser before they are sent.",
      "You can change your mind later by clearing site data for this website in your browser settings; the consent banner will appear again if no preference is stored.",
    ],
  },
  {
    title: "Changes",
    content: [
      "We may update this policy from time to time. The date at the top of this page shows when it was last revised.",
    ],
  },
] as const;
