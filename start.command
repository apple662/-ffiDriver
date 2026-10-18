#!/bin/bash
# Doppelklick im Finder startet "Berlin fährt!"
cd "$(dirname "$0")"
exec python3 bahnfahren.py
