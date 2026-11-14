"use client";

/**
 * Cloudflare Turnstile (bot check) for public request forms. The Worker verifies
 * the token server-side and fails closed. No site key → the widget says online
 * requests are unavailable, and the form stays disabled.
 */
import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("turnstile"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

type Props = {
  siteKey: string;
  action: string;
  onToken: (token: string) => void;
  /** Changing this number resets the widget (e.g. after a failed submit). */
  resetSignal?: number;
};

export default function TurnstileWidget({ siteKey, action, onToken, resetSignal = 0 }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const tokenCallback = useRef(onToken);
  tokenCallback.current = onToken;

  useEffect(() => {
    if (!siteKey || !box.current) return;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile || widgetId.current) return;
        widgetId.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action,
          theme: "light",
          callback: (token: string) => tokenCallback.current(token),
          "expired-callback": () => tokenCallback.current(""),
          "error-callback": () => tokenCallback.current(""),
        });
      })
      .catch(() => tokenCallback.current(""));
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (resetSignal && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
      tokenCallback.current("");
    }
  }, [resetSignal]);

  if (!siteKey) {
    return (
      <p className="text-sm text-[#8a5a00]" role="status">
        Online requests are not available yet. Please call or WhatsApp us.
      </p>
    );
  }
  return <div ref={box} className="min-h-[65px]" aria-label="Security check" />;
}
