import { TOURS_LIVE } from "./private-tours-mode";
import {
  CANCELLATION_POLICY_PAGE_INTRO,
  COMPANY_CANCEL_REFUND,
  DEPOSIT_CASH_POLICY_PARAGRAPHS,
  DEPOSIT_CASH_POLICY_TITLE,
  SIGNIFICANT_FLIGHT_DELAY_LIMIT,
  SIGNIFICANT_FLIGHT_DELAY_POLICY,
  LESS_THAN_24H_NON_REFUNDABLE,
  MORE_THAN_24H_REFUND,
  SPECIFIC_DATE_TRANSPORT_NOTE,
  STATUTORY_RIGHTS_NOTE,
} from "../../shared/cancellation-policy";

export const TERMS_LAST_UPDATED = "September 2026 v2";

const BASE_TERMS_SECTIONS = [
  {
    title: "Introduction",
    content: [
      "Welcome to My Airport Taxi NI. By requesting a quotation, making a booking or using our services, you agree to these Terms & Conditions.",
    ],
  },
  {
    title: "Operator & contact details",
    content: [
      "My Airport Taxi NI is a fully licensed and insured private hire operator providing pre-booked airport transfers and chauffeur services in Northern Ireland.",
    ],
    list: [
      "Trading name: My Airport Taxi NI",
      "Email: bookings@myairporttaxini.co.uk",
      "Telephone (Business Line): 028 9602 2952",
      "WhatsApp (messages only): @belfasttaxi — see our Contact page",
      "Website: www.myairporttaxini.co.uk",
      "Service area: Greater Belfast and across Northern Ireland",
      "Business address: Available on request (email bookings@myairporttaxini.co.uk)",
      "Complaints & legal enquiries: bookings@myairporttaxini.co.uk",
    ],
    footer:
      "My Airport Taxi NI operates as a sole trader. Our business address is not published on this website for privacy reasons but will be provided promptly on request for legal, corporate, or booking enquiries. Please contact us if you require written confirmation of our operator status.",
  },
  {
    title: "Our Service",
    content: [
      "My Airport Taxi NI provides pre-booked private airport transfers throughout Greater Belfast and surrounding areas, including transfers to and from:",
    ],
    list: [
      "Belfast International Airport",
      "Belfast City Airport",
      "Dublin Airport",
      "City of Derry Airport",
    ],
    contentAfterList: [
      "We also provide pre-booked long-distance private transfers from Greater Belfast to destinations throughout Northern Ireland and the Republic of Ireland.",
      "Standard pickups are from anywhere within Greater Belfast. Pre-booked airport pickups are also available from Belfast International Airport, Belfast City Airport, City of Derry Airport and Dublin Airport.",
      "Pickups from elsewhere in Northern Ireland to a Greater Belfast destination receive a live online quote where route pricing is available. Other out-of-area pickups (for example outside Northern Ireland, or NI pickups to destinations outside Greater Belfast) require manual approval, do not receive an automatic online price, and cannot be paid for immediately online until we confirm a fixed quote.",
    ],
    footer:
      "All journeys are subject to vehicle availability. Saloon and Estate or similar larger vehicle carry up to 4 passengers. Business Class carries up to 3 passengers. A 7 Seater Minibus carries up to 7 when it is offered and available. Business Class is a premium executive vehicle: on journeys of 50 miles or more it can be booked at the fixed price shown; on shorter journeys it is a request and we confirm the price and availability before you pay.",
  },
  {
    title: "Cross-border & Republic of Ireland journeys",
    content: [
      "Journeys with a pickup or drop-off in the Republic of Ireland (including Dublin city, Eircode addresses, and Dublin Airport from Northern Ireland) are quoted individually where an instant online fare does not apply.",
      "Dublin Airport transfers may show a live online price where eligible. Other Republic of Ireland city destinations use Request Fixed Quote for manual confirmation before travel.",
      "All cross-border journeys are quoted and charged in pounds sterling (GBP) unless otherwise agreed in writing.",
      "Applicable tolls for the agreed route are included in an accepted fixed quote.",
      "Customers must select complete pickup and drop-off addresses from the Google Places suggestions on our quote form. Typed addresses that are not selected from suggestions are not accepted.",
    ],
  },
  {
    title: "Vehicles & capacity",
    content: [
      "Saloon and estate car transfers for up to 4 passengers are fulfilled by My Airport Taxi NI using our own licensed vehicles and drivers.",
      "A 7 Seater Minibus carries up to 7 passengers when it is offered and available. Business Class is a premium executive vehicle: on journeys of 50 miles or more it can be booked at the fixed price shown; on shorter journeys it is a request and we confirm the price and availability before you pay.",
      "We remain your point of contact for booking, payment (where applicable), and customer service.",
    ],
  },
  {
    title: "Booking",
    content: ["Customers are responsible for providing accurate information including:"],
    list: [
      "Pickup address",
      "Destination",
      "Complete addresses selected from Google Places suggestions (where the quote form requires this)",
      "Date",
      "Time",
      "Flight number (where applicable)",
      "Contact telephone number",
      "Number of passengers",
      "Number of suitcases",
      "Child seat requirements",
    ],
    footer:
      "Incorrect or incomplete information may result in delays, additional charges, cancellation, or the booking being treated as a no-show without refund. Bookings are subject to vehicle availability and are not confirmed until we accept the booking in writing (including by email) or payment is completed where an instant online fare applies.",
  },
  {
    title: "Quotations & Fares",
    content: [
      "All quotations are based on the information supplied at the time of booking.",
      "Where applicable, airport access charges and route tolls that form part of the quoted journey are included in the displayed fixed price.",
      "Tolls are not implied for every booking — they are included only where they form part of the agreed route (for example certain Dublin Airport journeys).",
      "Prices may change if:",
    ],
    list: [
      "Pickup or destination changes.",
      "Additional waiting time is incurred beyond the complimentary allowance.",
      "Additional passengers or luggage are added.",
      "Extra stops are requested.",
    ],
  },
  {
    title: "Promotional codes",
    content: [
      "Discount codes we email on request (for example our 10% welcome code) apply to the vehicle fare only: the journey fare for a one-way booking, or the combined outward and return journey fares for a return booking. Airport access, pickup, drop-off, parking and barrier charges and optional extras such as Meet & Greet are not discounted.",
      "Each code is shown with its terms when it is sent: the percentage, a minimum eligible vehicle fare (currently £100) and an expiry date (currently 30 days from issue). A code can be used once, only by the customer whose email address it was sent to, and only on standard online bookings. One welcome discount per customer.",
      "Codes cannot be used for journeys on excluded dates (currently 14 December to 5 January, our Christmas and New Year period; 24 March to 5 April 2027, Easter; 21–23 May 2027, the Garth Brooks concerts in Belfast; 9–18 July 2027, the Twelfth fortnight; and 17–21 August 2027, the Harry Styles concerts in Dublin); if either journey of a return falls on an excluded date the code cannot be used. Any excluded dates are shown when you enter the code.",
      "From time to time we run limited-time offers (for example Black Friday) with a higher percentage. A code requested during the offer gets the offer percentage and keeps it until its normal expiry date; the offer dates and percentage are shown on the website while it runs.",
      "Codes cannot be combined with any other offer, special price or discount on the same booking, cannot be exchanged for cash, and cannot be added to a booking after payment.",
      "If a booking made with a code is cancelled in time for a full refund, the code can be used again until its original expiry date. We may withdraw a code that is being misused.",
    ],
  },
  {
    title: "Booking & Payment",
    content: [
      "For Saloon, Estate or similar larger vehicle, and Business Class transfers where an instant fare is shown, you may pay online by card at the end of the website quote. Your booking is confirmed once payment is completed.",
      "Deposit + Cash: if you select Deposit + Cash, the amount charged online is a deposit towards the total fare. Your booking is confirmed once the deposit has been successfully paid. The remaining balance shown at checkout must be paid in cash to your driver on the day of travel. Card payment is not available for the remaining balance, so you must ensure that you have sufficient cash available at the time of pickup. Deposit + Cash is not available on Personal Quotes, Quick Quotes, saved quote links, short-notice payment links, Request Only payment links, or airport-to-airport specialist payment links.",
      "Card deposit (journeys at least 30 days ahead): this is a separate option from Deposit + Cash. You pay a 20% deposit by card to confirm your booking, and the remaining balance is also paid by card. Seven days before your pickup we email you a secure payment link for the balance, followed by reminders. If the balance has not been paid three days before your pickup, the booking is cancelled automatically and your deposit is refunded in full. If you cancel 24 hours or more before pickup, everything you have paid is refunded in line with our cancellation policy.",
      "For out-of-area pickup requests, and Republic of Ireland city destinations that require a fixed quote, the process is: request a quote or booking, wait for us to confirm the fare and job, then pay via the secure payment link we email. Your booking is confirmed after payment is received.",
      "Payment may be made:",
    ],
    list: [
      "By card on the website (Saloon, Estate or similar larger vehicle, or Business Class with an instant fare), the full fare, a Deposit + Cash deposit where offered and selected, or a 20% card deposit with the balance paid by card later (journeys at least 30 days ahead)",
      "By cash to the driver for the remaining balance on a Deposit + Cash booking",
      "By card via the secure payment link we email after confirming your booking",
      "By cash to the driver (where otherwise agreed)",
      "By bank transfer (where agreed)",
      "By any other accepted payment method we confirm in writing",
    ],
    footer:
      "Payment must be made before or at the start of the journey unless a credit account has been agreed. A booking request alone does not confirm the journey.",
  },
  {
    title: "Waiting Time",
    subsections: [
      {
        subtitle: "Airport Collections",
        content: [
          "Airport pickups include up to 60 minutes complimentary waiting time from the actual flight landing time.",
          "This is not unlimited waiting. Additional waiting time beyond the complimentary period may be charged.",
        ],
      },
      {
        subtitle: "All Other Collections",
        content: [
          "Pickups from non-airport locations include up to 10 minutes complimentary waiting time from the agreed pickup time.",
          "Waiting beyond this period may incur additional charges.",
        ],
      },
    ],
  },
  {
    title: "Significant flight delays",
    content: [
      SIGNIFICANT_FLIGHT_DELAY_POLICY,
      SIGNIFICANT_FLIGHT_DELAY_LIMIT,
      "Airport pickups include up to 60 minutes complimentary waiting time from the actual flight landing time.",
      "If no flight number is supplied, we cannot guarantee delayed collection without additional charges.",
    ],
  },
  {
    id: "cancellation",
    title: "Cancellations & Refunds",
    content: [CANCELLATION_POLICY_PAGE_INTRO],
    subsections: [
      {
        subtitle: "At least 24 hours before pickup",
        content: [MORE_THAN_24H_REFUND],
      },
      {
        subtitle: "Less than 24 hours before pickup",
        content: [LESS_THAN_24H_NON_REFUNDABLE],
      },
      {
        subtitle: DEPOSIT_CASH_POLICY_TITLE,
        content: [...DEPOSIT_CASH_POLICY_PARAGRAPHS],
      },
      {
        subtitle: "Significant flight delays",
        content: [SIGNIFICANT_FLIGHT_DELAY_POLICY, SIGNIFICANT_FLIGHT_DELAY_LIMIT],
      },
      {
        subtitle: "Cancellations by us",
        content: [COMPANY_CANCEL_REFUND],
      },
    ],
    footer: `${STATUTORY_RIGHTS_NOTE} ${SPECIFIC_DATE_TRANSPORT_NOTE}`,
  },
  {
    title: "Changes to Your Booking",
    content: [
      "You may request one online change to your booking when more than 24 hours’ notice is provided, subject to availability.",
      "Requests made within 24 hours of the scheduled pickup cannot be amended automatically and must be agreed directly with My Airport Taxi NI.",
      "We will always try to accommodate reasonable changes, but availability cannot be guaranteed.",
      "Changing a booking does not provide a way to avoid the applicable cancellation policy.",
      "Online amendments are always recalculated using current authoritative pricing. Changing the journey details (for example addresses, passengers, luggage, vehicle, or return) may change the fare. If the new fare is higher, the additional amount must be paid before the change is confirmed. If the new fare is lower, any refund due is processed by My Airport Taxi NI.",
      "Where a change materially alters the journey, including pickup, destination, passengers or luggage, the fare is recalculated the same way.",
      "A saved quote is not a booking. When a saved quote includes a pickup date and time, you can book at the price shown until the hold time stated in the quote: up to seven days, two hours for journeys less than 24 hours away, and never past the pickup time. If you change the date, time or other journey details before paying, the fare is recalculated using current pricing and the held price no longer applies.",
    ],
  },
  {
    title: "No-Shows",
    content: ["A booking may be treated as a no-show where:"],
    list: [
      "The passenger has not attended the agreed pickup point by the end of the applicable complimentary waiting period described in Section 9; and",
      "We have made reasonable attempts to contact the passenger without success.",
    ],
    contentAfterList: [
      "A customer leaving the airport or another pickup location without contacting us may also be treated as a no-show where this prevents the journey from being provided.",
      "Incorrect booking information will only result in a booking being treated as a no-show where it prevents us from providing the journey after reasonable attempts to contact the customer.",
      "A no-show is non-refundable.",
    ],
  },
  {
    title: "Child Seats",
    content: [
      "Booster seats and child seats can be requested during booking, but availability is not guaranteed.",
      "Customers must request child or booster seats in advance so we can check what we can provide.",
      "If a legally required child seat cannot be provided, we may be unable to carry the journey.",
    ],
  },
  {
    title: "Passenger Responsibilities",
    content: ["Passengers must:"],
    list: [
      "Wear seat belts where required by law.",
      "Treat the vehicle respectfully.",
      "Avoid behaviour that endangers the driver or other passengers.",
      "Not smoke or vape in the vehicle.",
      "Not consume illegal drugs.",
    ],
  },
  {
    title: "Vehicle Cleaning and Damage",
    content: [
      "The person making the booking is responsible for the conduct of passengers travelling under the booking.",
      "Passengers must not damage, contaminate or excessively soil the vehicle.",
      "Where a passenger causes cleaning beyond ordinary routine cleaning — including for example vomiting or bodily fluids, significant food or drink spillages, stains, pet soiling or contamination, smoking or vaping contamination, excessive mess, or deliberate or negligent damage — My Airport Taxi NI may recover the reasonable costs directly resulting from the incident.",
      "Those costs may include reasonable specialist cleaning or valeting, reasonable repair or replacement for damage, and reasonable and evidenced loss of use or driver earnings where the vehicle genuinely has to be taken out of service.",
      "Charges must be proportionate and based on reasonable loss or cost, not arbitrary penalties.",
      "Where reasonably practicable we retain evidence such as timestamped photographs, cleaning or repair invoices or receipts, the date and time the vehicle was out of service, and the associated booking or journey reference.",
      "We do not silently charge a customer’s card for these later amounts unless the payment provider and the customer’s specific payment authorisation lawfully support that exact charge. The default workflow is to record the incident, document a reasonable amount, and send an invoice or payment request with an explanation and evidence.",
    ],
  },
  {
    title: "Luggage",
    content: [
      "Luggage capacity depends on passenger numbers, luggage quantity and the vehicle arranged. Customers must provide accurate luggage details when booking or requesting a quote so that a suitable vehicle can be arranged.",
      "Customers must ensure:",
    ],
    list: [
      "All luggage is declared during booking.",
      "Oversized luggage is advised in advance.",
    ],
    footer:
      "We reserve the right to refuse luggage that cannot safely be accommodated for your passenger count (which may require a different vehicle or change the fare). Saloon and Estate are booked for up to 4 passengers; Business Class for up to 3 passengers. A 7 Seater Minibus is booked for up to 7 when it is offered.",
  },
  {
    title: "Lost Property",
    content: [
      "Items left in the vehicle will be retained where possible.",
      "Reasonable collection or delivery charges may apply.",
      "We cannot guarantee recovery of lost property.",
    ],
  },
  {
    title: "Liability",
    content: [
      "Whilst every effort is made to arrive on time, My Airport Taxi NI cannot accept liability for delays caused by circumstances outside our reasonable control, including:",
    ],
    list: [
      "Traffic congestion",
      "Road closures",
      "Severe weather",
      "Accidents",
      "Police incidents",
      "Airport disruption",
    ],
  },
  {
    title: "Complaints",
    content: [
      "If you are dissatisfied with our service, please contact us as soon as possible.",
      "We aim to investigate and respond to complaints promptly and fairly.",
    ],
  },
  {
    title: "Privacy",
    content: [
      "Personal information is processed in accordance with our Privacy Policy at myairporttaxini.co.uk/privacy/.",
    ],
  },
  {
    title: "Website",
    content: [
      "Whilst every effort is made to ensure information on this website is accurate, quotations and availability are subject to confirmation.",
    ],
  },
  {
    title: "Governing Law",
    content: [
      "These Terms & Conditions are governed by the laws of Northern Ireland.",
    ],
  },
] as const;

/** Private Tours wording appears only in the live build, together with the tours pages themselves. */
const PRIVATE_TOURS_TERMS_SECTIONS = [
  {
    title: "Private Tours (quote requests)",
    content: [
      "A Private Tours request is a request for a personal quote, not a booking. Nothing is booked or charged until we confirm your quote with you in writing.",
      "Journey times and any guide prices on the website are provisional. Your quote confirms the price, pick-up, route and timings for your day. We may decline or change a request, for example for safety, timing or availability reasons, including cruise all-aboard times.",
      "Your driver is a private local driver. Private tours are driven, not guided. Entry tickets, food and drink are not included unless your quote says so. Opening times and entry details are set by each attraction and should be checked before you travel.",
      "Payment and cancellation terms for your tour are set out in your quote. The cancellation terms for airport transfers above do not apply to a Private Tour unless your quote says so.",
    ],
  },
] as const;

export const TERMS_SECTIONS = TOURS_LIVE ? [...BASE_TERMS_SECTIONS, ...PRIVATE_TOURS_TERMS_SECTIONS] : [...BASE_TERMS_SECTIONS];
