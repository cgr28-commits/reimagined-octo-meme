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

type TestEmailEnv = WorkerEmailEnv & {
  OWNER_ACCESS_KEY?: string;
  DRIVER_ACCESS_KEY?: string;
  TEST_EMAIL_TOKEN?: string;
};

function authorizedForTestEmails(request: Request, env: TestEmailEnv): boolean {
  const session = resolveDriverSession(request, env);
  if (session.authorized && session.role === "owner") return true;

  const expected = env.TEST_EMAIL_TOKEN?.trim() ?? "";
  if (!expected || expected === "cleared") return false;
  const provided =
    request.headers.get("X-Test-Email-Token")?.trim() ||
    new URL(request.url).searchParams.get("token")?.trim() ||
    "";
  return Boolean(provided) && provided === expected;
}

/** Owner key or one-shot CI token: send sample driver + customer emails to bookings@. */
export async function handleTestDriverDetailEmails(
  request: Request,
  env: TestEmailEnv,
  origin: string | null,
): Promise<Response> {
  if (!authorizedForTestEmails(request, env)) {
    return jsonResponse({ ok: false, error: "Owner key or test token required" }, 401, origin);
  }

  // Consume body if present (destination is always the business mailbox).
  await request.json().catch(() => null);
  const to = "bookings@myairporttaxini.co.uk";

  const job = sampleJob();
  const driverEmail = buildDriverAssignmentEmail({
    job,
    acceptUrl: "https://www.myairporttaxini.co.uk/driver-accept/?token=TEST-TOKEN",
  });
  const customerEmail = buildCustomerDriverDetailsEmail({ job });

  const attempts: Array<{ label: string; ok: boolean; error?: string }> = [];

  async function attempt(
    label: string,
    run: () => Promise<{ sent: boolean; error?: string }>,
  ): Promise<boolean> {
    const result = await run();
    attempts.push({ label, ok: result.sent, error: result.error });
    return result.sent;
  }

  const driverOk = await attempt("driver", () =>
    trySendEmail(env, {
      to,
      toName: "Bookings",
      subject: `[TEST] ${driverEmail.subject}`,
      body: driverEmail.text,
      htmlBody: driverEmail.html,
    }),
  );
  const customerOk = await attempt("customer", () =>
    trySendEmail(env, {
      to,
      toName: "Bookings",
      subject: `[TEST] ${customerEmail.subject}`,
      body: customerEmail.text,
      htmlBody: customerEmail.html,
    }),
  );

  return jsonResponse(
    {
      ok: driverOk && customerOk,
      to,
      from: to,
      attempts,
      note: "All site mail uses bookings@myairporttaxini.co.uk. Customer preview is first-name only.",
      previews: {
        driverSubject: `[TEST] ${driverEmail.subject}`,
        customerSubject: `[TEST] ${customerEmail.subject}`,
      },
    },
    driverOk && customerOk ? 200 : 502,
    origin,
  );
}

export function isTestDriverDetailEmailsPath(pathname: string): boolean {
  return (
    pathname === "/test/driver-detail-emails" ||
    pathname === "/api/test/driver-detail-emails"
  );
}
