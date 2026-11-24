"use client";
import { useSyncExternalStore } from "react";

/** The customer's selected attractions. Light per-visitor convenience only (localStorage, try/catch); the server never sees it until they save a plan or send an enquiry. */
const KEY = "pt-selection-v1";
const MAX = 8;
const listeners = new Set<() => void>();
let cache: string[] | null = null;
const EMPTY: string[] = [];

function read(): string[] {
  if (cache) return cache;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string").slice(0, MAX) : [];
  } catch { cache = []; }
  return cache!;
}
function write(next: string[]) {
  cache = next.slice(0, MAX);
  try { window.localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage unavailable: selection lasts for this page view */ }
  listeners.forEach((l) => l());
}
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; cb(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
};

export const SELECTION_MAX = MAX;
export const getSelection = () => read();
export const setSelection = (ids: string[]) => write(Array.from(new Set(ids)));
export const addToSelection = (id: string) => { const cur = read(); if (!cur.includes(id) && cur.length < MAX) write([...cur, id]); };
export const removeFromSelection = (id: string) => write(read().filter((x) => x !== id));
export const clearSelection = () => write([]);

export function useSelection(): string[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}
