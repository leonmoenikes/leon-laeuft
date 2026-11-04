// Rennmodus: Einteilung, Ansagen, Km-Schild, Ziel, Distanz-Kalibrierung
const { ok, eq, newPage, close, noErrors, recordSay, said, sim, startFirst } = require('./helpers');
const race5k = () => { localStorage.setItem('iv_mig3', 'true');
  localStorage.setItem('iv_plans', JSON.stringify([{ id: 'c1', kind: 'race', name: 'Stadtlauf', dist: '5k', km: 5, time: 1500, ant: false }, { id: 'c2', kind: 'race', name: 'Zehner', dist: '10k', km: 10, time: 3000, ant: false }])); };

exports['Renneinteilung: Negativ-Split ergibt genau die Zielzeit'] = async b => {
  const pg = await newPage(b);
  const r = await pg.evaluate(() => [[10000, 3000], [5000, 1500], [21097.5, 6300]].map(([D, T]) => { const s = raceSplits(D, T); return [fmtPace(s[0].pace), fmtPace(s[s.length - 1].pace), Math.round(s[s.length - 1].cum)]; }));
  eq(r, [['5:05', '4:57', 3000], ['5:05', '4:57', 1500], ['5:04', '4:56', 6300]], 'Einteilung');
  await close(pg);
};

exports['Rennen: Startwarnung, Zwischenzeiten, Halbzeit, letzter km, Ziel'] = async b => {
  const pg = await newPage(b, { init: race5k });
  await recordSay(pg);
  await startFirst(pg, 'race');
  for (const [d, t] of [[500, 140], [1000, 290], [2000, 590], [2500, 740], [3000, 890], [4000, 1190], [5000, 1490]]) await sim(pg, d, t);
  const s = (await said(pg)).join(' | ');
  ok(/^#beep rstart_\d/.test(s), 'Start: ' + s.slice(0, 40));
  ok(/^#beep rstart_\d \| rfast_\d/.test(s), '500 m zu schnell → Warnung');
  ok(/km n1 n4 n50 n15 sekunden rahead rfast_\d/.test(s), 'km 1: Zwischenzeit, 15 s vor Plan, Warnung');
  ok(/rhalf_1 rprog n24 n45/.test(s), 'Halbzeit mit Hochrechnung');
  ok(/km n4 .* rlast_1/.test(s), 'letzter Kilometer');
  ok(/rfin_1 rtime n24 n50 rgood_\d/.test(s), 'Ziel mit Endzeit');
  noErrors(pg); await close(pg);
};

exports['Km-Schild gleicht ab, Ziel stoppt die Uhr, Korrektur wird vorgeschlagen'] = async b => {
  const pg = await newPage(b, { init: race5k });
  await startFirst(pg, 'race');
  await sim(pg, 4300, 1290);
  ok(await pg.isVisible('#ract'), 'Km-Schild-Taste sichtbar');
  eq(await pg.textContent('#ract'), 'Km-Schild', 'Beschriftung');
  await pg.evaluate(() => { R.rawDist = 4300; });
  await pg.click('#ract');
  eq(await pg.evaluate(() => Math.round(R.stepDist)), 4000, 'auf km 4 abgeglichen');
  await sim(pg, 4500, 1350);
  eq(await pg.textContent('#ract'), 'Ziel ✓', 'Ziel-Taste auf den letzten 600 m');
  await pg.evaluate(() => { R.rawDist = 5080; });
  await pg.click('#ract');
  const r = await pg.evaluate(() => runs[runs.length - 1]);
  eq([Math.round(r.dist), r.cal], [5000, { off: 5000, raw: 5080 }], 'Rennen beendet mit Abgleich');
  ok(await pg.isVisible('text=Distanz-Korrektur auf −1,6 % setzen'), 'Vorschlag −1,6 %');
  await pg.click('text=Distanz-Korrektur auf −1,6 % setzen');
  eq(await pg.evaluate(() => settings.corr), -1.6, 'Korrektur übernommen');
  noErrors(pg); await close(pg);
};
