// Gemeinsame Hilfen für die Browser-Tests (Playwright, Chromium).
const { devices } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Kleiner Webserver: Tests laufen über http://localhost statt file:// – so hat jeder
// Browser-Kontext garantiert seinen eigenen Speicher (bei file:// vermischt Chromium ihn).
function serve(dir) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
  const srv = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(dir, p.endsWith('/') ? p + 'index.html' : p);
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}
let appSrv = null;
async function appUrl() { if (!appSrv) appSrv = await serve(ROOT); return `http://localhost:${appSrv.address().port}/`; }
function stop() { if (appSrv) appSrv.close(); appSrv = null; }

class AssertError extends Error {}
const ok = (cond, msg) => { if (!cond) throw new AssertError(msg); };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: erwartet ${JSON.stringify(b)}, bekommen ${JSON.stringify(a)}`);

// Neue Seite mit iPhone-Maßen, simuliertem GPS und Test-Einstellungen.
// init: Funktion, die vor jedem Laden im Browser läuft (z. B. Testdaten setzen).
async function newPage(browser, { init, initArg, scheme = 'light', settings = {}, url } = {}) {
  url = url || await appUrl();
  const ctx = await browser.newContext({
    ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, colorScheme: scheme,
    geolocation: { latitude: 52.52, longitude: 13.4, accuracy: 6 }, permissions: ['geolocation'], acceptDownloads: true,
  });
  const pg = await ctx.newPage();
  pg.errors = [];
  pg.on('pageerror', e => pg.errors.push(e.message));
  pg.on('dialog', d => d.accept());
  await pg.addInitScript(s => {
    // Teilen-Dialog gibt es im Test-Browser nicht → Download-Weg
    Navigator.prototype.canShare = undefined; Navigator.prototype.share = undefined;
    if (!localStorage.getItem('iv_settings'))
      localStorage.setItem('iv_settings', JSON.stringify(Object.assign({ startLocked: false, autoLock: false, ver: 2 }, s)));
  }, settings);
  if (init) await pg.addInitScript(init, initArg);
  await pg.goto(url);
  return pg;
}
const close = pg => pg.context().close();
const noErrors = pg => eq(pg.errors, [], 'JavaScript-Fehler auf der Seite');

// Ansagen mitschneiden: Bausteine statt Ton (Stimme wird vorher geladen)
async function recordSay(pg) {
  await pg.evaluate(async () => {
    audioOn(); await loadVoice();
    window.__said = []; window.__tts = 0;
    // gleiche Voreinstellung wie say(): Ansprache mit Namen laut Einstellung
    window.say = (t, low, ant = !!settings.antName) => { __said.push(t.map(x => clipKey(x, ant) || x).join(' ')); return Promise.resolve(); };
    const sp = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = u => { if (u.text.trim()) __tts++; };
  });
}
const said = pg => pg.evaluate(() => __said.splice(0));

// Lauf-Fortschritt setzen und einen Tick ausführen
const sim = (pg, d, t) => pg.evaluate(([d, t]) => {
  if (!R) return; R.stepDist = d; R.totalDist = d; R.stepTime = t; R.total = t; R.last = Date.now(); tick();
}, [d, t]);

// Vorlage der gewählten Art starten (erste Karte) und loslaufen
async function startFirst(pg, kind) {
  await pg.evaluate(k => { setKind(k); show('home'); }, kind);
  await pg.click('#plans .play');
  await pg.click('#runwait .btn.fill');
}

module.exports = { ROOT, serve, appUrl, stop, ok, eq, newPage, close, noErrors, recordSay, said, sim, startFirst };
