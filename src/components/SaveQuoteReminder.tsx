"use client";
import { useEffect, useRef, useState } from "react";
import type { SaveQuoteSettings } from "../../shared/save-quote-settings";
const SESSION_KEY = "matni-save-quote-reminder-shown";
let shownInMemory = false;
export default function SaveQuoteReminder({ eligible, settings, quoteKey, onSave, onBook }: {
  eligible: boolean; settings: SaveQuoteSettings; quoteKey: string; onSave: (channel: "email" | "whatsapp") => void; onBook: () => void;
}) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => { setMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)); }, []);
  const channels = mobile ? ["whatsapp", "email"] as const : ["email", "whatsapp"] as const;
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; height: number } | null>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!eligible || !settings.enabled || !settings.popupEnabled || !(settings.emailEnabled || settings.whatsappEnabled)) { setVisible(false); return; }
    try { if (sessionStorage.getItem(SESSION_KEY)) return; } catch { /* memory fallback */ }
    if (shownInMemory) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      if (document.hidden || shownInMemory) return;
      timer = setTimeout(() => {
        if (document.hidden || shownInMemory) return;
        shownInMemory = true;
        try { sessionStorage.setItem(SESSION_KEY, "1"); } catch { /* memory fallback */ }
        setVisible(true);
      }, settings.popupDelaySeconds * 1000);
    };
    const form = document.getElementById("quoteForm");
    const events = ["pointerdown", "keydown", "input", "focusin"];
    events.forEach(e => form?.addEventListener(e, reset));
    window.addEventListener("scroll", reset, { passive: true });
    document.addEventListener("visibilitychange", reset);
    reset();
    return () => { clearTimeout(timer); events.forEach(e => form?.removeEventListener(e, reset)); window.removeEventListener("scroll", reset); document.removeEventListener("visibilitychange", reset); };
  }, [eligible, settings, quoteKey]);
  useEffect(() => {
    if (!visible) return;
    const place = () => {
      if (!panel.current) return;
      const width = Math.min(340, window.innerWidth - 32);
      const height = panel.current.offsetHeight;
      const left = window.innerWidth - width - 16;
      const candidates = [96, window.innerHeight - height - 40];
      const protectedRects = Array.from(document.querySelectorAll('#quoteForm button, #quoteForm input, [data-quote-result-price], #quoteForm [data-quote-fare-status]')).map(el => el.getBoundingClientRect());
      const top = candidates.find(y => y >= 80 && y + height <= window.innerHeight - 24 && !protectedRects.some(r => r.width && r.height && left < r.right && left + width > r.left && y < r.bottom && y + height > r.top));
      setPosition(top === undefined ? null : { top, left, height });
    };
    place(); window.addEventListener("resize",place); window.addEventListener("scroll",place,{ passive:true });
    return () => { window.removeEventListener("resize",place); window.removeEventListener("scroll",place); };
  }, [visible, mobile]);
  if (!visible || !eligible) return null;
  return <div className="my-3" style={position ? { minHeight: position.height } : undefined}><aside ref={panel} data-save-quote-reminder role="region" aria-label="Save your quote reminder" className="z-40 mx-auto w-full max-w-[340px] rounded-2xl border border-white/20 bg-[#071C38] p-4 text-white shadow-xl" style={position ? { position: "fixed", top: position.top, left: position.left, width: "min(340px, calc(100vw - 32px))", paddingBottom: "max(16px, env(safe-area-inset-bottom))" } : undefined}>
    <button type="button" aria-label="Close save quote reminder" className="float-right -mr-2 -mt-2 min-h-11 min-w-11" onClick={() => setVisible(false)}>×</button>
    <h3 className="text-base font-bold">Not Ready to Book Yet?</h3>
    <p className="mt-2 text-sm">Save your airport transfer quote and come back whenever you’re ready.</p>
    <div className="mt-3 flex flex-col gap-2">
      {channels.filter(channel => channel === "email" ? settings.emailEnabled : settings.whatsappEnabled).map((channel, index) => <button key={channel} type="button" className={`min-h-11 rounded-xl px-3 ${index === 0 ? "bg-[#2FBF4A] font-semibold text-[#071C38]" : "border border-white/30"}`} onClick={() => { setVisible(false); onSave(channel); }}>{channel === "email" ? "Email My Quote" : "Save via WhatsApp"}</button>)}
      <button type="button" className="min-h-11 rounded-xl border border-white/30 px-3" onClick={() => { setVisible(false); onBook(); }}>Continue to Booking</button>
    </div><p className="mt-2 text-xs text-white/70">No obligation to book.</p>
  </aside></div>;
}
