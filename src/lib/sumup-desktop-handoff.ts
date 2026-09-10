export type DesktopSumUpPopup = {
  opener: unknown;
  location: {
    href: string;
    assign?: (url: string) => void;
  };
};

export type DesktopSumUpWindow = {
  open: (url?: string, target?: string, features?: string) => DesktopSumUpPopup | null;
  location: {
    assign: (url: string) => void;
    href?: string;
  };
};

export type DesktopSumUpHandoffResult = {
  openedNewTab: boolean;
  navigations: Array<{ target: "popup" | "same-tab"; url: string }>;
};

export function openDesktopSumUpCheckout(
  win: DesktopSumUpWindow | (Window & typeof globalThis),
  paymentUrl: string,
): DesktopSumUpHandoffResult {
  const paymentTab = win.open("about:blank", "_blank") as DesktopSumUpPopup | null;
  if (paymentTab == null) {
    win.location.assign(paymentUrl);
    return {
      openedNewTab: false,
      navigations: [{ target: "same-tab", url: paymentUrl }],
    };
  }

  paymentTab.opener = null;
  paymentTab.location.href = paymentUrl;
  return {
    openedNewTab: true,
    navigations: [{ target: "popup", url: paymentUrl }],
  };
}

export type CancelPaymentQuoteState = {
  quoteStep: number;
  openCheckout: unknown;
  paying: boolean;
  childSeats: number;
  childSeatNotes: string;
};

export function applyCancelPaymentReturnToQuote<T extends CancelPaymentQuoteState>(state: T): T {
  return {
    ...state,
    quoteStep: 1,
    openCheckout: null,
    paying: false,
  };
}
