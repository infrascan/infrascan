# @infrascan/aws-cloudtrail-scanner

A scanner module for AWS CloudTrail. It records which trails and CloudTrail Lake event data stores exist, who owns
them, where they deliver and what they select, and which trails each account can see in each region. All nodes are
informational. Lake queries, Insights data, dashboards, imports and channels are not read.

This module is standalone: it is not registered by [@infrascan/aws](../../packages/aws).

## What is scanned

CloudTrail is regional (`callPerRegion: true`).

| Call | Used for |
| --- | --- |
| `DescribeTrails` (`includeShadowTrails: true`) | Every trail visible from the account and region, including shadow copies of multi-region and organization trails. Decides the status node's `status`. |
| `GetTrailStatus` | `IsLogging`, the latest delivery errors (verbatim) and logging times. |
| `GetEventSelectors` | Basic and advanced event selectors, as returned. |
| `ListEventDataStores` | Event data stores in the account and region. |
| `GetEventDataStore` | Status, organization and multi-region flags, retention, KMS key, billing mode and advanced selectors for each store (the list call no longer returns these). |

`GetTrailStatus` and `GetEventSelectors` are only called for trails whose ARN account is the scanned account and whose
home region is the scanned region; CloudTrail only answers for a trail in its home region.

### Which account sees what

- The account that owns a trail sees it in its home region, and a shadow copy in every other region if it is
  multi-region.
- A member account of an organization trail sees the trail (owned by the management account) as a shadow trail in
  every region it covers. It cannot get its status or selectors.
- Organization trails and organization event data stores created by a delegated administrator are owned by the
  management account.

A call that fails is recorded with its error (see `CallState`). The status node lists the calls that failed for the
account and region in `serviceStatus.failedCalls`.

## Graph

| Node | Id | Parent |
| --- | --- | --- |
| Status (`cloudtrail-status`) | `${account}-${region}-cloudtrail` | scanned account id |
| Trail (`cloudtrail-trail`) | trail ARN | owning account id |
| Event data store (`cloudtrail-event-data-store`) | event data store ARN | owning account id |

Every node has `location.code` set to the scanned region and `tenant.tenantId` set to the scanned account.

A trail node is emitted only by the owning account's scan of the trail's home region; shadow copies seen elsewhere are
not separate nodes. An event data store node is emitted only by the scan of the account and region in its ARN. Trail
nodes record `IsOrganizationTrail`, `IsMultiRegionTrail`, `HomeRegion`, S3 bucket and prefix, SNS topic, KMS key
(also on `encryption.keyId`), CloudWatch Logs log group and role, log file validation, `IsLogging`, delivery errors and
selectors.

The status node is emitted for every scanned account and region once `DescribeTrails` has been recorded. It carries:

- `serviceStatus`: the shared header used by the governance scanners. `status` is `enabled` when any trail is visible
  from the account and region (including another account's organization trail), `disabled` when none is, and
  `unknown` when `DescribeTrails` failed (`statusReason` is the error name).
- `cloudtrail.status.trails`: every visible trail with its ARN, owning account (from the ARN), home region and
  organization and multi-region flags, so a member account's view of an organization trail is recorded.
- `cloudtrail.status.eventDataStores`: every listed event data store with its owning account, organization and
  multi-region flags and status.

No edges are drawn.
