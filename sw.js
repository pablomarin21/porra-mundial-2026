// Service worker SOLO para notificaciones push (no cachea nada, para no servir versiones viejas).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (e) { try { d = { body: event.data.text() }; } catch (_) { d = {}; } }
  const title = d.title || "⚽ Porra Mundial 2026";
  const opts = {
    body: d.body || "¡Novedades en la porra!",
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { url: d.url || "./?porra=FAMILIA2026" },
  };
  if (d.tag) { opts.tag = d.tag; opts.renotify = true; }
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./?porra=FAMILIA2026";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          // navega la ventana ya abierta al enlace (deep-link al 28-jun) y la enfoca
          if ("navigate" in c) return c.navigate(url).then((cl) => (cl || c).focus()).catch(() => c.focus());
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
