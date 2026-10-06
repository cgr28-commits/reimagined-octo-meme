/**
 * Customer-facing cancellation policy copy.
 * Checkout, Terms, FAQ, confirmation emails and /cancellation/ must stay aligned.
 * Refund processing is unchanged — this module is display wording only.
 */

export const CANCELLATION_POLICY_PATH = "/cancellation/";

export const CHECKOUT_CANCELLATION_HEADING = "Cancellation policy";

export const CHECKOUT_CANCELLATION_SUMMARY =
  "Cancel more than 24 hours before your scheduled pickup for a refund of the amount actually paid. Cancellations less than 24 hours before pickup are non-refundable.";

export const VIEW_FULL_CANCELLATION_POLICY_LABEL = "View full Cancellation Policy";

export const STATUTORY_RIGHTS_NOTE =
  "These terms do not affect any rights you have that cannot legally be excluded.";

export const SPECIFIC_DATE_TRANSPORT_NOTE =
  "This booking is for passenger transport on a specific date and time. The statutory cooling-off right that applies to some other distance contracts does not apply to this booking.";

export const COMPANY_CANCEL_REFUND =
  "If My Airport Taxi NI cancels a confirmed booking and cannot provide the journey, you will receive a full refund.";

export const SIGNIFICANT_FLIGHT_DELAY_POLICY =
  "Where a valid flight number has been provided, we will monitor your flight and make reasonable efforts to accommodate a revised arrival time. If your flight is significantly delayed and, because of the revised arrival time, we are ultimately unable to provide your booked transfer, we will cancel that journey and refund in full any amount you have paid for it. This will not be treated as a customer cancellation or no-show.";

export const SIGNIFICANT_FLIGHT_DELAY_LIMIT =
  "Flight monitoring does not guarantee that we can accommodate every delay, and our complimentary waiting period is not unlimited.";

/** Kept for existing imports. This is the significant-delay refund paragraph, not a customer-cancellation rule. */
export const FLIGHT_DELAY_POLICY = SIGNIFICANT_FLIGHT_DELAY_POLICY;

export const AIRPORT_WAITING_FROM_LANDING =
  "Airport pickups include up to 60 minutes complimentary waiting time from the actual flight landing time, where a valid flight number has been provided.";

/** Shorter customer-facing answer. The full legal paragraphs stay on Terms and the Cancellation Policy. */
export const FLIGHT_MONITORING_FAQ_ANSWER =
  "Where a valid flight number has been provided, we monitor your flight and make reasonable efforts to adjust the collection time for an early or delayed arrival. Airport pickups include up to 60 minutes complimentary waiting from the actual landing time. If a significant delay means we cannot provide your booked transfer, we cancel that journey and refund in full the amount paid for it. This will not be treated as a customer cancellation or no-show.";

export const FLIGHT_MONITORING_SHORT =
  "Where a valid flight number has been provided, we monitor your flight and make reasonable efforts to adjust the collection time. Airport pickups include 60 minutes complimentary waiting from the actual landing time.";

export const CONFIRMATION_EMAIL_CANCELLATION_POLICY = [
  CHECKOUT_CANCELLATION_SUMMARY,
  COMPANY_CANCEL_REFUND,
  STATUTORY_RIGHTS_NOTE,
].join(" ");

export const UNDER_24H_CANCEL_CUSTOMER_NOTICE =
  "Your cancellation was received less than 24 hours before the scheduled pickup. Under our cancellation policy this booking is non-refundable.";

export const FAQ_CANCEL_ANSWER = [
  CHECKOUT_CANCELLATION_SUMMARY,
  "A no-show after the complimentary waiting period and reasonable contact attempts is also non-refundable.",
  COMPANY_CANCEL_REFUND,
  "If a significant flight delay means we cannot provide your booked transfer, we cancel that journey and refund in full the amount paid for it. This will not be treated as a customer cancellation or no-show.",
  STATUTORY_RIGHTS_NOTE,
  SPECIFIC_DATE_TRANSPORT_NOTE,
  "Full details are in our Cancellation Policy and Terms & Conditions.",
].join(" ");

export const CANCELLATION_POLICY_PAGE_INTRO =
  "The same cancellation policy applies to airport, long-distance and cross-border transfers.";

export const MORE_THAN_24H_REFUND =
  "If we receive your cancellation more than 24 hours before the scheduled pickup time, we will issue a refund of the amount actually paid.";

export const LESS_THAN_24H_NON_REFUNDABLE =
  "If we receive your cancellation less than 24 hours before the scheduled pickup time, the booking is non-refundable.";

export const DEPOSIT_CASH_POLICY_TITLE = "Deposit + Cash bookings";

export const DEPOSIT_CASH_POLICY_PARAGRAPHS = [
  "If you select Deposit + Cash, the amount charged online is a deposit towards the total fare. Your booking is confirmed once the deposit has been successfully paid. The remaining balance shown at checkout must be paid in cash to your driver on the day of travel. Card payment is not available for the remaining balance, so you must ensure that you have sufficient cash available at the time of pickup.",
  "Deposit + Cash is offered on eligible website instant quotes only. The remaining cash balance is due to the driver at pickup and cannot be paid by card.",
  "If you cancel more than 24 hours before pickup, we refund the amount actually paid — the card deposit. The unpaid cash balance is not charged.",
  "If you cancel less than 24 hours before pickup, the card deposit is non-refundable. The unpaid cash balance is not charged.",
  "A no-show is non-refundable in the same way. The unpaid cash balance is not charged.",
] as const;

export const CANCELLATION_POLICY_SECTIONS = [
  {
    title: "More than 24 hours before pickup",
    content: [MORE_THAN_24H_REFUND],
  },
  {
    title: "Less than 24 hours before pickup",
    content: [LESS_THAN_24H_NON_REFUNDABLE],
  },
  {
    title: DEPOSIT_CASH_POLICY_TITLE,
    content: [...DEPOSIT_CASH_POLICY_PARAGRAPHS],
  },
  {
    title: "No-shows",
    content: [
      "A booking may be treated as a no-show where the passenger has not attended the agreed pickup point by the end of the complimentary waiting period, and we have made reasonable attempts to contact the passenger without success.",
      "A customer leaving the airport or another pickup location without contacting us may also be treated as a no-show where this prevents the journey from being provided.",
      "A no-show is non-refundable.",
    ],
  },
  {
    title: "Significant flight delays",
    content: [
      SIGNIFICANT_FLIGHT_DELAY_POLICY,
      SIGNIFICANT_FLIGHT_DELAY_LIMIT,
      AIRPORT_WAITING_FROM_LANDING,
      "Non-airport pickups include 10 minutes complimentary waiting time.",
    ],
  },
  {
    title: "Cancellation by My Airport Taxi NI",
    content: [COMPANY_CANCEL_REFUND],
  },
  {
    title: "Your rights",
    content: [STATUTORY_RIGHTS_NOTE, SPECIFIC_DATE_TRANSPORT_NOTE],
  },
] as const;
