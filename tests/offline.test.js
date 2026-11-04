// Offline-Fähigkeit: Service Worker über einen lokalen Webserver (Service Worker brauchen http/https)
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ok, eq, newPage, close, noErrors, ROOT } = require('./helpers');

function serve(dir) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(dir, p.endsWith('/') ? p + 'index.html' : p);
    if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}

exports['Startet offline aus dem Speicher, Update ersetzt die Stimme'] = async b => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'll-srv-'));
  for (const f of ['index.html', 'sw.js', 'voice.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  const srv = await serve(dir), url = `http://localhost:${srv.address().port}/`;
  const keys = p => p.evaluate(async () => (await (await caches.open('leon-laeuft-v1')).keys()).map(r => new URL(r.url).pathname + new URL(r.url).search));
  try {
    const pg = await newPage(b, { url });
    await pg.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
    await pg.waitForFunction(async () => (await (await caches.open('leon-laeuft-v1')).keys()).length >= 2, null, { timeout: 15000 });
    const k0 = await keys(pg);
    ok(k0.includes('/') && k0.some(k => /^\/voice\.js\?v=/.test(k)), 'Seite und Stimme im Speicher: ' + k0.join(', '));
    await pg.context().setOffline(true);
    await pg.reload();
    eq(await pg.evaluate(() => [document.title, Object.keys(VOICE_BERLIN).length]), ['Leon Läuft', 154], 'offline gestartet mit Stimme');
    await pg.context().setOffline(false);
    // Update: neue Versionskennung → neue Stimme gespeichert, alte entfernt
    const f = path.join(dir, 'index.html');
    fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(/voice\.js\?v=[0-9a-f]+/, 'voice.js?v=abcdef0123'));
    await pg.reload();
    await pg.waitForFunction(async () => (await (await caches.open('leon-laeuft-v1')).keys()).some(r => r.url.includes('abcdef0123')), null, { timeout: 15000 });
    await pg.waitForTimeout(300);
    eq((await keys(pg)).filter(k => k.startsWith('/voice.js')), ['/voice.js?v=abcdef0123'], 'nur neue Stimme im Speicher');
    noErrors(pg); await close(pg);
  } finally { srv.close(); }
};
