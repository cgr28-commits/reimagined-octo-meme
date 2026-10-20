"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { shouldHidePublicSalesWidgets } from "@/lib/owner-portal";

type TawkAPI = {
  onLoad?: () => void;
  showWidget?: () => void;
  hideWidget?: () => void;
};

export default function TawkChat() {
  const pathname = usePathname();

  useEffect(() => {
    const chatWindow = window as Window & {
      Tawk_API?: TawkAPI;
      Tawk_LoadStart?: Date;
    };
    const hidden = shouldHidePublicSalesWidgets(pathname);
    const api = (chatWindow.Tawk_API ??= {});
    const syncVisibility = () => {
      if (hidden) api.hideWidget?.();
      else api.showWidget?.();
    };
    api.onLoad = syncVisibility;
    syncVisibility();

    // Load once, and only after visiting a public customer page.
    if (!hidden && !document.getElementById("matni-tawk-chat")) {
      chatWindow.Tawk_LoadStart = new Date();
      const script = document.createElement("script");
      script.id = "matni-tawk-chat";
      script.async = true;
      script.src = "https://embed.tawk.to/6ad66513bb99a434ca8e2310/1k5anllun";
      script.charset = "UTF-8";
      script.setAttribute("crossorigin", "*");
      document.head.appendChild(script);
    }
  }, [pathname]);

  return null;
}
