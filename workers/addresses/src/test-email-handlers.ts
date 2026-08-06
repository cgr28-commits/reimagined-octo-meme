import {
  buildCustomerDriverDetailsEmail,
  buildDriverAssignmentEmail,
  type BookingJobRecord,
} from "../shared/booking-job";
import { corsHeaders } from "../shared/google-places";
import { resolveDriverSession } from "./driver-auth";
import { trySendEmail, type WorkerEmailEnv } from "./worker-email";

function jsonResponse(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

function sampleJob(): BookingJobRecord {
  return {
    id: "TEST-DRV-001",
    createdAt: new Date().toISOString(),
    status: "paid",
    kind: "booking-request",
    customerName: "Jamie Murphy",
    customerEmail: "jamie.murphy@example.com",
    customerMobile: "07700 900123",
    tripLabel: "Belfast City → Belfast International (BFS)",
    pickupLabel: "12 Botanic Avenue, Belfast BT7 1JG",
    dropoffLabel: "Belfast International Airport (BFS)",
    returnJourney: false,
    tripDate: "12 Aug 2026",
    tripTime: "06:45",
    passengers: 2,
    suitcases: 2,
    vehicle: "Saloon",
    isAirportTrip: true,
    airportCode: "BFS",
    isFromAirport: false,
    flightNumber: "EZY8021",
    driverFirstName: "Gary Wilson",
    driverEmail: "gary.driver@example.com",
    driverMobile: "07700 900456",
    driverCarMake: "Skoda",
    driverCarModel: "Octavia",
    driverCarColour: "Silver",
    driverReg: "AB12 CDE",
    driverPayAmount: "£45",
    driverAssignmentStatus: "pending",
  };
}

/** Owner-only: send sample driver assignment + customer driver-details emails. */
export async function handleTestDriverDetailEmails(
  request: Request,
  env: WorkerEmailEnv & { OWNER_ACCESS_KEY?: string; DRIVER_ACCESS_KEY?: string },
  origin: string | null,
): Promise<Response> {
  const session = resolveDriverSession(request, env);
  if (!session.authorized || session.role !== "owner") {
    return jsonResponse({ ok: false, error: "Owner key required" }, 401, origin);
  }

  let to = "cgr28@hotmail.co.uk";
  try {
    const body = (await request.json().catch(() => null)) as { to?: string } | null;
    if (body?.to?.trim()) to = body.to.trim();
  } catch {
    // keep default
  }

  const job = sampleJob();
  const driverEmail = buildDriverAssignmentEmail({
    job,
    acceptUrl: "https://www.myairporttaxini.co.uk/driver?accept=TEST-TOKEN",
  });
  const customerEmail = buildCustomerDriverDetailsEmail({ job });

  const driverResult = await trySendEmail(env, {
    to,
    toName: "Colin",
    subject: `[TEST] ${driverEmail.subject}`,
    body: driverEmail.text,
    htmlBody: driverEmail.html,
  });

  const customerResult = await trySendEmail(env, {
    to,
    toName: "Colin",
    subject: `[TEST] ${customerEmail.subject}`,
    body: customerEmail.text,
    htmlBody: customerEmail.html,
  });

  return jsonResponse(
    {
      ok: driverResult.sent && customerResult.sent,
      to,
      driver: driverResult,
      customer: customerResult,
      note: "Customer email uses first name only (no surname).",
    },
    driverResult.sent && customerResult.sent ? 200 : 502,
    origin,
  );
}

export function isTestDriverDetailEmailsPath(pathname: string): boolean {
  return (
    pathname === "/test/driver-detail-emails" ||
    pathname === "/api/test/driver-detail-emails"
  );
}
