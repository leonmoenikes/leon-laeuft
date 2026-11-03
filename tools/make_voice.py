#!/usr/bin/env python3
"""Erzeugt die Berliner Sprachansagen (voice.js) für die Intervall-App.

Die Ansagen werden aus kurzen Bausteinen (Zahlen, Wörter, Sprüche)
zusammengesetzt und in der App über Web Audio abgespielt. Dadurch mischen
sie sich mit Musik (Spotify & Co.), statt sie wie die iOS-Sprachausgabe
zu pausieren.

Voraussetzungen:
  pip install piper-tts
  ffmpeg
  Stimme "de-thorsten-low" (onnx + onnx.json), z. B. aus
  https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-de-thorsten-low.tar.gz

Aufruf:
  python3 tools/make_voice.py PFAD/de-thorsten-low.onnx voice.js

Sprüche ändern: einfach unten in CLIPS anpassen und neu erzeugen.
Varianten heißen name_1, name_2 … – die App wählt zufällig.
Varianten mit vorangestelltem "a" (z. B. afaster_1) sprechen Antonia
mit Namen an und werden im Antonia-Modus bevorzugt.
"""
import base64, json, os, subprocess, sys, tempfile, wave

UNITS = {1: 'een', 2: 'zwee', 3: 'drei', 4: 'vier', 5: 'fünf', 6: 'sechs', 7: 'siebn', 8: 'acht', 9: 'neun'}
BASE = {0: 'null', 1: 'eens', 2: 'zwee', 3: 'drei', 4: 'vier', 5: 'fünf', 6: 'sechs', 7: 'siebn', 8: 'acht', 9: 'neun',
        10: 'zehn', 11: 'elf', 12: 'zwölf', 13: 'dreizehn', 14: 'vierzehn', 15: 'fuffzehn', 16: 'sechzehn',
        17: 'siebzehn', 18: 'achtzehn', 19: 'neunzehn'}
TENS = {2: 'zwanzig', 3: 'dreißig', 4: 'vierzig', 5: 'fuffzig'}


def zahl(n):
    if n in BASE:
        return BASE[n]
    t, u = divmod(n, 10)
    return TENS[t] if u == 0 else f'{UNITS[u]}und{TENS[t]}'


CLIPS = {f'n{i}': zahl(i) for i in range(60)}
CLIPS.update({'een': 'een', 'eene': 'eene'})
CLIPS.update({f'h{i}': ('hundert' if i == 1 else f'{BASE[i]}hundert') for i in range(1, 10)})
CLIPS.update({f't{i}': ('tausend' if i == 1 else f'{BASE[i]}tausend') for i in range(1, 10)})
CLIPS.update({
    'von': 'von', 'meta': 'Meta', 'km': 'Kilometa', 'komma': 'Komma', 'tempo': 'Tempo',
    'minuten': 'Minuten', 'minute': 'Minute', 'sekunden': 'Sekunden', 'prokm': 'pro Kilometa',
    # Namen der Abschnitte
    'nm_iv': 'Intervall', 'nm_sprint': 'Sprint', 'nm_tempo': 'Tempo', 'nm_ziel': 'Zieltempo',
    'nm_dauer': 'Dauerloof', 'nm_lang': 'Langa Loof', 'nm_test': "Testloof. Jetz jilt's!",
    # Sprüche
    'start_1': "Na, denn wolln wa ma! Los jeht's!",
    'start_2': "Uff jeht's, ab jeht's!",
    'astart_1': "Na Antonia, denn wolln wa ma! Los jeht's!",
    'astart_2': "Hallo Antonia! Uff jeht's, ab jeht's!",
    'warm_1': 'Uffwärmen. Janz locker einloofen.',
    'cool_1': 'Ausloofen. Schön locker, de Arbeit is jetan.',
    'rest_1': 'Pause. Ma schön durchschnaufen.',
    'rest_2': 'Pause. Kurz verschnaufen.',
    'arest_1': 'Pause, Antonia. Ma schön durchschnaufen.',
    'last_1': 'Letztet Intervall! Jetz noch ma allet jeben!',
    'alast_1': 'Letztet Intervall, Antonia! Jetz noch ma allet jeben!',
    'h100_1': 'Noch hundert Meta! Jib Jas!',
    'h100_2': 'Noch hundert Meta! Endspurt, Keule!',
    'ah100_1': 'Noch hundert Meta, Antonia! Jib Jas!',
    't10_1': 'Noch zehn Sekunden. Mach dir bereit!',
    'faster_1': 'Etwas schnella! Det jeht noch!',
    'faster_2': 'Mehr Jas, nich trödeln!',
    'faster_3': 'Hopp hopp, bisschen flotta!',
    'afaster_1': 'Antonia, bisschen schnella! Det jeht noch!',
    'slower_1': 'Etwas langsama! Nich so hetzen!',
    'slower_2': 'Immer mit de Ruhe, wa!',
    'slower_3': 'Nu ma langsam mit de jungen Pferde!',
    'aslower_1': 'Antonia, nich so hetzen! Etwas langsama!',
    'ok_1': 'Passt. Allet jut!',
    'ok_2': 'Läuft wie jeschmiert!',
    'ok_3': 'Allet im Lot, weita so!',
    'aok_1': 'Passt, Antonia. Allet jut!',
    'fin_1': 'Feierabend! Dit Trainin is vorbei.',
    'end_1': 'Jut jemacht!',
    'end_2': 'Dit war stark, Keule!',
    'aend_1': 'Jut jemacht, Antonia! Dit war stark!',
    'aend_2': 'Super, Antonia! Ick bin stolz uff dir!',
})


def synth(model, text, out_wav):
    from piper import PiperVoice
    global _voice
    if '_voice' not in globals():
        _voice = PiperVoice.load(model)
    with wave.open(out_wav, 'wb') as w:
        _voice.synthesize_wav(text, w)


def main():
    model, out = sys.argv[1], sys.argv[2]
    data = {}
    with tempfile.TemporaryDirectory() as td:
        for key, text in CLIPS.items():
            raw, mp3 = os.path.join(td, key + '.wav'), os.path.join(td, key + '.mp3')
            synth(model, text, raw)
            # Stille vorn/hinten entfernen, dann auf "setzt sich gegen Musik durch" trimmen:
            # Bass raus, Präsenz (3 kHz) anheben, kräftig komprimieren, Pegel angleichen, Limiter.
            # Ergebnis ca. -11 LUFS (Spotify spielt mit -14 LUFS), Spitzen unter -2 dBFS.
            af = ('silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
                  'silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
                  'highpass=f=110,equalizer=f=3000:t=q:w=1.1:g=5,equalizer=f=250:t=q:w=1:g=-3,'
                  'dynaudnorm=f=150:g=15:p=0.9,'
                  'acompressor=threshold=-26dB:ratio=6:attack=3:release=50:makeup=6,'
                  'volume=9dB,alimiter=limit=0.79:attack=2:release=40:level=false')
            subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', raw, '-af', af,
                            '-ac', '1', '-ar', '16000', '-b:a', '40k', mp3], check=True)
            with open(mp3, 'rb') as f:
                data[key] = base64.b64encode(f.read()).decode()
            print(f'{key:10s} {text}')
    with open(out, 'w') as f:
        f.write('/* Berliner Sprachansagen – erzeugt mit tools/make_voice.py (Stimme: Piper de-thorsten-low). Nicht von Hand bearbeiten. */\n')
        f.write('window.VOICE_BERLIN=' + json.dumps(data, separators=(',', ':')) + ';\n')
    print(f'{len(data)} Clips → {out} ({os.path.getsize(out) // 1024} KB)')


if __name__ == '__main__':
    main()
