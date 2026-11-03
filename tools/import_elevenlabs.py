#!/usr/bin/env python3
"""Importiert die ElevenLabs-Aufnahmen (teil1..4.mp3) als Sprach-Bausteine (voice.js).

  python3 tools/import_elevenlabs.py teil1.mp3 teil2.mp3 teil3.mp3 teil4.mp3 \
      --out voice.js [--check] [--clips ORDNER]

Jeder Teil enthält 32 Sätze in der Reihenfolge aus make_voice.CLIPS
(siehe make_elevenlabs_script.py). Die Schnittstellen werden so gewählt,
dass die Pausen möglichst lang sind UND jeder Abschnitt ungefähr so lang
ist, wie sein Text erwarten lässt (dynamische Programmierung). So werden
auch kurze Pausen zwischen Sätzen sicher von Pausen innerhalb eines
Spruchs unterschieden.

--check  nur analysieren und die Zuordnung ausgeben, nichts schreiben
--clips  zusätzlich jeden Baustein als MP3 in diesen Ordner schreiben

Benötigt: numpy, ffmpeg.
"""
import argparse, base64, importlib.util, json, math, os, re, subprocess, sys, tempfile
import numpy as np

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('mv', os.path.join(HERE, 'make_voice.py'))
mv = importlib.util.module_from_spec(spec); spec.loader.exec_module(mv)

SR, HOP = 16000, 160          # Analyse: 16 kHz, 10-ms-Raster
PER_PART = 32
# Gleiche Klangbearbeitung wie bei Thorsten: setzt sich gegen Musik durch (~ -12 LUFS)
MASTER = ('highpass=f=90,equalizer=f=3000:t=q:w=1.1:g=3,'
          'dynaudnorm=f=150:g=15:p=0.9,'
          'acompressor=threshold=-26dB:ratio=5:attack=3:release=50:makeup=5,'
          'volume=8dB,alimiter=limit=0.79:attack=2:release=40:level=false')


def load(path):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def weight(text):
    """Grobe Sprechdauer eines Textes: Silben ~ Vokalgruppen, Satzzeichen = kurze Pausen."""
    t = text.lower()
    syl = len(re.findall(r'[aeiouäöüy]+', t))
    return syl + 1.5 * len(re.findall(r'[.,!?]', t[:-1])) + 0.5


def segment(x, texts):
    n = len(texts)
    fr = len(x) // HOP
    db = 20 * np.log10(np.sqrt(np.mean(x[:fr * HOP].reshape(fr, HOP) ** 2, axis=1)) + 1e-9)
    peak = np.percentile(db, 99)
    thr = max(np.percentile(db, 8) + 10, peak - 38)
    sil = db < thr
    # stille Läufe (frame-Indizes)
    runs, i = [], 0
    while i < fr:
        if sil[i]:
            j = i
            while j < fr and sil[j]:
                j += 1
            runs.append((i, j)); i = j
        else:
            i += 1
    s0 = runs[0][1] if runs and runs[0][0] == 0 else 0
    e0 = runs[-1][0] if runs and runs[-1][1] == fr else fr
    cand = [(a, b) for a, b in runs if a > s0 and b < e0 and b - a >= 8]   # >= 80 ms
    w = np.array([weight(t) for t in texts])
    speech = (e0 - s0) - sum(b - a for a, b in cand)
    rate = speech / w.sum()                     # Frames pro Gewichtseinheit
    exp = w * rate
    # DP: wähle n-1 Lücken aus cand (geordnet)
    m = len(cand)
    if m < n - 1:
        raise SystemExit(f'Nur {m} Pausen gefunden, {n - 1} benötigt.')
    gl = np.array([b - a for a, b in cand], dtype=float)
    INF = 1e18
    def seg_cost(k, start, end):
        dur = max(1, end - start)
        r = math.log(dur / exp[k])
        return 6.0 * r * r
    gapbonus = lambda g: -2.0 * math.log1p(g / 10)   # längere Lücke = besser
    # dp[k][j]: Satz k endet an Lücke j (k = 0..n-2)
    dp = np.full((n - 1, m), INF); bp = np.full((n - 1, m), -1, dtype=int)
    for j in range(m):
        dp[0][j] = seg_cost(0, s0, cand[j][0]) + gapbonus(gl[j])
    for k in range(1, n - 1):
        for j in range(k, m):
            best, arg = INF, -1
            for p in range(k - 1, j):
                if dp[k - 1][p] >= INF:
                    continue
                c = dp[k - 1][p] + seg_cost(k, cand[p][1], cand[j][0])
                if c < best:
                    best, arg = c, p
            if arg >= 0:
                dp[k][j] = best + gapbonus(gl[j]); bp[k][j] = arg
    tot = [dp[n - 2][j] + seg_cost(n - 1, cand[j][1], e0) for j in range(m)]
    j = int(np.argmin(tot)); sel = []
    for k in range(n - 2, -1, -1):
        sel.append(j); j = bp[k][j]
    sel.reverse()
    bounds, prev = [], s0
    for j in sel:
        bounds.append((prev, cand[j][0], gl[j])); prev = cand[j][1]
    bounds.append((prev, e0, 0))
    chosen = set(sel)
    longest_unused = max([gl[j] for j in range(m) if j not in chosen] or [0])
    return [(a * HOP / SR, b * HOP / SR, g * HOP / SR, exp[k] * HOP / SR) for k, (a, b, g) in enumerate(bounds)], \
        min(gl[sel]) * HOP / SR, longest_unused * HOP / SR


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('parts', nargs=4)
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'voice.js'))
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--clips')
    a = ap.parse_args()
    items = list(mv.CLIPS.items())
    assert len(items) == 4 * PER_PART, len(items)
    data, warn = {}, 0
    for pi, path in enumerate(a.parts):
        block = items[pi * PER_PART:(pi + 1) * PER_PART]
        segs, min_used, max_unused = segment(load(path), [t for k, t in block])
        print(f'\n=== Teil {pi + 1}: {os.path.basename(path)}  (kürzeste gewählte Pause {min_used:.2f}s, '
              f'längste ungenutzte {max_unused:.2f}s)')
        for (k, t), (s, e, g, ex) in zip(block, segs):
            r = (e - s) / ex
            flag = '  <-- prüfen' if r < 0.55 or r > 1.8 else ''
            warn += bool(flag)
            print(f'{k:10s} {s:6.2f}-{e:6.2f}s  {e - s:4.2f}s (erw. {ex:4.2f}s, x{r:4.2f})  Pause danach {g:4.2f}s  {t[:40]}{flag}')
            if not a.check:
                with tempfile.NamedTemporaryFile(suffix='.mp3') as tf:
                    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{max(0, s - 0.04):.3f}', '-to', f'{e + 0.06:.3f}',
                                    '-i', path, '-af', 'afade=t=in:d=0.01,' + MASTER, '-ac', '1', '-ar', '22050', '-b:a', '48k', tf.name], check=True)
                    b = open(tf.name, 'rb').read()
                    data[k] = base64.b64encode(b).decode()
                    if a.clips:
                        os.makedirs(a.clips, exist_ok=True); open(os.path.join(a.clips, k + '.mp3'), 'wb').write(b)
    print(f'\n{warn} Abschnitte mit auffälliger Länge.')
    if not a.check:
        with open(a.out, 'w') as f:
            f.write('/* Berliner Sprachansagen – ElevenLabs-Aufnahmen, importiert mit tools/import_elevenlabs.py. Nicht von Hand bearbeiten. */\n')
            f.write('window.VOICE_BERLIN=' + json.dumps(data, separators=(',', ':')) + ';\n')
        print(f'{len(data)} Clips → {a.out} ({os.path.getsize(a.out) // 1024} KB)')


if __name__ == '__main__':
    main()
