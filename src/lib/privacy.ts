import { BUSINESS_LEGAL } from "@/lib/business-legal";

export const PRIVACY_LAST_UPDATED = "September 2026 v1";

export const PRIVACY_SECTIONS = [
  {
    title: "Who we are",
    content: [
      `${BUSINESS_LEGAL.tradingName} provides pre-booked private airport transfers in ${BUSINESS_LEGAL.serviceArea}.`,
      `Contact: ${BUSINESS_LEGAL.email} · WhatsApp @belfasttaxi`,
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
      "Saved quote details (name, email, journey snapshot and fixed price) when you choose Save Quote",
      "Payment confirmation details from SumUp (amount, transaction reference)",
      "Optional live location if a customer chooses to share it via WhatsApp",
      "Driver GPS location history may be recorded during booked journeys for operational/dispute evidence",
      "Marketing preferences if you opt in to receive updates (optional)",
      "Limited technical signals for security, fraud prevention and advertising abuse monitoring (such as hashed network identifiers, coarse browser/device category, landing page, referrer host, and advertising campaign parameters when present)",
    ],
  },
  {
    title: "How we use your information",
    content: ["We use your information to:"],
    list: [
      "Provide quotations and confirm bookings",
      "Save fixed-price quotes you request and email you a secure link to return and book",
      "Send transactional saved-quote reminders (about 24 hours and 5 days after saving) while your quote is still valid and unpaid — these are not marketing emails",
      "Process card payments via SumUp",
      "Send booking confirmations and invoices by email",
      "Contact you about your journey (including SMS/WhatsApp where agreed)",
      "Send Driver on the way and arrival updates by email when applicable",
      "Record journey status and GPS route points as operational evidence for service delivery, safety and payment disputes",
      "Log bookings in our business calendar",
      "Respond to enquiries and complaints",
      "Send occasional marketing emails if you have opted in (offers, travel tips and service news)",
      "Monitor for security, fraud prevention and advertising abuse (for example repetitive paid-advertising clicks with no genuine booking activity)",
    ],
  },
  {
    title: "Saved quotes & quote follow-up emails",
    content: [
      "If you use Save Quote, we store your name, email and journey/price snapshot for up to 7 days (and a short period afterwards for audit) so you can reopen your fixed price via a secure link.",
      "We send an initial confirmation email and up to two automated reminders while the quote remains saved, unbooked and unexpired. Saving a quote does not subscribe you to marketing emails.",
      "Mobile numbers are not collected at the Save Quote stage — only when you continue to book.",
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
    title: "Driver tracking & location records",
    content: [
      "When your driver starts tracking for a booked journey, we may record timestamped GPS points (latitude, longitude, accuracy, speed and heading where the device provides them).",
      "We use this data to show you a live tracking page, to operate the journey safely, and to keep an internal journey record that may support payment or service disputes. A journey record does not guarantee the outcome of any card chargeback.",
      "Journey and driver location information, together with booking-event information, may be recorded and retained where necessary for providing and managing the booked service, safety and security, resolving complaints, fraud prevention, payment and refund disputes, and establishing or defending legal claims.",
      "We email Driver on the way and arrival updates on travel day. Your driver may share live location via WhatsApp when appropriate. We do not use a public website live-tracking page.",
      "We do not intentionally collect unnecessary device identifiers beyond what is needed to operate location sharing, and we do not add invasive device fingerprinting solely for chargeback purposes.",
    ],
  },
  {
    title: "Retention",
    content: [
      "Booking and payment records are kept as long as needed for customer service, accounting, tax and dispute resolution — typically up to 6 years where required for tax or accounting, then deleted or anonymised where we no longer need them.",
      "Saved quotes are kept for the 7-day validity window and a short additional period for audit and conversion tracking, then removed automatically from active storage.",
      "Driver GPS journey evidence is retained as an operational/dispute record for a configurable period (default around 13 months / ~400 days unless a longer period is set for the business). It is not retained indefinitely.",
      "Journey records and any operational GPS evidence are retained only as needed for disputes, safety, and legal requirements. Optional WhatsApp live location is controlled by the sender inside WhatsApp.",
      "Refund and cancellation audit records are kept with the related booking for the same accounting/dispute retention period.",
      "Advertising abuse / security monitoring event records are retained for about 90 days, then removed or anonymised. Aggregated non-identifying statistics may be kept longer.",
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
      "We may also use a short-lived essential session identifier for security, fraud prevention and advertising abuse monitoring. This is separate from optional marketing measurement and is not used to identify individual competitors.",
      "Optional Google Ads cookies are used only if you choose “Accept measurement cookies” on our consent banner. When accepted, we load the Google tag sitewide with Google Consent Mode so Google may measure fixed-price quotes, saved booking requests and completed paid bookings, subject to that consent choice.",
      "The Google tag may set Google cookies used for conversion measurement. It is not used for general site analytics browsing tracking.",
      "With your consent, we may also send securely hashed booking contact details (such as email or phone) to Google as enhanced conversions to improve measurement accuracy. These details are hashed in the browser before they are sent.",
      "A third-party traffic-quality provider (TrafficGuard) may load for advertising traffic quality measurement. Our own advertising-abuse monitoring complements that provider and does not replace it.",
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
