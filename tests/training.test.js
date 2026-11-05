// Training-Reiter, die drei Trainingsarten und die Lauf-Engine
const { ok, eq, newPage, close, noErrors, recordSay, said, sim, startFirst } = require('./helpers');

exports['Umstellung alter Daten (v3): Intervalle bleiben, Rennen wird Vorlage'] = async b => {
  const pg = await newPage(b, { init: () => { if (sessionStorage.x) return; sessionStorage.x = 1;
    localStorage.setItem('iv_plans', JSON.stringify([{ id: 'p1', name: '5 × 1000 m', warm: 10, cool: 5, sets: [{ reps: 5, dist: 1000, pace: 240, rest: 120 }] }]));
    localStorage.setItem('iv_race', JSON.stringify({ dist: 'hm', km: 10, time: 6300, ant: true })); } });
  const p = await pg.evaluate(() => plans.map(p => [p.kind, p.name, p.dist || null, p.time || null, p.ant || false]));
  eq(p, [['run', 'Lockerer Lauf', 8000, null, false], ['iv', '5 × 1000 m', null, null, false], ['iv', 'Finale Vorbereitung', null, null, false], ['race', 'Halbmarathon auf Zeit', 'hm', 6300, true]], 'Vorlagen nach Umstellung');
  await pg.reload();
  eq(await pg.evaluate(() => plans.length), 4, 'Umstellung läuft nur einmal');
  noErrors(pg); await close(pg);
};

exports['Editor: Lauf mit Distanz und Zieltempo speichern'] = async b => {
  const pg = await newPage(b);
  await pg.evaluate(() => setKind('run'));
  await pg.click('#newbtn');
  await pg.click('.segc button:has-text("Distanz")');
  await pg.locator('label:has-text("Zieltempo") input').check();
  await pg.click('text=Sichern');
  const r = await pg.evaluate(() => plans.filter(p => p.kind === 'run').pop());
  eq([r.goal, r.dist, r.pace], ['dist', 8000, 330], 'gespeicherter Lauf');
  ok(await pg.isVisible('#plans .pk-run'), 'Karte im Training sichtbar');
  noErrors(pg); await close(pg);
};

exports['Lauf mit Dauerziel: km-Ansagen mit Tempo-Hinweis, Halbzeit, Ende nach Zeit'] = async b => {
  const pg = await newPage(b, { init: () => { localStorage.setItem('iv_mig3', 'true'); localStorage.setItem('iv_kind', '"run"');
    localStorage.setItem('iv_plans', JSON.stringify([{ id: 'r1', kind: 'run', name: 'Feierabendrunde', goal: 'time', dur: 30, pace: 330 }])); } });
  await recordSay(pg);
  await startFirst(pg, 'run');
  for (const [d, t] of [[1000, 312], [2000, 640], [2900, 905], [3000, 940], [4000, 1290], [5000, 1650], [5440, 1800]]) await sim(pg, d, t);
  const s = (await said(pg)).join(' | ');
  ok(/^start_\d \| #beep nm_dauer n30 minuten tempo n5 n30 prokm/.test(s), 'Start-Ansage: ' + s.slice(0, 80));
  ok(/km n1 tempo n5 n12 slower_\d/.test(s), 'km 1 zu schnell → langsamer');
  ok(/km n2 tempo n5 n28 ok_\d/.test(s), 'km 2 im Ziel → passt');
  ok(/rhalf_1/.test(s), 'Halbzeit');
  ok(/km n4 tempo n5 n50 faster_\d/.test(s), 'km 4 zu langsam → schneller');
  ok(/fin_1 n5 komma n4 km end_\d/.test(s), 'Ende nach 30 min');
  const r = await pg.evaluate(() => runs[runs.length - 1]);
  eq([r.kind, r.log.map(l => l.label)], ['run', ['Km 1', 'Km 2', 'Km 3', 'Km 4', 'Km 5', 'Km 6 (440 m)']], 'Verlauf mit km-Splits');
  noErrors(pg); await close(pg);
};

exports['Freier Lauf: zwei Knöpfe, kein Überspringen, grüne Farbe'] = async b => {
  const pg = await newPage(b, { init: () => { localStorage.setItem('iv_mig3', 'true');
    localStorage.setItem('iv_plans', JSON.stringify([{ id: 'f1', kind: 'run', name: 'Frei', goal: 'free', pace: 0 }])); } });
  await startFirst(pg, 'run');
  await sim(pg, 1200, 400);
  eq(await pg.locator('.ctl .cbtn').count(), 2, 'Anzahl Bedienknöpfe');
  ok(!(await pg.isVisible('#rskip')), 'Überspringen ausgeblendet');
  eq(await pg.getAttribute('#v-run', 'data-k'), 'run', 'Farbschema Lauf');
  eq(await pg.textContent('#rstep'), 'Lauf', 'Überschrift');
  await pg.click('.ctl .cbtn:has-text("Beenden")');
  eq(await pg.evaluate(() => runs[runs.length - 1].log.map(l => l.label)), ['Km 1', 'Km 2 (200 m)'], 'km-Splits');
  noErrors(pg); await close(pg);
};

exports['Intervalle: Überspringen in der Danach-Karte, Zeitüberlauf zählt weiter'] = async b => {
  const pg = await newPage(b);
  await startFirst(pg, 'iv');
  await sim(pg, 0, 600); // Warm-up vorbei
  ok(await pg.isVisible('#rskip'), 'Überspringen sichtbar');
  await pg.click('#rskip');
  eq(await pg.evaluate(() => R.steps[R.i].type), 'rest', 'nach Überspringen: Pause');
  // Bildschirm war 150 s aus, Pause dauert 120 s → 30 s im nächsten Intervall
  const r = await pg.evaluate(() => { R.stepTime = 0; R.last = performance.now() - 150000; tick(); return [R.steps[R.i].type, Math.round(R.stepTime)]; });
  eq(r, ['run', 30], 'Überlauf');
  noErrors(pg); await close(pg);
};

exports['Vorlage „Finale Vorbereitung“: 3 km locker + 3 Steigerungen, passende Ansagen'] = async b => {
  const pg = await newPage(b);
  const p = await pg.evaluate(() => { const p = plans.find(x => x.id === 'p-final'); return { kind: p.kind, steps: buildSteps(p).map(s => s.label + (s.dist ? ' ' + s.dist : ' ' + s.dur)) }; });
  eq(p, { kind: 'iv', steps: ['Dauerlauf 3000', 'Pause 60', 'Steigerung 1/3 80', 'Pause 60', 'Steigerung 2/3 80', 'Pause 60', 'Steigerung 3/3 80'] }, 'Ablauf');
  await recordSay(pg);
  await pg.evaluate(() => { setKind('iv'); show('home'); });
  await pg.click('#plans .group:has-text("Finale Vorbereitung") .play');
  await pg.click('#runwait .btn.fill');
  await sim(pg, 1000, 390);                         // km 1 im lockeren Tempo
  await sim(pg, 3000, 1170); await sim(pg, 0, 60);  // Ende Dauerlauf, Pause vorbei
  await pg.evaluate(() => { R.stepDist = 80; tick(); R.stepTime = 60; R.last = performance.now(); tick(); R.stepDist = 80; tick(); });
  const s = (await said(pg)).join(' | ');
  ok(/#beep nm_dauer n3 km tempo n6 n30 prokm/.test(s), 'Start: Dauerlauf 3 km @ 6:30: ' + s.slice(0, 90));
  ok(/#beep nm_sprint n1 von n3 tempo n5 minuten prokm/.test(s), 'Steigerung ohne falsche Distanz-Zahl: ' + s);
  ok(!/last_\d/.test(s), 'kein „Letztet Intervall … reiß dir ma zusamm“');
  ok(!/n59 meta/.test(s), 'keine falsche „neunundfuffzig Meta“');
  await pg.reload();
  eq(await pg.evaluate(() => plans.filter(p => p.id === 'p-final').length), 1, 'Vorlage nur einmal angelegt');
  noErrors(pg); await close(pg);
};

exports['Neuinstallation: alle Vorlagen haben eindeutige IDs, doppelte werden repariert'] = async b => {
  const pg = await newPage(b);
  const ids = await pg.evaluate(() => plans.map(p => p.id));
  eq(new Set(ids).size, ids.length, 'IDs eindeutig');
  // alter Zustand mit doppelter ID wird beim Start repariert
  await pg.evaluate(() => { const p = JSON.parse(localStorage.getItem('iv_plans')); p[1].id = p[0].id; localStorage.setItem('iv_plans', JSON.stringify(p)); });
  await pg.reload();
  const ids2 = await pg.evaluate(() => plans.map(p => p.id));
  eq(new Set(ids2).size, ids2.length, 'doppelte ID repariert');
  noErrors(pg); await close(pg);
};
