# Upstream sync (Haven)

Mosaic tracks [`ancsemi/Haven`](https://github.com/ancsemi/Haven) continuously via
[`.github/workflows/upstream-sync.yml`](../.github/workflows/upstream-sync.yml).

## How the automation works

- Runs daily (`12:17 UTC`) and on manual dispatch (`dry_run` supported).
- Fetches `upstream/main`, measures drift.
- If upstream moved: attempts a merge on a scratch branch.
  - **Clean merge + module smoke passes** → pushes the merge commit to `main`
    and closes any open `upstream-sync` issue.
  - **Conflicts / failed smoke** → opens (or updates) an `upstream-sync` issue
    with the conflict list. `main` is never touched on this path.
- The sync is always a **merge commit** — upstream history must stay reachable
  for the next sync. Never squash or rebase upstream commits into the fork.

## Manual resolution (when the issue fires)

1. `git clone https://github.com/reverb256/Mosaic.git && cd Mosaic`
2. `git remote add upstream https://github.com/ancsemi/Haven.git && git fetch upstream`
3. `git checkout -b sync/manual main && git merge upstream/main`
4. Reconcile conflicts: take **upstream's structure** for shared files and port
   Mosaic's additive layers on top. The canonical worked example is the
   2026-09-18 sync (merge `b21ae75`, upstream v4.9.0). Files that have
   historically overlapped: `server.js`, `src/auth.js`, `src/database.js`,
   `public/js/app.js`, `package.json`, `package-lock.json`, `README.md`.
5. Verify:
   ```bash
   npm ci
   JWT_SECRET=test timeout 60 node -e "require('./src/auth'); require('./src/routes-mosaic'); require('./src/database'); console.log('OK'); process.exit(0)"
   ```
6. Push to `main`, then close the `upstream-sync` issue.

## Notes

- Automation credentials: the workflow pushes use the repo secret `SYNC_PAT`
  (classic PAT with `repo` + `workflow` scopes — required because sync merges
  carry upstream workflow files, which the default `GITHUB_TOKEN` cannot
  update). Rotate the secret when the PAT rotates. The `gh` CLI OAuth token
  does NOT have `workflow` scope — local pushes that touch
  `.github/workflows/` must use the PAT.
- Known pre-existing test debt: `test/identity.test.js` DB + HTTP suites fail on
  `main` (they expect a `database.createIdentity`-style API that was never
  implemented). The smoke check therefore gates on module load, not the full
  suite. Fixing the suite would let the automation gate harder.
- Deployment source for k3s is `~/Work/Projects/Mosaic` (see the
  `mosaic-k3s-funnel` skill); rebuild with the same recipe after a sync.
