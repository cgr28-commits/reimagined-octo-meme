/* Owner Dashboard notifications. Scope: /owner/ only. No caching, no fetch handling. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "My Airport Taxi NI", body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "My Airport Taxi NI";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      icon: "/owner-icon-192.png",
      badge: "/owner-icon-192.png",
      data: { url: typeof data.url === "string" && data.url.startsWith("/owner/") ? data.url : "/owner/?ui=mobile" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/owner/?ui=mobile";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).pathname.startsWith("/owner") && "focus" in client) {
          client.postMessage({ type: "owner-open", url });
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
