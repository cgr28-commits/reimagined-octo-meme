"use client";
export default function CookieSettingsButton() {
  return (
    <button
      type="button"
      className="underline underline-offset-2"
      onClick={() =>
        window.dispatchEvent(new Event("matni-open-cookie-settings"))
      }
    >
      Cookie Settings
    </button>
  );
}
