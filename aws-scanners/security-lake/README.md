# @infrascan/aws-security-lake-scanner

A scanner module for Amazon Security Lake. It records, per account and region, whether a data lake exists, how it is
configured, which log sources it collects, the organization auto-enable configuration and its subscribers. It gathers
information only: exceptions, notifications and data are not recorded. All nodes are informational.

This module is standalone: it is not registered by [@infrascan/aws](../../packages/aws).

## What is scanned

Security Lake is regional (`callPerRegion: true`).

| Call | Used for |
| --- | --- |
| `ListDataLakes` | The data lake in the scanned region (`regions: [region]`): ARN, S3 bucket ARN, KMS key, lifecycle (expiration and transitions), replication, create and update status. Decides the status. |
| `ListLogSources` | Log sources collected in the region, per contributing account: AWS source names and versions, and custom sources. |
| `GetDataLakeOrganizationConfiguration` | Sources enabled automatically for accounts joining the organization, in the scanned region. |
| `ListSubscribers` | Subscriber id, name, ARN, principal, access types, sources, status and dates. The identity's external id is dropped before the response is recorded. |

`ListLogSources`, `GetDataLakeOrganizationConfiguration` and `ListSubscribers` describe a data lake, so they are only
called where `ListDataLakes` returned one for the region.

Which account can see what:

- The account that owns the data lake (for an organization, the Security Lake delegated administrator) sees the data
  lake, the log sources of every contributing account and the subscribers.
- Only the delegated administrator can read the organization configuration.
- Accounts whose logs are collected by another account's data lake have no data lake of their own; they appear in the
  owning account's `logSources`.

A call that fails is recorded with its error (see `CallState`) and listed in `serviceStatus.failedCalls`, and the
related detail field is left out rather than reported as empty.

## Status

| `serviceStatus.status` | When |
| --- | --- |
| `enabled` | `ListDataLakes` returned a data lake in the scanned region, whatever its create status. |
| `disabled` | `ListDataLakes` succeeded and returned no data lake for the region. |
| `unknown` | `ListDataLakes` failed. `statusReason` is the error name. |

Security Lake has no administrator/member relationship call in scope, so `administratorAccountId` and
`relationshipStatus` are never set.

## Graph

| Node | Id | Parent | Detail |
| --- | --- | --- | --- |
| Security Lake status (`securitylake-status`) | `${account}-${region}-securitylake` | scanned account id | `serviceStatus`, `securitylake` (`dataLake`, `logSources`, `organizationAutoEnableSources`, `subscribers`), `encryption.keyId` |

One status node is emitted per scanned account and region, whatever the status. No edges are emitted.
