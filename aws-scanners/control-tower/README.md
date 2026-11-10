# @infrascan/aws-control-tower-scanner

A scanner module for AWS Control Tower. It records the landing zone (version, status, drift status and manifest), the
baselines enabled on OUs and accounts, and the controls enabled on each target, with the status and drift strings AWS
reports. All nodes are informational. Control Catalog and operation history are not read.

This module is standalone: it is not registered by [@infrascan/aws](../../packages/aws).

## What is scanned

Control Tower is regional (`callPerRegion: true`), but it only answers in the landing zone's home region of the
management account. In other regions and from other accounts the calls return nothing or fail; the result is recorded
and no nodes are emitted.

| Call | Used for |
| --- | --- |
| `ListLandingZones` | Landing zone ARNs. |
| `GetLandingZone` | Landing zone node: version, latest available version, status, drift status, remediation types and the manifest as returned. |
| `ListBaselines` | Baseline names and descriptions, used to label enabled baselines. |
| `ListEnabledBaselines` | Enabled baseline nodes and `enabled-on` edges. |
| `ListEnabledControls` | Enabled controls, grouped into one node per target, and `enabled-on` edges. Called without a target, which lists every enabled control. |

From the manifest the following are read defensively, because the schema differs between landing zone versions:
`governedRegions`, `centralizedLogging.accountId` (log archive account), `securityRoles.accountId` (audit account),
`config.accountId` (newer manifests) and `organizationStructure`. The full manifest is kept as well.

A call that fails is recorded with its error (see `CallState`), so a denied call or a region without a landing zone is
not mistaken for an empty result.

## Graph

| Node | Id | Parent |
| --- | --- | --- |
| Landing zone (`controltower-landing-zone`) | landing zone ARN | scanned (management) account id |
| Enabled baseline (`controltower-enabled-baseline`) | enabled baseline ARN | scanned (management) account id |
| Enabled controls (`controltower-enabled-controls`) | `${targetIdentifier}#controltower-enabled-controls` | scanned (management) account id |

Every node has `location.code` set to the region and `tenant.tenantId` set to the scanned account. A node is emitted
only by the scan of the account and region in the resource's ARN, so each appears once. Enabled controls can number in
the thousands, so each target gets one node listing its controls with their `controlIdentifier`, `parentIdentifier`,
`statusSummary` and `driftStatusSummary`. Status and drift summaries are kept as AWS returned them.

| Edge | Source → target | Metadata |
| --- | --- | --- |
| `log-archive` | landing zone → log archive account id | — |
| `audit` | landing zone → audit account id | — |
| `enabled-on` | enabled baseline → OU ARN or account id | `baselineIdentifier`, `targetIdentifier` |
| `enabled-on` | enabled-controls node → OU ARN or account id | `targetIdentifier` |

Targets are Organizations ARNs. OU ARNs are used as edge targets as they are; account ARNs
(`arn:aws:organizations::<management>:account/o-x/<id>`) target the 12-digit account id, matching the Organizations
scanner's node ids. Other identifiers are recorded on the node but get no edge. If the log archive and audit accounts
are the same account, the landing zone gets one edge to it, labelled `log-archive`, with both roles in `roles`.
