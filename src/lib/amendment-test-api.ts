import { resolveWorkerBaseUrl } from "./worker-api";

const WORKER_BASE = resolveWorkerBaseUrl();

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export type AmendmentTestFixtureSummary = {
  isAmendmentTestFixture: true;
  customerReference: string;
  paymentReference: string;
  customerEmail: string;
  tripDate: string;
  tripTime: string;
  pickupLabel: string;
  dropoffLabel: string;
  amount: number;
  amountPaidLabel: string;
  paymentStatus?: string;
  status?: string;
  freeAmendmentAvailable: boolean;
  dateTimeAmendmentCount: number;
  manageBookingUrl: string | null;
  manageBookingTokenPresent: boolean;
  warning: string;
};

export type AmendmentTestSeedResponse = {
  ok: boolean;
  fixture: AmendmentTestFixtureSummary;
  quote: {
    amount: number;
    amountLabel: string;
    source: string;
    premiumApplied?: boolean;
  };
  error?: string;
};

export async function seedAmendmentTestFixture(input: {
  ownerKey: string;
  manageBookingBaseUrl: string;
  customerEmail?: string;
}): Promise<AmendmentTestSeedResponse> {
  const response = await fetch(`${WORKER_BASE}/paid-bookings/amendment-test/seed`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Owner-Key": input.ownerKey.trim(),
    },
    body: JSON.stringify({
      manageBookingBaseUrl: input.manageBookingBaseUrl,
      ...(input.customerEmail ? { customerEmail: input.customerEmail } : {}),
    }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Failed to seed amendment test fixture"));
  }
  return payload as unknown as AmendmentTestSeedResponse;
}

export async function listAmendmentTestFixtures(
  ownerKey: string,
  manageBookingBaseUrl: string,
): Promise<AmendmentTestFixtureSummary[]> {
  const url = new URL(`${WORKER_BASE}/paid-bookings/amendment-test/list`);
  url.searchParams.set("siteOrigin", manageBookingBaseUrl);
  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Owner-Key": ownerKey.trim(),
    },
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Failed to list amendment test fixtures"));
  }
  return Array.isArray(payload.fixtures)
    ? (payload.fixtures as AmendmentTestFixtureSummary[])
    : [];
}
