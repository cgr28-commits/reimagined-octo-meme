import type { BookingJobRecord } from "../../shared/booking-job";

function resolveBookingsApiUrl(): string {
  const bookingsUrl = process.env.NEXT_PUBLIC_BOOKINGS_API_URL?.trim() ?? "";
  if (!bookingsUrl) {
    return "";
  }

  try {
    const parsed = new URL(bookingsUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === "www.myairporttaxini.co.uk" || host === "myairporttaxini.co.uk") {
      return "";
    }
    return bookingsUrl;
  } catch {
    return "";
  }
}

function workerBaseUrl(): string {
  const bookingsUrl = resolveBookingsApiUrl();
  if (!bookingsUrl) {
    return "";
  }
  return bookingsUrl.replace(/\/bookings\/?$/i, "");
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  return ((await response.json().catch(() => null)) as Record<string, unknown> | null) ?? {};
}

export async function fetchOwnerBookingJobs(ownerKey: string): Promise<BookingJobRecord[]> {
  const base = workerBaseUrl();
  if (!base) {
    throw new Error("Bookings API is not configured");
  }

  const response = await fetch(`${base}/booking-jobs`, {
    headers: {
      Accept: "application/json",
      "X-Driver-Key": ownerKey.trim(),
    },
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Failed to load booking jobs"));
  }
  return Array.isArray(payload.jobs) ? (payload.jobs as BookingJobRecord[]) : [];
}

export async function markBookingJobPaid(
  ownerKey: string,
  input: { id: string; amountPaidLabel: string; paymentReference?: string },
): Promise<BookingJobRecord> {
  const base = workerBaseUrl();
  if (!base) {
    throw new Error("Bookings API is not configured");
  }

  const response = await fetch(`${base}/booking-jobs/mark-paid`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Driver-Key": ownerKey.trim(),
    },
    body: JSON.stringify(input),
  });
  const payload = await parseJson(response);
  if (!response.ok || !payload.job) {
    throw new Error(String(payload.error ?? "Failed to mark booking paid"));
  }
  return payload.job as BookingJobRecord;
}

export async function assignBookingJobDriver(
  ownerKey: string,
  input: {
    id: string;
    driverFirstName: string;
    driverEmail: string;
    driverMobile: string;
    driverCarMake: string;
    driverCarModel: string;
    driverCarColour?: string;
    driverReg: string;
    driverPayAmount: string;
  },
): Promise<BookingJobRecord> {
  const base = workerBaseUrl();
  if (!base) {
    throw new Error("Bookings API is not configured");
  }

  const response = await fetch(`${base}/booking-jobs/assign-driver`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Driver-Key": ownerKey.trim(),
    },
    body: JSON.stringify(input),
  });
  const payload = await parseJson(response);
  if (!response.ok || !payload.job) {
    throw new Error(String(payload.error ?? "Failed to assign driver"));
  }
  return payload.job as BookingJobRecord;
}

export async function lookupDriverAcceptJob(token: string): Promise<{
  id: string;
  customerName: string;
  pickupLabel: string;
  dropoffLabel: string;
  tripDate: string;
  tripTime: string;
  driverFirstName?: string;
  driverPayAmount?: string;
  driverAssignmentStatus: string;
  vehicle: string;
  driverCarMake?: string;
  driverCarModel?: string;
  driverReg?: string;
}> {
  const base = workerBaseUrl();
  if (!base) {
    throw new Error("Bookings API is not configured");
  }

  const response = await fetch(
    `${base}/driver-accept?token=${encodeURIComponent(token.trim())}`,
    { headers: { Accept: "application/json" } },
  );
  const payload = await parseJson(response);
  if (!response.ok || !payload.job) {
    throw new Error(String(payload.error ?? "Job not found"));
  }
  return payload.job as {
    id: string;
    customerName: string;
    pickupLabel: string;
    dropoffLabel: string;
    tripDate: string;
    tripTime: string;
    driverFirstName?: string;
    driverPayAmount?: string;
    driverAssignmentStatus: string;
    vehicle: string;
    driverCarMake?: string;
    driverCarModel?: string;
    driverReg?: string;
  };
}

export async function confirmDriverAcceptJob(
  token: string,
  action: "accept" | "decline" = "accept",
): Promise<void> {
  const base = workerBaseUrl();
  if (!base) {
    throw new Error("Bookings API is not configured");
  }

  const response = await fetch(`${base}/driver-accept/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ token, action }),
  });
  const payload = await parseJson(response);
  if (!response.ok) {
    throw new Error(String(payload.error ?? "Could not confirm job"));
  }
}
