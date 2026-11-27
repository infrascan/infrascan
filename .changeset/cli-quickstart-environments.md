---
"@infrascan/cli": minor
---

`infrascan quickstart` now scans environments: one or more accounts, each with its own regions, into a single graph. Pass an environment with `--config` (the scan config format), or build one interactively and save it for reuse with `scan -c` and `quickstart -c`. The scan config file accepts `"credentialSource": "env"`, and is validated when loaded, so unknown keys such as a misspelt `regions` are reported instead of ignored.
