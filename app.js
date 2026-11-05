'use strict';
// The phone page: subscribes this phone to the pushes of one computer (the key in ?k=) and gives back the code to paste
// in Backlog Tool there. It sends nothing anywhere itself: no data, no account, no server of its own.
(() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  // iPhone opens the Home Screen app with the address it was added from; the key is kept as well in case it is not.
  const KEY = params.get('k') || localStorage.getItem('bt.k') || '';
  if (params.get('k')) localStorage.setItem('bt.k', params.get('k'));
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  // Apps for one kind of alert, with the icon of that kind (the same icons as on Windows): an iPhone always shows
  // the icon of the app in its notifications, so each icon needs its own app on the Home Screen.
  const APPS = {
    urgent: ['BT Urgent', '#dc2626', 'Very High and the other special alerts'],
    answer: ['BT Answer', '#d97706', 'tickets that need your answer'],
    reopened: ['BT Reopened', '#a21caf', 'reopened tickets and rejected solutions'],
    kpi: ['BT KPI', '#ea580c', 'KPIs about to expire'],
    new: ['BT New', '#2563eb', 'new tickets'],
    call: ['BT Calls', '#0d9488', 'new calls'],
    watch: ['BT Watched', '#7c3aed', 'changes of watched tickets'],
    favorite: ['BT Favorites', '#ca8a04', 'changes of favorite tickets'],
    reminder: ['BT Reminders', '#0891b2', 'your reminders']
  };
  const APP = Object.prototype.hasOwnProperty.call(APPS, params.get('g')) ? params.get('g') : '';
  if (APP) {
    const [name, color, what] = APPS[APP];
    document.title = name;
    $('manifest').href = `apps/${APP}.webmanifest`;
    $('touchIcon').href = `apps/${APP}-180.png`;
    $('favicon').href = `apps/${APP}-180.png`;
    $('appTitle').content = name;
    $('themeColor').content = color;
    $('logo').src = `apps/${APP}-180.png`;
    $('title').textContent = name;
    $('sub').textContent = `Backlog Tool on this phone: ${what}`;
    $('appName').textContent = name;
  }

  const toBytes = s => {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b + '='.repeat((4 - (b.length % 4)) % 4)), c => c.charCodeAt(0));
  };
  const toB64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const codeOf = sub => {
    const j = sub.toJSON();
    return `BT1.${toB64url(new TextEncoder().encode(JSON.stringify({ endpoint: j.endpoint, keys: j.keys, g: APP || undefined })))}`;
  };

  function show(id) {
    for (const s of document.querySelectorAll('[data-step]')) s.hidden = s.id !== id;
  }

  const when = at => new Date(at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  // A short ID of the push address; Backlog Tool shows the same ID next to the phone, so the two can be compared.
  async function idOf(endpoint) {
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
    return Array.from(hash.slice(-3), b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  async function registration() {
    await navigator.serviceWorker.register('sw.js');
    return navigator.serviceWorker.ready;
  }

  // The key a subscription was made with; '' when the browser does not say it in the usual form (then it is kept).
  const keyOf = sub => {
    const k = sub && sub.options && sub.options.applicationServerKey;
    return k && k.byteLength === 65 ? toB64url(k) : '';
  };

  // The subscription of this phone, and whether it was made for this computer (the key in the link). It is never
  // dropped here: only Turn on (for another computer) and Turn off do that.
  async function current() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return { sub, mine: !!sub && (keyOf(sub) || KEY) === KEY };
  }

  async function renderLast() {
    const list = $('last');
    const cache = await caches.open('bt-alerts');
    const [hit, st] = await Promise.all([cache.match('last'), cache.match('status')]);
    const items = hit ? await hit.json() : [];
    const status = st ? await st.json() : null;
    $('received').textContent = status ? `Last alert received ${when(status.at)}${status.error ? ` (shown without its options: ${status.error})` : ''}.` : 'No alert has reached this phone yet.';
    if (!items.length) return;
    list.textContent = '';
    for (const it of items) {
      const li = document.createElement('li');
      const title = document.createElement(it.u ? 'a' : 'b');
      title.textContent = it.t;
      if (it.u) { title.href = it.u; title.target = '_blank'; title.rel = 'noopener'; }
      const body = document.createElement('div');
      body.textContent = it.b;
      const at = document.createElement('div');
      at.className = 'when';
      at.textContent = when(it.at);
      li.append(title, body, at);
      list.append(li);
    }
  }

  async function showCode(sub) {
    $('code').value = codeOf(sub);
    show('ready');
    $('phoneId').textContent = `Phone ID ${await idOf(sub.endpoint)}: Backlog Tool settings - Phone shows the same ID next to this phone when it is paired.`;
    renderLast();
  }

  $('on').addEventListener('click', async () => {
    $('startError').textContent = '';
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { show('blocked'); return; }
      const reg = await registration();
      let sub = await reg.pushManager.getSubscription();
      // A subscription keeps the key it was made with: one made for another computer is replaced.
      if (sub && keyOf(sub) && keyOf(sub) !== KEY) { await sub.unsubscribe(); sub = null; }
      const fresh = !sub;
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(KEY) });
      await showCode(sub);
      if (fresh) $('readyInfo').textContent = 'This is a new code: paste it in Backlog Tool settings - Phone. A code shown before no longer works.';
    } catch (e) {
      $('startError').textContent = `It did not work: ${e && e.message ? e.message : e}`;
    }
  });

  $('share').addEventListener('click', async () => {
    const text = $('code').value;
    if (navigator.share) {
      try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    $('copy').click();
  });

  $('copy').addEventListener('click', async () => {
    const ok = await navigator.clipboard.writeText($('code').value).then(() => true, () => false);
    if (!ok) { $('code').select(); }
    $('readyInfo').textContent = ok ? 'Copied. Paste it in Backlog Tool on the computer.' : 'Select the code and copy it.';
  });

  $('test').addEventListener('click', async () => {
    const reg = await registration();
    await reg.showNotification(APP ? APPS[APP][0] : 'Backlog Tool', { body: 'Notifications work on this phone.', icon: APP ? `apps/${APP}-180.png` : 'icon-192.png', tag: 'bt-local-test' });
    // The number on the icon of the Home Screen; it goes when the app is opened again.
    const badge = navigator.setAppBadge ? await navigator.setAppBadge(1).then(() => true, () => false) : false;
    $('readyInfo').textContent = `A notification should be on the phone now, with the icon of this app.${badge ? ' The icon on the Home Screen shows 1.' : ''} Alerts from the computer come the same way.`;
  });

  $('off').addEventListener('click', async () => {
    const { sub } = await current();
    if (sub) await sub.unsubscribe();
    show('start');
    $('startError').textContent = 'Alerts are off on this phone. Turning them on again makes a new code for the computer.';
  });

  navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', e => { if (e.data === 'pushed') renderLast(); });

  (async () => {
    if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
    if (!KEY) { show('nokey'); return; }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      show(ios && !standalone ? 'ios' : 'unsupported');
      return;
    }
    if (Notification.permission === 'denied') { show('blocked'); return; }
    const { sub, mine } = Notification.permission === 'granted' ? await current() : { sub: null, mine: false };
    if (sub && mine) { await showCode(sub); return; }
    show('start');
    if (sub) $('startError').textContent = 'This phone gets the alerts of another computer. Turn on alerts to get the ones of this computer instead.';
  })().catch(e => { show('start'); $('startError').textContent = String(e && e.message ? e.message : e); });
})();
