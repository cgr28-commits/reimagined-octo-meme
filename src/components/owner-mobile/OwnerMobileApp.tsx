"use client";

/**
 * Mobile-first Owner Dashboard (approved Nov 2026 design).
 *
 * Home, Bookings, Inbox (email + WhatsApp), Customers and More, with a fixed bottom bar.
 * Reads the same Worker endpoints as the classic dashboard and changes no business rules:
 * fares, deposits, refunds, payments and booking changes still go through the existing
 * screens, which open from here ("full controls") with a back button to this view.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import styles from "./OwnerMobile.module.css";
import {
  AlertIcon,
  BackIcon,
  BellIcon,
  CalendarIcon,
  CardIcon,
  ChatIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  CopyIcon,
  ExternalIcon,
  HomeIcon,
  MailIcon,
  MoreIcon,
  NavigateIcon,
  PeopleIcon,
  PhoneIcon,
  PlaneIcon,
  SearchIcon,
  SendIcon,
} from "./OwnerMobileIcons";
import {
  bookingForLeg,
  buildCustomerDirectory,
  buildHomeSummary,
  buildMessageItems,
  formatCountdown,
  formatLondonTime,
  mapsLink,
  matchesBookingSearch,
  minutesUntilPickup,
  paidLegs,
  telLink,
  whatsAppLink,
  whatsAppReplyWindowClosesAt,
  type MobileCustomer,
  type MobileMessageItem,
  type MobilePaidBooking,
  type MobileUrgentItem,
  type MobileWhatsAppChat,
} from "./owner-mobile-data";
import { fetchOwnerPaidBookings, type OwnerPaidBookingSummary } from "@/lib/paid-bookings-api";
import { fetchShortNoticeBookings, type ShortNoticeBookingSummary } from "@/lib/short-notice-api";
import {
  ownerInboxFetch,
  type InboxListResponse,
  type InboxThreadBooking,
  type InboxThreadResponse,
} from "@/lib/owner-inbox-api";
import { resolveWorkerBaseUrl } from "@/lib/worker-api";
import { fetchOwnerAccountProfile } from "@/lib/tracking-api";
import { isPreviewHost, sampleOwnerData } from "./owner-mobile-sample";
import OwnerDriversScreen from "./OwnerDriversScreen";
import OwnerNotificationsScreen from "./OwnerNotificationsScreen";
import { ownerDrivers, type DriversSummary } from "@/lib/driver-accounts-api";
import type { OwnerDashboardToolTab } from "@/components/OwnerDashboardToolSwitcher";
import { buildOwnerOutgoingEmail, type InboxMessage } from "../../../shared/owner-inbox";
import {
  formatOwnerOpsDateLabel,
  formatOwnerOpsMoney,
  isOwnerOpsAwaitingPaymentStatus,
  ownerOpsTodayDate,
  paidBookingIsCancelled,
  type OwnerOpsLeg,
} from "../../../shared/owner-dashboard-ops";
import { addDaysYmd } from "../../../shared/upcoming-jobs";

const WORKER_BASE = resolveWorkerBaseUrl();
const REFRESH_MS = 60_000;

export type OwnerMobileTab = "home" | "bookings" | "inbox" | "customers" | "more";

type View =
  | { kind: "tab" }
  | { kind: "booking"; ref: string; leg: OwnerOpsLeg["leg"]; fromDriverId?: string }
  | { kind: "email"; threadKey: string }
  | { kind: "whatsapp"; phone: string }
  | { kind: "customer"; id: string }
  | { kind: "drivers"; driverId?: string }
  | { kind: "notifications" };

export type OwnerMobileAppProps = {
  ownerKey: string;
  ownerFirstName?: string;
  initialTab?: OwnerMobileTab;
  /** Open one of the existing (classic) tools, e.g. pricing or refunds, inside the mobile chrome. */
  onOpenTool: (tool: OwnerDashboardToolTab, options?: { date?: string; returnTab?: OwnerMobileTab }) => void;
  onSwitchToClassic: () => void;
  onSignOut: () => void;
};

type ChatEntry = { at: string; from: "customer" | "assistant" | "team"; text: string; failed?: boolean };
type ChatRecord = { phone: string; name?: string; messages: ChatEntry[] };

async function fetchWhatsAppChats(ownerKey: string): Promise<MobileWhatsAppChat[]> {
  const response = await fetch(`${WORKER_BASE}/owner/whatsapp-chats`, {
    headers: { Accept: "application/json", "X-Owner-Key": ownerKey.trim() },
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as { chats?: MobileWhatsAppChat[]; error?: string };
  if (!response.ok) throw new Error(payload.error || "WhatsApp chats unavailable");
  return Array.isArray(payload.chats) ? payload.chats : [];
}

function newSendId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\s'-]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function londonLongDate(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
}

function greeting(now: Date): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function shortDate(ymd: string): string {
  const parsed = Date.parse(`${ymd}T12:00:00Z`);
  if (!Number.isFinite(parsed)) return ymd;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" }).format(
    new Date(parsed),
  );
}

function messageTime(iso: string, now: Date): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const today = ownerOpsTodayDate(now);
  const day = ownerOpsTodayDate(new Date(ms));
  if (day === today) return formatLondonTime(iso);
  if (day === addDaysYmd(today, -1)) return "Yesterday";
  return shortDate(day);
}

type PaymentChip = { label: string; tone: "green" | "amber" | "red" | "grey" };

function paymentChip(booking: MobilePaidBooking | undefined): PaymentChip {
  if (!booking) return { label: "—", tone: "grey" };
  const status = String(booking.status || "").toLowerCase();
  if (paidBookingIsCancelled(booking)) return { label: "Cancelled", tone: "grey" };
  if (isOwnerOpsAwaitingPaymentStatus(status)) return { label: "Awaiting payment", tone: "red" };
  if (status === "refunded" || status === "refunded_active") return { label: "Refunded", tone: "grey" };
  if (status === "partially_refunded") return { label: "Part refunded", tone: "amber" };
  if (status.includes("hold") || status.includes("authori")) return { label: "Card held", tone: "amber" };
  return { label: "Paid", tone: "green" };
}

function legPassengers(booking?: MobilePaidBooking): string {
  const n = Number(booking?.passengers);
  return Number.isFinite(n) && n > 0 ? `${n} passenger${n === 1 ? "" : "s"}` : "";
}

function legFlight(booking: MobilePaidBooking | undefined, leg: OwnerOpsLeg): string {
  const flight = leg.leg === "return" ? booking?.returnFlightNumber : booking?.flightNumber;
  return flight?.trim() || "";
}

function bookingRefLabel(booking?: MobilePaidBooking): string {
  return booking?.customerReference?.trim() || booking?.paymentReference || "";
}

const toneClass = (tone: string) =>
  ({ red: styles.red, amber: styles.amber, blue: styles.blue, green: styles.green, grey: styles.grey })[tone] ?? styles.grey;

export default function OwnerMobileApp({
  ownerKey,
  ownerFirstName,
  initialTab = "home",
  onOpenTool,
  onSwitchToClassic,
  onSignOut,
}: OwnerMobileAppProps) {
  const [tab, setTab] = useState<OwnerMobileTab>(initialTab);
  // A tapped notification opens the right tab (#inbox, #bookings, #home).
  useEffect(() => {
    const go = (url: string) => {
      const target = url.split("#")[1];
      if (target === "inbox" || target === "bookings" || target === "home" || target === "customers" || target === "more") {
        setTab(target);
        setView({ kind: "tab" });
      }
    };
    go(window.location.hash ? `#${window.location.hash.slice(1)}` : "");
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === "owner-open" && typeof event.data.url === "string") go(event.data.url);
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, []);
  const [view, setView] = useState<View>({ kind: "tab" });
  const [now, setNow] = useState(() => new Date());
  const [bookings, setBookings] = useState<OwnerPaidBookingSummary[]>([]);
  const [shortNotice, setShortNotice] = useState<ShortNoticeBookingSummary[]>([]);
  const [inbox, setInbox] = useState<InboxListResponse | null>(null);
  const [chats, setChats] = useState<MobileWhatsAppChat[]>([]);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [typing, setTyping] = useState(false);
  const [toast, setToast] = useState("");
  const [profileFirstName, setProfileFirstName] = useState("");
  /** Stage 1 driver accounts (staging only). Null when not switched on. */
  const [driversSummary, setDriversSummary] = useState<DriversSummary | null>(null);
  /** Staging preview only: show clearly-labelled sample data instead of the (empty) staging data. */
  const [sample, setSample] = useState(false);
  const [previewHost, setPreviewHost] = useState(false);
  useEffect(() => setPreviewHost(isPreviewHost()), []);

  // Greeting uses the first name saved in the owner profile, if there is one.
  useEffect(() => {
    let cancelled = false;
    fetchOwnerAccountProfile(ownerKey)
      .then(({ profile }) => {
        const first = profile?.displayName?.trim().split(/\s+/)[0] ?? "";
        if (!cancelled && first && first.toLowerCase() !== "owner") setProfileFirstName(first);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ownerKey]);

  const load = useCallback(async () => {
    if (sample) {
      const data = sampleOwnerData(new Date());
      setBookings(data.bookings);
      setShortNotice(data.shortNotice);
      setInbox(data.inbox);
      setChats(data.chats);
      setLoadErrors([]);
      setLoaded(true);
      setNow(new Date());
      return;
    }
    void ownerDrivers
      .summary(ownerKey)
      .then(setDriversSummary)
      .catch(() => setDriversSummary(null));
    // Each part shows as soon as it arrives: bookings never wait for emails or WhatsApp.
    const errors: string[] = [];
    const part = <T,>(promise: Promise<T>, apply: (value: T) => void, label: string) =>
      promise.then(apply).catch(() => {
        errors.push(label);
      });
    const bookingsPart = part(
      fetchOwnerPaidBookings(ownerKey, { mode: "upcoming", pastDays: 1, futureDays: 120, limit: 250 }),
      setBookings,
      "bookings",
    ).then(() => {
      setLoaded(true);
      setNow(new Date());
    });
    await Promise.all([
      bookingsPart,
      part(fetchShortNoticeBookings(ownerKey), setShortNotice, "short-notice requests"),
      part(ownerInboxFetch<InboxListResponse>(ownerKey, "/owner/inbox"), setInbox, "emails"),
      part(fetchWhatsAppChats(ownerKey), setChats, "WhatsApp chats"),
    ]);
    setLoadErrors(errors);
    setLoaded(true);
    setNow(new Date());
  }, [ownerKey, sample]);

  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(clock);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  // Hide the bottom bar while typing so the iPhone keyboard never sits on top of it.
  useEffect(() => {
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    const onIn = (event: FocusEvent) => isField(event.target) && setTyping(true);
    const onOut = () => window.setTimeout(() => setTyping(isField(document.activeElement)), 50);
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab, view]);

  const threads = useMemo(() => inbox?.threads ?? [], [inbox]);
  const summary = useMemo(
    () => buildHomeSummary({ bookings, shortNotice, threads, chats, now }),
    [bookings, shortNotice, threads, chats, now],
  );
  const messages = useMemo(() => buildMessageItems(threads, chats, now), [threads, chats, now]);
  const awaitingRequests = summary.urgent.filter((item) => item.kind === "short_notice").length;

  const openTab = (next: OwnerMobileTab) => {
    setTab(next);
    setView({ kind: "tab" });
  };

  const openMessage = (item: Pick<MobileMessageItem, "channel" | "threadKey" | "phone">) => {
    if (item.channel === "email" && item.threadKey) setView({ kind: "email", threadKey: item.threadKey });
    if (item.channel === "whatsapp" && item.phone) setView({ kind: "whatsapp", phone: item.phone });
  };

  const openUrgent = (item: MobileUrgentItem) => {
    if (item.target.tab === "inbox" && item.target.ref) {
      const [channel, id] = item.target.ref.split(/:(.+)/);
      openMessage(channel === "email" ? { channel: "email", threadKey: id } : { channel: "whatsapp", phone: id });
      return;
    }
    if (item.target.tab === "requests") onOpenTool("requests", { returnTab: tab });
    else if (item.target.tab === "admin") onOpenTool("admin", { returnTab: tab });
  };

  const openLeg = (leg: OwnerOpsLeg) => setView({ kind: "booking", ref: leg.bookingId, leg: leg.leg });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast("Copied");
    } catch {
      setToast("Couldn't copy on this device");
    }
  };

  let screen: ReactNode;
  if (view.kind === "booking") {
    screen = (
      <BookingDetail
        bookings={bookings}
        refId={view.ref}
        legKind={view.leg}
        now={now}
        threads={threads}
        chats={chats}
        onBack={() => setView(view.fromDriverId ? { kind: "drivers", driverId: view.fromDriverId } : { kind: "tab" })}
        onCopy={copy}
        onOpenMessage={openMessage}
        onFullControls={(date) => onOpenTool("jobs", { date, returnTab: tab })}
      />
    );
  } else if (view.kind === "email") {
    screen = (
      <EmailThread
        sample={sample}
        ownerKey={ownerKey}
        threadKey={view.threadKey}
        now={now}
        onBack={() => setView({ kind: "tab" })}
        onChanged={load}
        onToast={setToast}
        onOpenBooking={(paymentReference) => {
          const booking = bookings.find((b) => b.paymentReference === paymentReference);
          if (booking) setView({ kind: "booking", ref: paymentReference, leg: "outbound" });
          else setToast("That booking isn't in the next 4 months");
        }}
      />
    );
  } else if (view.kind === "whatsapp") {
    screen = (
      <WhatsAppThread
        sample={sample}
        ownerKey={ownerKey}
        phone={view.phone}
        now={now}
        onBack={() => setView({ kind: "tab" })}
        onChanged={load}
        onToast={setToast}
      />
    );
  } else if (view.kind === "customer") {
    screen = (
      <CustomersScreen
        sampleBookings={sample ? bookings : null}
        ownerKey={ownerKey}
        now={now}
        threads={threads}
        chats={chats}
        selectedId={view.id}
        onSelect={(id) => setView(id ? { kind: "customer", id } : { kind: "tab" })}
        onOpenMessage={openMessage}
        onOpenBooking={(ref) => setView({ kind: "booking", ref, leg: "outbound" })}
      />
    );
  } else if (view.kind === "notifications") {
    screen = <OwnerNotificationsScreen ownerKey={ownerKey} onBack={() => setView({ kind: "tab" })} onToast={setToast} />;
  } else if (view.kind === "drivers") {
    screen = (
      <OwnerDriversScreen
        ownerKey={ownerKey}
        initialDriverId={view.driverId}
        onOpenBooking={(ref, leg, driverId) => setView({ kind: "booking", ref, leg, fromDriverId: driverId })}
        onBack={() => {
          setView({ kind: "tab" });
          void ownerDrivers.summary(ownerKey).then(setDriversSummary).catch(() => undefined);
        }}
        onToast={setToast}
      />
    );
  } else if (tab === "home") {
    screen = (
      <HomeScreen
        now={now}
        firstName={ownerFirstName || profileFirstName}
        bookings={bookings}
        summary={summary}
        loaded={loaded}
        loadErrors={loadErrors}
        onOpenLeg={openLeg}
        onOpenUrgent={openUrgent}
        onOpenTab={openTab}
        offerSample={previewHost && !sample && loaded && bookings.length === 0 && threads.length === 0 && chats.length === 0}
        driverAlert={<DriverAlertBanner summary={driversSummary} onOpen={() => setView({ kind: "drivers" })} />}
        onShowSample={() => setSample(true)}
      />
    );
  } else if (tab === "bookings") {
    screen = (
      <BookingsScreen
        bookings={bookings}
        now={now}
        loaded={loaded}
        onOpenLeg={openLeg}
        onOpenCalendar={() => onOpenTool("jobs", { returnTab: "bookings" })}
      />
    );
  } else if (tab === "inbox") {
    screen = (
      <InboxScreen
        messages={messages}
        inbox={inbox}
        loaded={loaded}
        now={now}
        onOpen={openMessage}
        onOpenEmailSetup={() => onOpenTool("inbox", { returnTab: "inbox" })}
      />
    );
  } else if (tab === "customers") {
    screen = (
      <CustomersScreen
        sampleBookings={sample ? bookings : null}
        ownerKey={ownerKey}
        now={now}
        threads={threads}
        chats={chats}
        selectedId={null}
        onSelect={(id) => id && setView({ kind: "customer", id })}
        onOpenMessage={openMessage}
        onOpenBooking={(ref) => setView({ kind: "booking", ref, leg: "outbound" })}
      />
    );
  } else {
    screen = (
      <MoreScreen
        awaitingRequests={awaitingRequests}
        onOpenDrivers={driversSummary ? () => setView({ kind: "drivers" }) : undefined}
        onOpenNotifications={sample ? undefined : () => setView({ kind: "notifications" })}
        driversSummary={driversSummary}
        onOpenTool={(tool) => onOpenTool(tool, { returnTab: "more" })}
        onSwitchToClassic={onSwitchToClassic}
        onSignOut={onSignOut}
      />
    );
  }

  const showNav = view.kind === "tab" || view.kind === "customer";

  return (
    <div className={styles.app} data-owner-mobile-app>
      {sample ? (
        <div
          role="status"
          style={{ position: "sticky", top: 0, zIndex: 50, background: "#FFF4DB", color: "#6B4100", padding: "calc(env(safe-area-inset-top) + 8px) 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800 }}
        >
          <span>Sample data — nothing on these screens is real</span>
          <button type="button" className={styles.linkButton} style={{ color: "#6B4100", minHeight: 32 }} onClick={() => setSample(false)}>
            Use staging data
          </button>
        </div>
      ) : null}
      <div className={styles.inner}>{screen}</div>
      {toast ? (
        <div
          role="status"
          style={{
            position: "fixed",
            left: "50%",
            bottom: "calc(96px + env(safe-area-inset-bottom))",
            transform: "translateX(-50%)",
            background: "#071C38",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 999,
            fontSize: 14,
            fontWeight: 700,
            zIndex: 80,
          }}
        >
          {toast}
        </div>
      ) : null}
      {showNav ? (
        <BottomNav
          tab={tab}
          hidden={typing}
          inboxCount={summary.unreadMessages}
          bookingsUrgent={awaitingRequests}
          onChange={openTab}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom navigation                                                   */
/* ------------------------------------------------------------------ */

export function BottomNav({
  tab,
  hidden,
  inboxCount,
  bookingsUrgent,
  onChange,
}: {
  tab: OwnerMobileTab | null;
  hidden?: boolean;
  inboxCount: number;
  bookingsUrgent: number;
  onChange: (tab: OwnerMobileTab) => void;
}) {
  const items: Array<{ id: OwnerMobileTab; label: string; icon: ReactNode; badge?: number; urgent?: boolean }> = [
    { id: "home", label: "Home", icon: <HomeIcon size={24} /> },
    { id: "bookings", label: "Bookings", icon: <CalendarIcon size={24} />, badge: bookingsUrgent, urgent: true },
    { id: "inbox", label: "Inbox", icon: <ChatIcon size={24} />, badge: inboxCount },
    { id: "customers", label: "Customers", icon: <PeopleIcon size={24} /> },
    { id: "more", label: "More", icon: <MoreIcon size={24} /> },
  ];
  return (
    <nav aria-label="Owner dashboard" className={`${styles.nav} ${hidden ? styles.navHidden : ""}`}>
      <div className={styles.navInner}>
        {items.map((item) => {
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? "page" : undefined}
              className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
              onClick={() => onChange(item.id)}
              data-owner-mobile-nav={item.id}
            >
              <span style={active ? { color: "#17803A" } : undefined}>{item.icon}</span>
              {item.label}
              {item.badge ? (
                <span
                  className={`${styles.navBadge} ${item.urgent ? styles.navBadgeUrgent : ""}`}
                  aria-label={`${item.badge} new`}
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

function HomeScreen({
  now,
  firstName,
  bookings,
  summary,
  loaded,
  loadErrors,
  onOpenLeg,
  onOpenUrgent,
  onOpenTab,
  offerSample,
  onShowSample,
  driverAlert,
}: {
  driverAlert?: ReactNode;
  offerSample?: boolean;
  onShowSample?: () => void;
  now: Date;
  firstName?: string;
  bookings: MobilePaidBooking[];
  summary: ReturnType<typeof buildHomeSummary>;
  loaded: boolean;
  loadErrors: string[];
  onOpenLeg: (leg: OwnerOpsLeg) => void;
  onOpenUrgent: (item: MobileUrgentItem) => void;
  onOpenTab: (tab: OwnerMobileTab) => void;
}) {
  const next = summary.nextPickup;
  const nextBooking = next ? bookingForLeg(bookings, next) : undefined;
  const nextChip = paymentChip(nextBooking);
  const minutes = next ? minutesUntilPickup(next, now) : null;
  const countdown = formatCountdown(minutes);
  const nextLabel = next
    ? next.scheduledDate === summary.today
      ? `Next pickup${countdown ? ` · ${countdown}` : ""}`
      : `Next pickup · ${formatOwnerOpsDateLabel(next.scheduledDate, summary.today)}`
    : "";
  const urgentShown = summary.urgent.slice(0, 4);
  const todayActive = summary.todayLegs.filter((leg) => !leg.completed);

  return (
    <>
      <div data-owner-mobile-header className={styles.heroHeader}>
        <div className={styles.heroTop}>
          <div>
            <p className={styles.heroDate}>{londonLongDate(now)}</p>
            <h1 className={styles.heroTitle}>
              {greeting(now)}
              {firstName ? `, ${firstName}` : ""}
            </h1>
          </div>
          <button
            type="button"
            className={styles.iconButtonDark}
            aria-label={`Messages, ${summary.unreadMessages} unread`}
            onClick={() => onOpenTab("inbox")}
          >
            <BellIcon />
            {summary.unreadMessages ? <span className={styles.dot} /> : null}
          </button>
        </div>
        {next ? (
          <button type="button" className={styles.nextCard} onClick={() => onOpenLeg(next)} data-owner-next-pickup>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span className={styles.nextLabel}>{nextLabel}</span>
              <span className={`${styles.chip} ${toneClass(nextChip.tone)}`}>{nextChip.label}</span>
            </span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span className={styles.nextTime}>{next.scheduledTime || "—"}</span>
              <span className={styles.nextPlace}>{next.pickup}</span>
            </span>
            <span className={styles.nextMeta}>
              {[next.customerName, legFlight(nextBooking, next), legPassengers(nextBooking)].filter(Boolean).join(" · ")}
            </span>
          </button>
        ) : (
          <div className={styles.nextCard} style={{ cursor: "default" }}>
            <span className={styles.nextLabel}>Next pickup</span>
            <span className={styles.nextMeta}>{loaded ? "No upcoming pickups booked." : "Loading…"}</span>
          </div>
        )}
      </div>

      <main className={styles.main}>
        {driverAlert}
        {offerSample ? (
          <div className={`${styles.notice} ${styles.blue}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span>This staging copy has no bookings or messages yet, so the screens are empty.</span>
            <button type="button" className={styles.secondaryButton} onClick={onShowSample}>
              Show sample data
            </button>
          </div>
        ) : null}
        {loadErrors.length ? (
          <div className={`${styles.notice} ${styles.amber}`} role="status">
            Couldn&apos;t load {loadErrors.join(", ")} just now. What&apos;s shown may be incomplete — it will retry
            automatically.
          </div>
        ) : null}

        <div className={styles.homeGrid}>
          <section aria-label="Needs you now" className={styles.card} style={{ paddingBottom: 6 }}>
            <div className={styles.cardHead}>
              <h2 className={styles.sectionTitle}>Needs you now</h2>
              {summary.urgent.length > 0 ? (
                <span className={`${styles.chip} ${styles.red}`}>{summary.urgent.length}</span>
              ) : null}
            </div>
            {urgentShown.length === 0 ? (
              <p className={styles.empty}>{loaded ? "Nothing needs you right now." : "Checking…"}</p>
            ) : (
              urgentShown.map((item) => (
                <button key={item.id} type="button" className={styles.row} onClick={() => onOpenUrgent(item)}>
                  <span className={`${styles.rowIcon} ${toneClass(item.tone)}`}>
                    {item.kind === "short_notice" ? (
                      <ClockIcon size={19} />
                    ) : item.kind === "email" ? (
                      <MailIcon size={19} />
                    ) : item.kind === "whatsapp" ? (
                      <ChatIcon size={19} />
                    ) : (
                      <CardIcon size={19} />
                    )}
                  </span>
                  <span className={styles.rowBody}>
                    <span className={styles.rowTitle}>{item.title}</span>
                    <span className={styles.rowDetail}>{item.detail}</span>
                  </span>
                  <span className={`${styles.chip} ${toneClass(item.tone)}`}>{item.badge}</span>
                </button>
              ))
            )}
            {summary.urgent.length > urgentShown.length ? (
              <button type="button" className={styles.linkButton} style={{ margin: "0 12px" }} onClick={() => onOpenTab("inbox")}>
                {summary.urgent.length - urgentShown.length} more
              </button>
            ) : null}
          </section>

          <section aria-label="Today's bookings" className={styles.card} style={{ paddingBottom: 6 }}>
            <div className={styles.cardHead}>
              <h2 className={styles.sectionTitle}>
                Today · {summary.todayLegs.length} booking{summary.todayLegs.length === 1 ? "" : "s"}
              </h2>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#445468" }} title="Completed journeys today">
                {loaded ? `${formatOwnerOpsMoney(summary.earnedTodayGbp)} earned` : "—"}
              </span>
            </div>
            {todayActive.length === 0 ? (
              <p className={styles.empty}>
                {summary.todayLegs.length
                  ? `All ${summary.todayCompletedCount} done for today.`
                  : loaded
                    ? "No bookings today."
                    : "Loading…"}
              </p>
            ) : (
              todayActive.map((leg) => {
                const booking = bookingForLeg(bookings, leg);
                const chip = paymentChip(booking);
                const isNext = next && leg.bookingId === next.bookingId && leg.leg === next.leg;
                return (
                  <button
                    key={`${leg.bookingId}:${leg.leg}`}
                    type="button"
                    className={styles.row}
                    style={isNext ? { background: "#F3FBF4" } : undefined}
                    onClick={() => onOpenLeg(leg)}
                  >
                    <span style={{ width: 48, fontSize: 15, fontWeight: 800 }}>{leg.scheduledTime || "—"}</span>
                    <span className={styles.rowBody}>
                      <span className={styles.rowTitle} style={{ fontSize: 14, fontWeight: 700 }}>
                        {leg.customerName || "Customer"} · {leg.pickup}
                      </span>
                    </span>
                    <span className={`${styles.chip} ${toneClass(chip.tone)}`}>{chip.label}</span>
                  </button>
                );
              })
            )}
            {summary.todayCompletedCount > 0 && todayActive.length > 0 ? (
              <p className={styles.empty} style={{ paddingTop: 4, paddingBottom: 4 }}>
                {summary.todayCompletedCount} already done today
              </p>
            ) : null}
            <button type="button" className={styles.linkButton} style={{ width: "100%" }} onClick={() => onOpenTab("bookings")}>
              All bookings
            </button>
          </section>
        </div>
      </main>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Bookings                                                            */
/* ------------------------------------------------------------------ */

type DayFilter = "today" | "tomorrow" | "upcoming";

function BookingsScreen({
  bookings,
  now,
  loaded,
  onOpenLeg,
  onOpenCalendar,
}: {
  bookings: MobilePaidBooking[];
  now: Date;
  loaded: boolean;
  onOpenLeg: (leg: OwnerOpsLeg) => void;
  onOpenCalendar: () => void;
}) {
  const [day, setDay] = useState<DayFilter>("today");
  const [query, setQuery] = useState("");
  const today = ownerOpsTodayDate(now);
  const tomorrow = addDaysYmd(today, 1);
  const legs = useMemo(
    () =>
      paidLegs(bookings)
        .filter((leg) => !leg.cancelled && leg.scheduledDate >= today)
        .sort((a, b) => `${a.scheduledDate}T${a.scheduledTime}`.localeCompare(`${b.scheduledDate}T${b.scheduledTime}`)),
    [bookings, today],
  );
  const counts = {
    today: legs.filter((leg) => leg.scheduledDate === today).length,
    tomorrow: legs.filter((leg) => leg.scheduledDate === tomorrow).length,
    upcoming: legs.filter((leg) => leg.scheduledDate > tomorrow).length,
  };
  const searching = query.trim().length > 0;
  const shown = legs.filter((leg) => {
    const booking = bookingForLeg(bookings, leg);
    if (searching) return booking ? matchesBookingSearch(booking, leg, query) : false;
    if (day === "today") return leg.scheduledDate === today;
    if (day === "tomorrow") return leg.scheduledDate === tomorrow;
    return leg.scheduledDate > tomorrow;
  });
  const done = shown.filter((leg) => leg.completed);
  const todo = shown.filter((leg) => !leg.completed);
  const nextKey = legs.find((leg) => !leg.completed && (minutesUntilPickup(leg, now) ?? 1) > -60);

  const groups = useMemo(() => {
    if (!(searching || day === "upcoming")) return null;
    const map = new Map<string, OwnerOpsLeg[]>();
    for (const leg of todo) map.set(leg.scheduledDate, [...(map.get(leg.scheduledDate) || []), leg]);
    return [...map.entries()];
  }, [searching, day, todo]);

  const card = (leg: OwnerOpsLeg) => {
    const booking = bookingForLeg(bookings, leg);
    const chip = paymentChip(booking);
    const isNext = nextKey && nextKey.bookingId === leg.bookingId && nextKey.leg === leg.leg;
    const flight = legFlight(booking, leg);
    const minutes = isNext ? minutesUntilPickup(leg, now) : null;
    const driver = booking?.assignedDriverLabel || booking?.assignedDriverName;
    return (
      <button
        key={`${leg.bookingId}:${leg.leg}`}
        type="button"
        className={`${styles.bookingCard} ${isNext ? styles.bookingCardNext : ""} ${leg.completed ? styles.bookingCardDone : ""}`}
        onClick={() => onOpenLeg(leg)}
        data-owner-booking-card={leg.bookingId}
      >
        <span className={styles.bookingTop}>
          <span style={{ display: "flex", flexDirection: "column" }}>
            {isNext && formatCountdown(minutes) ? (
              <span style={{ fontSize: 12, fontWeight: 800, color: "#17803A", letterSpacing: 0.6 }}>
                NEXT · {formatCountdown(minutes).toUpperCase()}
              </span>
            ) : null}
            <span className={styles.bookingTime}>{leg.scheduledTime || "—"}</span>
          </span>
          <span className={`${styles.chip} ${toneClass(chip.tone)}`}>
            {leg.completed ? "Completed" : chip.label}
          </span>
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span className={styles.bookingName}>{leg.customerName || "Customer"}</span>
          <span className={styles.bookingRoute}>
            {leg.pickup} → {leg.dropoff}
          </span>
        </span>
        {!leg.completed ? (
          <span className={styles.tags}>
            {flight ? <span className={`${styles.tag} ${styles.blue}`}>{flight}</span> : null}
            {legPassengers(booking) ? <span className={`${styles.tag} ${styles.grey}`}>{legPassengers(booking)}</span> : null}
            {booking?.vehicle ? <span className={`${styles.tag} ${styles.grey}`}>{booking.vehicle}</span> : null}
            {driver ? <span className={`${styles.tag} ${styles.grey}`}>Driver: {driver}</span> : null}
            {leg.isReturnBooking ? (
              <span className={`${styles.tag} ${styles.grey}`}>{leg.leg === "return" ? "Return leg" : "Outbound leg"}</span>
            ) : null}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <>
      <div data-owner-mobile-header className={styles.pageHeader}>
        <div className={styles.pageTitleRow}>
          <h1 className={styles.pageTitle}>Bookings</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className={styles.squareButton}
              aria-label="Calendar and full job controls"
              onClick={onOpenCalendar}
            >
              <CalendarIcon size={20} />
            </button>
            <a href="/quick-quote/" className={styles.emeraldButton} style={{ minHeight: 44, borderRadius: 14, fontSize: 15 }}>
              + New
            </a>
          </div>
        </div>
        <label className={styles.search}>
          <SearchIcon size={18} />
          <span className={styles.srOnly}>Search bookings</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, reference, airport or date"
            enterKeyHint="search"
          />
        </label>
        {!searching ? (
          <div role="tablist" aria-label="Day" className={styles.segmented}>
            {(
              [
                ["today", `Today · ${counts.today}`],
                ["tomorrow", `Tomorrow · ${counts.tomorrow}`],
                ["upcoming", `Upcoming · ${counts.upcoming}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={day === id}
                className={`${styles.segment} ${day === id ? styles.segmentActive : ""}`}
                onClick={() => setDay(id)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <main className={styles.main} style={{ gap: 10 }}>
        {!loaded ? <p className={styles.empty}>Loading bookings…</p> : null}
        {loaded && shown.length === 0 ? (
          <p className={styles.empty}>
            {searching ? "No bookings in the next 4 months match that search." : "No bookings for this day."}
          </p>
        ) : null}
        {groups
          ? groups.map(([date, items]) => (
              <section key={date} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <p className={styles.groupLabel}>{formatOwnerOpsDateLabel(date, today)}</p>
                {items.map(card)}
              </section>
            ))
          : (
            <>
              {todo.length && done.length ? <p className={styles.groupLabel}>Still to do</p> : null}
              {todo.map(card)}
              {done.length ? <p className={styles.groupLabel}>Done</p> : null}
              {done.map(card)}
            </>
          )}
      </main>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Booking detail                                                      */
/* ------------------------------------------------------------------ */

function BookingDetail({
  bookings,
  refId,
  legKind,
  now,
  threads,
  chats,
  onBack,
  onCopy,
  onOpenMessage,
  onFullControls,
}: {
  bookings: MobilePaidBooking[];
  refId: string;
  legKind: OwnerOpsLeg["leg"];
  now: Date;
  threads: InboxListResponse["threads"];
  chats: MobileWhatsAppChat[];
  onBack: () => void;
  onCopy: (text: string) => void;
  onOpenMessage: (item: Pick<MobileMessageItem, "channel" | "threadKey" | "phone">) => void;
  onFullControls: (date: string) => void;
}) {
  const booking = bookings.find((b) => b.paymentReference === refId);
  const legs = booking ? paidLegs([booking]) : [];
  const leg = legs.find((l) => l.leg === legKind) ?? legs[0];
  if (!booking || !leg) {
    return (
      <>
        <div data-owner-mobile-header className={styles.pageHeader}>
          <div className={styles.backRow}>
            <button type="button" className={styles.backButton} onClick={onBack}>
              <BackIcon size={24} />
              Back
            </button>
          </div>
        </div>
        <p className={styles.empty}>This booking is no longer in the list. It may have been cancelled or moved.</p>
      </>
    );
  }
  const chip = paymentChip(booking);
  const phone = telLink(booking.mobileNumber);
  const wa = whatsAppLink(booking.mobileNumber);
  const email = String(booking.customerEmail || "").trim().toLowerCase();
  const thread = threads.find((t) => t.counterpartEmail.toLowerCase() === email && !t.archived);
  const waDigits = wa ? wa.replace("https://wa.me/", "") : "";
  const chat = chats.find((c) => c.phone === waDigits);
  const flight = legFlight(booking, leg);
  const minutes = minutesUntilPickup(leg, now);
  const driver = booking.assignedDriverLabel || booking.assignedDriverName || (booking.primaryDriverDefault ? "You" : "");
  const navigateTo = leg.completed ? leg.dropoff : leg.pickup;
  const amount = booking.amountPaid || (booking.amount ? formatOwnerOpsMoney(Number(booking.amount)) : "—");

  return (
    <>
      <div data-owner-mobile-header className={styles.detailHeader}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button type="button" className={`${styles.backButton} ${styles.detailBack}`} onClick={onBack}>
            <BackIcon size={24} />
            Back
          </button>
        </div>
        <div style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#AFC0D6" }}>{bookingRefLabel(booking)}</span>
            <span className={`${styles.chip} ${toneClass(chip.tone)}`}>{leg.completed ? "Completed" : chip.label}</span>
          </span>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.4 }}>{leg.customerName || "Customer"}</h1>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: "#C9D5E4" }}>
            {formatOwnerOpsDateLabel(leg.scheduledDate, ownerOpsTodayDate(now))} · {leg.scheduledTime}
            {!leg.completed && formatCountdown(minutes) ? ` · ${formatCountdown(minutes)}` : ""}
          </p>
        </div>
        <div className={styles.actionGrid}>
          <a href={phone ?? undefined} className={`${styles.action} ${phone ? "" : styles.actionDisabled}`}>
            <span className={styles.actionIcon}>
              <PhoneIcon />
            </span>
            Call
          </a>
          <a
            href={wa ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.action} ${wa ? "" : styles.actionDisabled}`}
          >
            <span className={`${styles.actionIcon} ${styles.actionIconPrimary}`}>
              <ChatIcon />
            </span>
            WhatsApp
          </a>
          {thread ? (
            <button type="button" className={styles.action} onClick={() => onOpenMessage({ channel: "email", threadKey: thread.threadKey })}>
              <span className={styles.actionIcon}>
                <MailIcon />
              </span>
              Email
            </button>
          ) : (
            <button type="button" className={`${styles.action} ${email ? "" : styles.actionDisabled}`} onClick={() => onFullControls(leg.scheduledDate)}>
              <span className={styles.actionIcon}>
                <MailIcon />
              </span>
              Email
            </button>
          )}
          <a href={mapsLink(navigateTo)} target="_blank" rel="noopener noreferrer" className={styles.action}>
            <span className={styles.actionIcon}>
              <NavigateIcon />
            </span>
            Navigate
          </a>
        </div>
      </div>

      <main className={styles.main} style={{ gap: 12, paddingBottom: 140 }}>
        <section aria-label="Journey" className={`${styles.card} ${styles.cardPad}`} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { label: `Pickup · ${leg.scheduledTime}`, place: leg.pickup, dot: "#2FBF4A" },
            { label: "Drop-off", place: leg.dropoff, dot: "#071C38" },
          ].map((stop) => (
            <div key={stop.label} className={styles.stop}>
              <span style={{ width: 12, height: 12, borderRadius: 4, background: stop.dot, marginTop: 5, flexShrink: 0 }} />
              <span className={styles.stopBody}>
                <span className={styles.stopLabel}>{stop.label}</span>
                <span className={styles.stopPlace}>{stop.place}</span>
              </span>
              <button type="button" className={styles.squareButton} aria-label={`Copy ${stop.label.toLowerCase()} address`} onClick={() => onCopy(stop.place)}>
                <CopyIcon size={18} />
              </button>
            </div>
          ))}
        </section>

        <section
          aria-label="Details"
          className={`${styles.card} ${styles.cardPad}`}
          style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}
        >
          <Fact label="Flight" value={flight || "Not given"} icon={<PlaneIcon size={14} />} />
          <Fact
            label="Passengers"
            value={legPassengers(booking) || "—"}
            sub={Number(booking.suitcases) > 0 ? `${booking.suitcases} case${booking.suitcases === 1 ? "" : "s"}` : undefined}
          />
          <Fact label="Vehicle" value={booking.vehicle || "—"} />
          <Fact label="Driver" value={driver || "Not assigned"} />
        </section>

        {booking.notes?.trim() ? (
          <section aria-label="Notes" className={`${styles.card} ${styles.cardPad}`}>
            <h2 className={styles.sectionTitle} style={{ fontSize: 15, marginBottom: 6 }}>
              Customer notes
            </h2>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: "#22324A", whiteSpace: "pre-wrap" }}>{booking.notes}</p>
          </section>
        ) : null}

        <section aria-label="Payment" className={`${styles.card} ${styles.cardPad}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className={styles.kv}>
            <span style={{ fontWeight: 800, color: "#071C38", fontSize: 16 }}>Payment</span>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{amount}</span>
          </div>
          <div className={styles.kv}>
            <span>Status</span>
            <span>{chip.label}</span>
          </div>
          {Number(booking.amountRefunded) > 0 ? (
            <div className={styles.kv}>
              <span>Refunded</span>
              <span>{formatOwnerOpsMoney(Number(booking.amountRefunded))}</span>
            </div>
          ) : null}
        </section>

        <section aria-label="Messages" className={`${styles.card} ${styles.cardPad}`} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 className={styles.sectionTitle} style={{ fontSize: 15 }}>
            Messages
          </h2>
          {thread ? (
            <button type="button" className={styles.row} style={{ padding: "6px 0" }} onClick={() => onOpenMessage({ channel: "email", threadKey: thread.threadKey })}>
              <span className={`${styles.chip} ${styles.blue}`}>Email</span>
              <span className={styles.rowBody}>
                <span className={styles.rowTitle} style={{ fontSize: 14 }}>
                  {thread.subject}
                </span>
                <span className={styles.rowDetail}>{thread.lastSnippet}</span>
              </span>
              {thread.unread ? <span className={styles.unreadDot} aria-label="Unread" /> : <ChevronIcon size={18} />}
            </button>
          ) : null}
          {chat ? (
            <button type="button" className={styles.row} style={{ padding: "6px 0" }} onClick={() => onOpenMessage({ channel: "whatsapp", phone: chat.phone })}>
              <span className={`${styles.chip} ${styles.green}`}>WhatsApp</span>
              <span className={styles.rowBody}>
                <span className={styles.rowDetail}>{chat.lastText}</span>
              </span>
              <ChevronIcon size={18} />
            </button>
          ) : null}
          {!thread && !chat ? <p style={{ margin: 0, fontSize: 14, color: "#5B6B80" }}>No emails or WhatsApp messages from this customer yet.</p> : null}
        </section>
      </main>

      <div className={styles.stickyFooter}>
        <div className={styles.stickyFooterInner}>
          <button type="button" className={styles.primaryButton} onClick={() => onFullControls(leg.scheduledDate)}>
            Status, edit, cancel or refund
          </button>
          <p style={{ margin: 0, fontSize: 12, color: "#5B6B80", textAlign: "center" }}>
            Opens the existing job controls, so every rule stays exactly as it is today.
          </p>
        </div>
      </div>
    </>
  );
}

function Fact({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#5B6B80", display: "flex", alignItems: "center", gap: 4 }}>
        {icon}
        {label}
      </span>
      <span style={{ fontSize: 15, fontWeight: 800, overflowWrap: "anywhere" }}>{value}</span>
      {sub ? <span style={{ fontSize: 13, color: "#5B6B80" }}>{sub}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inbox                                                               */
/* ------------------------------------------------------------------ */

type Channel = "all" | "email" | "whatsapp";

function InboxScreen({
  messages,
  inbox,
  loaded,
  now,
  onOpen,
  onOpenEmailSetup,
}: {
  messages: MobileMessageItem[];
  inbox: InboxListResponse | null;
  loaded: boolean;
  now: Date;
  onOpen: (item: MobileMessageItem) => void;
  onOpenEmailSetup: () => void;
}) {
  const [channel, setChannel] = useState<Channel>("all");
  const [filter, setFilter] = useState<"none" | "unread" | "reply" | "system">("none");
  const systemCount = messages.filter((m) => m.system).length;
  const [query, setQuery] = useState("");
  const unreadBy = (c: Channel) => messages.filter((m) => m.unread && (c === "all" || m.channel === c)).length;
  const shown = messages.filter((m) => {
    if (channel !== "all" && m.channel !== channel) return false;
    if (filter === "unread" && !m.unread) return false;
    if (filter === "reply" && !m.needsReply) return false;
    const q = query.trim().toLowerCase();
    // Automatic emails live under their own filter (and still turn up in search).
    if (filter === "system" ? !m.system : m.system && !q) return false;
    if (q && ![m.name, m.subject, m.preview, m.bookingRef].filter(Boolean).join(" ").toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <>
      <div data-owner-mobile-header className={styles.pageHeader}>
        <div className={styles.pageTitleRow}>
          <div>
            <h1 className={styles.pageTitle}>Inbox</h1>
            <p className={styles.pageSub}>Email and WhatsApp together</p>
          </div>
          {unreadBy("all") ? <span className={`${styles.chip} ${styles.green}`} style={{ fontSize: 13 }}>{unreadBy("all")} unread</span> : null}
        </div>
        <label className={styles.search}>
          <SearchIcon size={18} />
          <span className={styles.srOnly}>Search messages</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search names, subjects or references" enterKeyHint="search" />
        </label>
        <div role="tablist" aria-label="Channel" className={styles.segmented}>
          {(
            [
              ["all", "All"],
              ["email", "Email"],
              ["whatsapp", "WhatsApp"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={channel === id}
              className={`${styles.segment} ${channel === id ? styles.segmentActive : ""}`}
              onClick={() => setChannel(id)}
            >
              {label}
              {unreadBy(id) ? ` · ${unreadBy(id)}` : ""}
            </button>
          ))}
        </div>
        <div className={styles.filterRow}>
          {(
            [
              ["unread", "Unread"],
              ["reply", "Needs reply"],
              ["system", systemCount ? `Automatic (${systemCount})` : "Automatic"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              className={`${styles.filter} ${filter === id ? styles.filterActive : ""}`}
              onClick={() => setFilter(filter === id ? "none" : id)}
            >
              {label}
            </button>
          ))}
          <button type="button" className={styles.filter} onClick={onOpenEmailSetup}>
            Archive &amp; email settings
          </button>
        </div>
      </div>

      {inbox && !inbox.connected ? (
        <button type="button" className={`${styles.notice} ${styles.amber}`} style={{ margin: "12px 16px 0", border: 0, textAlign: "left", width: "calc(100% - 32px)", cursor: "pointer" }} onClick={onOpenEmailSetup}>
          Email isn&apos;t connected yet, so new emails to bookings@ won&apos;t appear here. Tap to set it up.
        </button>
      ) : null}

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {!loaded ? <li className={styles.empty}>Loading messages…</li> : null}
        {loaded && shown.length === 0 ? <li className={styles.empty}>No messages here.</li> : null}
        {shown.map((m) => (
          <li key={m.id}>
            <button type="button" className={styles.messageRow} onClick={() => onOpen(m)} data-owner-message={m.id}>
              <span className={`${styles.avatar} ${m.channel === "whatsapp" ? styles.green : styles.blue}`}>
                {initials(m.name)}
                <span className={styles.channelBadge} style={{ background: m.channel === "whatsapp" ? "#17803A" : "#1F4FBF" }}>
                  {m.channel === "whatsapp" ? <ChatIcon size={11} strokeWidth={2.6} /> : <MailIcon size={11} strokeWidth={2.6} />}
                </span>
              </span>
              <span className={styles.rowBody} style={{ gap: 3 }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span className={styles.rowTitle} style={{ fontWeight: m.unread ? 800 : 600 }}>
                    {m.name}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: m.unread ? "#17803A" : "#5B6B80", flexShrink: 0 }}>
                    {messageTime(m.at, now)}
                  </span>
                </span>
                {m.subject ? (
                  <span className={styles.rowDetail} style={{ fontWeight: 700, color: "#071C38" }}>
                    {m.subject}
                  </span>
                ) : null}
                <span className={styles.rowDetail}>{m.preview}</span>
                <span className={styles.tags} style={{ marginTop: 3 }}>
                  {m.bookingRef ? <span className={`${styles.chip} ${styles.blue}`}>{m.bookingRef}</span> : null}
                  {m.channel === "whatsapp" && m.needsReply ? (
                    m.replyWindowClosesAt ? (
                      <span className={`${styles.chip} ${styles.amber}`}>
                        Reply by {messageTime(m.replyWindowClosesAt, now) === formatLondonTime(m.replyWindowClosesAt) ? formatLondonTime(m.replyWindowClosesAt) : `${shortDate(ownerOpsTodayDate(new Date(m.replyWindowClosesAt)))} ${formatLondonTime(m.replyWindowClosesAt)}`}
                      </span>
                    ) : (
                      <span className={`${styles.chip} ${styles.grey}`}>24 h window closed · reply in WhatsApp app</span>
                    )
                  ) : null}
                </span>
              </span>
              {m.unread ? <span className={styles.unreadDot} aria-label="Unread" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Email conversation + reply                                          */
/* ------------------------------------------------------------------ */

function EmailThread({
  sample,
  ownerKey,
  threadKey,
  now,
  onBack,
  onChanged,
  onToast,
  onOpenBooking,
}: {
  sample?: boolean;
  ownerKey: string;
  threadKey: string;
  now: Date;
  onBack: () => void;
  onChanged: () => void;
  onToast: (text: string) => void;
  onOpenBooking: (paymentReference: string) => void;
}) {
  const draftKey = `matni-owner-draft:email:${threadKey}`;
  const [data, setData] = useState<InboxThreadResponse | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState(() => {
    try {
      return window.localStorage.getItem(draftKey) ?? "";
    } catch {
      return "";
    }
  });
  const [bookingRef, setBookingRef] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [sending, setSending] = useState(false);
  const sendIdRef = useRef(newSendId());

  const load = useCallback(async () => {
    if (sample) {
      setData(sampleOwnerData(new Date()).thread);
      return;
    }
    try {
      setData(await ownerInboxFetch<InboxThreadResponse>(ownerKey, `/owner/inbox/thread?thread=${encodeURIComponent(threadKey)}`));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the conversation");
    }
  }, [ownerKey, threadKey, onChanged, sample]);

  useEffect(() => {
    void load();
    // Opening marks the conversation read; refresh the badge once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);

  // Drafts are kept on this device while you type (server-side drafts come in the next stage).
  useEffect(() => {
    try {
      if (text.trim()) window.localStorage.setItem(draftKey, text);
      else window.localStorage.removeItem(draftKey);
    } catch {
      // Private browsing: drafts just aren't kept.
    }
  }, [text, draftKey]);

  const messages: InboxMessage[] = data?.messages ?? [];
  const first = messages[0];
  const lastIn = [...messages].reverse().find((m) => m.direction === "in");
  const name = lastIn?.counterpartName || first?.counterpartName || first?.counterpartEmail || "Conversation";
  const linked: InboxThreadBooking[] = data?.bookings ?? [];

  const preview = useMemo(
    () =>
      previewing
        ? buildOwnerOutgoingEmail({
            message: text.trim(),
            booking: null,
            quoted: lastIn ? { from: lastIn.counterpartName || lastIn.counterpartEmail, at: lastIn.at, text: lastIn.text } : null,
          })
        : null,
    [previewing, text, lastIn],
  );

  const send = async () => {
    if (sending || !text.trim()) return;
    if (sample) {
      onToast("Sample data — nothing was sent");
      setPreviewing(false);
      return;
    }
    setSending(true);
    try {
      const result = await ownerInboxFetch<{ ok: true; duplicate?: boolean }>(ownerKey, "/owner/inbox/reply", {
        threadKey,
        message: text.trim(),
        sendId: sendIdRef.current,
        ...(bookingRef ? { paymentReference: bookingRef } : {}),
      });
      onToast(result.duplicate ? "Already sent — not sent twice" : "Email sent");
      setText("");
      setPreviewing(false);
      sendIdRef.current = newSendId();
      await load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Not sent");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div data-owner-mobile-header className={styles.pageHeader}>
        <div className={styles.backRow}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            <BackIcon size={24} />
            Inbox
          </button>
        </div>
        <div style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{name}</span>
          {first ? <span style={{ fontSize: 14, color: "#445468" }}>{first.subject}</span> : null}
          {linked.length ? (
            <span className={styles.tags} style={{ marginTop: 4 }}>
              {linked.map((b) => (
                <button key={b.paymentReference} type="button" className={`${styles.chip} ${styles.blue}`} style={{ border: 0, cursor: "pointer", minHeight: 28 }} onClick={() => onOpenBooking(b.paymentReference)}>
                  {b.reference} · {shortDate(b.tripDate)} {b.tripTime}
                </button>
              ))}
            </span>
          ) : null}
        </div>
      </div>
      <main className={styles.main} style={{ gap: 10 }}>
        {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
        {!data && !error ? <p className={styles.empty}>Loading…</p> : null}
        {messages.map((m) => (
          <div key={m.id} className={m.direction === "in" ? styles.bubbleIn : styles.bubbleOut}>
            {m.direction === "out" ? <span className={styles.bubbleWho}>You</span> : null}
            <span>{m.text}</span>
            {m.attachments?.length ? (
              <span style={{ fontSize: 12, fontWeight: 700, color: "#445468" }}>
                {m.attachments.length} attachment{m.attachments.length === 1 ? "" : "s"}: {m.attachments.map((a) => a.filename).join(", ")}
              </span>
            ) : null}
            <span className={styles.bubbleMeta}>{messageTime(m.at, now)}</span>
          </div>
        ))}

        {data ? (
          <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#445468" }}>Your reply</span>
              <textarea className={styles.composer} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Write to ${name.split(" ")[0]}…`} rows={5} />
            </label>
            {linked.length ? (
              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#445468" }}>Add booking details box</span>
                <select
                  value={bookingRef}
                  onChange={(e) => setBookingRef(e.target.value)}
                  style={{ minHeight: 44, borderRadius: 12, border: "1px solid #DCE3EC", padding: "0 12px", fontSize: 16, background: "#fff", color: "#071C38" }}
                >
                  <option value="">No booking box</option>
                  {linked.map((b) => (
                    <option key={b.paymentReference} value={b.paymentReference}>
                      {b.reference} · {shortDate(b.tripDate)} {b.tripTime}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <span style={{ fontSize: 12, color: "#5B6B80" }}>{text.trim() ? "Draft kept on this phone" : " "}</span>
            <button type="button" className={styles.primaryButton} disabled={!text.trim()} onClick={() => setPreviewing(true)}>
              Preview before sending
              <ChevronIcon size={18} />
            </button>
          </section>
        ) : null}
      </main>

      {previewing && preview ? (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Email preview">
          <div className={styles.sheet}>
            <span className={styles.grabber} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 17 }}>What {name.split(" ")[0]} will see</strong>
              <button type="button" className={styles.linkButton} onClick={() => setPreviewing(false)}>
                Edit
              </button>
            </div>
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={preview.html}
              style={{ width: "100%", height: "52dvh", border: "1px solid #E3E8EF", borderRadius: 14, background: "#fff" }}
            />
            {bookingRef ? (
              <p style={{ margin: 0, fontSize: 12, color: "#5B6B80" }}>The booking details box is added when it&apos;s sent.</p>
            ) : null}
            <button type="button" className={styles.emeraldButton} disabled={sending} onClick={send}>
              <SendIcon size={20} />
              {sending ? "Sending…" : "Send email"}
            </button>
            <p style={{ margin: 0, fontSize: 12, color: "#5B6B80", textAlign: "center" }}>
              Sends from bookings@ · a second tap can&apos;t send it twice
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* WhatsApp conversation                                               */
/* ------------------------------------------------------------------ */

function WhatsAppThread({
  sample,
  ownerKey,
  phone,
  now,
  onBack,
  onChanged,
  onToast,
}: {
  sample?: boolean;
  ownerKey: string;
  phone: string;
  now: Date;
  onBack: () => void;
  onChanged: () => void;
  onToast: (text: string) => void;
}) {
  const [chat, setChat] = useState<ChatRecord | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const sendIdRef = useRef(newSendId());

  const load = useCallback(async () => {
    if (sample) {
      const record = sampleOwnerData(new Date()).chatRecord;
      setChat(phone === record.phone ? record : { phone, name: "Sample customer", messages: [{ at: new Date(Date.now() - 50 * 3600000).toISOString(), from: "customer", text: "Is the price the same for the way back?" }] });
      setPaused(true);
      return;
    }
    try {
      const response = await fetch(`${WORKER_BASE}/owner/whatsapp-chats?phone=${encodeURIComponent(phone)}`, {
        headers: { Accept: "application/json", "X-Owner-Key": ownerKey.trim() },
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as { chat?: ChatRecord; assistantPaused?: boolean; error?: string };
      if (!response.ok || !payload.chat) throw new Error(payload.error || "Could not load this chat");
      setChat(payload.chat);
      setPaused(Boolean(payload.assistantPaused));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this chat");
    }
  }, [ownerKey, phone, sample]);

  useEffect(() => {
    void load();
  }, [load]);

  const lastCustomer = chat ? [...chat.messages].reverse().find((m) => m.from === "customer") : undefined;
  const closesAt = lastCustomer
    ? whatsAppReplyWindowClosesAt({ phone, updatedAt: lastCustomer.at, lastText: "", lastFrom: "customer" }, now)
    : null;
  const appLink = whatsAppLink(`+${phone}`) ?? `https://wa.me/${phone}`;

  const post = async (body: Record<string, unknown>) => {
    if (sample) throw new Error("Sample data — nothing was sent");
    const response = await fetch(`${WORKER_BASE}/owner/whatsapp-chats/reply`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Owner-Key": ownerKey.trim() },
      body: JSON.stringify({ phone, ...body }),
    });
    const payload = (await response.json().catch(() => ({}))) as { assistantPaused?: boolean; error?: string };
    if (!response.ok) throw new Error(payload.error || "Not sent");
    return payload;
  };

  const send = async () => {
    if (sending || !text.trim()) return;
    setSending(true);
    try {
      await post({ text: text.trim(), sendId: sendIdRef.current });
      setText("");
      sendIdRef.current = newSendId();
      onToast("Sent on WhatsApp");
      await load();
      onChanged();
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Not sent");
    } finally {
      setSending(false);
    }
  };

  const resume = async () => {
    try {
      await post({ action: "resume" });
      setPaused(false);
      onToast("The assistant will answer this customer again");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Couldn't change that");
    }
  };

  const name = chat?.name?.trim() || `+${phone}`;

  return (
    <>
      <div data-owner-mobile-header className={styles.pageHeader}>
        <div className={styles.backRow} style={{ justifyContent: "space-between" }}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            <BackIcon size={24} />
            Inbox
          </button>
          <a href={appLink} target="_blank" rel="noopener noreferrer" className={styles.secondaryButton} style={{ minHeight: 40 }}>
            <ExternalIcon size={15} />
            Open in WhatsApp
          </a>
        </div>
        <div style={{ padding: "0 8px", display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{name}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#17803A" }}>WhatsApp · +{phone}</span>
          {paused ? (
            <span className={styles.tags} style={{ marginTop: 4, alignItems: "center" }}>
              <span className={`${styles.chip} ${styles.grey}`}>Assistant paused</span>
              <button type="button" className={styles.linkButton} style={{ minHeight: 32, fontSize: 13 }} onClick={resume}>
                Hand back to assistant
              </button>
            </span>
          ) : null}
        </div>
      </div>
      <main className={styles.main} style={{ gap: 10, paddingBottom: 200 }}>
        {error ? <div className={`${styles.notice} ${styles.red}`}>{error}</div> : null}
        {!chat && !error ? <p className={styles.empty}>Loading…</p> : null}
        {chat?.messages.map((m, index) => (
          <div key={`${m.at}-${index}`} className={m.from === "customer" ? styles.bubbleIn : styles.bubbleOut}>
            {m.from !== "customer" ? <span className={styles.bubbleWho}>{m.from === "assistant" ? "Assistant" : "You"}</span> : null}
            <span>{m.text}</span>
            <span className={styles.bubbleMeta}>
              {messageTime(m.at, now)}
              {m.failed ? " · not delivered" : ""}
            </span>
          </div>
        ))}
        {chat ? (
          <p style={{ margin: 0, fontSize: 12, color: "#5B6B80" }}>
            Photos, voice notes and replies you type in the WhatsApp app itself don&apos;t show here yet — open the app to see them.
          </p>
        ) : null}
      </main>
      <div className={styles.stickyFooter}>
        <div className={styles.stickyFooterInner}>
          {closesAt ? (
            <>
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#8A5300" }}>
                <ClockIcon size={15} />
                You can reply here until {messageTime(closesAt, now) === formatLondonTime(closesAt) ? formatLondonTime(closesAt) : `${shortDate(ownerOpsTodayDate(new Date(closesAt)))} ${formatLondonTime(closesAt)}`}
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <label style={{ flex: 1 }}>
                  <span className={styles.srOnly}>WhatsApp reply</span>
                  <textarea
                    className={styles.composer}
                    style={{ minHeight: 46, borderRadius: 23, padding: "11px 16px", resize: "none" }}
                    rows={1}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Reply on WhatsApp…"
                  />
                </label>
                <button
                  type="button"
                  aria-label="Send WhatsApp reply"
                  disabled={sending || !text.trim()}
                  onClick={send}
                  style={{ width: 46, height: 46, borderRadius: 23, border: 0, background: "#2FBF4A", color: "#071C38", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: sending || !text.trim() ? 0.5 : 1 }}
                >
                  <SendIcon size={20} />
                </button>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontSize: 13, color: "#445468", lineHeight: 1.4 }}>
                It&apos;s more than 24 hours since this customer last wrote, so WhatsApp won&apos;t deliver a reply from the dashboard.
              </span>
              <a href={appLink} target="_blank" rel="noopener noreferrer" className={styles.emeraldButton}>
                <ExternalIcon size={18} />
                Reply in the WhatsApp app
              </a>
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Customers                                                           */
/* ------------------------------------------------------------------ */

function CustomersScreen({
  sampleBookings,
  ownerKey,
  now,
  threads,
  chats,
  selectedId,
  onSelect,
  onOpenMessage,
  onOpenBooking,
}: {
  sampleBookings?: OwnerPaidBookingSummary[] | null;
  ownerKey: string;
  now: Date;
  threads: InboxListResponse["threads"];
  chats: MobileWhatsAppChat[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenMessage: (item: Pick<MobileMessageItem, "channel" | "threadKey" | "phone">) => void;
  onOpenBooking: (paymentReference: string) => void;
}) {
  const [all, setAll] = useState<OwnerPaidBookingSummary[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const today = ownerOpsTodayDate(now);

  useEffect(() => {
    if (sampleBookings) {
      setAll(sampleBookings);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [recent, upcoming] = await Promise.all([
          fetchOwnerPaidBookings(ownerKey, { mode: "recent", days: 400, limit: 500 }),
          fetchOwnerPaidBookings(ownerKey, { mode: "upcoming", pastDays: 0, futureDays: 180, limit: 250 }),
        ]);
        const byRef = new Map<string, OwnerPaidBookingSummary>();
        for (const b of [...recent, ...upcoming]) byRef.set(b.paymentReference, b);
        if (!cancelled) setAll([...byRef.values()]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load customers");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerKey, sampleBookings]);

  const customers = useMemo(() => (all ? buildCustomerDirectory(all, today) : []), [all, today]);
  const selected = selectedId ? customers.find((c) => c.id === selectedId) : undefined;

  if (selectedId && selected) {
    return (
      <CustomerProfile
        customer={selected}
        today={today}
        threads={threads}
        chats={chats}
        onBack={() => onSelect(null)}
        onOpenMessage={onOpenMessage}
        onOpenBooking={onOpenBooking}
      />
    );
  }

  const q = query.trim().toLowerCase();
  const shown = q
    ? customers.filter((c) =>
        [c.name, c.email, c.mobile, ...c.bookings.map((b) => b.customerReference || b.paymentReference)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : customers;

  return (
    <>
      <div data-owner-mobile-header className={styles.pageHeader}>
        <div className={styles.pageTitleRow}>
          <div>
            <h1 className={styles.pageTitle}>Customers</h1>
            <p className={styles.pageSub}>{all ? `${customers.length} people from the last 13 months` : "Loading…"}</p>
          </div>
        </div>
        <label className={styles.search}>
          <SearchIcon size={18} />
          <span className={styles.srOnly}>Search customers</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email, phone or reference" enterKeyHint="search" />
        </label>
      </div>
      <main className={styles.main} style={{ gap: 0, padding: 0 }}>
        {error ? <div className={`${styles.notice} ${styles.red}`} style={{ margin: 16 }}>{error}</div> : null}
        {all && shown.length === 0 ? <p className={styles.empty}>No customers match that.</p> : null}
        {shown.map((c) => (
          <button key={c.id} type="button" className={styles.messageRow} onClick={() => onSelect(c.id)}>
            <span className={`${styles.avatar} ${styles.grey}`}>{initials(c.name)}</span>
            <span className={styles.rowBody}>
              <span className={styles.rowTitle}>{c.name}</span>
              <span className={styles.rowDetail}>
                {c.bookings.length} booking{c.bookings.length === 1 ? "" : "s"}
                {c.totalSpendGbp !== null ? ` · ${formatOwnerOpsMoney(c.totalSpendGbp)}` : ""}
              </span>
            </span>
            {c.upcomingCount ? <span className={`${styles.chip} ${styles.green}`}>{c.upcomingCount} upcoming</span> : <ChevronIcon size={18} />}
          </button>
        ))}
      </main>
    </>
  );
}

function CustomerProfile({
  customer,
  today,
  threads,
  chats,
  onBack,
  onOpenMessage,
  onOpenBooking,
}: {
  customer: MobileCustomer;
  today: string;
  threads: InboxListResponse["threads"];
  chats: MobileWhatsAppChat[];
  onBack: () => void;
  onOpenMessage: (item: Pick<MobileMessageItem, "channel" | "threadKey" | "phone">) => void;
  onOpenBooking: (paymentReference: string) => void;
}) {
  const phone = telLink(customer.mobile);
  const wa = whatsAppLink(customer.mobile);
  const emails = new Set(customer.bookings.map((b) => String(b.customerEmail || "").toLowerCase()).filter(Boolean));
  const customerThreads = threads.filter((t) => emails.has(t.counterpartEmail.toLowerCase()));
  const waDigits = wa ? wa.replace("https://wa.me/", "") : "";
  const chat = chats.find((c) => c.phone === waDigits);
  const cancelled = customer.bookings.filter((b) => paidBookingIsCancelled(b)).length;
  const upcoming = customer.bookings.filter((b) => !paidBookingIsCancelled(b) && String(b.tripDate || "") >= today);
  const past = customer.bookings.filter((b) => !upcoming.includes(b));

  const bookingRow = (b: MobilePaidBooking, highlight: boolean) => (
    <button
      key={b.paymentReference}
      type="button"
      className={styles.row}
      style={{ padding: "10px 12px", borderRadius: 14, background: highlight ? "#E6F6EA" : "transparent" }}
      onClick={() => onOpenBooking(b.paymentReference)}
    >
      <span className={styles.rowBody}>
        <span className={styles.rowTitle} style={{ fontSize: 14 }}>
          {shortDate(String(b.tripDate || ""))} {b.tripTime} · {b.pickupLabel} → {b.dropoffLabel}
        </span>
        <span className={styles.rowDetail}>
          {bookingRefLabel(b)} · {paymentChip(b).label}
          {b.amountPaid ? ` · ${b.amountPaid}` : ""}
        </span>
      </span>
      <ChevronIcon size={18} />
    </button>
  );

  return (
    <>
      <div data-owner-mobile-header className={styles.pageHeader} style={{ borderRadius: "0 0 28px 28px" }}>
        <div className={styles.backRow}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            <BackIcon size={24} />
            Customers
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 8px" }}>
          <span className={styles.avatar} style={{ width: 60, height: 60, borderRadius: 30, background: "#071C38", color: "#fff", fontSize: 21 }}>
            {initials(customer.name)}
          </span>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{customer.name}</h1>
            <span style={{ fontSize: 13, color: "#5B6B80", overflowWrap: "anywhere" }}>
              {[customer.email, customer.mobile].filter(Boolean).join(" · ")}
            </span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, padding: "0 4px" }}>
          <a href={phone ?? undefined} className={`${styles.secondaryButton} ${phone ? "" : styles.actionDisabled}`} style={{ minHeight: 48 }}>
            <PhoneIcon size={18} />
            Call
          </a>
          <a href={wa ?? undefined} target="_blank" rel="noopener noreferrer" className={`${styles.emeraldButton} ${wa ? "" : styles.actionDisabled}`} style={{ minHeight: 48, fontSize: 14, borderRadius: 12 }}>
            <ChatIcon size={18} />
            WhatsApp
          </a>
          {customerThreads[0] ? (
            <button type="button" className={styles.secondaryButton} style={{ minHeight: 48 }} onClick={() => onOpenMessage({ channel: "email", threadKey: customerThreads[0].threadKey })}>
              <MailIcon size={18} />
              Email
            </button>
          ) : (
            <a href={customer.email ? `mailto:${customer.email}` : undefined} className={`${styles.secondaryButton} ${customer.email ? "" : styles.actionDisabled}`} style={{ minHeight: 48 }}>
              <MailIcon size={18} />
              Email
            </a>
          )}
        </div>
      </div>
      <main className={styles.main} style={{ gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{customer.bookings.length}</span>
            <span className={styles.statLabel}>Bookings</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{customer.totalSpendGbp !== null ? formatOwnerOpsMoney(customer.totalSpendGbp) : "—"}</span>
            <span className={styles.statLabel}>Paid in total</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{cancelled}</span>
            <span className={styles.statLabel}>Cancelled</span>
          </div>
        </div>

        <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 className={styles.sectionTitle} style={{ marginBottom: 6 }}>
            Bookings
          </h2>
          {upcoming.map((b) => bookingRow(b, true))}
          {past.map((b) => bookingRow(b, false))}
        </section>

        <section className={`${styles.card} ${styles.cardPad}`} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 className={styles.sectionTitle}>Messages</h2>
          {customerThreads.map((t) => (
            <button key={t.threadKey} type="button" className={styles.row} style={{ padding: "6px 0" }} onClick={() => onOpenMessage({ channel: "email", threadKey: t.threadKey })}>
              <span className={`${styles.chip} ${styles.blue}`}>Email</span>
              <span className={styles.rowBody}>
                <span className={styles.rowDetail} style={{ color: "#071C38", fontWeight: 700 }}>
                  {t.subject}
                </span>
              </span>
              <ChevronIcon size={18} />
            </button>
          ))}
          {chat ? (
            <button type="button" className={styles.row} style={{ padding: "6px 0" }} onClick={() => onOpenMessage({ channel: "whatsapp", phone: chat.phone })}>
              <span className={`${styles.chip} ${styles.green}`}>WhatsApp</span>
              <span className={styles.rowBody}>
                <span className={styles.rowDetail}>{chat.lastText}</span>
              </span>
              <ChevronIcon size={18} />
            </button>
          ) : null}
          {!customerThreads.length && !chat ? <p style={{ margin: 0, fontSize: 14, color: "#5B6B80" }}>No messages yet.</p> : null}
        </section>
      </main>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* More                                                                */
/* ------------------------------------------------------------------ */

const MORE_GROUPS: Array<{ title: string; items: Array<{ tool: OwnerDashboardToolTab; label: string; hint: string }> }> = [
  {
    title: "Money",
    items: [
      { tool: "admin", label: "Payments & refunds", hint: "Awaiting payment, future jobs, refunds" },
      { tool: "money", label: "Revenue & driver pay", hint: "Earned revenue, payments received, driver pay" },
    ],
  },
  {
    title: "Bookings & requests",
    items: [
      { tool: "requests", label: "Short-notice requests", hint: "Approve or decline, deposit cash" },
      { tool: "enquiries", label: "Enquiries & quotes", hint: "Quote and enquiry jobs" },
      { tool: "past", label: "Past jobs", hint: "Completed journeys and quote again" },
      { tool: "availability", label: "Availability", hint: "When customers can book online" },
    ],
  },
  {
    title: "On the road",
    items: [
      { tool: "name-board", label: "Name Board", hint: "Full-screen passenger name sign" },
      { tool: "tracking", label: "Drivers & tracking", hint: "Driver tracking jobs and acceptance" },
    ],
  },
  {
    title: "Pricing & marketing",
    items: [
      { tool: "pricing", label: "Fares & pricing", hint: "The existing pricing screen, unchanged" },
      { tool: "marketing", label: "Marketing list", hint: "Customers who opted in to marketing" },
      { tool: "google-ads", label: "Google Ads", hint: "Ad spend and booking upload file" },
    ],
  },
  {
    title: "Messages",
    items: [
      { tool: "inbox", label: "Email settings & archive", hint: "Connection, archived conversations" },
      { tool: "whatsapp", label: "WhatsApp assistant log", hint: "What the assistant replied" },
    ],
  },
];

const ADVANCED_TOOLS: Array<{ tool: OwnerDashboardToolTab; label: string }> = [
  { tool: "postcode-pricing", label: "Postcode Pricing" },
  { tool: "a2a-quotes", label: "A2A Quotes" },
  { tool: "personal-quotes", label: "Personal Quotes" },
  { tool: "same-fare", label: "Same Fare Test" },
  { tool: "empty-legs", label: "Empty Legs (preview)" },
];

function MoreScreen({
  awaitingRequests,
  onOpenDrivers,
  onOpenNotifications,
  driversSummary,
  onOpenTool,
  onSwitchToClassic,
  onSignOut,
}: {
  awaitingRequests: number;
  onOpenDrivers?: () => void;
  onOpenNotifications?: () => void;
  driversSummary?: DriversSummary | null;
  onOpenTool: (tool: OwnerDashboardToolTab) => void;
  onSwitchToClassic: () => void;
  onSignOut: () => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  return (
    <>
      <div data-owner-mobile-header className={styles.pageHeader}>
        <div className={styles.pageTitleRow}>
          <h1 className={styles.pageTitle}>More</h1>
        </div>
      </div>
      <main className={styles.main} style={{ gap: 14 }}>
        {onOpenNotifications ? (
          <section className={styles.card} style={{ overflow: "hidden" }}>
            <button type="button" className={styles.row} onClick={onOpenNotifications} data-owner-more="notifications">
              <span className={styles.rowBody}>
                <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                  Notifications
                </span>
                <span className={styles.rowDetail} style={{ whiteSpace: "normal" }}>
                  Alerts on your phone for bookings, messages and requests
                </span>
              </span>
              <ChevronIcon size={18} />
            </button>
          </section>
        ) : null}
        {onOpenDrivers ? (
          <section className={styles.card} style={{ overflow: "hidden" }}>
            <button type="button" className={styles.row} onClick={onOpenDrivers} data-owner-more="drivers">
              <span className={styles.rowBody}>
                <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                  Drivers
                </span>
                <span className={styles.rowDetail} style={{ whiteSpace: "normal" }}>
                  Invite, check documents, approve or suspend · driver support number
                </span>
              </span>
              {driversSummary && (driversSummary.urgent.length || driversSummary.alerts.length) ? (
                <span className={`${styles.chip} ${styles.red}`}>{driversSummary.urgent.length + driversSummary.alerts.length} urgent</span>
              ) : driversSummary?.unreadMessages ? (
                <span className={`${styles.chip} ${styles.blue}`}>{driversSummary.unreadMessages} new</span>
              ) : null}
              <ChevronIcon size={18} />
            </button>
          </section>
        ) : null}
        {MORE_GROUPS.map((group) => (
          <section key={group.title} className={styles.card} style={{ overflow: "hidden" }}>
            <h2 style={{ margin: 0, padding: "14px 16px 4px", fontSize: 12, fontWeight: 800, letterSpacing: 0.8, color: "#5B6B80", textTransform: "uppercase" }}>
              {group.title}
            </h2>
            {group.items.map((item) => (
              <button key={item.tool} type="button" className={styles.row} onClick={() => onOpenTool(item.tool)} data-owner-more={item.tool}>
                <span className={styles.rowBody}>
                  <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                    {item.label}
                  </span>
                  <span className={styles.rowDetail} style={{ whiteSpace: "normal" }}>
                    {item.hint}
                  </span>
                </span>
                {item.tool === "requests" && awaitingRequests ? (
                  <span className={`${styles.chip} ${styles.red}`}>{awaitingRequests} to decide</span>
                ) : null}
                <ChevronIcon size={18} />
              </button>
            ))}
          </section>
        ))}

        <section className={styles.card} style={{ overflow: "hidden", border: "1px dashed #B9C4D2" }}>
          <button type="button" className={styles.row} aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((v) => !v)}>
            <span className={styles.rowBody}>
              <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                Advanced &amp; testing tools
              </span>
              <span className={styles.rowDetail} style={{ whiteSpace: "normal" }}>
                Still working, just tucked away from everyday use
              </span>
            </span>
            <span style={{ transform: advancedOpen ? "rotate(90deg)" : undefined, display: "inline-flex" }}>
              <ChevronIcon size={18} />
            </span>
          </button>
          {advancedOpen
            ? ADVANCED_TOOLS.map((item) => (
                <button key={item.tool} type="button" className={styles.row} onClick={() => onOpenTool(item.tool)} data-owner-more={item.tool}>
                  <span className={styles.rowBody}>
                    <span className={styles.rowTitle} style={{ fontWeight: 600 }}>
                      {item.label}
                    </span>
                  </span>
                  <ChevronIcon size={18} />
                </button>
              ))
            : null}
        </section>

        <section className={styles.card} style={{ overflow: "hidden" }}>
          <button type="button" className={styles.row} onClick={onSwitchToClassic}>
            <span className={styles.rowBody}>
              <span className={styles.rowTitle} style={{ fontWeight: 700 }}>
                Use the classic dashboard
              </span>
              <span className={styles.rowDetail}>Switch back any time from its More menu</span>
            </span>
          </button>
          <button type="button" className={styles.row} onClick={onSignOut}>
            <span className={styles.rowBody}>
              <span className={styles.rowTitle} style={{ fontWeight: 700, color: "#B42318" }}>
                Sign out of this phone
              </span>
            </span>
          </button>
        </section>
        <p style={{ margin: "0 4px", fontSize: 12, color: "#5B6B80", display: "flex", gap: 6, alignItems: "center" }}>
          <AlertIcon size={14} />
          Prices, deposits, refunds and booking rules are unchanged — the screens above are the same ones you use today.
        </p>
        <p style={{ margin: "0 4px", fontSize: 12, color: "#5B6B80", display: "flex", gap: 6, alignItems: "center" }}>
          <CheckIcon size={14} />
          New mobile dashboard · staging preview
        </p>
      </main>
    </>
  );
}

/** Home banner for driver reports and booking reviews. Urgent first; nothing shown when all clear. */
function DriverAlertBanner({ summary, onOpen }: { summary: DriversSummary | null; onOpen: () => void }) {
  if (!summary) return null;
  const urgent = summary.urgent.length;
  const reviews = summary.alerts.length;
  const needReplacement = summary.alerts.reduce((n, a) => n + (a.unresolved ?? 0), 0);
  const unread = summary.unreadMessages;
  if (!urgent && !reviews && !unread) return null;
  const critical = urgent > 0 || reviews > 0;
  const first = summary.urgent[0];
  const title = urgent
    ? `${first.categoryLabel} — ${first.driverName}${urgent > 1 ? ` (+${urgent - 1} more)` : ""}`
    : reviews
      ? needReplacement
        ? `${needReplacement} booking${needReplacement === 1 ? "" : "s"} need${needReplacement === 1 ? "s" : ""} a replacement driver`
        : summary.alerts[0].title
      : `${unread} new driver message${unread === 1 ? "" : "s"}`;
  const detail = urgent
    ? first.body
    : reviews
      ? `${summary.alerts[0].title}. Nothing has been cancelled or reassigned.`
      : "Open Drivers to read them.";
  return (
    <button
      type="button"
      onClick={onOpen}
      data-driver-alert-banner={critical ? "urgent" : "info"}
      style={{
        width: "100%",
        textAlign: "left",
        display: "grid",
        gap: 4,
        padding: "14px 16px",
        minHeight: 64,
        borderRadius: 18,
        border: critical ? "2px solid #D92D20" : "1px solid #CFE0F5",
        background: critical ? "#FEF3F2" : "#EEF4FC",
        color: "#071C38",
        cursor: "pointer",
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: critical ? "#B42318" : "#1D4F91" }}>
        {urgent ? "Urgent driver report" : reviews ? "Bookings to review" : "Drivers"}
        {critical && unread ? ` · ${unread} unread` : ""}
      </span>
      <span style={{ fontSize: 16, fontWeight: 800 }}>{title}</span>
      <span style={{ fontSize: 14, color: "#33445C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail}</span>
    </button>
  );
}

/** Individual screens, exported for offline layout previews (rendered to static HTML and screenshotted). */
export const ownerMobileScreensForPreview = { HomeScreen, BookingsScreen, InboxScreen, MoreScreen, BookingDetail };
