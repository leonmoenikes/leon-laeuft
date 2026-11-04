// Gemeinsame Hilfen für die Browser-Tests (Playwright, Chromium).
const { devices } = require('playwright');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP = 'file://' + path.join(ROOT, 'index.html');

class AssertError extends Error {}
const ok = (cond, msg) => { if (!cond) throw new AssertError(msg); };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: erwartet ${JSON.stringify(b)}, bekommen ${JSON.stringify(a)}`);

// Neue Seite mit iPhone-Maßen, simuliertem GPS und Test-Einstellungen.
// init: Funktion, die vor jedem Laden im Browser läuft (z. B. Testdaten setzen).
async function newPage(browser, { init, initArg, scheme = 'light', settings = {}, url = APP } = {}) {
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
    window.say = (t, low, ant) => { __said.push(t.map(x => clipKey(x, ant) || x).join(' ')); return Promise.resolve(); };
    const sp = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = u => { if (u.text.trim()) __tts++; };
  });
}
const said = pg => pg.evaluate(() => __said.splice(0));

// Lauf-Fortschritt setzen und einen Tick ausführen
const sim = (pg, d, t) => pg.evaluate(([d, t]) => {
  if (!R) return; R.stepDist = d; R.totalDist = d; R.stepTime = t; R.total = t; R.last = performance.now(); tick();
}, [d, t]);

// Vorlage der gewählten Art starten (erste Karte) und loslaufen
async function startFirst(pg, kind) {
  await pg.evaluate(k => { setKind(k); show('home'); }, kind);
  await pg.click('#plans .play');
  await pg.click('#runwait .btn.fill');
}

module.exports = { ROOT, APP, ok, eq, newPage, close, noErrors, recordSay, said, sim, startFirst };
