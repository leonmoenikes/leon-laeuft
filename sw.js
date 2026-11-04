/* Service Worker: macht Leon Läuft offline-fähig.
   - Seite (index.html): zuerst aus dem Netz (höchstens 3,5 s), sonst die
     gespeicherte Version. So kommen Updates an, und ohne Empfang startet die
     App trotzdem.
   - voice.js?v=<hash>: aus dem Speicher. Die Datei ändert sich nur mit neuer
     Versionskennung; dann wird die neue geladen und die alte entfernt. */
const CACHE = 'leon-laeuft-v1';
const PAGE = new URL('./', self.registration.scope).href;

const isVoice = url => new URL(url).pathname.endsWith('/voice.js');

async function cacheVoiceFromHtml(html) {
  const m = html.match(/voice\.js\?v=[0-9a-f]+/);
  if (!m) return;
  const url = new URL(m[0], self.registration.scope).href;
  const c = await caches.open(CACHE);
  if (!(await c.match(url))) {
    const r = await fetch(url);
    if (r.ok) await c.put(url, r);
  }
  // alte Stimmen-Versionen löschen
  for (const req of await c.keys()) if (isVoice(req.url) && req.url !== url) await c.delete(req);
}

// Seite neu laden und speichern; die Stimme wird getrennt im Hintergrund
// nachgeladen (bg), damit die Seite nicht auf die 2-MB-Datei warten muss.
async function refreshPage(bg) {
  const r = await fetch(PAGE, { cache: 'no-cache' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const c = await caches.open(CACHE);
  await c.put(PAGE, r.clone());
  const voice = r.clone().text().then(cacheVoiceFromHtml).catch(() => {});
  if (bg) bg(voice); else await voice;
  return r;
}

self.addEventListener('install', e => {
  e.waitUntil(refreshPage().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isVoice(req.url)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) await c.put(req, r.clone());
      return r;
    })());
    return;
  }

  if (req.mode === 'navigate' || url.href === PAGE || url.pathname.endsWith('/index.html')) {
    e.respondWith((async () => {
      const net = refreshPage(p => e.waitUntil(p));
      e.waitUntil(net.catch(() => {}));
      try {
        return await withTimeout(net, 3500);
      } catch (err) {
        const c = await caches.open(CACHE);
        return (await c.match(PAGE)) || Response.error();
      }
    })());
  }
});
