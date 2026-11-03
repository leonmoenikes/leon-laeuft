#!/usr/bin/env python3
"""Trägt die Versionskennung von voice.js in index.html ein (Cache-Busting).

Safari / Home-Bildschirm-Apps halten voice.js sonst im Cache. Mit
voice.js?v=<hash> lädt das iPhone die Datei neu, sobald sie sich ändert.
Wird von make_voice.py und import_elevenlabs.py automatisch aufgerufen.
"""
import hashlib, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def bump(voice=os.path.join(ROOT, 'voice.js'), index=os.path.join(ROOT, 'index.html')):
    h = hashlib.sha1(open(voice, 'rb').read()).hexdigest()[:10]
    s = open(index, encoding='utf-8').read()
    s2, n = re.subn(r'<script src="voice\.js(\?v=[0-9a-f]+)?"></script>', f'<script src="voice.js?v={h}"></script>', s)
    if n != 1:
        sys.exit('voice.js-Einbindung in index.html nicht gefunden')
    open(index, 'w', encoding='utf-8').write(s2)
    print(f'index.html → voice.js?v={h}')


if __name__ == '__main__':
    bump()
