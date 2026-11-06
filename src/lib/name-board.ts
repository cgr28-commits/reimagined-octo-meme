/**
 * Owner Dashboard → Name Board (airport pickup sign).
 *
 * Pure helpers with no React and no network access so they can be unit tested
 * offline (scripts/check-owner-name-board.ts).
 *
 * Privacy: passenger names only ever live in component state and in
 * localStorage on this device. Nothing here sends, logs or encodes a name
 * into a URL.
 */

export const NAME_BOARD_STORAGE_KEY = "matni-name-board-v1";
export const NAME_BOARD_MAX_CHARS = 80;
export const NAME_BOARD_MAX_LINES = 3;

export type NameBoardTheme = "dark" | "light";

export type NameBoardSettings = {
  name: string;
  theme: NameBoardTheme;
  showWelcome: boolean;
};

export const NAME_BOARD_DEFAULTS: NameBoardSettings = {
  name: "",
  theme: "dark",
  showWelcome: true,
};

export const NAME_BOARD_COLOURS = {
  navy: "#071C38",
  emerald: "#2FBF4A",
  white: "#FFFFFF",
} as const;

/**
 * Tidy what the driver typed: collapse runs of spaces, drop empty lines,
 * keep at most NAME_BOARD_MAX_LINES lines and NAME_BOARD_MAX_CHARS characters.
 * Explicit line breaks are kept so "Mr & Mrs Smith\nAcme Ltd" shows on two lines.
 */
export function normalizeBoardName(raw: string): string {
  const lines = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .slice(0, NAME_BOARD_MAX_LINES);
  let joined = lines.join("\n");
  if (joined.length > NAME_BOARD_MAX_CHARS) {
    joined = joined.slice(0, NAME_BOARD_MAX_CHARS).trimEnd();
  }
  return joined;
}

/** Limit raw input while typing (keeps newlines the driver is mid-way through). */
export function clampBoardInput(raw: string): string {
  const text = String(raw ?? "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n").slice(0, NAME_BOARD_MAX_LINES);
  return lines.join("\n").slice(0, NAME_BOARD_MAX_CHARS);
}

/**
 * Largest font size (integer px, between min and max) for which `fits(size)`
 * is true. `fits` must be monotonic (true for small sizes, false once too big).
 * Returns `min` when even the minimum does not fit — the caller then allows
 * emergency word breaking so nothing is clipped.
 */
export function largestFittingSize(
  fits: (size: number) => boolean,
  min: number,
  max: number,
): number {
  let lo = Math.max(1, Math.floor(min));
  let hi = Math.max(lo, Math.floor(max));
  if (!fits(lo)) return lo;
  if (fits(hi)) return hi;
  // Invariant: fits(lo) === true, fits(hi) === false.
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function safeStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage;
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Read saved settings from this device only. Never throws. */
export function loadNameBoardSettings(storage?: StorageLike | null): NameBoardSettings {
  const store = safeStorage(storage);
  if (!store) return { ...NAME_BOARD_DEFAULTS };
  try {
    const raw = store.getItem(NAME_BOARD_STORAGE_KEY);
    if (!raw) return { ...NAME_BOARD_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<NameBoardSettings> | null;
    return {
      name: typeof parsed?.name === "string" ? clampBoardInput(parsed.name) : "",
      theme: parsed?.theme === "light" ? "light" : "dark",
      showWelcome: parsed?.showWelcome !== false,
    };
  } catch {
    return { ...NAME_BOARD_DEFAULTS };
  }
}

/** Save to this device only. Returns false when storage is unavailable (e.g. private mode). */
export function saveNameBoardSettings(
  settings: NameBoardSettings,
  storage?: StorageLike | null,
): boolean {
  const store = safeStorage(storage);
  if (!store) return false;
  try {
    store.setItem(
      NAME_BOARD_STORAGE_KEY,
      JSON.stringify({
        name: clampBoardInput(settings.name),
        theme: settings.theme === "light" ? "light" : "dark",
        showWelcome: settings.showWelcome !== false,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

/** Reset: remove everything the name board stored on this device. */
export function clearNameBoardSettings(storage?: StorageLike | null): void {
  const store = safeStorage(storage);
  if (!store) return;
  try {
    store.removeItem(NAME_BOARD_STORAGE_KEY);
  } catch {
    // Storage blocked — nothing was saved, so nothing to clear.
  }
}

export type NameBoardEnvironment = {
  wakeLock: boolean;
  fullscreen: boolean;
  iosLike: boolean;
  standalone: boolean;
};

/** Feature detection only — no user-agent promises about what iOS will do. */
export function detectNameBoardEnvironment(
  win: (Window & typeof globalThis) | undefined = typeof window === "undefined"
    ? undefined
    : window,
): NameBoardEnvironment {
  if (!win) return { wakeLock: false, fullscreen: false, iosLike: false, standalone: false };
  const nav = win.navigator as Navigator & { standalone?: boolean };
  const doc = win.document as Document & {
    webkitFullscreenEnabled?: boolean;
  };
  const el = doc.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => void;
  };
  const fullscreen = Boolean(
    (doc.fullscreenEnabled && typeof el.requestFullscreen === "function") ||
      (doc.webkitFullscreenEnabled && typeof el.webkitRequestFullscreen === "function"),
  );
  const ua = nav.userAgent || "";
  // Only used to choose which help text to show — never to promise behaviour.
  const iosLike =
    /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1);
  let standalone = nav.standalone === true;
  try {
    standalone = standalone || win.matchMedia?.("(display-mode: standalone)").matches === true;
  } catch {
    // ignore
  }
  return {
    wakeLock: "wakeLock" in nav && typeof (nav as Navigator & { wakeLock?: unknown }).wakeLock === "object",
    fullscreen,
    iosLike,
    standalone,
  };
}

/** Honest, short status lines for the driver. Never claims iOS can be forced. */
export function wakeLockMessage(state: "active" | "unsupported" | "failed" | "released"): string {
  switch (state) {
    case "active":
      return "Screen is being kept awake while the board is showing.";
    case "released":
      return "Screen may dim again — tap the board to keep it awake, or check Auto-Lock.";
    case "failed":
      return "This browser didn't allow keeping the screen awake. Your phone may dim — set Auto-Lock to a longer time while you wait.";
    case "unsupported":
    default:
      return "This browser can't keep the screen awake. On iPhone, set Settings › Display & Brightness › Auto-Lock to a longer time while you wait.";
  }
}

export const NAME_BOARD_IPHONE_TIPS: readonly string[] = [
  "Turn your phone sideways for the biggest name. iPhone can't be forced into landscape by a website.",
  "Turn brightness up yourself — websites can't change screen brightness.",
  "Safari may keep its address bar visible. Tap the aA button and choose Hide Toolbar for more space.",
];
