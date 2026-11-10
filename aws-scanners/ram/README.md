# @infrascan/aws-ram-scanner

A scanner module for AWS Resource Access Manager. It records what each account shares through RAM and with whom:
the resource shares it owns, their principals and resources, and the shares other accounts have shared with it. All
nodes are informational.

Share invitations, permissions and the content of shared resources are out of scope. This module is standalone: it is
not registered by [@infrascan/aws](../../packages/aws).

## What is scanned

RAM is regional (`callPerRegion: true`).

| Call | Used for |
| --- | --- |
| `GetResourceShares` (`resourceOwner: SELF`) | Share nodes: ARN, name, status, `allowExternalPrincipals`, feature set, owning account, tags. |
| `GetResourceShares` (`resourceOwner: OTHER-ACCOUNTS`) | Incoming shares, listed on the status node (ARN, owning account, name, status). No nodes. |
| `ListPrincipals` (`resourceOwner: SELF`) | Principals on each share node, and `shared-with` edges. |
| `ListResources` (`resourceOwner: SELF`, `resourceRegionScope: ALL`) | Resource ARNs, types and region scope on each share node. |

Every account can make these calls about its own shares. Shares made to an organization or OU are listed by the
owner with the organization or OU ARN as the principal. A call that fails is recorded with its error (see
`CallState`), so a denied call is not mistaken for an empty result. Failed calls are listed on the status node in
`serviceStatus.failedCalls`.

## Graph

| Node | Id | Parent |
| --- | --- | --- |
| Status (`ram-status`) | `${account}-${region}-ram` | scanned account id |
| Resource share (`ram-resource-share`) | share ARN (owned shares only) | scanned account id |

The status node carries `serviceStatus` and `ram.status.incomingResourceShares`:

| `serviceStatus.status` | When |
| --- | --- |
| `enabled` | At least one owned or incoming share is listed that is not `DELETED` |
| `disabled` | Both listings succeeded and returned no share (other than `DELETED` ones) |
| `unknown` | No share was found and a `GetResourceShares` listing failed; `statusReason` is the error name |

Share nodes carry `ram.resourceShare`, including every principal (verbatim, with its `external` flag) and resource.

| Edge | Source → target | Metadata |
| --- | --- | --- |
| `shared-with` | share → account id, or organization / OU ARN | `external` |

IAM role and user principals and service principals have no node to point at, so they are only recorded on the share
node.
