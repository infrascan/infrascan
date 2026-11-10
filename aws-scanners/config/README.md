# @infrascan/aws-config-scanner

A scanner module for AWS Config. It records how Config is set up in each account and region: the configuration
recorders (including service-linked recorders), delivery channels, aggregators, aggregation authorizations,
organization rules and conformance packs, and a compact list of the rules deployed. All nodes are informational. No
compliance, evaluation, history or resource data is read.

This module is standalone: it is not registered by [@infrascan/aws](../../packages/aws).

## What is scanned

Config is regional (`callPerRegion: true`); every call runs in every scanned region.

| Call | Used for |
| --- | --- |
| `ListConfigurationRecorders` | Finds service-linked recorders, which the describe calls only return when asked for by ARN. |
| `DescribeConfigurationRecorders` | Recorders: name, ARN, role, recording group, recording mode, recording scope, service principal. Called once with no input (the customer managed recorder) and once per service-linked recorder ARN. |
| `DescribeConfigurationRecorderStatus` | Whether each recorder is recording and its last status. Decides the status node's `status`. |
| `DescribeDeliveryChannels` | S3 bucket, key prefix, KMS key ARN, SNS topic ARN, snapshot delivery frequency. |
| `DescribeConfigurationAggregators` | Aggregator nodes and `aggregates` edges. |
| `DescribeAggregationAuthorizations` | Accounts and regions authorized to aggregate this account's data. |
| `DescribeOrganizationConfigRules` | Organization rules: name, ARN, excluded accounts, managed rule identifier or custom Lambda ARN. |
| `DescribeOrganizationConformancePacks` | Organization conformance packs: name, ARN, excluded accounts, delivery bucket. |
| `DescribeConformancePacks` | Conformance packs deployed in the account: name, ARN, delivery bucket, `CreatedBy`. |
| `DescribeConfigRules` | Rules deployed in the account: name, ARN, source owner and identifier, `CreatedBy`, state. |

Any account can describe its own recorders, channels, aggregators, authorizations, conformance packs and rules. Only
the management account or a Config delegated administrator can describe organization rules and conformance packs;
other accounts get `OrganizationAccessDeniedException`, which is recorded. Rules and packs deployed by an organization
rule, by a conformance pack or by another service (e.g. Security Hub) show who created them in `createdBy`.

A call that fails is recorded with its error (see `CallState`), so a denied call is not mistaken for an empty result.
The status node lists the calls that failed for the account and region in `serviceStatus.failedCalls`.

## Graph

| Node | Id | Parent |
| --- | --- | --- |
| Status (`config-status`) | `${account}-${region}-config` | scanned account id |
| Aggregator (`config-aggregator`) | aggregator ARN | scanned account id |

Every node has `location.code` set to the region and `tenant.tenantId` set to the scanned account.

The status node is emitted for every scanned account and region once `DescribeConfigurationRecorderStatus` has been
recorded, including when Config is disabled or the call failed. It carries:

- `serviceStatus`: the shared header used by the governance scanners. `status` is `enabled` when any recorder is
  recording, `disabled` when there is no recorder or none is recording, and `unknown` when the status call failed and
  no recorder was seen recording (`statusReason` is the error name). A failed call is never reported as `disabled`.
- `config.status`: recorders (with their recording status), delivery channels, aggregator ARNs, aggregation
  authorizations, organization rules, organization conformance packs, conformance packs and rules.

| Edge | Source → target | Metadata |
| --- | --- | --- |
| `aggregates` | aggregator → account id | `allAwsRegions`, `awsRegions` (merged across the aggregator's account sources) |

Only accounts listed explicitly in an account source get an edge. An organization source names no accounts; its role
and regions are recorded on the aggregator node (`config.aggregator.organizationSource`).
