// Berliner Stimme: lädt, spielt über Web Audio (liegt über der Musik), nie iOS-Sprachausgabe
const { ok, eq, newPage, close, noErrors, startFirst, recordSay, said } = require('./helpers');

exports['Stimme lädt alle Bausteine und spielt über Web Audio'] = async b => {
  const pg = await newPage(b, { init: () => {
    window.__played = []; window.__tts = 0;
    const st = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function () { __played.push(Object.keys(VB.buf).find(k => VB.buf[k] === this.buffer)); return st.apply(this, arguments); };
    speechSynthesis.speak = u => { if (u.text.trim()) __tts++; };
  } });
  await startFirst(pg, 'iv');
  await pg.waitForFunction(() => __played.length >= 4, null, { timeout: 15000 });
  const r = await pg.evaluate(() => ({ n: Object.keys(VOICE_BERLIN).length, ready: VB.ready, first: __played.slice(0, 4), tts: __tts, info: VOICE_INFO.name }));
  eq(r.n, 154, 'Anzahl Bausteine');
  ok(r.ready, 'Stimme dekodiert');
  ok(/^start_\d$/.test(r.first[0]) && r.first[1] === 'warm_1', 'erste Ansage: ' + r.first.join(' '));
  eq(r.tts, 0, 'iOS-Sprachausgabe nie benutzt (würde Spotify pausieren)');
  noErrors(pg); await close(pg);
};

exports['Bausteine für Zahlen, Distanzen, Zeiten und Tempo'] = async b => {
  const pg = await newPage(b);
  const r = await pg.evaluate(() => ({ d1200: TK.dist(1200), d450: TK.dist(450), d1000: TK.dist(1000), d21: TK.dist(21097), km: TK.km(7800), dur: TK.dur(90), p: TK.pace(245, true), t: TK.time(6305), s: TK.secs(1) }));
  eq(r, { d1200: ['t1', 'h2', 'meta'], d450: ['h4', 'n50', 'meta'], d1000: ['een', 'km'], d21: ['n21', 'komma', 'n1', 'km'], km: ['n7', 'komma', 'n8', 'km'],
    dur: ['eene', 'minute', 'n30'], p: ['tempo', 'n4', 'n5', 'prokm'], t: ['eene', 'stunde', 'n45', 'n5'], s: ['eene', 'sekunde'] }, 'Bausteine');
  const missing = await pg.evaluate(() => { audioOn(); return loadVoice().then(() => ['n0', 'n59', 'h9', 't9', 'rahead', 'rbehind', 'stunde', 'sekunde', 'nm_dauer'].filter(k => !VB.buf[k])); });
  eq(missing, [], 'fehlende Bausteine');
  await close(pg);
};

exports['Schalter „Antonia mit Namen ansprechen“ steuert die Ansprache überall'] = async b => {
  // ohne Antonia-Plan: Voreinstellung aus
  const pg = await newPage(b);
  eq(await pg.evaluate(() => [settings.antName, document.querySelector('#s-antname').checked]), [false, false], 'Voreinstellung ohne Plan');
  await recordSay(pg);
  await startFirst(pg, 'run');
  await pg.evaluate(() => finish(false));
  ok((await said(pg)).every(x => !/\ba(start|end|ok|faster|slower|h100)_/.test(x)), 'ohne Namen');
  // Schalter an → im normalen Lauf mit Namen
  await pg.evaluate(() => show('set'));
  await pg.check('#s-antname');
  eq(await pg.evaluate(() => JSON.parse(localStorage.getItem('iv_settings')).antName), true, 'gespeichert');
  await startFirst(pg, 'run');
  await pg.evaluate(() => finish(false));
  const s = (await said(pg)).join(' | ');
  ok(/astart_\d/.test(s) && /aend_\d/.test(s), 'Start und Ende mit Namen: ' + s);
  noErrors(pg); await close(pg);
  // mit Antonia-Plan auf dem Gerät: Voreinstellung an
  const pg2 = await newPage(b, { init: () => localStorage.setItem('iv_coach', JSON.stringify({ cfg: {}, sessions: [] })) });
  eq(await pg2.evaluate(() => settings.antName), true, 'Voreinstellung mit Plan');
  await close(pg2);
};
