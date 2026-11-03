#!/usr/bin/env python3
"""Erzeugt die ElevenLabs-Skripte aus tools/make_voice.py (CLIPS + TAGS).

  python3 tools/make_elevenlabs_script.py

- elevenlabs-skript.txt     Multilingual v2: exakte <break>-Pausen, ohne Audio-Tags
- elevenlabs-skript-v4.txt  Eleven v4/v3: Audio-Tags für die Stimmung, Pausen über
                            Zeilenumbrüche und [long pause]

Reihenfolge und Aufteilung (4 Teile à 32) müssen beim Import gleich bleiben.
"""
import importlib.util, os, sys
sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('mv', os.path.join(HERE, 'make_voice.py'))
mv = importlib.util.module_from_spec(spec); spec.loader.exec_module(mv)

PARTS = 4
items = list(mv.CLIPS.items())
size = -(-len(items) // PARTS)
blocks = [items[i * size:(i + 1) * size] for i in range(PARTS)]


def write(name, head, fmt, sep):
    out = head[:]
    for i, b in enumerate(blocks, 1):
        out += [f'TEIL {i} von {PARTS}  ({len(b)} Sätze)', '-' * 60, sep.join(fmt(k, t) for k, t in b), '-' * 60, '']
    with open(os.path.join(HERE, name), 'w') as f:
        f.write('\n'.join(out) + '\n')


COMMON = ['', 'So geht es:',
          '1. Gleiche Stimme und Einstellungen für alle 4 Teile.',
          '2. Jeden Teil komplett (alles zwischen den Strichlinien) einfügen, erzeugen, als MP3 herunterladen.',
          '3. Dateien benennen: teil1.mp3 … teil4.mp3 – und hochladen.', '',
          'Wichtig: Nichts umstellen oder weglassen – die Zuordnung erfolgt über die Reihenfolge.', '']

write('elevenlabs-skript.txt',
      ['ElevenLabs-Skript für Eleven Multilingual v2 (mit exakten Pausen)',
       '=================================================================', '',
       'Modell "Eleven Multilingual v2" wählen – nur dieses versteht die <break>-Pausen.',
       'Für Eleven v4 bitte elevenlabs-skript-v4.txt verwenden.'] + COMMON,
      lambda k, t: t, ' <break time="1.5s" /> ')

write('elevenlabs-skript-v4.txt',
      ['ElevenLabs-Skript für Eleven v4 / v3 (mit Audio-Tags)',
       '=====================================================', '',
       'Die [Tags] in eckigen Klammern steuern die Stimmung (mürrisch, genervt, trocken …)',
       'und werden nicht mitgesprochen. [long pause] sorgt für den Abstand zwischen den Sätzen.',
       'Tipp: Den Stabilitäts-Regler eher niedrig stellen ("Creative"), dann setzt',
       'v4 die Stimmungen stärker um.'] + COMMON,
      lambda k, t: (f'[{mv.TAGS[k]}] ' if k in mv.TAGS else '') + t + ' [long pause]', '\n\n')
print('ok')
