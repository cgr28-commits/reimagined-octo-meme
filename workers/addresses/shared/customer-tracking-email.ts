import { BRAND_NAVY, BRAND_EMERALD } from "./business-email";

export const TRACKING_ACTIVATION_COPY = "Your tracking link only becomes live when your driver is on the way and starts sharing their location. Before then, it will show a waiting message. Tracking stops when sharing is stopped or your journey is completed.";
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function safeLink(value?: string | null): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["www.myairporttaxini.co.uk", "myairporttaxini.co.uk"].includes(url.hostname) && url.pathname === "/track/" ? url.href : null;
  } catch { return null; }
}
export function customerTrackingText(url?: string | null): string {
  const href = safeLink(url);
  return href ? `\n\nTRACK YOUR DRIVER\n${TRACKING_ACTIVATION_COPY}\n${href}\n` : "";
}
export function customerTrackingHtml(url?: string | null): string {
  const href = safeLink(url);
  return href ? `<div style="margin:24px 0;padding:20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;text-align:center;"><h2 style="margin:0 0 12px;font-size:18px;color:${BRAND_NAVY};">Track your driver</h2><p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#475569;">${escape(TRACKING_ACTIVATION_COPY)}</p><a href="${escape(href)}" style="display:inline-block;background:${BRAND_EMERALD};color:${BRAND_NAVY};padding:14px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Track Your Driver</a><p style="margin:12px 0 0;font-size:12px;word-break:break-all;"><a href="${escape(href)}" style="color:${BRAND_NAVY};">${escape(href)}</a></p></div>` : "";
}
