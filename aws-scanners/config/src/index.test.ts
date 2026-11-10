import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  ConfigServiceClient,
  DescribeAggregationAuthorizationsCommand,
  DescribeConfigRulesCommand,
  DescribeConfigurationAggregatorsCommand,
  DescribeConfigurationRecordersCommand,
  DescribeConfigurationRecorderStatusCommand,
  DescribeConformancePacksCommand,
  DescribeDeliveryChannelsCommand,
  DescribeOrganizationConfigRulesCommand,
  DescribeOrganizationConformancePacksCommand,
  ListConfigurationRecordersCommand,
  OrganizationAccessDeniedException,
} from "@aws-sdk/client-config-service";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import ConfigScanner from ".";
import type { ConfigStatusDetails, GraphState, ServiceStatus } from "./graph";

const MANAGEMENT = "111111111111";
const AUDIT = "222222222222";
const WORKLOAD = "333333333333";
const REGION = "eu-west-1";
const RECORDER_ARN = `arn:aws:config:${REGION}:${AUDIT}:configuration-recorder/default/abc`;
const SLR_ARN = `arn:aws:config:${REGION}:${AUDIT}:configuration-recorder/AWSConfigurationRecorderForSecurityHub/def`;
const AGGREGATOR_ARN = `arn:aws:config:${REGION}:${AUDIT}:config-aggregator/config-aggregator-abc`;
const ORG_AGGREGATOR_ARN = `arn:aws:config:${REGION}:${AUDIT}:config-aggregator/config-aggregator-org`;

function newConnector(): Connector {
  return buildFsConnector(mkdtempSync(join(tmpdir(), "infrascan-test-state-")));
}

function contextFor(account: string): AwsContext {
  return { account, region: REGION, partition: "aws" };
}

function denied(name = "AccessDeniedException") {
  return Object.assign(new Error("denied"), { name });
}

function mockPopulated(client: ConfigServiceClient) {
  const mocked = mockClient(client);
  mocked.on(ListConfigurationRecordersCommand).resolves({
    ConfigurationRecorderSummaries: [
      { arn: RECORDER_ARN, name: "default", recordingScope: "PAID" },
      {
        arn: SLR_ARN,
        name: "AWSConfigurationRecorderForSecurityHub",
        servicePrincipal: "securityhub.amazonaws.com",
        recordingScope: "INTERNAL",
      },
    ],
  });
  mocked
    .on(DescribeConfigurationRecordersCommand, {})
    .resolves({
      ConfigurationRecorders: [
        {
          arn: RECORDER_ARN,
          name: "default",
          roleARN: `arn:aws:iam::${AUDIT}:role/config`,
          recordingGroup: {
            allSupported: true,
            includeGlobalResourceTypes: true,
            recordingStrategy: { useOnly: "ALL_SUPPORTED_RESOURCE_TYPES" },
          },
          recordingMode: { recordingFrequency: "CONTINUOUS" },
          recordingScope: "PAID",
        },
      ],
    })
    .on(DescribeConfigurationRecordersCommand, { Arn: SLR_ARN })
    .resolves({
      ConfigurationRecorders: [
        {
          arn: SLR_ARN,
          name: "AWSConfigurationRecorderForSecurityHub",
          servicePrincipal: "securityhub.amazonaws.com",
          recordingScope: "INTERNAL",
        },
      ],
    });
  mocked
    .on(DescribeConfigurationRecorderStatusCommand, {})
    .resolves({
      ConfigurationRecordersStatus: [
        {
          arn: RECORDER_ARN,
          name: "default",
          recording: true,
          lastStatus: "Success",
          lastStartTime: new Date("2024-01-01T00:00:00Z"),
        },
      ],
    })
    .on(DescribeConfigurationRecorderStatusCommand, { Arn: SLR_ARN })
    .resolves({
      ConfigurationRecordersStatus: [
        {
          arn: SLR_ARN,
          name: "AWSConfigurationRecorderForSecurityHub",
          recording: false,
          lastStatus: "NotApplicable",
        },
      ],
    });
  mocked.on(DescribeDeliveryChannelsCommand).resolves({
    DeliveryChannels: [
      {
        name: "default",
        s3BucketName: "config-bucket",
        s3KeyPrefix: "o-abc",
        s3KmsKeyArn: `arn:aws:kms:${REGION}:${AUDIT}:key/1`,
        snsTopicARN: `arn:aws:sns:${REGION}:${AUDIT}:config`,
        configSnapshotDeliveryProperties: {
          deliveryFrequency: "TwentyFour_Hours",
        },
      },
    ],
  });
  mocked
    .on(DescribeConfigurationAggregatorsCommand)
    .resolves({
      ConfigurationAggregators: [
        {
          ConfigurationAggregatorName: "accounts",
          ConfigurationAggregatorArn: AGGREGATOR_ARN,
          AccountAggregationSources: [
            {
              AccountIds: [MANAGEMENT, WORKLOAD],
              AwsRegions: ["eu-west-1"],
            },
            { AccountIds: [WORKLOAD], AwsRegions: ["us-east-1"] },
          ],
          CreationTime: new Date("2024-02-01T00:00:00Z"),
        },
      ],
      NextToken: "page-2",
    })
    .on(DescribeConfigurationAggregatorsCommand, { NextToken: "page-2" })
    .resolves({
      ConfigurationAggregators: [
        {
          ConfigurationAggregatorName: "organization",
          ConfigurationAggregatorArn: ORG_AGGREGATOR_ARN,
          OrganizationAggregationSource: {
            RoleArn: `arn:aws:iam::${AUDIT}:role/aggregator`,
            AllAwsRegions: true,
          },
          CreatedBy: "securityhub.amazonaws.com",
        },
      ],
    });
  mocked.on(DescribeAggregationAuthorizationsCommand).resolves({
    AggregationAuthorizations: [
      {
        AggregationAuthorizationArn: `arn:aws:config:${REGION}:${AUDIT}:aggregation-authorization/${MANAGEMENT}/us-east-1`,
        AuthorizedAccountId: MANAGEMENT,
        AuthorizedAwsRegion: "us-east-1",
      },
    ],
  });
  mocked.on(DescribeOrganizationConfigRulesCommand).resolves({
    OrganizationConfigRules: [
      {
        OrganizationConfigRuleName: "org-s3",
        OrganizationConfigRuleArn: `arn:aws:config:${REGION}:${AUDIT}:organization-config-rule/org-s3`,
        OrganizationManagedRuleMetadata: {
          RuleIdentifier: "S3_BUCKET_VERSIONING_ENABLED",
        },
        ExcludedAccounts: [WORKLOAD],
      },
      {
        OrganizationConfigRuleName: "org-custom",
        OrganizationConfigRuleArn: `arn:aws:config:${REGION}:${AUDIT}:organization-config-rule/org-custom`,
        OrganizationCustomRuleMetadata: {
          LambdaFunctionArn: `arn:aws:lambda:${REGION}:${AUDIT}:function:rule`,
          OrganizationConfigRuleTriggerTypes: [
            "ConfigurationItemChangeNotification",
          ],
        },
      },
    ],
  });
  mocked.on(DescribeOrganizationConformancePacksCommand).resolves({
    OrganizationConformancePacks: [
      {
        OrganizationConformancePackName: "org-pack",
        OrganizationConformancePackArn: `arn:aws:config:${REGION}:${AUDIT}:organization-conformance-pack/org-pack`,
        ExcludedAccounts: [MANAGEMENT],
        LastUpdateTime: new Date("2024-03-01T00:00:00Z"),
      },
    ],
  });
  mocked.on(DescribeConformancePacksCommand).resolves({
    ConformancePackDetails: [
      {
        ConformancePackName: "OrgConformsPack-org-pack",
        ConformancePackArn: `arn:aws:config:${REGION}:${AUDIT}:conformance-pack/OrgConformsPack-org-pack/conformance-pack-1`,
        ConformancePackId: "conformance-pack-1",
        DeliveryS3Bucket: "pack-bucket",
        CreatedBy: "config-conforms.amazonaws.com",
      },
    ],
  });
  mocked.on(DescribeConfigRulesCommand).resolves({
    ConfigRules: [
      {
        ConfigRuleName: "securityhub-rule",
        ConfigRuleArn: `arn:aws:config:${REGION}:${AUDIT}:config-rule/config-rule-1`,
        Source: { Owner: "AWS", SourceIdentifier: "IAM_ROOT_ACCESS_KEY_CHECK" },
        CreatedBy: "securityhub.amazonaws.com",
        ConfigRuleState: "ACTIVE",
      },
    ],
  });
  return mocked;
}

async function scan(
  connector: Connector,
  context: AwsContext,
  client: ConfigServiceClient,
) {
  for (const getter of ConfigScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector, context: AwsContext) {
  const nodes: GraphState[] = [];
  for (const entity of ConfigScanner.entities ?? []) {
    for await (const node of generateNodesFromEntity(
      connector,
      context,
      entity,
    )) {
      nodes.push(node as BaseState as GraphState);
    }
  }
  return nodes;
}

type StatusNode = GraphState & {
  serviceStatus: ServiceStatus;
  config: { status: ConfigStatusDetails };
};

function statusNode(nodes: GraphState[], account: string): StatusNode {
  return nodes.find(
    (node) => node.$graph.id === `${account}-${REGION}-config`,
  ) as StatusNode;
}

t.test(
  "A populated account produces a status node, aggregator nodes and aggregates edges",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(AUDIT);
    const client = ConfigScanner.getClient(fromProcess(), context);
    const mocked = mockPopulated(client);
    await scan(connector, context, client);

    // The service-linked recorder is described by its ARN.
    t.same(
      mocked
        .commandCalls(DescribeConfigurationRecordersCommand)
        .map((c) => c.args[0].input),
      [{}, { Arn: SLR_ARN }],
    );

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 3);
    for (const node of nodes) {
      t.equal(node.$graph.nodeClass, "informational");
      t.equal(node.$graph.parent, AUDIT);
      t.equal(node.location?.code, REGION);
      t.equal(node.tenant.tenantId, AUDIT);
      t.equal(node.resource.category, "config");
    }

    const status = statusNode(nodes, AUDIT);
    t.equal(status.$graph.nodeType, "config-status");
    t.equal(status.resource.subcategory, "status");
    t.same(status.serviceStatus, {
      service: "config",
      status: "enabled",
      failedCalls: {},
    });
    const details = status.config.status;
    t.equal(details.recorders.length, 2);
    t.match(details.recorders[0], {
      name: "default",
      roleArn: `arn:aws:iam::${AUDIT}:role/config`,
      recording: true,
      lastStatus: "Success",
      lastStartTime: Date.parse("2024-01-01T00:00:00Z"),
      recordingGroup: { recordingStrategy: "ALL_SUPPORTED_RESOURCE_TYPES" },
      recordingMode: { recordingFrequency: "CONTINUOUS" },
    });
    t.match(details.recorders[1], {
      servicePrincipal: "securityhub.amazonaws.com",
      recordingScope: "INTERNAL",
      recording: false,
    });
    t.same(details.deliveryChannels, [
      {
        name: "default",
        s3BucketName: "config-bucket",
        s3KeyPrefix: "o-abc",
        s3KmsKeyArn: `arn:aws:kms:${REGION}:${AUDIT}:key/1`,
        snsTopicArn: `arn:aws:sns:${REGION}:${AUDIT}:config`,
        deliveryFrequency: "TwentyFour_Hours",
      },
    ]);
    t.same(details.aggregatorArns, [AGGREGATOR_ARN, ORG_AGGREGATOR_ARN]);
    t.match(details.aggregationAuthorizations, [
      { authorizedAccountId: MANAGEMENT, authorizedAwsRegion: "us-east-1" },
    ]);
    t.match(details.organizationConfigRules, [
      {
        name: "org-s3",
        ruleType: "managed",
        ruleIdentifier: "S3_BUCKET_VERSIONING_ENABLED",
        excludedAccounts: [WORKLOAD],
      },
      {
        name: "org-custom",
        ruleType: "custom-lambda",
        lambdaFunctionArn: `arn:aws:lambda:${REGION}:${AUDIT}:function:rule`,
      },
    ]);
    t.match(details.organizationConformancePacks, [
      {
        name: "org-pack",
        excludedAccounts: [MANAGEMENT],
        lastUpdatedAt: Date.parse("2024-03-01T00:00:00Z"),
      },
    ]);
    t.match(details.conformancePacks, [
      {
        name: "OrgConformsPack-org-pack",
        deliveryS3Bucket: "pack-bucket",
        createdBy: "config-conforms.amazonaws.com",
      },
    ]);
    t.same(details.configRules, [
      {
        name: "securityhub-rule",
        arn: `arn:aws:config:${REGION}:${AUDIT}:config-rule/config-rule-1`,
        sourceOwner: "AWS",
        sourceIdentifier: "IAM_ROOT_ACCESS_KEY_CHECK",
        createdBy: "securityhub.amazonaws.com",
        state: "ACTIVE",
      },
    ]);

    const aggregator = nodes.find((node) => node.$graph.id === AGGREGATOR_ARN);
    t.equal(aggregator?.$graph.nodeType, "config-aggregator");
    t.equal(aggregator?.audit?.createdAt, Date.parse("2024-02-01T00:00:00Z"));
    const orgAggregator = nodes.find(
      (node) => node.$graph.id === ORG_AGGREGATOR_ARN,
    ) as GraphState & {
      config: { aggregator: Record<string, unknown> };
    };
    t.same(orgAggregator.config.aggregator.organizationSource, {
      roleArn: `arn:aws:iam::${AUDIT}:role/aggregator`,
      allAwsRegions: true,
      awsRegions: undefined,
    });
    t.equal(
      orgAggregator.config.aggregator.createdBy,
      "securityhub.amazonaws.com",
    );

    const edges = await ConfigScanner.getEdges!(connector);
    t.same(edges, [
      {
        source: AGGREGATOR_ARN,
        target: MANAGEMENT,
        metadata: {
          label: "aggregates",
          allAwsRegions: false,
          awsRegions: ["eu-west-1"],
        },
      },
      {
        source: AGGREGATOR_ARN,
        target: WORKLOAD,
        metadata: {
          label: "aggregates",
          allAwsRegions: false,
          awsRegions: ["eu-west-1", "us-east-1"],
        },
      },
    ]);
  },
);

t.test(
  "An account without a recorder is disabled and records organization calls it may not make",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = ConfigScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().resolves({});
    mocked
      .on(ListConfigurationRecordersCommand)
      .resolves({ ConfigurationRecorderSummaries: [] });
    const orgDenied = new OrganizationAccessDeniedException({
      message: "not the management account",
      $metadata: {},
    });
    mocked.on(DescribeOrganizationConfigRulesCommand).rejects(orgDenied);
    mocked.on(DescribeOrganizationConformancePacksCommand).rejects(orgDenied);
    await scan(connector, context, client);

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const status = statusNode(nodes, WORKLOAD);
    t.equal(status.$graph.parent, WORKLOAD);
    t.same(status.serviceStatus, {
      service: "config",
      status: "disabled",
      failedCalls: {
        DescribeOrganizationConfigRules: "OrganizationAccessDeniedException",
        DescribeOrganizationConformancePacks:
          "OrganizationAccessDeniedException",
      },
    });
    t.same(status.config.status.recorders, []);
    t.same(await ConfigScanner.getEdges!(connector), []);
  },
);

t.test("A recorder that is not recording is disabled", async (t) => {
  const connector = newConnector();
  const context = contextFor(WORKLOAD);
  const client = ConfigScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked.onAnyCommand().resolves({});
  mocked.on(DescribeConfigurationRecorderStatusCommand).resolves({
    ConfigurationRecordersStatus: [{ name: "default", recording: false }],
  });
  await scan(connector, context, client);
  const status = statusNode(await nodesFor(connector, context), WORKLOAD);
  t.equal(status.serviceStatus.status, "disabled");
});

t.test(
  "A denied status call is unknown and the status node is still emitted",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = ConfigScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(denied());
    await scan(connector, context, client);

    const state = await connector.resolveStateForServiceFunction(
      WORKLOAD,
      REGION,
      "ConfigService",
      "DescribeConfigurationRecorderStatus",
    );
    t.equal(state[0]._error.name, "AccessDeniedException");

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const status = statusNode(nodes, WORKLOAD);
    t.equal(status.serviceStatus.status, "unknown");
    t.equal(status.serviceStatus.statusReason, "AccessDeniedException");
    t.equal(
      status.serviceStatus.failedCalls.DescribeConfigurationRecorderStatus,
      "AccessDeniedException",
    );
    t.equal(Object.keys(status.serviceStatus.failedCalls).length, 10);
    t.equal(status.tenant.tenantId, WORKLOAD);
    t.equal(status.location?.code, REGION);
  },
);
