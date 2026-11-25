---
"@infrascan/cli": minor
"@infrascan/sdk": minor
---

Add `infrascan quickstart`, which prompts for credentials and regions (or takes them as flags), scans the account with an in-place progress line, and writes both the visual and informational graphs. The SDK's `performScan` now accepts an `onProgress` listener which receives a `ScanProgressEvent` as each region and service is scanned.
