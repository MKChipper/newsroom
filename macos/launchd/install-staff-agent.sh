#!/usr/bin/env bash
# Install / manage the always-on Newsroom staff workers (production Convex).
#
#   ./install-staff-agent.sh            # install + start (default)
#   ./install-staff-agent.sh status     # is it loaded? tail the log
#   ./install-staff-agent.sh restart    # kick it
#   ./install-staff-agent.sh uninstall  # stop + remove
#
# The agent runs `node agents/staff.mjs` pointed at production Convex, starting
# at login and restarting on crash. See com.deinfluenced.newsroom.staff.plist.
set -euo pipefail

LABEL="com.deinfluenced.newsroom.staff"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/$LABEL.plist"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
LOG="$HOME/Library/Logs/newsroom-staff.log"

case "${1:-install}" in
  install)
    mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
    cp "$SRC" "$DEST"
    # replace any previous copy cleanly
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    launchctl bootstrap "$DOMAIN" "$DEST"
    launchctl enable "$DOMAIN/$LABEL"
    launchctl kickstart -k "$DOMAIN/$LABEL"
    echo "Installed and started $LABEL."
    echo "Log: $LOG"
    ;;
  uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    rm -f "$DEST"
    echo "Removed $LABEL. (Repo copy of the plist is kept.)"
    ;;
  restart)
    launchctl kickstart -k "$DOMAIN/$LABEL"
    echo "Restarted $LABEL."
    ;;
  status)
    launchctl print "$DOMAIN/$LABEL" 2>/dev/null | grep -E "state =|pid =" || echo "not loaded"
    echo "--- last 20 log lines ---"
    tail -n 20 "$LOG" 2>/dev/null || echo "(no log yet)"
    ;;
  *)
    echo "usage: $0 [install|uninstall|restart|status]" >&2
    exit 1
    ;;
esac
