/* Service worker minimal : permet l'installation du raccourci. Aucune mise en cache, les pages restent toujours à jour. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () { /* réseau direct, sans cache */ });
