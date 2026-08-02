import type { DriverJobsResponse, PublicTrackResponse } from "@/lib/tracking-api";
import { SITE } from "@/lib/data";

export const DEMO_TRACK_TOKENS = ["demo-early", "demo-waiting", "demo-live"] as const;
export type DemoTrackToken = (typeof DEMO_TRACK_TOKENS)[number];

export const DEMO_DRIVER_KEY = "demo-driver-key";

export function isDemoTrackToken(token: string): token is DemoTrackToken {
  return (DEMO_TRACK_TOKENS as readonly string[]).includes(token);
}

function londonParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const tripDate = `${get("year")}-${get("month")}-${get("day")}`;
  const tripTime = `${get("hour")}:${get("minute")}`;

  return {
    tripDate,
    tripTime,
    pickupAt: `${tripDate}T${tripTime}`,
    pickupDisplay: date.toLocaleString("en-GB", {
      timeZone: "Europe/London",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function formatWindowDisplay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  return date.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildDemoResponse(
  token: DemoTrackToken,
  config: {
    customerName: string;
    pickupLabel: string;
    dropoffLabel: string;
    pickupDate: Date;
    sharingActive: boolean;
    driver?: { lat: number; lng: number };
    window: { open: boolean; reason: "too_early" | "too_late" | "open"; opensAt: Date; closesAt: Date };
  },
): PublicTrackResponse {
  const schedule = londonParts(config.pickupDate);
  const trackUrl = `${SITE.url}/track/?id=${encodeURIComponent(token)}`;

  return {
    ok: true,
    customerName: config.customerName,
    pickupLabel: config.pickupLabel,
    dropoffLabel: config.dropoffLabel,
    tripDate: schedule.tripDate,
    tripTime: schedule.tripTime,
    pickupAt: schedule.pickupAt,
    pickupDisplay: schedule.pickupDisplay,
    trackingWindow: {
      open: config.window.open,
      opensAt: config.window.opensAt.toISOString(),
      closesAt: config.window.closesAt.toISOString(),
      pickupAt: schedule.pickupAt,
      reason: config.window.reason,
      opensAtDisplay: formatWindowDisplay(config.window.opensAt.toISOString()),
      closesAtDisplay: formatWindowDisplay(config.window.closesAt.toISOString()),
    },
    sharingActive: config.sharingActive,
    driver: config.driver
      ? {
          lat: config.driver.lat,
          lng: config.driver.lng,
          updatedAt: new Date().toISOString(),
        }
      : null,
    trackUrl,
  };
}

export function getDemoTrackResponse(token: DemoTrackToken): PublicTrackResponse {
  const now = new Date();

  if (token === "demo-early") {
    const pickup = addMinutes(now, 24 * 60);
    const opensAt = addMinutes(pickup, -120);
    const closesAt = addMinutes(pickup, 90);

    return buildDemoResponse(token, {
      customerName: "Alex Demo",
      pickupLabel: "249 Rashee Road, Ballyclare",
      dropoffLabel: "Belfast International Airport (BFS)",
      pickupDate: pickup,
      sharingActive: false,
      window: { open: false, reason: "too_early", opensAt, closesAt },
    });
  }

  if (token === "demo-waiting") {
    const pickup = addMinutes(now, 45);
    const opensAt = addMinutes(pickup, -120);
    const closesAt = addMinutes(pickup, 90);

    return buildDemoResponse(token, {
      customerName: "Jamie Demo",
      pickupLabel: "Holiday Inn Express, Belfast",
      dropoffLabel: "George Best Belfast City Airport (BHD)",
      pickupDate: pickup,
      sharingActive: false,
      window: { open: true, reason: "open", opensAt, closesAt },
    });
  }

  const pickup = addMinutes(now, 30);
  const opensAt = addMinutes(pickup, -120);
  const closesAt = addMinutes(pickup, 90);

  return buildDemoResponse(token, {
    customerName: "Sam Demo",
    pickupLabel: "Titanic Belfast",
    dropoffLabel: "Belfast International Airport (BFS)",
    pickupDate: pickup,
    sharingActive: true,
    driver: { lat: 54.5973, lng: -5.9301 },
    window: { open: true, reason: "open", opensAt, closesAt },
  });
}

export function getDemoDriverJobs(): DriverJobsResponse {
  const waiting = getDemoTrackResponse("demo-waiting");
  const live = getDemoTrackResponse("demo-live");

  return {
    ok: true,
    date: waiting.tripDate,
    jobs: [
      {
        ...live,
        token: "demo-live",
        customerMobile: "+447700900123",
        paymentReference: "DEMO-MATNI-1001",
      },
      {
        ...waiting,
        token: "demo-waiting",
        customerMobile: "+447700900123",
        paymentReference: "DEMO-MATNI-1001",
      },
    ],
  };
}

export const DEMO_SCENARIOS = [
  {
    token: "demo-early" as const,
    title: "Too early",
    description: "Link saved in invoice — tracking opens on travel day.",
  },
  {
    token: "demo-waiting" as const,
    title: "Waiting for driver",
    description: "Tracking window is open; driver has not started sharing yet.",
  },
  {
    token: "demo-live" as const,
    title: "Live map",
    description: "Driver is sharing location — customer sees the map.",
  },
] as const;
