---
"@infrascan/cli": minor
"@infrascan/fs-connector": patch
---

Add a local-first mode to the CLI. Scans are now stored as snapshots in a standard per-user state directory (`~/.local/state/infrascan`, respecting `INFRASCAN_HOME` and `XDG_STATE_HOME`), and `graph`/`render` default to the latest scan. A saved config in `~/.config/infrascan/config.json` is reused by `scan` when `--config` isn't given. The new `state` command lists, prunes and imports scans, and imports existing config files. Passing `-o`/`--input` keeps the previous directory based behaviour.

Fix the fs-connector mutating its shared default config, and not awaiting creation of the target directory.
