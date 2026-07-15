# Newsroom Mac Workstation

The Mac desktop app is the production-workstation surface for Newsroom.

It deliberately keeps the media workflow local:

- `media-vault/` is the source of truth for generated and packaged assets.
- `recordings-inbox/` is watched by the local inbox worker.
- Convex production remains the shared workflow database.
- Vercel remains useful for hosted status/text access, but not for local media.

## Run

```bash
./script/build_and_run.sh
```

The app opens as `NewsroomDesktop.app` from:

```text
macos/NewsroomDesktop/dist/NewsroomDesktop.app
```

## Always-on (launchd) — recommended

Two per-user launchd agents keep the workstation running against production with
no terminal, app window, or Claude session held open. They start at login,
restart on crash, and survive reboot:

- `com.deinfluenced.newsroom.staff` — `node agents/staff.mjs` (desks/angle
  replies, Telegram gates, recordings inbox, tips inbox)
- `com.deinfluenced.newsroom.dashboard` — the Vite **dev** server on
  `http://localhost:5180` (dev mode is required: the `/media-upload` and
  `/media/*` endpoints that attach screenshots and show previews are dev-server
  middleware backed by the local `media-vault/`)

Both point at production Convex (`https://utmost-chipmunk-181.convex.cloud`).

```bash
macos/launchd/install-agents.sh            # install + start both
macos/launchd/install-agents.sh status     # loaded? tail the logs
macos/launchd/install-agents.sh restart
macos/launchd/install-agents.sh uninstall
```

Logs: `~/Library/Logs/newsroom-staff.log`, `~/Library/Logs/newsroom-dashboard.log`.

Use `http://localhost:5180` for anything touching media (uploads, previews); the
hosted Vercel URL is read/approve only and cannot upload or show media.

**Do not also run the Mac app's "Start production console" while these agents are
installed** — it starts its own copies of the same processes and its supervisor
kills by name pattern, so the two fight. Pick one.

## Start Production Console (Mac app — alternative to launchd)

Use **Start production console** inside the Mac app. This intentionally restarts
the local dashboard and staff worker processes so they point at production
Convex:

```text
https://utmost-chipmunk-181.convex.cloud
```

The app starts:

- Vite dashboard on `http://localhost:5180`
- staff workers via `npm run staff`
- workers with `VITE_CONVEX_URL` set to production

## Health Checks

The sidebar shows:

- dashboard availability
- staff worker process state
- Claude SDK auth/model check
- production Convex post count
- rejected tip count

The Claude model is still controlled by:

```text
NEWSROOM_CLAUDE_MODEL
```

in `.env.local`.

## Build / Verify

```bash
./script/build_and_run.sh --verify
npm run check:claude
npm run typecheck
swift build --package-path macos/NewsroomDesktop
```
