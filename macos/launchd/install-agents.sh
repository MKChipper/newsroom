#!/usr/bin/env bash
# Install / manage the always-on Newsroom launchd agents (production Convex).
#
# Two per-user agents, both pointed at production, both auto-restarting and
# surviving reboot — so nothing is tied to a terminal, the Mac app, or a Claude
# session:
#   * staff     — node agents/staff.mjs (desks/angle replies, gates, inbox, tips)
#   * dashboard — Vite dev server on http://localhost:5180 (the only surface where
#                 screenshot uploads + media previews work; they're dev-only
#                 middleware backed by the local media-vault/)
#
#   ./install-agents.sh            # install + start both (default)
#   ./install-agents.sh status     # are they loaded? tail the logs
#   ./install-agents.sh restart    # kick both
#   ./install-agents.sh uninstall  # stop + remove both
set -euo pipefail

LABELS=(com.deinfluenced.newsroom.staff com.deinfluenced.newsroom.dashboard)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOMAIN="gui/$(id -u)"
LOGDIR="$HOME/Library/Logs"

case "${1:-install}" in
  install)
    mkdir -p "$HOME/Library/LaunchAgents" "$LOGDIR"
    for L in "${LABELS[@]}"; do
      cp "$HERE/$L.plist" "$HOME/Library/LaunchAgents/$L.plist"
      launchctl bootout "$DOMAIN/$L" 2>/dev/null || true
      launchctl bootstrap "$DOMAIN" "$HOME/Library/LaunchAgents/$L.plist"
      launchctl enable "$DOMAIN/$L"
      launchctl kickstart -k "$DOMAIN/$L"
      echo "started $L"
    done
    echo "Done. Dashboard: http://localhost:5180  ·  logs in $LOGDIR/newsroom-*.log"
    ;;
  uninstall)
    for L in "${LABELS[@]}"; do
      launchctl bootout "$DOMAIN/$L" 2>/dev/null || true
      rm -f "$HOME/Library/LaunchAgents/$L.plist"
      echo "removed $L"
    done
    ;;
  restart)
    for L in "${LABELS[@]}"; do launchctl kickstart -k "$DOMAIN/$L" && echo "restarted $L"; done
    ;;
  status)
    for L in "${LABELS[@]}"; do
      echo "== $L =="
      launchctl print "$DOMAIN/$L" 2>/dev/null | grep -E "state =|pid =" || echo "  not loaded"
    done
    echo "--- newsroom-staff.log (last 8) ---";     tail -n 8 "$LOGDIR/newsroom-staff.log" 2>/dev/null || echo "(none)"
    echo "--- newsroom-dashboard.log (last 8) ---"; tail -n 8 "$LOGDIR/newsroom-dashboard.log" 2>/dev/null || echo "(none)"
    ;;
  *)
    echo "usage: $0 [install|uninstall|restart|status]" >&2; exit 1 ;;
esac
