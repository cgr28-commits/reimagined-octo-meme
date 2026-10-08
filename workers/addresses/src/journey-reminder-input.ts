import type { JourneyReminderInput } from "../shared/journey-reminder";
import type { PaidBookingRecord } from "../shared/paid-booking-record";
import type { TrackingJobRecord } from "../shared/tracking";

export function airportPickupReminderInput(
  job: TrackingJobRecord,
  paid: PaidBookingRecord | null,
): JourneyReminderInput {
  const leg = job.journeyLeg === "return" ? "return" : "outbound";
  const schedule =
    leg === "return"
      ? {
          tripDate: paid?.returnDate?.trim() || job.tripDate,
          tripTime: paid?.returnTime?.trim() || job.tripTime,
          pickupLabel: paid?.dropoffLabel?.trim() || job.pickupLabel,
          dropoffLabel: paid?.pickupLabel?.trim() || job.dropoffLabel,
          flightNumber: paid?.returnFlightNumber?.trim() || job.flightNumber,
        }
      : {
          tripDate: paid?.tripDate?.trim() || job.tripDate,
          tripTime: paid?.tripTime?.trim() || job.tripTime,
          pickupLabel: paid?.pickupLabel?.trim() || job.pickupLabel,
          dropoffLabel: paid?.dropoffLabel?.trim() || job.dropoffLabel,
          flightNumber: paid?.flightNumber?.trim() || job.flightNumber,
        };
  const isFromAirport =
    typeof paid?.isFromAirport === "boolean"
      ? leg === "return"
        ? !paid.isFromAirport
        : paid.isFromAirport
      : job.isFromAirport;
  return {
    customerName: paid?.customerName || job.customerName,
    customerEmail: paid?.customerEmail || job.customerEmail,
    pickupLabel: schedule.pickupLabel,
    dropoffLabel: schedule.dropoffLabel,
    tripDate: schedule.tripDate,
    tripTime: schedule.tripTime,
    journeyLeg: leg,
    isFromAirport,
    airportCode: job.airportCode || paid?.airportCode,
    flightNumber: schedule.flightNumber,
    vehicle: paid?.vehicle || undefined,
    airportAccessOption: paid?.airportAccessOption,
    outboundAirportAccessOption: paid?.outboundAirportAccessOption,
    returnAirportAccessOption: paid?.returnAirportAccessOption,
    expressDropOffSelected: paid?.expressDropOffSelected,
    outboundExpressDropOffSelected: paid?.outboundExpressDropOffSelected,
    returnExpressDropOffSelected: paid?.returnExpressDropOffSelected,
    expressDropOffFee:
      leg === "return"
        ? paid?.returnAirportAccessChargeGbp
        : (paid?.outboundAirportAccessChargeGbp ?? paid?.expressDropOffFee),
    expressDropOffAirport: paid?.expressDropOffAirport,
    dublinArrivalTerminal: paid?.dublinArrivalTerminal,
    returnDublinArrivalTerminal: paid?.returnDublinArrivalTerminal,
    reminderSentAt: job.airportCollectionInfoSentAt || job.airportPickupReminderSentAt,
    reminderSentForPickupAt: job.journeyReminderSentForPickupAt,
    reminderDriverKey: job.journeyReminderDriverKey,
    driverUpdateSentForKey: job.journeyDriverUpdateSentForKey,
    assignmentStatus: job.assignmentStatus,
    assignedDriverName: job.assignedDriverName,
    assignedDriverMobile: job.assignedDriverMobile,
    refundedAt: job.refundedAt,
    operationalStatus: paid?.operationalStatus,
    bookingStatus: paid?.status,
    cancelledLegs: paid?.cancelledLegs,
    outboundCancelledAt: paid?.outboundCancelledAt,
    returnCancelledAt: paid?.returnCancelledAt,
    journeyStatus: job.journeyStatus,
    isRefundTest: paid?.isRefundTest,
  };
}
