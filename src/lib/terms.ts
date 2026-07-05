export const TERMS_LAST_UPDATED = "July 2026";

export const TERMS_SECTIONS = [
  {
    title: "Introduction",
    content: [
      "Welcome to My Airport Taxi NI. By requesting a quotation, making a booking or using our services, you agree to these Terms & Conditions.",
    ],
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
    ],
    footer: "All journeys are subject to vehicle availability.",
  },
  {
    title: "Booking",
    content: ["Customers are responsible for providing accurate information including:"],
    list: [
      "Pickup address",
      "Destination",
      "Date",
      "Time",
      "Flight number (where applicable)",
      "Contact telephone number",
      "Number of passengers",
      "Number of suitcases",
      "Child seat requirements",
    ],
    footer:
      "Incorrect or incomplete information may result in delays, additional charges, cancellation, or the booking being treated as a no-show without refund.",
  },
  {
    title: "Quotations & Fares",
    content: [
      "All quotations are based on the information supplied at the time of booking.",
      "Prices may change if:",
    ],
    list: [
      "Pickup or destination changes.",
      "Additional waiting time is incurred.",
      "Additional passengers or luggage are added.",
      "Extra stops are requested.",
    ],
  },
  {
    title: "Payment",
    content: ["Payment may be made:"],
    list: ["Online (where available)", "By card", "By cash", "By any other accepted payment method"],
    footer:
      "Payment must be made before or at the start of the journey unless a credit account has been agreed.",
  },
  {
    title: "Waiting Time",
    subsections: [
      {
        subtitle: "Airport Collections",
        content: [
          "We provide 60 minutes complimentary waiting time from the actual flight landing time.",
          "Additional waiting time may be charged.",
        ],
      },
      {
        subtitle: "All Other Collections",
        content: [
          "We provide 10 minutes complimentary waiting time.",
          "Waiting beyond this period may incur additional charges.",
        ],
      },
    ],
  },
  {
    title: "Flight Delays",
    content: [
      "We monitor flight arrivals where a valid flight number has been provided.",
      "If your flight is delayed, we will adjust your collection time where reasonably possible.",
      "If no flight number is supplied, we cannot guarantee delayed collection without additional charges.",
    ],
  },
  {
    title: "Cancellations & Refunds",
    subsections: [
      {
        subtitle: "More than 24 hours before pickup",
        content: ["A full refund will be provided."],
      },
      {
        subtitle: "Less than 24 hours before pickup",
        content: ["Bookings are non-refundable."],
      },
    ],
  },
  {
    title: "No Shows",
    content: ["A booking may be treated as a No Show where:"],
    list: [
      "The customer cannot be contacted.",
      "The customer fails to attend the agreed pickup point.",
      "Incorrect booking information has been provided.",
      "The customer leaves the airport without contacting us.",
    ],
    footer: "No refunds will be issued for No Shows.",
  },
  {
    title: "Child Seats",
    content: [
      "Child seats are available where requested during booking.",
      "Customers must request child seats in advance.",
      "Failure to request a child seat may prevent us from carrying the journey if legally required.",
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
      "Not damage or excessively soil the vehicle.",
    ],
    footer: "Customers may be charged for damage or specialist cleaning where appropriate.",
  },
  {
    title: "Luggage",
    content: ["Customers must ensure:"],
    list: [
      "All luggage is declared during booking.",
      "Oversized luggage is advised in advance.",
    ],
    footer: "We reserve the right to refuse luggage that cannot safely be accommodated.",
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
      "Personal information is processed in accordance with our Privacy Policy.",
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
