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

## Start Production Console

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
