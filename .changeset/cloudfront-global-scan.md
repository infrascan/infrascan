---
"@infrascan/aws-cloudfront-scanner": patch
---

Scan CloudFront as a global service (`callPerRegion: false`), matching its codegen config. `ListDistributions` now runs once per account in the scan's default region instead of once per scanned region, which previously recorded the same distributions repeatedly.
