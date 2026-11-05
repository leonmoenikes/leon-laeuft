// Daten: Backup/Wiederherstellung, Absturzschutz, Strecke, Statistik, GPX
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ok, eq, newPage, close, noErrors, startFirst, sim } = require('./helpers');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'll-test-'));
// App "neu starten". Chromium schreibt localStorage verzögert; geht der Stand beim
// schnellen Neuladen verloren (oder liegt dort noch ein älterer), wird der zuletzt
// gesicherte Stand gesetzt – getestet wird die App-Logik.
async function restart(pg) {
  // Stand sichern, dann die alte Seite „abstürzen“ lassen: kein Timer, kein Sichern beim Verlassen
  const snap = await pg.evaluate(() => { saveLive(); clearInterval(R.timer); R.state = 'crashed'; return localStorage.getItem('iv_live'); });
  await pg.reload();
  await pg.evaluate(s => { if (localStorage.getItem('iv_live') !== s) { localStorage.setItem('iv_live', s); show('home'); } }, snap);
}

exports['Backup erstellen und sicher wiederherstellen'] = async b => {
  const pg = await newPage(b);
  await pg.evaluate(async () => { runs.push({ id: 'r1', kind: 'run', date: new Date().toISOString(), name: 'Test', time: 600, dist: 2000, pace: 300, log: [] }); saveHist(); await trackPut('r1', [[52.5, 13.4, 0], [52.501, 13.401, 10]]); });
  await pg.evaluate(() => show('set'));
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#v-set button.linkcell')]);
  const f = path.join(tmp, 'backup.json'); await dl.saveAs(f);
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  eq([d.app, d.tracks.length, JSON.parse(d.ls.iv_hist).length], ['leon-laeuft', 1, 1], 'Backup-Inhalt');
  // manipuliertes Backup: gefährliche ID, unbekannte Art, HTML im Namen
  d.ls.iv_plans = JSON.stringify([{ id: "x' onclick='alert(1)", kind: 'run', name: '<img src=x onerror=alert(1)>', goal: 'free' }, { id: 'p2', kind: 'evil" x="', name: 'weg' }]);
  fs.writeFileSync(f, JSON.stringify(d));
  await pg.evaluate(async () => { localStorage.clear(); await trackDel('r1'); });
  await pg.locator('input[type=file]').setInputFiles(f);
  await pg.waitForFunction(() => runs.length === 1);
  const r = await pg.evaluate(async () => ({ plans: plans.filter(p => p.id !== 'p-final').map(p => [/^[\w-]+$/.test(p.id), p.kind]), runs: runs.length, track: (await trackGet('r1') || []).length }));
  eq(r, { plans: [[true, 'run']], runs: 1, track: 2 }, 'nach Wiederherstellung');
  await pg.evaluate(() => setKind('run'));
  eq(await pg.locator('#plans img').count(), 0, 'kein eingeschleustes HTML');
  noErrors(pg); await close(pg);
};

exports['Absturzschutz: Lauf fortsetzen, Rennuhr läuft weiter, Speichern'] = async b => {
  const pg = await newPage(b);
  await startFirst(pg, 'run');
  await sim(pg, 1500, 480);
  await pg.evaluate(() => { R.track.push([52.5, 13.4, 0], [52.51, 13.4, 400]); });
  await restart(pg);
  ok(await pg.isVisible('.resume'), 'Karte „Lauf unterbrochen“');
  await pg.click('.resume .btn.fill');
  eq(await pg.evaluate(() => [R.state, Math.round(R.totalDist), Math.round(R.total), R.track[R.track.length - 1]]), ['run', 1500, 480, null], 'fortgesetzt mit Lücke in der Strecke');
  await pg.evaluate(() => finish(true, true));
  // Rennen: 2 min Unterbrechung zählen zur Rennzeit
  await startFirst(pg, 'race');
  await sim(pg, 800, 240);
  await restart(pg);
  await pg.evaluate(() => { const o = JSON.parse(localStorage.getItem('iv_live')); o.savedAt -= 120000; localStorage.setItem('iv_live', JSON.stringify(o)); });
  await pg.click('.resume .btn.fill');
  const rt = await pg.evaluate(() => Math.round(R.total)); // 240 s + 120 s Unterbrechung + Dauer des Neuladens
  ok(rt >= 359 && rt <= 380, 'Rennuhr +120 s, bekommen ' + rt);
  // Speichern ohne Fortsetzen
  await restart(pg);
  await pg.click('.resume button:has-text("Speichern")');
  eq(await pg.evaluate(() => [runs[runs.length - 1].kind, localStorage.getItem('iv_live')]), ['race', null], 'gespeichert, Sicherung gelöscht');
  noErrors(pg); await close(pg);
};

exports['Lauf-Details: Diagramm, Strecke, GPX; Statistik und Bestzeiten'] = async b => {
  const pg = await newPage(b, { init: () => { if (sessionStorage.x) return; sessionStorage.x = 1; localStorage.setItem('iv_mig3', 'true');
    const D = 864e5, km = (n, base) => Array.from({ length: n }, (_, i) => ({ type: 'run', label: 'Km ' + (i + 1), target: 300, tdist: 1000, dist: 1000, time: base + (i % 3) }));
    localStorage.setItem('iv_hist', JSON.stringify([
      { id: 'a', kind: 'run', date: new Date(Date.now() - 9 * D).toISOString(), name: 'Lauf', time: 1650, dist: 5000, pace: 330, log: km(5, 329) },
      { id: 'b', kind: 'iv', date: new Date(Date.now() - 5 * D).toISOString(), name: '5 × 1000', time: 2000, dist: 7000, pace: 300, log: [{ type: 'run', label: 'Intervall 1/5', target: 240, tdist: 1000, dist: 1000, time: 236 }] },
      { id: 'c', kind: 'race', date: new Date(Date.now() - 1 * D).toISOString(), name: 'Stadtlauf', time: 2990, dist: 10000, pace: 299, log: km(10, 298) }])); } });
  await pg.evaluate(async () => { const p = []; for (let i = 0; i <= 50; i++) p.push([52.5 + i * 0.0002, 13.4 + (i % 10) * 0.0001, i * 10]); await trackPut('c', p); });
  await pg.evaluate(() => showRun('c'));
  await pg.waitForSelector('#trkwrap:not([hidden])');
  eq(await pg.locator('#pchart circle').count(), 10, 'Punkte im km-Diagramm');
  await pg.click('#pchart svg rect >> nth=2');
  ok((await pg.textContent('#pchart .ctip')).startsWith('Km 3'), 'Tooltip');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('text=GPX exportieren')]);
  const f = path.join(tmp, 't.gpx'); await dl.saveAs(f);
  const g = fs.readFileSync(f, 'utf8');
  ok(g.startsWith('<?xml') && (g.match(/<trkpt /g) || []).length === 51, 'GPX mit 51 Punkten');
  eq(await pg.evaluate(() => bestTimes().map(x => x.time ? fmtTime(x.time) : null)), ['3:56', '24:54', '49:49', null], 'Bestzeiten');
  await pg.evaluate(() => { show('hist'); setHistView('stats'); });
  const weeks = await pg.evaluate(() => new Set(runs.map(r => ymd(mondayOf(new Date(r.date))))).size);
  eq(await pg.locator('#wchart path').count(), weeks, 'eine Säule je Woche mit Läufen');
  noErrors(pg); await close(pg);
};
