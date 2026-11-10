---
"@infrascan/aws-config-scanner": minor
---

Add a standalone scanner for AWS Config. It records one informational status node per account and region (enabled when a recorder, service-linked recorders included, is recording) with recorders, delivery channels, aggregation authorizations, organization rules and conformance packs, conformance packs and a compact rule list. Aggregators are nodes with `aggregates` edges to their explicit source accounts. No compliance or evaluation data is fetched, failed calls are kept in state with their AWS error, and the scanner is not registered by `@infrascan/aws`.
