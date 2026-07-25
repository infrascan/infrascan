---
"@infrascan/aws-cloudwatch-logs-scanner": patch
"@infrascan/aws-dynamodb-scanner": patch
"@infrascan/aws-ec2-scanner": patch
"@infrascan/aws-ecs-scanner": patch
"@infrascan/aws-elastic-load-balancing-scanner": patch
"@infrascan/aws-kinesis-scanner": patch
"@infrascan/aws-lambda-scanner": patch
"@infrascan/aws-s3-scanner": patch
"@infrascan/aws-sqs-scanner": patch
"@infrascan/aws-step-function-scanner": patch
---

Normalize timestamp fields in entity ETLs to a numeric millisecond epoch with `tryNormalizeDateEpoch`. With the `Serialized` lifecycle type now typing rehydrated state honestly (persisted `Date` fields are ISO strings at ETL time), these sites are updated to normalize at runtime rather than assume a live `Date` — a belt-and-suspenders pairing with the compile-time type, since TypeScript does not enforce types at runtime. This also fixes the graphing crash where `Date`-typed fields (e.g. ec2 launch template `CreateTime`, lambda `StartingPositionTimestamp`) had `toISOString()` called on what was actually a string. Timestamp node properties (`audit.createdAt`, dynamodb throughput/archive dates, lambda `startingPositionTimestamp`) are now numeric epochs; the sqs scanner already computed an epoch and now emits it as a number rather than a string.
