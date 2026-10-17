import type { PaidBookingRecord } from "./paid-booking-record";
import {
  grossAmountCollectedOf,
  amountActuallyRefundedOf,
} from "./paid-booking-record";
import { sanitizeAdsAttribution } from "./ads-attribution";
export function marketingReportRow(
  record: PaidBookingRecord,
  permitted: boolean,
) {
  const a = permitted ? sanitizeAdsAttribution(record.attribution) : undefined;
  const touch = a?.consent?.advertising ? a.lastTouch : undefined;
  const cash = record.cashCollectedAt ? Number(record.cashBalanceDue) || 0 : 0;
  return {
    reference: record.customerReference || record.paymentReference,
    paymentReference: record.paymentReference,
    createdAt: record.createdAt,
    source: touch?.source || "Unknown",
    confidence: touch?.confidence || "unknown",
    evidence: touch?.evidence || "No current permitted attribution evidence",
    campaign: touch?.utm_campaign || "",
    firstSource: a?.firstTouch?.source || "Unknown",
    capturedAt: touch?.capturedAt,
    fare: record.totalFare ?? record.amount,
    collected: grossAmountCollectedOf(record) + cash,
    refunded: amountActuallyRefundedOf(record),
    cancelled: Boolean(
      record.cancelledAt || record.operationalStatus === "cancelled",
    ),
    conversionStatus: record.googleAdsPaidConversionStatus || "not_recorded",
    attempts: record.googleAdsPaidConversionAttempts || 0,
    lastAttemptAt: record.googleAdsPaidConversionLastAttemptAt,
    // Raw Google errors can contain click identifiers: keep them out of this report.
    error:
      record.googleAdsPaidConversionStatus === "failed"
        ? "Upload failed — inspect the existing redacted booking diagnostic"
        : "",
  };
}
export type MarketingReportRow = ReturnType<typeof marketingReportRow>;
