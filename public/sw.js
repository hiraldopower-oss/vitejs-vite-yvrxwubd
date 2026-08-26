// Service worker mínimo — su única función es permitir que Chrome en Android
// pueda mostrar notificaciones reales (registration.showNotification) en vez
// de solo el sonido/vibración. No necesita hacer nada más por sí mismo.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Si el usuario toca la notificación, enfoca o abre la pestaña del panel.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
