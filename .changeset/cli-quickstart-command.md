---
"@infrascan/cli": minor
"@infrascan/sdk": minor
---

Add `infrascan quickstart`, which scans an environment of one or more accounts (each with its own regions) and writes both the visual and informational graphs, with an in-place progress line. Accounts can be given with `--config` (the scan config format), as flags for a single account, or interactively; an interactively built environment can be saved as a config file. The scan config file now accepts `"credentialSource": "env"`, and is validated when loaded, so unknown keys such as a misspelt `regions` are reported instead of ignored. The SDK's `performScan` now accepts an `onProgress` listener which receives a `ScanProgressEvent` as each region and service is scanned.
