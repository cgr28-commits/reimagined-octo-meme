const DEFAULT_WORKER_BASE = "https://reimagined-octo-meme.cgr28.workers.dev";

function resolveWorkerBaseUrl(): string {
  const bookings = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (bookings) {
    try {
      const host = new URL(bookings).hostname.toLowerCase();
      if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
        return DEFAULT_WORKER_BASE;
      }

      return bookings.replace(/\/bookings\/?$/, "");
    } catch {
      return DEFAULT_WORKER_BASE;
    }
  }

  return DEFAULT_WORKER_BASE;
}

const WORKER_BASE = resolveWorkerBaseUrl();

export type RefundIssueResponse = {
  ok: boolean;
  alreadyRefunded?: boolean;
  paymentReference: string;
  refundAmount?: string;
  sumUpRefunded?: boolean;
  calendarCancelled?: number;
  /** @deprecated Use calendarCancelled */
  calendarDeleted?: number;
  trackingRemoved?: boolean;
  customerEmailSent?: boolean;
  ownerEmailSent?: boolean;
  warnings?: string[];
  error?: string;
};

export async function issueBookingRefund(input: {
  ownerKey: string;
  paymentReference: string;
}): Promise<RefundIssueResponse> {
  const response = await fetch(`${WORKER_BASE}/bookings/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Owner-Key": input.ownerKey.trim(),
      "X-Driver-Key": input.ownerKey.trim(),
    },
    body: JSON.stringify({
      paymentReference: input.paymentReference.trim(),
    }),
  });

  const payload = (await response.json().catch(() => null)) as RefundIssueResponse | null;
  if (!payload) {
    throw new Error(`Refund request failed (${response.status})`);
  }

  if (!response.ok && !payload.error) {
    throw new Error(`Refund request failed (${response.status})`);
  }

  return payload;
}
