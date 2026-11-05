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

  const toBytes = s => {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b + '='.repeat((4 - (b.length % 4)) % 4)), c => c.charCodeAt(0));
  };
  const toB64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const codeOf = sub => {
    const j = sub.toJSON();
    return `BT1.${toB64url(new TextEncoder().encode(JSON.stringify({ endpoint: j.endpoint, keys: j.keys })))}`;
  };

  function show(id) {
    for (const s of document.querySelectorAll('[data-step]')) s.hidden = s.id !== id;
  }

  async function registration() {
    await navigator.serviceWorker.register('sw.js');
    return navigator.serviceWorker.ready;
  }

  // A subscription made for another computer (another key) is replaced.
  async function current() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub && sub.options && sub.options.applicationServerKey && toB64url(sub.options.applicationServerKey) !== KEY) {
      await sub.unsubscribe();
      return null;
    }
    return sub;
  }

  async function renderLast() {
    const list = $('last');
    const cache = await caches.open('bt-alerts');
    const hit = await cache.match('last');
    const items = hit ? await hit.json() : [];
    if (!items.length) return;
    list.textContent = '';
    for (const it of items) {
      const li = document.createElement('li');
      const title = document.createElement(it.u ? 'a' : 'b');
      title.textContent = it.t;
      if (it.u) { title.href = it.u; title.target = '_blank'; title.rel = 'noopener'; }
      const body = document.createElement('div');
      body.textContent = it.b;
      const when = document.createElement('div');
      when.className = 'when';
      when.textContent = new Date(it.at).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      li.append(title, body, when);
      list.append(li);
    }
  }

  function showCode(sub) {
    $('code').value = codeOf(sub);
    show('ready');
    renderLast();
  }

  $('on').addEventListener('click', async () => {
    $('startError').textContent = '';
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { show('blocked'); return; }
      const reg = await registration();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(KEY) });
      showCode(sub);
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
    await reg.showNotification('Backlog Tool', { body: 'Notifications work on this phone.', icon: 'icon-192.png', tag: 'bt-local-test' });
    $('readyInfo').textContent = 'A notification should be on the phone now. Alerts from the computer come the same way.';
  });

  $('off').addEventListener('click', async () => {
    const sub = await current();
    if (sub) await sub.unsubscribe();
    show('start');
  });

  navigator.serviceWorker && navigator.serviceWorker.addEventListener('message', e => { if (e.data === 'pushed') renderLast(); });

  (async () => {
    if (!KEY) { show('nokey'); return; }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      show(ios && !standalone ? 'ios' : 'unsupported');
      return;
    }
    if (Notification.permission === 'denied') { show('blocked'); return; }
    const sub = Notification.permission === 'granted' ? await current() : null;
    if (sub) showCode(sub);
    else show('start');
  })().catch(e => { show('start'); $('startError').textContent = String(e && e.message ? e.message : e); });
})();
