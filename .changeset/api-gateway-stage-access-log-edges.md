---
"@infrascan/aws-api-gateway-scanner": minor
---

Stages are scanned (`GetStages`) and graphed as informational nodes beneath their API. Each API links to the log groups its stages write access logs to, using an edge selector declared in the scanner config.
