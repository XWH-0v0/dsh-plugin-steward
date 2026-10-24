# Plugin Steward

English | [中文](README.zh.md)

A DSH Web plugin that adds a **Plugin Steward** tab to the running Plugins page.

## Features

- Search installed profile bundles by title, package name, description, or component name.
- Sort by name, enabled state, or update availability.
- Switch a whole bundle on or off, or switch one of its loader rows independently.
- Check npm registries and GitHub Releases for newer releases, and mark affected bundles
  with **Update available**.
- Update an exact new version in place. If removal, download, install, or activation fails,
  the Host cleans up the failed attempt and reinstalls the previous version.
- Preserve the bundle's enabled/disabled state across an update and report when a restart is
  required.
- Chinese and English interface copy.

## Usage

1. Open **Plugins** in the sidebar.
2. Select the **Plugin Steward** tab.
3. Search, sort, and filter the installed bundle list.
4. When a bundle has an update, select **Update to vX.Y.Z**. Progress and the result appear on
   the card.

## Update and rollback

The update flow is:

1. Confirm from the update cache that the selected version is still `latest`.
2. Remove the old bundle.
3. Install the exact new version, preserving the previous enabled state.
4. Verify the installed version.
5. If any step fails:
   - try to remove the failed new version;
   - reinstall the old version;
   - return `rolled-back` or `rollback-failed`.

Every result is one of `updated`, `restart-required`, `rolled-back`, or `rollback-failed`.
A failed rollback reports the old version and requires a manual reinstall from the official
Plugins page.

A removal that DSH reports as `restart-required` is a deferred success, not a failure: the
new version is still installed, and the result is `restart-required`. The running process
keeps the old code until DSH restarts. The restart reason is included in the result and in
the per-stage diagnostics.

On failure, the tab keeps a persistent failure panel showing the error code, the reason
returned by the update service, the rollback status, and optional stage diagnostics. The
reason can be copied for a bug report. Failed results include a top-level `reason`, a
`failure` object with the original error, and `rollbackReason` when rollback failed.

> Updates use the official plugin manager's remove-then-install flow. After a successful
> update, the bundle rejoins the end of the profile bundle list, which can change
> configuration precedence.

## Update sources

- npm registry packages compare their registry's `latest` dist-tag.
- Explicit GitHub package sources compare the latest GitHub Release whose tag is a SemVer
  version. The update installs that release tag as an exact Git spec and rolls back to the
  old version's tag (or the original commit for a pinned source).
- GitHub release assets are not downloaded; the release tag is installed.
- Public GitHub repositories work without credentials. For a private repository or higher
  rate limits, set `GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_PAT` in the Host environment. The
  Git install itself still needs Git credentials configured for the Host.
- Local paths, `link:`, GitHub sources without a SemVer release, tarball installs, read-only
  bundles, and Plugin Steward itself are not auto-updated.
- `pluginManager.installBundle` checks compatibility with the running DSH version; a
  failure triggers rollback.
- Changes that need a DSH restart are reported as `restart-required` instead of claiming the
  new code is already live.

## Host routes

The browser half uses the generated `pluginManager` Remote namespace for inventory and
enablement. The Host half adds two same-origin routes:

- `GET /dsh-plugin-steward/updates` — cached npm/GitHub Release comparison with a ten-minute
  TTL.
- `POST /dsh-plugin-steward/update` — removes the old bundle, installs the exact npm or
  GitHub Release target, verifies it, and rolls back on failure.

The update route requires:

- a loopback Host and a same-origin request;
- a JSON request body;
- the private `x-plugin-steward-update: 1` header;
- a target that is installed, removable, not read-only, and not this plugin;
- a target version matching the cached `latest`.

Only one update runs at a time.

## Files

- `index.js` — Host entry, cached update check, update/rollback coordinator.
- `client.js` — `plugins.tab` management view, update button, and `plugins.detail.badge`.
- `cordis.patch.yml` — inserts the Loader row.
- `locale/` — Plugin Manager display metadata.
- `icon.svg` — original artwork for the plugin inventory.

## Security

- The update route accepts only same-origin loopback requests and requires the private
  intent header.
- The target version is validated against the Host's update cache; the browser cannot choose
  an arbitrary version, registry, or GitHub ref.
- GitHub API credentials are read from the Host environment and are never returned to the
  browser; only `api.github.com` is contacted.
- Updates and rollbacks call the official `pluginManager` service, so compatibility checks,
  build-script approval, and the profile write lock still apply.
