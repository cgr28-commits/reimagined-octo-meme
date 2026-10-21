"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

/** Driver sign-in/jobs do not mount public marketing, chat or consent services. */
export default function PublicWebsiteOnly({ children, freshDriverNavigation = false }: { children: ReactNode; freshDriverNavigation?: boolean }) {
  const pathname = usePathname();
  const driverPage = /^\/driver(?:\/|$)/.test(pathname ?? "");

  useEffect(() => {
    if (driverPage || !freshDriverNavigation) return;
    // Enter the private portal in a fresh document, so previously loaded public
    // third-party scripts cannot survive a client-side navigation into My Jobs.
    function enterDriverPortal(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const target = new URL(anchor.href, window.location.href);
      if (target.origin !== window.location.origin || !/^\/driver(?:\/|$)/.test(target.pathname)) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(target.href);
    }
    document.addEventListener("click", enterDriverPortal, true);
    return () => document.removeEventListener("click", enterDriverPortal, true);
  }, [driverPage, freshDriverNavigation]);

  return driverPage ? null : children;
}
