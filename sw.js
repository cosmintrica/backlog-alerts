'use strict';
// Shows the alerts the computer pushes; the push service only carried them, encrypted for this phone.
const SN = 'https://prysmiansd.service-now.com/';
// The kinds of alert with an icon of their own (apps/<kind>-180.png), the same icons as on Windows.
const KINDS = ['urgent', 'answer', 'reopened', 'kpi', 'new', 'call', 'watch', 'favorite', 'reminder'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const putJson = (cache, key, value) => cache.put(key, new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } }));

// The last alerts and how the last push went, for the page (an alert swiped away by mistake can still be found there).
async function remember(item, status) {
  const cache = await caches.open('bt-alerts');
  const hit = await cache.match('last');
  const list = hit ? await hit.json() : [];
  list.unshift(item);
  await putJson(cache, 'last', list.slice(0, 30));
  await putJson(cache, 'status', status);
  for (const client of await self.clients.matchAll({ type: 'window' })) client.postMessage('pushed');
}

// An iPhone counts a push whose handling ends in an error as a push without a notification, and after a few it drops
// the subscription while the push service still answers OK: the notification comes first and nothing after it may fail.
async function onPush(event) {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { t: 'Backlog Tool', b: event.data ? event.data.text() : '' }; }
  const title = String(d.t || 'Backlog Tool').slice(0, 120);
  const body = String(d.b || '').slice(0, 500);
  // Only a page of the ServiceNow instance is opened from an alert.
  const url = typeof d.u === 'string' && d.u.startsWith(SN) ? d.u : '';
  const tag = typeof d.g === 'string' && d.g ? d.g.slice(0, 80) : '';
  // Android shows this icon; an iPhone always shows the icon of the app.
  const icon = KINDS.includes(d.a) ? `apps/${d.a}-180.png` : 'icon-192.png';
  const options = { body, icon, requireInteraction: !!d.r, vibrate: [300, 120, 300, 120, 600], data: { url } };
  if (tag) Object.assign(options, { tag, renotify: true });
  let error = '';
  try {
    await self.registration.showNotification(title, options);
  } catch (e) {
    error = String(e && e.message ? e.message : e);
    await self.registration.showNotification(title, { body, data: { url } });
  }
  try {
    await remember({ t: title, b: body, u: url, at: Date.now() }, { at: Date.now(), error });
  } catch { /* the list is extra: the notification is what counts */ }
}

self.addEventListener('push', event => event.waitUntil(onPush(event)));

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  event.waitUntil(self.clients.openWindow(url || './'));
});
