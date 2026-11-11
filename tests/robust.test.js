// Robustheit: Bildschirm aus, GPS-Lücken, lange Dauern, Audio-Kontext
const { ok, eq, newPage, close, noErrors, recordSay, said, sim, startFirst } = require('./helpers');
const runFree = () => { localStorage.setItem('iv_mig3', 'true'); localStorage.setItem('iv_tpl_final', 'true');
  localStorage.setItem('iv_plans', JSON.stringify([{ id: 'f1', kind: 'run', name: 'Frei', goal: 'free', pace: 0 }, { id: 'c1', kind: 'race', name: 'Zehner', dist: '10k', km: 10, time: 3000 }])); };
// Bildschirm aus/an simulieren
const hide = (pg, hidden) => pg.evaluate(h => { Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);

exports['Bildschirm 3 min aus: Zeit läuft weiter, Lücke wird vermerkt'] = async b => {
  const pg = await newPage(b, { init: runFree });
  await startFirst(pg, 'run');
  await sim(pg, 900, 300);
  await hide(pg, true);
  // 180 s später wacht die App auf (Uhr der Engine läuft über Date.now, nicht über performance.now)
  await pg.evaluate(() => { R.hidAt -= 180000; R.last -= 180000; });
  await hide(pg, false);
  const r = await pg.evaluate(() => [Math.round(R.total), Math.round(R.gap), R.win.length, document.querySelector('#toast').hidden]);
  eq(r, [480, 180, 0, false], 'Zeit +180 s, Lücke 180 s, Pace-Fenster geleert, Hinweis sichtbar');
  ok(/Bildschirm war 3:00 aus/.test(await pg.textContent('#toast')), 'Hinweistext');
  await pg.evaluate(() => finish(true, true));
  eq(await pg.evaluate(() => runs[runs.length - 1].gap), 180, 'Lücke im Lauf gespeichert');
  ok(/Bildschirm war bei diesem Lauf insgesamt 3:00 aus/.test(await pg.textContent('#detail')), 'Hinweis in den Lauf-Details');
  eq(await pg.evaluate(() => /performance\.now/.test(tick.toString() + onPos.toString() + curPace.toString())), false, 'Engine nutzt die Wanduhr');
  noErrors(pg); await close(pg);
};

exports['GPS-Lücke über mehrere Kilometer: Splits bleiben vollständig (Lauf und Rennen)'] = async b => {
  const pg = await newPage(b, { init: runFree });
  await recordSay(pg);
  await startFirst(pg, 'run');
  await sim(pg, 1000, 330);
  await sim(pg, 4200, 1410);   // Sprung von km 1 auf km 4,2
  await pg.evaluate(() => finish(true, true));
  eq(await pg.evaluate(() => runs[runs.length - 1].log.map(l => [l.label, Math.round(l.time)])), [['Km 1', 330], ['Km 2', 360], ['Km 3', 360], ['Km 4', 360], ['Km 5 (200 m)', 0]], 'Lauf: Zeit gleichmäßig verteilt');
  ok((await said(pg)).some(x => /^km n4 tempo n6 minuten/.test(x)), 'Ansage für den letzten vollen Kilometer');
  await startFirst(pg, 'race');
  await sim(pg, 1000, 300);
  await sim(pg, 3500, 1050);   // ungerade 500-m-Marke nach Sprung: km 2 und 3 dürfen nicht fehlen
  await sim(pg, 10000, 3000);
  eq(await pg.evaluate(() => runs[runs.length - 1].log.map(l => [l.label, Math.round(l.time)])), [['Km 1', 300], ['Km 2', 375], ['Km 3', 375], ['Km 4', 1950]], 'Rennen: keine Lücke in den Kilometern');
  noErrors(pg); await close(pg);
};

exports['Ansagen: Dauer ab 60 Minuten und volle Stunde'] = async b => {
  const pg = await newPage(b);
  eq(await pg.evaluate(() => [TK.dur(5400), TK.dur(3600), TK.dur(7200), TK.dur(3540), TK.time(3600), TK.time(3605), spDur(5400), spPace(299.6)]),
    [['eene', 'stunde', 'n30'], ['eene', 'stunde'], ['n2', 'stunde'], ['n59', 'minuten'], ['eene', 'stunde'], ['eene', 'stunde', 'n0', 'n5'], '1 Stunde 30 Minuten', '5 Minuten pro Kilometer'], 'Bausteine');
  await close(pg);
};

exports['Audio-Kontext hält wieder an – auch nach übersprungener Ansage'] = async b => {
  const pg = await newPage(b);
  await pg.evaluate(async () => { audioOn(); await loadVoice(); say(['@ok']); say(['@ok'], true); });   // zweite Ansage entfällt (low)
  await pg.waitForFunction(() => ac.state === 'suspended', null, { timeout: 15000 });
  await pg.evaluate(() => { audioOn(); });                                                              // nur aufwecken, nichts abspielen
  await pg.waitForFunction(() => ac.state === 'suspended', null, { timeout: 5000 });
  noErrors(pg); await close(pg);
};

exports['GPS-Anzeige meldet fehlendes Signal'] = async b => {
  const pg = await newPage(b, { init: runFree });
  await startFirst(pg, 'run');
  await pg.waitForFunction(() => R.fixT > 0, null, { timeout: 10000 });
  await pg.evaluate(() => { R.fixT -= 20000; tick(); });
  eq(await pg.textContent('#rgps'), 'kein GPS', 'Anzeige ohne Signal');
  await pg.context().setGeolocation({ latitude: 52.5201, longitude: 13.4, accuracy: 5 });
  await pg.waitForFunction(() => document.querySelector('#rgps').textContent.startsWith('±'), null, { timeout: 10000 });
  noErrors(pg); await close(pg);
};
