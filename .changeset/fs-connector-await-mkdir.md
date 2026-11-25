---
"@infrascan/fs-connector": patch
---

Wait for the target directory to be created before writing state, so scanning into a new output directory with `createTargetDirectory` no longer fails with ENOENT.
