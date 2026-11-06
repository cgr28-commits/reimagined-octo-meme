"use client";

/**
 * Name Board — airport pickup name sign for the driver's phone.
 *
 * Only rendered inside the signed-in Owner Dashboard / driver portal
 * (DriverPageClient) after the access key has been verified:
 *   - owner:  More → Name Board, or "Show name board" on a booking
 *   - driver: "Show name board" on an accepted airport booking they are assigned to
 * There is deliberately no separate page/route for it.
 *
 * Privacy: the passenger name stays in React state and in localStorage on this
 * device. This file makes no network requests, never writes the name to the
 * URL, document title, console, analytics or any third party.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import styles from "./NameBoardPanel.module.css";
import {
  NAME_BOARD_DEFAULTS,
  NAME_BOARD_IPHONE_TIPS,
  NAME_BOARD_MAX_CHARS,
  NAME_BOARD_MAX_LINES,
  clampBoardInput,
  clearNameBoardSettings,
  detectNameBoardEnvironment,
  largestFittingSize,
  loadNameBoardSettings,
  normalizeBoardName,
  saveNameBoardSettings,
  wakeLockMessage,
  type NameBoardEnvironment,
  type NameBoardSettings,
  type NameBoardTheme,
} from "@/lib/name-board";

const EMBLEM_DARK = "/name-board-emblem-dark.png";
const EMBLEM_LIGHT = "/name-board-emblem-light.png";

type WakeState = "idle" | "active" | "unsupported" | "failed" | "released";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
};

/* ------------------------------------------------------------------ */
/* Fit-to-box hook                                                     */
/* ------------------------------------------------------------------ */

function useFitText(
  boxRef: React.RefObject<HTMLDivElement | null>,
  textRef: React.RefObject<HTMLParagraphElement | null>,
  deps: unknown[],
) {
  const fit = useCallback(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text) return;
    const width = box.clientWidth;
    const height = box.clientHeight;
    if (width <= 0 || height <= 0) return;
    text.removeAttribute("data-break");
    const fits = (size: number) => {
      text.style.fontSize = `${size}px`;
      // Leave ~0.12em so glyphs that overhang the line box (accents, descenders)
      // are never cut off at the top or bottom.
      return (
        text.scrollWidth <= box.clientWidth + 0.5 &&
        text.scrollHeight + size * 0.12 <= box.clientHeight + 0.5
      );
    };
    const min = 10;
    const max = Math.max(min, Math.floor(height));
    let size = largestFittingSize(fits, min, max);
    // A single enormous "word" (e.g. a typo with no spaces) would otherwise be
    // squeezed onto one tiny line. Only then allow breaking inside words, and
    // only if that gives a bigger name — it is never clipped either way.
    if (!fits(size) || size < 32) {
      text.setAttribute("data-break", "anywhere");
      const broken = largestFittingSize(fits, min, max);
      if (broken > size || !fits(size)) {
        size = broken;
      } else {
        text.removeAttribute("data-break");
      }
    }
    text.style.fontSize = `${size}px`;
    text.dataset.fitSize = String(size);
  }, [boxRef, textRef]);

  useLayoutEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, ...deps]);

  useEffect(() => {
    const box = boxRef.current;
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(fit);
    };
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
    if (box && observer) observer.observe(box);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    document.addEventListener("fullscreenchange", schedule);
    // Re-fit once the brand font has loaded (it changes text width).
    void document.fonts?.ready?.then(schedule).catch(() => undefined);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      document.removeEventListener("fullscreenchange", schedule);
    };
  }, [boxRef, fit]);
}

/* ------------------------------------------------------------------ */
/* Board face (shared by preview and full screen)                      */
/* ------------------------------------------------------------------ */

function BoardFace({
  name,
  theme,
  showWelcome,
  variant,
  children,
  footerNote,
}: {
  name: string;
  theme: NameBoardTheme;
  showWelcome: boolean;
  variant: "preview" | "board";
  children?: React.ReactNode;
  footerNote?: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  useFitText(boxRef, textRef, [name, theme, showWelcome, variant]);
  const light = theme === "light";
  const footerStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: variant === "board" ? "1.2vh" : "4px",
  };

  return (
    <div
      className={`${styles.face} ${light ? styles.faceLight : ""} ${
        variant === "preview" ? styles.facePreview : ""
      }`}
      data-theme={theme}
      data-testid={variant === "board" ? "name-board-face" : "name-board-preview"}
    >
      {children}
      <div className={styles.brand} data-testid={variant === "board" ? "name-board-brand" : undefined}>
        {/* Same-origin images only — no third-party requests. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.emblem}
          src={light ? EMBLEM_LIGHT : EMBLEM_DARK}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <span className={styles.wordmark}>
          MY AIRPORT TAXI <span className={styles.wordmarkNi}>NI</span>
        </span>
      </div>
      <div className={styles.nameBox} ref={boxRef} data-testid={variant === "board" ? "name-board-box" : undefined}>
        <p
          ref={textRef}
          className={styles.nameText}
          data-testid={variant === "board" ? "name-board-name" : "name-board-preview-name"}
          lang="en"
        >
          {name || (variant === "preview" ? "Passenger name" : "")}
        </p>
      </div>
      <div style={footerStyle}>
        {showWelcome ? (
          <span className={styles.welcome} data-testid={variant === "board" ? "name-board-welcome" : undefined}>
            WELCOME TO BELFAST
          </span>
        ) : null}
        {footerNote}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export type NameBoardPrefill = {
  /** Passenger name from the selected booking (driver can still edit it). */
  name: string;
  /** Changes each time "Show name board" is tapped so the same name re-applies. */
  requestId: number;
};

export default function NameBoardPanel({ prefill = null }: { prefill?: NameBoardPrefill | null }) {
  const ids = useId();
  const inputId = `${ids}-name`;
  const hintId = `${ids}-hint`;
  const errorId = `${ids}-error`;
  const welcomeId = `${ids}-welcome`;

  const [settings, setSettings] = useState<NameBoardSettings>({ ...NAME_BOARD_DEFAULTS });
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [wakeState, setWakeState] = useState<WakeState>("idle");
  const [env, setEnv] = useState<NameBoardEnvironment>({
    wakeLock: false,
    fullscreen: false,
    iosLike: false,
    standalone: false,
  });
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const displayButtonRef = useRef<HTMLButtonElement>(null);
  const exitButtonRef = useRef<HTMLButtonElement>(null);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const openRef = useRef(false);
  const usedFullscreenRef = useRef(false);
  const scrollLockRef = useRef<{ html: string; body: string } | null>(null);

  // Load the last name from this device only.
  useEffect(() => {
    setSettings(loadNameBoardSettings());
    setEnv(detectNameBoardEnvironment());
    setPortalTarget(document.body);
    setHydrated(true);
    // Warm the emblem images so the board still shows the logo if signal drops.
    for (const src of [EMBLEM_DARK, EMBLEM_LIGHT]) {
      const img = new Image();
      img.src = src;
    }
  }, []);

  // Fill in the name from the booking the driver tapped (still editable).
  useEffect(() => {
    if (!hydrated || !prefill) return;
    const name = clampBoardInput(prefill.name.trim());
    if (!name) return;
    setSettings((current) => ({ ...current, name }));
    setInputError(null);
    setStatus("Name filled in from the booking — edit it if needed.");
  }, [hydrated, prefill]);

  // Persist locally whenever settings change (after the first load).
  useEffect(() => {
    if (!hydrated) return;
    const isDefault =
      settings.name === NAME_BOARD_DEFAULTS.name &&
      settings.theme === NAME_BOARD_DEFAULTS.theme &&
      settings.showWelcome === NAME_BOARD_DEFAULTS.showWelcome;
    // Store nothing at all until the driver changes something; Reset leaves no trace.
    if (isDefault) clearNameBoardSettings();
    else saveNameBoardSettings(settings);
  }, [hydrated, settings]);

  const boardName = normalizeBoardName(settings.name);

  /* ---------------- Wake lock ---------------- */

  const requestWakeLock = useCallback(async () => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };
    if (!nav.wakeLock?.request) {
      setWakeState("unsupported");
      return;
    }
    if (wakeLockRef.current && !wakeLockRef.current.released) {
      setWakeState("active");
      return;
    }
    try {
      const sentinel = await nav.wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      setWakeState(openRef.current ? "active" : "idle");
      sentinel.addEventListener("release", () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        if (openRef.current) setWakeState("released");
      });
      if (!openRef.current) {
        await sentinel.release().catch(() => undefined);
      }
    } catch {
      setWakeState("failed");
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
  }, []);

  // Browsers drop the wake lock when the tab is hidden; take it back on return.
  useEffect(() => {
    if (!open) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && openRef.current) void requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [open, requestWakeLock]);

  /* ---------------- Fullscreen / distraction-free ---------------- */

  const enterFullscreen = useCallback(() => {
    const doc = document as FullscreenDocument;
    const root = document.documentElement as FullscreenElement;
    usedFullscreenRef.current = false;
    try {
      let result: Promise<void> | void | undefined;
      if (document.fullscreenEnabled && typeof root.requestFullscreen === "function") {
        result = root.requestFullscreen({ navigationUI: "hide" });
      } else if (typeof root.webkitRequestFullscreen === "function") {
        result = root.webkitRequestFullscreen();
      } else {
        return; // iPhone Safari: no element fullscreen — the fixed overlay is the fallback.
      }
      usedFullscreenRef.current = true;
      void Promise.resolve(result)
        .then(() => {
          // Only some Android browsers honour this, and only in fullscreen.
          const orientation = screen.orientation as LockableOrientation | undefined;
          return orientation?.lock?.("landscape");
        })
        .catch(() => undefined);
    } catch {
      usedFullscreenRef.current = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    const doc = document as FullscreenDocument;
    try {
      (screen.orientation as LockableOrientation | undefined)?.unlock?.();
    } catch {
      // ignore
    }
    try {
      if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
        void document.exitFullscreen().catch(() => undefined);
      } else if (doc.webkitFullscreenElement && typeof doc.webkitExitFullscreen === "function") {
        void doc.webkitExitFullscreen();
      }
    } catch {
      // ignore
    }
    usedFullscreenRef.current = false;
  }, []);

  const lockScroll = useCallback(() => {
    if (scrollLockRef.current) return;
    scrollLockRef.current = {
      html: document.documentElement.style.overflow,
      body: document.body.style.overflow,
    };
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
  }, []);

  const unlockScroll = useCallback(() => {
    const saved = scrollLockRef.current;
    if (!saved) return;
    document.documentElement.style.overflow = saved.html;
    document.body.style.overflow = saved.body;
    scrollLockRef.current = null;
  }, []);

  /* ---------------- Open / close ---------------- */

  const openBoard = useCallback(() => {
    const name = normalizeBoardName(settings.name);
    if (!name) {
      setInputError("Enter the passenger's name first.");
      inputRef.current?.focus();
      return;
    }
    setInputError(null);
    setStatus("");
    // Keep these inside the tap handler: browsers require a user gesture.
    openRef.current = true;
    enterFullscreen();
    void requestWakeLock();
    lockScroll();
    setOpen(true);
  }, [enterFullscreen, lockScroll, requestWakeLock, settings.name]);

  const closeBoard = useCallback(() => {
    openRef.current = false;
    setOpen(false);
    releaseWakeLock();
    exitFullscreen();
    unlockScroll();
    setWakeState("idle");
    window.requestAnimationFrame(() => displayButtonRef.current?.focus());
  }, [exitFullscreen, releaseWakeLock, unlockScroll]);

  // Focus the exit control when the board opens; Escape closes it.
  useEffect(() => {
    if (!open) return;
    exitButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeBoard();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeBoard, open]);

  // Clean up if the dashboard tab is switched while the board is open.
  useEffect(
    () => () => {
      if (openRef.current) {
        openRef.current = false;
        releaseWakeLock();
        exitFullscreen();
      }
      unlockScroll();
    },
    [exitFullscreen, releaseWakeLock, unlockScroll],
  );

  /* ---------------- Editor actions ---------------- */

  const setTheme = (theme: NameBoardTheme) => setSettings((current) => ({ ...current, theme }));

  const reset = () => {
    clearNameBoardSettings();
    setSettings({ ...NAME_BOARD_DEFAULTS });
    setInputError(null);
    setStatus("Name board cleared from this phone.");
    inputRef.current?.focus();
  };

  const wakeText =
    wakeState === "idle"
      ? env.wakeLock
        ? "This browser can keep the screen awake while the board is showing."
        : wakeLockMessage("unsupported")
      : wakeLockMessage(wakeState);

  const charsUsed = settings.name.length;

  /* ---------------- Full-screen board ---------------- */

  const board =
    open && portalTarget
      ? createPortal(
          <div
            className={styles.board}
            role="dialog"
            aria-modal="true"
            aria-label="Pickup name board"
            data-testid="name-board-overlay"
            onClick={() => {
              // A tap is a user gesture: use it to take the wake lock back if it was lost.
              if (wakeState === "released" || wakeState === "failed") void requestWakeLock();
            }}
          >
            <BoardFace
              name={boardName}
              theme={settings.theme}
              showWelcome={settings.showWelcome}
              variant="board"
              footerNote={
                <p className={`${styles.boardNote} ${styles.portraitOnly}`} data-testid="name-board-rotate-hint">
                  Turn your phone sideways for a bigger name
                </p>
              }
            >
              <div className={styles.controls}>
                <button
                  type="button"
                  className={styles.boardButton}
                  onClick={(event) => {
                    event.stopPropagation();
                    setTheme(settings.theme === "dark" ? "light" : "dark");
                  }}
                  aria-label={
                    settings.theme === "dark"
                      ? "Switch to white background with dark text"
                      : "Switch to navy background with white text"
                  }
                  data-testid="name-board-theme-toggle"
                >
                  <span aria-hidden="true">◐</span>
                  {settings.theme === "dark" ? "White" : "Navy"}
                </button>
                <button
                  ref={exitButtonRef}
                  type="button"
                  className={`${styles.boardButton} ${styles.exitButton}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    closeBoard();
                  }}
                  aria-label="Exit name board and return to editing"
                  data-testid="name-board-exit"
                >
                  <span aria-hidden="true">✕</span>
                  Exit
                </button>
              </div>
            </BoardFace>
            <p className={styles.srOnly} role="status" aria-live="polite">
              {wakeState === "idle" ? "" : wakeLockMessage(wakeState)}
            </p>
          </div>,
          portalTarget,
        )
      : null;

  return (
    <section className={styles.panel} aria-labelledby={`${ids}-title`} data-testid="name-board-panel">
      <p className={styles.eyebrow}>Driver tool</p>
      <h2 id={`${ids}-title`} className={styles.title}>
        Airport name board
      </h2>
      <p className={styles.intro}>
        Show the passenger&rsquo;s name full screen at arrivals. Works without signal once this page
        is open.
      </p>

      <div className={styles.card}>
        <label htmlFor={inputId} className={styles.label}>
          Passenger name
        </label>
        <p id={hintId} className={styles.hint}>
          Up to {NAME_BOARD_MAX_LINES} lines. Press return to add a second line, for example a company
          name.
        </p>
        <textarea
          id={inputId}
          ref={inputRef}
          className={styles.nameInput}
          value={settings.name}
          onChange={(event) => {
            const next = clampBoardInput(event.target.value);
            setSettings((current) => ({ ...current, name: next }));
            if (inputError && normalizeBoardName(next)) setInputError(null);
            if (status) setStatus("");
          }}
          rows={2}
          // Length is capped by clampBoardInput (maxLength miscounts replaced
          // selections and line breaks in some browsers).
          placeholder="e.g. Mr & Mrs O'Neill"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="enter"
          aria-describedby={`${hintId}${inputError ? ` ${errorId}` : ""}`}
          aria-invalid={inputError ? true : undefined}
          data-testid="name-board-input"
          // Keep password managers / form-capture tools away from passenger names.
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
        />
        <div className={styles.metaRow}>
          <span>Saved on this phone only</span>
          <span aria-hidden="true">
            {charsUsed}/{NAME_BOARD_MAX_CHARS}
          </span>
        </div>
        {inputError ? (
          <p id={errorId} className={styles.error} role="alert">
            {inputError}
          </p>
        ) : null}

        <button
          ref={displayButtonRef}
          type="button"
          className={styles.primaryButton}
          onClick={openBoard}
          data-testid="name-board-display"
        >
          Display Name Board
        </button>

        <div className={styles.secondaryRow}>
          <button type="button" className={styles.secondaryButton} onClick={reset} data-testid="name-board-reset">
            Reset
          </button>
        </div>
        <p className={styles.status} role="status" aria-live="polite" data-testid="name-board-status">
          {status}
        </p>
      </div>

      <div className={styles.card}>
        <p className={styles.groupLabel} id={`${ids}-theme`}>
          Board colours
        </p>
        <div className={styles.segmented} role="group" aria-labelledby={`${ids}-theme`}>
          <button
            type="button"
            className={styles.segment}
            aria-pressed={settings.theme === "dark"}
            onClick={() => setTheme("dark")}
            data-testid="name-board-theme-dark"
          >
            <span className={`${styles.swatch} ${styles.swatchDark}`} aria-hidden="true" />
            Navy, white text
          </button>
          <button
            type="button"
            className={styles.segment}
            aria-pressed={settings.theme === "light"}
            onClick={() => setTheme("light")}
            data-testid="name-board-theme-light"
          >
            <span className={`${styles.swatch} ${styles.swatchLight}`} aria-hidden="true" />
            White, dark text
          </button>
        </div>

        <label className={styles.toggleRow} htmlFor={welcomeId}>
          <span className={styles.toggleText}>Show &lsquo;WELCOME TO BELFAST&rsquo;</span>
          <input
            id={welcomeId}
            type="checkbox"
            className={styles.checkbox}
            checked={settings.showWelcome}
            onChange={(event) =>
              setSettings((current) => ({ ...current, showWelcome: event.target.checked }))
            }
            data-testid="name-board-welcome-toggle"
          />
        </label>

        <div className={styles.previewWrap}>
          <p className={styles.hint} style={{ marginBottom: "0.4rem" }}>
            Preview (landscape)
          </p>
          <div className={styles.preview} aria-hidden="true">
            <BoardFace
              name={boardName}
              theme={settings.theme}
              showWelcome={settings.showWelcome}
              variant="preview"
            />
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <details className={styles.tips}>
          <summary>Phone tips &amp; privacy</summary>
          <ul>
            <li data-testid="name-board-wake-support">{wakeText}</li>
            {env.fullscreen ? (
              <li>This browser can go full screen. Tap Exit or press Back to leave.</li>
            ) : (
              <li>
                This browser can&rsquo;t go true full screen, so the board fills the visible screen
                instead.
              </li>
            )}
            {NAME_BOARD_IPHONE_TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
            <li>
              The name is kept only in this browser on this phone so it&rsquo;s still here if the
              page reloads. It isn&rsquo;t sent to our server, Google or anyone else. Tap Reset to
              remove it.
            </li>
          </ul>
        </details>
      </div>

      {board}
    </section>
  );
}
