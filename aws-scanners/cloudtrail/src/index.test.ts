import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  AccessDeniedException,
  CloudTrailClient,
  DescribeTrailsCommand,
  GetEventDataStoreCommand,
  GetEventSelectorsCommand,
  GetTrailStatusCommand,
  ListEventDataStoresCommand,
} from "@aws-sdk/client-cloudtrail";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import CloudTrailScanner from ".";
import type {
  CloudTrailStatusDetails,
  GraphState,
  ServiceStatus,
  TrailDetails,
} from "./graph";

const MANAGEMENT = "111111111111";
const WORKLOAD = "333333333333";
const HOME = "us-east-1";
const OTHER = "eu-west-1";
const ORG_TRAIL_ARN = `arn:aws:cloudtrail:${HOME}:${MANAGEMENT}:trail/org-trail`;
const LOCAL_TRAIL_ARN = `arn:aws:cloudtrail:${OTHER}:${MANAGEMENT}:trail/local`;
const EDS_ARN = `arn:aws:cloudtrail:${HOME}:${MANAGEMENT}:eventdatastore/eds-1`;

const orgTrail = {
  Name: "org-trail",
  TrailARN: ORG_TRAIL_ARN,
  HomeRegion: HOME,
  IsOrganizationTrail: true,
  IsMultiRegionTrail: true,
  IncludeGlobalServiceEvents: true,
  S3BucketName: "org-trail-bucket",
  S3KeyPrefix: "trail",
  KmsKeyId: `arn:aws:kms:${HOME}:${MANAGEMENT}:key/1`,
  CloudWatchLogsLogGroupArn: `arn:aws:logs:${HOME}:${MANAGEMENT}:log-group:trail:*`,
  LogFileValidationEnabled: true,
  HasCustomEventSelectors: true,
};
const localTrail = {
  Name: "local",
  TrailARN: LOCAL_TRAIL_ARN,
  HomeRegion: OTHER,
  IsOrganizationTrail: false,
  IsMultiRegionTrail: false,
  S3BucketName: "local-bucket",
};

function newConnector(): Connector {
  return buildFsConnector(mkdtempSync(join(tmpdir(), "infrascan-test-state-")));
}

function contextFor(account: string, region = HOME): AwsContext {
  return { account, region, partition: "aws" };
}

async function scan(
  connector: Connector,
  context: AwsContext,
  client: CloudTrailClient,
) {
  for (const getter of CloudTrailScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector, context: AwsContext) {
  const nodes: GraphState[] = [];
  for (const entity of CloudTrailScanner.entities ?? []) {
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
  cloudtrail: { status: CloudTrailStatusDetails };
};

function statusNode(nodes: GraphState[], context: AwsContext): StatusNode {
  return nodes.find(
    (node) =>
      node.$graph.id === `${context.account}-${context.region}-cloudtrail`,
  ) as StatusNode;
}

t.test(
  "The owning account in the home region emits the trail and event data store nodes",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(MANAGEMENT);
    const client = CloudTrailScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked
      .on(DescribeTrailsCommand)
      .resolves({ trailList: [orgTrail, localTrail] });
    mocked.on(GetTrailStatusCommand).resolves({
      IsLogging: true,
      LatestDeliveryError: "AccessDenied",
      LatestDeliveryTime: new Date("2024-05-01T00:00:00Z"),
    });
    mocked.on(GetEventSelectorsCommand).resolves({
      TrailARN: ORG_TRAIL_ARN,
      AdvancedEventSelectors: [
        {
          Name: "Management events",
          FieldSelectors: [{ Field: "eventCategory", Equals: ["Management"] }],
        },
      ],
    });
    mocked
      .on(ListEventDataStoresCommand)
      .resolves({
        EventDataStores: [{ EventDataStoreArn: EDS_ARN, Name: "lake" }],
        NextToken: "next",
      })
      .on(ListEventDataStoresCommand, { NextToken: "next" })
      .resolves({ EventDataStores: [] });
    mocked.on(GetEventDataStoreCommand).resolves({
      EventDataStoreArn: EDS_ARN,
      Name: "lake",
      Status: "ENABLED",
      OrganizationEnabled: true,
      MultiRegionEnabled: true,
      RetentionPeriod: 2557,
      KmsKeyId: `arn:aws:kms:${HOME}:${MANAGEMENT}:key/2`,
      CreatedTimestamp: new Date("2024-01-01T00:00:00Z"),
    });
    await scan(connector, context, client);

    // Only the trail homed here is asked for its status.
    t.same(
      mocked.commandCalls(GetTrailStatusCommand).map((c) => c.args[0].input),
      [{ Name: ORG_TRAIL_ARN }],
    );
    t.same(
      mocked.commandCalls(GetEventSelectorsCommand).map((c) => c.args[0].input),
      [{ TrailName: ORG_TRAIL_ARN }],
    );
    t.equal(mocked.commandCalls(ListEventDataStoresCommand).length, 2);

    const nodes = await nodesFor(connector, context);
    t.same(nodes.map((node) => node.$graph.id).sort(), [
      `${MANAGEMENT}-${HOME}-cloudtrail`,
      EDS_ARN,
      ORG_TRAIL_ARN,
    ]);
    for (const node of nodes) {
      t.equal(node.$graph.nodeClass, "informational");
      t.equal(node.$graph.parent, MANAGEMENT);
      t.equal(node.location?.code, HOME);
      t.equal(node.tenant.tenantId, MANAGEMENT);
      t.equal(node.resource.category, "cloudtrail");
    }

    const status = statusNode(nodes, context);
    t.equal(status.$graph.nodeType, "cloudtrail-status");
    t.same(status.serviceStatus, {
      service: "cloudtrail",
      status: "enabled",
      failedCalls: {},
    });
    t.same(status.cloudtrail.status.trails, [
      {
        arn: ORG_TRAIL_ARN,
        name: "org-trail",
        owningAccountId: MANAGEMENT,
        homeRegion: HOME,
        isOrganizationTrail: true,
        isMultiRegionTrail: true,
      },
      {
        arn: LOCAL_TRAIL_ARN,
        name: "local",
        owningAccountId: MANAGEMENT,
        homeRegion: OTHER,
        isOrganizationTrail: false,
        isMultiRegionTrail: false,
      },
    ]);
    t.same(status.cloudtrail.status.eventDataStores, [
      {
        arn: EDS_ARN,
        name: "lake",
        owningAccountId: MANAGEMENT,
        organizationEnabled: true,
        multiRegionEnabled: true,
        status: "ENABLED",
      },
    ]);

    const trail = nodes.find((node) => node.$graph.id === ORG_TRAIL_ARN) as
      | (GraphState & { cloudtrail: { trail: TrailDetails } })
      | undefined;
    t.equal(trail?.$graph.nodeType, "cloudtrail-trail");
    t.equal(trail?.encryption?.keyId, orgTrail.KmsKeyId);
    t.match(trail?.cloudtrail.trail, {
      isOrganizationTrail: true,
      isMultiRegionTrail: true,
      homeRegion: HOME,
      s3BucketName: "org-trail-bucket",
      s3KeyPrefix: "trail",
      cloudWatchLogsLogGroupArn: orgTrail.CloudWatchLogsLogGroupArn,
      logFileValidationEnabled: true,
      isLogging: true,
      latestDeliveryError: "AccessDenied",
      latestDeliveryTime: Date.parse("2024-05-01T00:00:00Z"),
    });
    t.same(trail?.cloudtrail.trail.selectors, {
      eventSelectors: [],
      advancedEventSelectors: [
        {
          name: "Management events",
          fieldSelectors: [
            {
              field: "eventCategory",
              equals: ["Management"],
              startsWith: undefined,
              endsWith: undefined,
              notEquals: undefined,
              notStartsWith: undefined,
              notEndsWith: undefined,
            },
          ],
        },
      ],
    });

    const store = nodes.find((node) => node.$graph.id === EDS_ARN) as
      | (GraphState & {
          cloudtrail: { eventDataStore: Record<string, unknown> };
        })
      | undefined;
    t.equal(store?.$graph.nodeType, "cloudtrail-event-data-store");
    t.match(store?.cloudtrail.eventDataStore, {
      organizationEnabled: true,
      multiRegionEnabled: true,
      retentionPeriodDays: 2557,
      status: "ENABLED",
      kmsKeyId: `arn:aws:kms:${HOME}:${MANAGEMENT}:key/2`,
    });
  },
);

t.test(
  "A member account sees the organization trail on its status node but does not emit it",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = CloudTrailScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.on(DescribeTrailsCommand).resolves({ trailList: [orgTrail] });
    mocked.on(ListEventDataStoresCommand).resolves({ EventDataStores: [] });
    await scan(connector, context, client);

    t.equal(mocked.commandCalls(GetTrailStatusCommand).length, 0);
    t.equal(mocked.commandCalls(GetEventSelectorsCommand).length, 0);

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const status = statusNode(nodes, context);
    t.equal(status.$graph.parent, WORKLOAD);
    t.equal(status.tenant.tenantId, WORKLOAD);
    t.equal(status.serviceStatus.status, "enabled");
    t.same(status.cloudtrail.status.trails, [
      {
        arn: ORG_TRAIL_ARN,
        name: "org-trail",
        owningAccountId: MANAGEMENT,
        homeRegion: HOME,
        isOrganizationTrail: true,
        isMultiRegionTrail: true,
      },
    ]);
  },
);

t.test(
  "The owning account does not emit a shadow copy outside the home region",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(MANAGEMENT, OTHER);
    const client = CloudTrailScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.on(DescribeTrailsCommand).resolves({ trailList: [orgTrail] });
    mocked.on(ListEventDataStoresCommand).resolves({ EventDataStores: [] });
    await scan(connector, context, client);

    const nodes = await nodesFor(connector, context);
    t.same(
      nodes.map((node) => node.$graph.id),
      [`${MANAGEMENT}-${OTHER}-cloudtrail`],
    );
    t.equal(statusNode(nodes, context).location?.code, OTHER);
  },
);

t.test("An account with no trails is disabled", async (t) => {
  const connector = newConnector();
  const context = contextFor(WORKLOAD);
  const client = CloudTrailScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked.on(DescribeTrailsCommand).resolves({ trailList: [] });
  mocked.on(ListEventDataStoresCommand).resolves({});
  await scan(connector, context, client);

  const nodes = await nodesFor(connector, context);
  t.equal(nodes.length, 1);
  const status = statusNode(nodes, context);
  t.same(status.serviceStatus, {
    service: "cloudtrail",
    status: "disabled",
    failedCalls: {},
  });
  t.same(status.cloudtrail.status, { trails: [], eventDataStores: [] });
});

t.test(
  "A denied DescribeTrails is unknown and the status node is still emitted",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = CloudTrailScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked
      .onAnyCommand()
      .rejects(new AccessDeniedException({ message: "denied", $metadata: {} }));
    await scan(connector, context, client);

    const state = await connector.resolveStateForServiceFunction(
      WORKLOAD,
      HOME,
      "CloudTrail",
      "DescribeTrails",
    );
    t.equal(state[0]._error.name, "AccessDeniedException");

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const status = statusNode(nodes, context);
    t.same(status.serviceStatus, {
      service: "cloudtrail",
      status: "unknown",
      statusReason: "AccessDeniedException",
      failedCalls: {
        DescribeTrails: "AccessDeniedException",
        ListEventDataStores: "AccessDeniedException",
      },
    });
    t.equal(status.$graph.parent, WORKLOAD);
    t.equal(status.location?.code, HOME);
  },
);
