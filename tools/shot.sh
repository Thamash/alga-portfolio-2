#!/bin/sh
# Képernyőkép headless Chrome-mal, file:// alól, a konzolüzenetekkel együtt.
# Használat: tools/shot.sh "task.html?id=collatz&n=27&step=40" kimenet.png [szélesség] [magasság]
# CHROME_FLAGS: további Chrome-kapcsolók, pl. CHROME_FLAGS=--force-prefers-reduced-motion (animációk nélkül, determinisztikus).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
W="${3:-1366}"; H="${4:-768}"
PROFILE="$(mktemp -d)"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" \
  --window-size="$W,$H" --virtual-time-budget=4000 $CHROME_FLAGS --enable-logging=stderr --v=0 \
  --screenshot="$2" "file://$ROOT/$1" 2>&1 | grep -E "CONSOLE|Uncaught|ERROR:.*(js|script)" | grep -v -E "gpu|GPU|dbus|Fontconfig" || true
rm -rf "$PROFILE"
