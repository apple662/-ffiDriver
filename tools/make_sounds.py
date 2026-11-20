#!/usr/bin/env python3
"""Erzeugt die Türwarntöne in ``sounds/`` (WAV, nur Python-Standardbibliothek).

Die Töne sind den Berliner Fahrzeugen nachempfunden, keine Originalaufnahmen:

- S-Bahn:  schnelle, helle Piepfolge
- U-Bahn:  zweistimmiges „Dü-dü“, mehrfach wiederholt
- Tram:    Bimmel-Glocke („Ding-Ding“) und danach Pieptöne
- Bus:     Zischen der Druckluft, wenn die Türen aufgehen, mit leisem „Klonk“
- Regio:   langsamere, hohe Doppelpieptöne wie bei Doppelstockzügen, dann Druckluft
- ICE:     Dreiklang-Gong wie am Bahnsteig, dann gleichmäßige Warnpieptöne
- Fähre:   zwei Schläge der Schiffsglocke, dann das Schiffshorn („Tuuut – tut“)
- Schiff:  tiefes Typhon eines Kreuzfahrtschiffs („Tuuuuut – tuuut“)
- Flug:    „Ding-Dong“ wie in der Kabine (Anschnallzeichen)
- Jet:     Triebwerke beim Start: anschwellendes Rauschen und Heulen

    python3 tools/make_sounds.py
"""

import math
import random
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


def hiss(dur, volume=0.8, seed=7):
    """Druckluft-Zischen: hochpassgefiltertes Rauschen, das schnell einsetzt und ausklingt."""
    rnd = random.Random(seed)  # fester Startwert, damit die Datei immer gleich ist
    n = int(RATE * dur)
    out, prev, low = [], 0.0, 0.0
    for i in range(n):
        t = i / RATE
        white = rnd.uniform(-1, 1)
        high = white - prev          # Hochpass: nur das helle „Sss“ bleibt
        prev = white
        low += (high - low) * 0.55   # sanfter Tiefpass gegen zu scharfes Kratzen
        attack = min(1.0, t / 0.03)
        decay = math.exp(-2.2 * max(0.0, t - 0.15))
        flutter = 1 + 0.12 * math.sin(2 * math.pi * 9 * t)  # leichtes Flattern des Ventils
        out.append(low * attack * decay * flutter * volume)
    return out


def thud(dur=0.18, volume=0.6):
    """Dumpfer Anschlag, wenn die Tür offen einrastet."""
    n = int(RATE * dur)
    return [volume * math.exp(-28 * i / RATE) * math.sin(2 * math.pi * (95 - 120 * i / RATE) * i / RATE)
            for i in range(n)]


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


def bus():
    s = []
    mix_in(s, hiss(0.25, 0.45, seed=3), 0.0)    # kurzes „Pff“ beim Entriegeln
    mix_in(s, hiss(1.6, 0.9), 0.22)             # langes „Pssscht“ beim Öffnen
    mix_in(s, thud(), 1.05)
    return s


def regio():
    s = []
    for i in range(5):
        at = i * 0.42
        mix_in(s, tone(2900, 0.11, 0.5, (1.0, 0.2)), at)
        mix_in(s, tone(2900, 0.11, 0.5, (1.0, 0.2)), at + 0.16)
    mix_in(s, hiss(0.7, 0.35, seed=11), 2.1)     # Türen schließen mit Druckluft
    return s


def ice():
    s = []
    for i, freq in enumerate((784, 659, 523)):       # Gong: drei weiche, absteigende Töne
        mix_in(s, bell(freq, 1.1, 0.5), i * 0.36)
    for i in range(6):
        mix_in(s, tone(1900, 0.14, 0.4, (1.0, 0.25)), 1.5 + i * 0.3)
    return s


def horn(dur, volume=0.6, freq=147):
    """Schiffshorn: tiefer, voller Ton mit vielen Obertönen, weich an- und abschwellend."""
    n = int(RATE * dur)
    partials = (1.0, 0.9, 0.7, 0.5, 0.35, 0.2)
    out = []
    for i in range(n):
        t = i / RATE
        env = min(1.0, t / 0.08, (dur - t) / 0.15)
        wobble = 1 + 0.004 * math.sin(2 * math.pi * 5 * t)
        v = sum(a * math.sin(2 * math.pi * freq * wobble * (k + 1) * t) for k, a in enumerate(partials))
        out.append(v * env * volume / sum(partials))
    return out


def faehre():
    s = []
    mix_in(s, bell(1320, 0.9, 0.45), 0.0)       # Schiffsglocke: „Ding-ding“
    mix_in(s, bell(1320, 0.9, 0.45), 0.3)
    mix_in(s, horn(1.3), 1.1)                   # „Tuuut …
    mix_in(s, horn(0.45), 2.6)                  # … tut“
    return s


def schiff():
    s = []
    mix_in(s, horn(2.2, 0.7, 98), 0.0)          # tiefes Typhon: „Tuuuuut …
    mix_in(s, horn(2.2, 0.35, 147), 0.0)        # (zweiter Ton dazu, klingt voller)
    mix_in(s, horn(0.9, 0.7, 98), 2.6)          # … tuuut“
    mix_in(s, horn(0.9, 0.35, 147), 2.6)
    return s


def flug():
    s = []
    mix_in(s, bell(988, 1.2, 0.5), 0.0)      # „Ding“
    mix_in(s, bell(784, 1.4, 0.5), 0.55)     # „Dong“
    return s


def jet(dur=4.0):
    """Triebwerke laufen hoch: Rauschen wird lauter und heller, dazu ein steigendes Heulen."""
    rnd = random.Random(5)
    n = int(RATE * dur)
    out, low, prev = [], 0.0, 0.0
    phase = 0.0
    for i in range(n):
        t = i / RATE
        up = min(1.0, t / 2.5)                          # in 2,5 s auf volle Kraft
        white = rnd.uniform(-1, 1)
        low += (white - low) * (0.05 + 0.25 * up)       # Tiefpass öffnet sich: das Rauschen wird heller
        rumble = low - prev * 0.3
        prev = low
        phase += 2 * math.pi * (300 + 1500 * up) / RATE  # Heulen der Turbine
        whine = 0.12 * up * math.sin(phase)
        fade = min(1.0, t / 0.3, (dur - t) / 0.8)
        out.append((rumble * (0.4 + 0.8 * up) + whine) * fade)
    return out


def main():
    save("sbahn.wav", sbahn())
    save("ubahn.wav", ubahn())
    save("tram.wav", tram())
    save("bus.wav", bus())
    save("regio.wav", regio())
    save("ice.wav", ice())
    save("faehre.wav", faehre())
    save("schiff.wav", schiff())
    save("flug.wav", flug())
    save("jet.wav", jet())


if __name__ == "__main__":
    main()
