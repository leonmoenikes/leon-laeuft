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
    'nm_dauer': 'Dauerloof', 'nm_lang': 'Langa Loof', 'nm_test': "Testloof, jetz jilt's.",
    # Sprüche – Berliner Schnauze: mürrisch, trocken, aber herzlich
    'start_1': "Na jut, denn mach ma. Los jeht's.",
    'start_2': "Ooch, schon wieda loofen? Na denn, ab jeht's.",
    'astart_1': "Na Antonia, denn mach ma. Los jeht's.",
    'astart_2': "Antonia, wat soll's. Ab jeht's.",
    'warm_1': 'Uffwärmen, janz locker, keene Hektik.',
    'cool_1': 'Ausloofen, endlich, de Arbeit is jetan.',
    'rest_1': 'Pause, ma durchschnaufen.',
    'rest_2': 'Pause, nu steh hier nich rum, trab locker.',
    'arest_1': 'Pause, Antonia, ma durchschnaufen.',
    'last_1': 'Letztet Intervall, jetz reiß dir ma zusamm.',
    'alast_1': 'Letztet Intervall, Antonia, jetz reiß dir ma zusamm.',
    'h100_1': 'Noch hundert Meta, nu mach schon, jib Jas!',
    'h100_2': 'Hundert Meta noch, det schaffste ooch.',
    'ah100_1': 'Noch hundert Meta, Antonia, jib Jas!',
    't10_1': 'Noch zehn Sekunden, mach dir bereit.',
    'faster_1': 'Mensch, schnella, det is doch keen Spaziergang.',
    'faster_2': 'Wat trödelste so rum, jib Jas!',
    'faster_3': 'Na, schläfste schon? Bisschen flotta, wa.',
    'afaster_1': "Antonia, wat is'n los? Schnella!",
    'slower_1': 'Langsam, wo willste denn hin?',
    'slower_2': 'Nich so hetzen, Mensch.',
    'slower_3': 'Immer mit de Ruhe, det is keen Wettrenn.',
    'aslower_1': 'Antonia, nich so hetzen, langsama.',
    'ok_1': 'Passt, kann man nich meckern.',
    'ok_2': 'Jo, läuft.',
    'ok_3': 'Allet im Lot, weita so.',
    'aok_1': 'Passt, Antonia, kann man nich meckern.',
    'fin_1': 'Feierabend, dit Trainin is vorbei.',
    'end_1': 'Jut jemacht, ehrlich.',
    'end_2': 'Na also, jeht doch.',
    'aend_1': 'Antonia, dit war stark, sach ick ja selten.',
    'aend_2': "Jut jemacht, Antonia, jetz ab uff's Sofa.",
    # Rennmodus (ElevenLabs Teil 5)
    'rstart_1': 'Rennen läuft. Ruhig anjehen, nich gleich allet verheizen.',
    'rstart_2': 'Na denn, Rennen. Und bloß nich zu schnell loslaufen, wa.',
    'arstart_1': 'Antonia, Rennen läuft. Ruhig anjehen, nich gleich allet verheizen.',
    'rfast_1': 'Zu schnell! Nimm ma Tempo raus, det rächt sich hinten raus.',
    'rfast_2': 'Langsam, Mensch! Det Rennen wird hinten entschieden.',
    'arfast_1': 'Antonia, zu schnell! Nimm ma Tempo raus.',
    'rslow_1': 'Du verlierst Zeit, bisschen Jas jeben.',
    'arslow_1': 'Antonia, du verlierst Zeit, bisschen Jas jeben.',
    'rahead': "vor'm Plan.",
    'rbehind': "hinter'm Plan.",
    'ron_1': 'Jenau im Plan, kann man nich meckern.',
    'ron_2': 'Im Plan, weita so.',
    'aron_1': 'Antonia, jenau im Plan.',
    'rhalf_1': 'Halbzeit.',
    'rprog': 'Hochjerechnet',
    'rlast_1': 'Letzta Kilometa! Jetz raushauen, wat noch drin is!',
    'arlast_1': 'Letzta Kilometa, Antonia! Jetz raushauen, wat noch drin is!',
    'rfin_1': 'Ziel! Dit wars.',
    'rtime': 'Endzeit',
    'rgood_1': 'Zielzeit jeknackt. Respekt, ehrlich.',
    'rgood_2': 'Unter Zielzeit. Na also, jeht doch.',
    'argood_1': 'Antonia, Zielzeit jeknackt! Dit war richtig stark.',
    'rmiss_1': 'Knapp vorbei. Nächstet Mal, wa.',
    'armiss_1': 'Knapp vorbei, Antonia. Nächstet Mal packste dit.',
    'stunde': 'Stunde',
    'sekunde': 'Sekunde',
})


# Audio-Tags für Eleven v4/v3 (nur im ElevenLabs-Skript, Piper würde sie vorlesen).
# ACCENT steht vor jeder Zeile, damit auch Zahlen und Einzelwörter berlinern;
# danach höchstens eine Stimmung pro Spruch. "cheeky" = Berliner Schnauze: frech, schnoddrig.
ACCENT = 'with a strong Berlin accent'
TAGS = {
    'nm_test': 'serious',
    'start_1': 'cheeky', 'start_2': 'sighs', 'astart_1': 'cheeky', 'astart_2': 'sighs',
    'warm_1': 'bored', 'cool_1': 'relieved',
    'rest_1': 'sighs', 'rest_2': 'cheeky', 'arest_1': 'sighs',
    'last_1': 'cheeky', 'alast_1': 'cheeky',
    'h100_1': 'annoyed', 'h100_2': 'deadpan', 'ah100_1': 'annoyed', 't10_1': 'bored',
    'faster_1': 'annoyed', 'faster_2': 'cheeky', 'faster_3': 'sarcastic', 'afaster_1': 'annoyed',
    'slower_1': 'annoyed', 'slower_2': 'cheeky', 'slower_3': 'sarcastic', 'aslower_1': 'cheeky',
    'ok_1': 'grudging', 'ok_2': 'deadpan', 'ok_3': 'cheeky', 'aok_1': 'grudging',
    'fin_1': 'relieved', 'end_1': 'grudging', 'end_2': 'deadpan', 'aend_1': 'grudging', 'aend_2': 'cheeky',
    'rstart_1': 'serious', 'rstart_2': 'cheeky', 'arstart_1': 'serious',
    'rfast_1': 'annoyed', 'rfast_2': 'cheeky', 'arfast_1': 'annoyed', 'rslow_1': 'annoyed', 'arslow_1': 'annoyed',
    'ron_1': 'grudging', 'ron_2': 'deadpan', 'aron_1': 'grudging', 'rhalf_1': 'serious',
    'rlast_1': 'annoyed', 'arlast_1': 'annoyed', 'rfin_1': 'relieved',
    'rgood_1': 'grudging', 'rgood_2': 'deadpan', 'argood_1': 'grudging', 'rmiss_1': 'sighs', 'armiss_1': 'sighs',
}


def parts():
    """Aufteilung für ElevenLabs: Teil 1-4 je 32 Bausteine (unverändert), ab Teil 5 Ergänzungen."""
    items = list(CLIPS.items())
    out = [items[i * 32:(i + 1) * 32] for i in range(4)]
    if len(items) > 128:
        out.append(items[128:])
    return out


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
        f.write('window.VOICE_INFO=' + json.dumps({'name': 'Thorsten (Piper)', 'built': __import__('datetime').date.today().isoformat()}, ensure_ascii=False) + ';\n')
    print(f'{len(data)} Clips → {out} ({os.path.getsize(out) // 1024} KB)')
    here = os.path.dirname(os.path.abspath(__file__))
    if os.path.abspath(out) == os.path.abspath(os.path.join(here, '..', 'voice.js')):
        sys.path.insert(0, here); import voice_version; voice_version.bump()


if __name__ == '__main__':
    main()
