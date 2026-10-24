# Plugin Steward

A DSH Web plugin that adds a **Plugin Steward** tab to the running Plugins page.

- Search installed profile bundles by title, package name, description, or component name.
- Sort by name, enabled state, or update availability.
- Switch a whole bundle on or off, or switch one of its loader rows independently.
- Check npm registries for newer releases and mark affected bundles with **Update available**.
- Update an exact new version in place. If removal, download, install, or activation fails,
  the Host cleans up the failed attempt and reinstalls the previous version.

The browser half uses the generated `pluginManager` Remote namespace for inventory and
enablement. The Host half adds two same-origin routes:

- `GET /dsh-plugin-steward/updates` — cached registry comparison, ten-minute TTL.
- `POST /dsh-plugin-steward/update` — removes the old registry bundle, installs the exact
  version, verifies the version, and rolls back on failure. The update route requires a
  JSON body and the private `x-plugin-steward-update: 1` header; it refuses local, linked,
  Git, read-only, self, and non-registry bundles. Only one update runs at a time.

Every update result reports the stages and either `updated`, `restart-required`,
`rolled-back`, or `rollback-failed`. The rollback installs the exact old version with the
same enabled state; a failed new version is removed before that rollback is attempted.
Update checking and updating remain advisory in the sense that a running DSH process that
needs a restart reports that requirement instead of pretending the new code is live.

## Files

- `index.js` — Host entry, cached update check, update/rollback coordinator.
- `client.js` — `plugins.tab` management view, update button, and `plugins.detail.badge`.
- `cordis.patch.yml` — inserts the Loader row.
- `locale/` — Plugin Manager display metadata.
- `icon.svg` — original artwork for the plugin inventory.
