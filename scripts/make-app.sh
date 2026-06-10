#!/bin/zsh
# Build Newsroom.app — a native double-clickable launcher that starts the
# whole stack (backend + dashboard + staff) and opens the dashboard.
# Interim shell until the Tauri wrap (needs a Rust toolchain).
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
osacompile -o "$DIR/Newsroom.app" <<APPLESCRIPT
do shell script "/bin/zsh -lc 'cd \"$DIR\" && (nohup npm run newsroom > /tmp/newsroom.log 2>&1 &)'"
delay 4
do shell script "open http://localhost:5180"
APPLESCRIPT
echo "Built $DIR/Newsroom.app — drag to Dock if you like."
