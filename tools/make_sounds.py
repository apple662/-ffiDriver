#!/usr/bin/env python3
"""Erzeugt die Türwarntöne in ``sounds/`` (WAV, nur Python-Standardbibliothek).

Die Töne sind den Berliner Fahrzeugen nachempfunden, keine Originalaufnahmen:

- S-Bahn:  schnelle, helle Piepfolge
- U-Bahn:  zweistimmiges „Dü-dü“, mehrfach wiederholt
- Tram:    Bimmel-Glocke („Ding-Ding“) und danach Pieptöne

    python3 tools/make_sounds.py
"""

import math
import struct
import wave
from pathlib import Path

RATE = 22050
OUT = Path(__file__).resolve().parent.parent / "sounds"


def tone(freq, dur, volume=0.5, harmonics=(1.0, 0.3, 0.15)):
    """Ton mit weichem Ein- und Ausschwingen (keine Knackser)."""
    n = int(RATE * dur)
    fade = min(int(RATE * 0.008), n // 2)
    out = []
    for i in range(n):
        t = i / RATE
        v = sum(a * math.sin(2 * math.pi * freq * (k + 1) * t) for k, a in enumerate(harmonics))
        env = min(1.0, i / fade, (n - i) / fade) if fade else 1.0
        out.append(v * env * volume / sum(harmonics))
    return out


def bell(freq, dur, volume=0.7):
    """Glockenschlag: unharmonische Obertöne, die abklingen."""
    n = int(RATE * dur)
    partials = ((1.0, 1.0, 3.0), (2.76, 0.5, 5.0), (5.4, 0.25, 8.0), (8.9, 0.12, 12.0))
    out = []
    for i in range(n):
        t = i / RATE
        v = sum(a * math.exp(-d * t) * math.sin(2 * math.pi * freq * m * t) for m, a, d in partials)
        attack = min(1.0, i / (RATE * 0.002))
        out.append(v * attack * volume / 1.87)
    return out


def silence(dur):
    return [0.0] * int(RATE * dur)


def mix_in(base, add, at):
    start = int(RATE * at)
    base.extend([0.0] * max(0, start + len(add) - len(base)))
    for i, v in enumerate(add):
        base[start + i] += v
    return base


def save(name, samples):
    OUT.mkdir(exist_ok=True)
    peak = max(1.0, max(abs(v) for v in samples))
    with wave.open(str(OUT / name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(v / peak * 32000)) for v in samples))
    print("geschrieben:", OUT / name)


def sbahn():
    s = []
    for _ in range(12):
        s += tone(2350, 0.075, 0.55, (1.0, 0.25)) + silence(0.065)
    return s


def ubahn():
    s = []
    for _ in range(5):
        s += tone(1400, 0.16, 0.55) + tone(1050, 0.16, 0.55) + silence(0.08)
    return s


def tram():
    s = []
    mix_in(s, bell(1180, 1.2), 0.0)
    mix_in(s, bell(1180, 1.2), 0.38)
    for i in range(6):
        mix_in(s, tone(1600, 0.12, 0.35, (1.0, 0.2)), 1.25 + i * 0.24)
    return s


def main():
    save("sbahn.wav", sbahn())
    save("ubahn.wav", ubahn())
    save("tram.wav", tram())


if __name__ == "__main__":
    main()
