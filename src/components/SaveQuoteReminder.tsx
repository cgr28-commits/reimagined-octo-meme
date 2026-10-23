"use client";
import { useEffect, useRef, useState } from "react";
import type { SaveQuoteSettings } from "../../shared/save-quote-settings";
const SESSION_KEY = "matni-save-quote-reminder-shown";
let shownInMemory = false;
export default function SaveQuoteReminder({ eligible, settings, quoteKey, onSave, onBook }: {
  eligible: boolean; settings: SaveQuoteSettings; quoteKey: string; onSave: () => void; onBook: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
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
      const protectedRects = Array.from(document.querySelectorAll('#quoteForm button, #quoteForm input, [data-quote-result-card], #quoteForm [data-quote-fare-status]')).map(el => el.getBoundingClientRect());
      // Protect the whole quote form on narrow screens; use an in-flow card if there is no safe space.
      if (window.innerWidth < 768) {
        const form = document.getElementById("quoteForm");
        if (form) protectedRects.push(form.getBoundingClientRect());
      }
      const top = candidates.find(y => y >= 80 && y + height <= window.innerHeight - 24 && !protectedRects.some(r => r.width && r.height && left < r.right && left + width > r.left && y < r.bottom && y + height > r.top));
      setPosition(top === undefined ? null : { top, left });
    };
    place(); window.addEventListener("resize",place); window.addEventListener("scroll",place,{ passive:true });
    return () => { window.removeEventListener("resize",place); window.removeEventListener("scroll",place); };
  }, [visible]);
  if (!visible || !eligible) return null;
  return <aside ref={panel} data-save-quote-reminder role="region" aria-label="Save your quote reminder" className="z-40 mx-auto my-3 w-full max-w-[340px] rounded-2xl border border-white/20 bg-[#071C38] p-4 text-white shadow-xl" style={position ? { position: "fixed", ...position, width: "min(340px, calc(100vw - 32px))", paddingBottom: "max(16px, env(safe-area-inset-bottom))" } : undefined}>
    <button type="button" aria-label="Close save quote reminder" className="float-right -mr-2 -mt-2 min-h-11 min-w-11" onClick={() => setVisible(false)}>×</button>
    <h3 className="text-base font-bold">Not Ready to Book Yet?</h3>
    <p className="mt-2 text-sm">Save your airport transfer quote and come back whenever you’re ready.</p>
    <div className="mt-3 flex flex-col gap-2">
      <button type="button" className="min-h-11 rounded-xl bg-[#2FBF4A] px-3 font-semibold text-[#071C38]" onClick={() => { setVisible(false); onSave(); }}>Save My Quote</button>
      <button type="button" className="min-h-11 rounded-xl border border-white/30 px-3" onClick={() => { setVisible(false); onBook(); }}>Continue to Booking</button>
    </div><p className="mt-2 text-xs text-white/70">No obligation to book.</p>
  </aside>;
}
