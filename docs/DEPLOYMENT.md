# Newsroom deployment and resilience

Last updated: 2026-06-13

## Current status

Newsroom has three runtime layers:

1. **Dashboard**: Vite/React app in `src/`.
2. **App backend**: Convex tables, queries, and mutations in `convex/`.
3. **Staff workers**: local Node processes in `agents/` for desks, Telegram
   gates, recording inbox, media generation, and packaging.

Vercel can host layer 1. Convex hosts layer 2. Layer 3 is currently local
because it runs long-lived processes, reads/writes local files, watches
`recordings-inbox/`, and writes finished assets into `media-vault/`.

## Vercel + Convex deployment

This repo includes `vercel.json` with:

```json
{
  "framework": "vite",
  "buildCommand": "npx convex deploy --cmd-url-env-var-name VITE_CONVEX_URL --cmd 'npm run build'",
  "outputDirectory": "dist"
}
```

The build command deploys Convex functions first, sets `VITE_CONVEX_URL` for
the frontend build, then builds the Vite site into `dist/`.

### Required external setup

1. Put the repo on GitHub, GitLab, or Bitbucket. Vercel deploy versioning comes
   from Git pushes and preview deployments.
2. Import the repo into Vercel.
3. In the Convex dashboard, create or open the production deployment and
   generate a production deploy key.
4. In Vercel project environment variables, add:
   - `CONVEX_DEPLOY_KEY`: the production deploy key, Production only.
   - `NEWSROOM_BASIC_AUTH`: `username:password`, Production only.
5. Keep the basic-auth middleware enabled before sharing the URL. This app does
   not yet have app-level user authentication, so an unprotected production URL
   would expose the dashboard and its Convex mutations. Vercel's built-in
   advanced password protection may also be used when the team plan supports it.
6. Deploy. Vercel will produce a URL like `https://<project>.vercel.app`.

For preview deployments, add a Convex preview deploy key to Vercel's Preview
environment as `CONVEX_DEPLOY_KEY`. Convex will create isolated preview
backends for branch deployments.

## What will work from mobile

The hosted dashboard can show Convex-backed records, Brain docs, story states,
creative briefs, route choices, captions, and approval state from mobile.

The hosted dashboard will not fully handle local media yet:

- `/media/*` is served by local Vite middleware during development only.
- `/media-upload` is also local Vite middleware.
- Vercel will not have access to `media-vault/` or `recordings-inbox/`.

That means source-of-truth text and workflow state can be mobile-accessible
now, but media previews/uploads need a storage migration before hosted mobile
use feels complete.

## Recommended resilience work

### 1. Protect access

Before exposing the dashboard publicly, keep `NEWSROOM_BASIC_AUTH` configured
in Vercel. Longer term, add app-level authentication and enforce it in Convex
functions.

### 2. Move media out of local files

Replace local `media-vault/` serving with cloud storage. The most direct path
is Convex File Storage for uploaded screenshots and generated assets, then
store file IDs or public URLs instead of local absolute paths.

Until this is done, the Vercel-hosted app should be treated as workflow/status
access, not the complete media production surface.

### 3. Decide where staff workers run

Keep the local staff runner if the Mac is the production workstation:

```bash
npm run staff
```

Point `.env.local` at the production `VITE_CONVEX_URL` when you want local
workers to process the hosted production database.

If this needs to be always-on without the Mac, move staff workers to a worker
host such as Fly.io, Render, Railway, or a small VPS. Vercel is not the right
place for the current long-running watcher/agent processes.

### 4. Backups and rollback

- Git + Vercel gives frontend/code rollback and preview deployments.
- Convex deployment history gives backend function versioning.
- Use Convex scheduled backups for production data and file storage once media
  moves there.

### 5. Operational checks

Before a production deploy:

```bash
npm run typecheck
npm run build
```

After deploy:

```bash
npx convex logs
npx convex run brain:docs
```

Confirm the hosted dashboard connects to the production Convex URL and that
local staff workers are reading/writing the same deployment.
