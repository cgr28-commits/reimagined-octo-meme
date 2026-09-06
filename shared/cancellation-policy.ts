/**
 * Customer-facing cancellation policy copy.
 * Checkout, Terms, FAQ, confirmation emails and /cancellation/ must stay aligned.
 * Refund processing is unchanged — this module is display wording only.
 */

export const CANCELLATION_POLICY_PATH = "/cancellation/";

export const CHECKOUT_CANCELLATION_HEADING = "Cancellation policy";

export const CHECKOUT_CANCELLATION_SUMMARY =
  "Cancel more than 24 hours before your scheduled pickup for a full refund. Cancellations less than 24 hours before pickup are non-refundable.";

export const VIEW_FULL_CANCELLATION_POLICY_LABEL = "View full Cancellation Policy";

export const STATUTORY_RIGHTS_NOTE =
  "These terms do not affect any rights you have that cannot legally be excluded.";

export const SPECIFIC_DATE_TRANSPORT_NOTE =
  "This booking is for passenger transport on a specific date and time. The statutory cooling-off right that applies to some other distance contracts does not apply to this booking.";

export const COMPANY_CANCEL_REFUND =
  "If My Airport Taxi NI cancels a confirmed booking and cannot provide the journey, you will receive a full refund.";

export const FLIGHT_DELAY_POLICY =
  "Where a correct flight number has been provided, a flight delay will not normally be treated as a cancellation or no-show. We will adjust the planned collection time in accordance with the waiting-time policy.";

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
  STATUTORY_RIGHTS_NOTE,
  SPECIFIC_DATE_TRANSPORT_NOTE,
  "Full details are in our Cancellation Policy and Terms & Conditions.",
].join(" ");

export const CANCELLATION_POLICY_PAGE_INTRO =
  "The same cancellation policy applies to airport, long-distance and cross-border transfers.";

export const CANCELLATION_POLICY_SECTIONS = [
  {
    title: "More than 24 hours before pickup",
    content: [
      "If we receive your cancellation more than 24 hours before the scheduled pickup time, we will issue a full refund of the fare paid.",
    ],
  },
  {
    title: "Less than 24 hours before pickup",
    content: [
      "If we receive your cancellation less than 24 hours before the scheduled pickup time, the booking is non-refundable.",
    ],
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
    title: "Flight delays and waiting time",
    content: [
      FLIGHT_DELAY_POLICY,
      "Airport pickups include 60 minutes complimentary waiting time where a valid flight number has been provided. This is not unlimited free waiting.",
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
