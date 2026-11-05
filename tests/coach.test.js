// Planung (früher Antonia-Modus): Plan, Abhaken, Mitlernen, Verschieben
const { ok, eq, newPage, close, noErrors } = require('./helpers');
const setup = () => { localStorage.setItem('iv_mig3', 'true'); };

exports['Plan: Aufbau mit Formwoche und Testlauf'] = async b => {
  const pg = await newPage(b);
  const r = await pg.evaluate(() => { const s = genCoach({ goal: '10k', time: 3000, cur: 3150, per: 3, weeks: 10, days: [1, 3, 6], start: '2026-11-09' });
    return { n: s.length, last: s.slice(-3).map(x => x.kind), phases: [...new Set(s.map(x => x.phase))], rec: s.filter(x => x.rec).length,
      test: fmtPace(s[s.length - 1].plan.sets[0].pace), firstInt: s.find(x => x.kind === 'int').plan.sets[0].pace, lastInt: s.filter(x => x.kind === 'int').pop().plan.sets[0].pace }; });
  eq([r.n, r.last, r.phases, r.test], [30, ['sharp', 'easy', 'test'], ['base', 'build', 'peak', 'taper'], '5:00'], 'Plan');
  ok(r.rec >= 3, 'Erholungswochen vorhanden');
  ok(r.lastInt < r.firstInt, 'Tempi werden mit Bestzeit Woche für Woche schneller');
  await close(pg);
};

exports['Erledigte Einheit wird abgehakt, Testlauf startet im Rennmodus'] = async b => {
  const pg = await newPage(b, { init: setup });
  await pg.evaluate(() => { const cfg = { goal: '10k', time: 3000, cur: 0, per: 3, weeks: 10, days: [1, 3, 6], start: '2026-11-09' }; coach = { cfg, sessions: genCoach(cfg) }; saveCoach(); startSess('s0_2'); });
  await pg.click('#runwait .btn.fill');
  await pg.evaluate(() => { R.stepDist = R.steps[0].dist; R.totalDist = R.stepDist; R.stepTime = R.total = 3000; tick(); });
  const r = await pg.evaluate(() => { const s = coach.sessions.find(x => x.id === 's0_2'); return [!!s.done, runs[runs.length - 1].kind]; });
  eq(r, [true, 'coach'], 'Einheit erledigt');
  await pg.evaluate(() => { show('coach'); startSess(coach.sessions.find(s => s.kind === 'test').id); });
  eq(await pg.evaluate(() => [!!R.race, R.race.ant, R.kind]), [true, true, 'coach'], 'Testlauf als Rennen mit Antonia');
  noErrors(pg); await close(pg);
};

exports['Plan lernt mit, Einheiten verschieben, Neuberechnung behält alles'] = async b => {
  const pg = await newPage(b, { init: setup });
  const r = await pg.evaluate(() => {
    const cfg = { goal: '10k', time: 3000, cur: 0, per: 3, weeks: 10, days: [1, 3, 6], start: ymd(mondayOf(new Date(Date.now() - 21 * 864e5))) };
    coach = { cfg, sessions: genCoach(cfg), adj: 0, adjAt: null };
    coach.sessions.filter(s => QUAL.includes(s.kind)).slice(0, 3).forEach((s, i) => { const id = 'rq' + i, log = [];
      s.plan.sets.forEach(x => { for (let j = 0; j < x.reps; j++) log.push({ type: 'run', label: 'I', target: x.pace, tdist: x.dist, dist: x.dist, time: (x.pace - 8) * x.dist / 1000 }); });
      runs.push({ id, kind: 'coach', date: new Date().toISOString(), name: s.title, time: 600, dist: 3000, pace: 300, log }); s.done = { run: id, date: new Date(Date.now() - (3 - i) * 1000).toISOString() }; });
    saveCoach(); saveHist(); const a = coachAdvice(); return a && { mean: Math.round(a.mean), adj: a.adj }; });
  eq(r, { mean: -8, adj: -4 }, 'Vorschlag nach 3 schnellen Einheiten');
  await pg.evaluate(() => show('coach'));
  await pg.click('.advice .btn.fill');
  eq(await pg.evaluate(() => [coach.adj, coachAdvice(), coach.sessions.find(s => s.kind === 'test').plan.sets[0].pace]), [-4, null, 300], 'Anpassung übernommen, Testlauf bleibt');
  const d = await pg.evaluate(() => { const s = coach.sessions.filter(s => !s.done).sort((a, b) => sessDate(a) - sessDate(b))[0]; openSess(s.id); return [s.id, ymd(sessDate(s))]; });
  await pg.click('text=Einen Tag später');
  const end0 = await pg.evaluate(() => ymd(sessDate(coach.sessions[coach.sessions.length - 1])));
  await pg.click('text=Ab hier alles eine Woche später');
  const r2 = await pg.evaluate(([id, end0]) => { const s = coach.sessions.find(x => x.id === id), e = sessDate(coach.sessions[coach.sessions.length - 1]);
    return [s.off, Math.round((e - parseYmd(end0)) / 864e5)]; }, [d[0], end0]);
  eq(r2, [8, 7], 'verschoben (1 Tag + 1 Woche), Plan endet eine Woche später');
  await pg.evaluate(() => { show('coach'); cf = newCf(); createCoach(); });
  eq(await pg.evaluate(() => [coach.adj, coach.sessions.filter(s => s.done).length, coach.sessions.some(s => s.off)]), [-4, 3, true], 'Neuberechnung behält Anpassung, Erledigtes, Verschiebungen');
  noErrors(pg); await close(pg);
};

exports['Reiter heißt „Planung“; späterer Plan schaltet die Namens-Ansprache nicht um'] = async b => {
  const pg = await newPage(b, { init: setup });
  eq(await pg.textContent('.tabbar button[data-v=coach]'), 'Planung', 'Reiter');
  await pg.evaluate(() => show('coach'));
  eq(await pg.textContent('#coachbody .large'), 'Planung', 'Überschrift');
  eq(await pg.evaluate(() => settings.antName), false, 'ohne Plan: kein Name');
  await pg.evaluate(() => { cf = newCf(); createCoach(); });
  await pg.reload();
  eq(await pg.evaluate(() => [settings.antName, HK.coach.t]), [false, 'Planung'], 'nach Plan-Erstellung weiterhin kein Name');
  noErrors(pg); await close(pg);
};
