/**
 * Path helpers for owner/admin portal chrome.
 * Public Header / WhatsApp / QuoteAssistant must stay on customer pages.
 */

export function normalizePortalPath(pathname: string | null | undefined): string {
  if (!pathname) return "";
  const trimmed = pathname.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "") || "/";
}

/** Owner dashboard + Journey Evidence (+ nested owner tools). */
export function isOwnerPortalPath(pathname: string | null | undefined): boolean {
  const path = normalizePortalPath(pathname);
  return path === "/owner" || path.startsWith("/owner/");
}

/** Admin tools that should not show public sales chrome. */
export function isAdminPortalPath(pathname: string | null | undefined): boolean {
  const path = normalizePortalPath(pathname);
  return path === "/admin" || path.startsWith("/admin/");
}

/** Driver ops dashboard — same public-chrome conflict as owner on mobile. */
export function isDriverPortalPath(pathname: string | null | undefined): boolean {
  const path = normalizePortalPath(pathname);
  return path === "/driver" || path.startsWith("/driver/");
}

/** Hide public WhatsApp / quote assistant FABs on private ops + checkout routes. */
export function shouldHidePublicSalesWidgets(pathname: string | null | undefined): boolean {
  const path = normalizePortalPath(pathname);
  return (
    isOwnerPortalPath(pathname) ||
    isAdminPortalPath(pathname) ||
    isDriverPortalPath(pathname) ||
    path === "/book-quote" ||
    path === "/quick-quote" ||
    path === "/booking-confirmed"
  );
}
