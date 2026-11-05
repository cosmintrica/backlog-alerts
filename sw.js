'use strict';
// Shows the alerts the computer pushes; the push service only carried them, encrypted for this phone.
const SN = 'https://prysmiansd.service-now.com/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// The last alerts, for the page (an alert swiped away by mistake can still be found there).
async function remember(item) {
  const cache = await caches.open('bt-alerts');
  const hit = await cache.match('last');
  const list = hit ? await hit.json() : [];
  list.unshift(item);
  await cache.put('last', new Response(JSON.stringify(list.slice(0, 30)), { headers: { 'Content-Type': 'application/json' } }));
  for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage('pushed');
}

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { t: 'Backlog Tool', b: event.data ? event.data.text() : '' }; }
  const title = String(d.t || 'Backlog Tool').slice(0, 120);
  // Only a page of the ServiceNow instance is opened from an alert.
  const url = typeof d.u === 'string' && d.u.startsWith(SN) ? d.u : '';
  const tag = typeof d.g === 'string' && d.g ? d.g.slice(0, 80) : '';
  const options = { body: String(d.b || '').slice(0, 500), icon: 'icon-192.png', requireInteraction: !!d.r, vibrate: [300, 120, 300, 120, 600], timestamp: Date.now(), data: { url } };
  if (tag) Object.assign(options, { tag, renotify: true });
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), remember({ t: title, b: options.body, u: url, at: Date.now() })]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  event.waitUntil(self.clients.openWindow(url || './'));
});
