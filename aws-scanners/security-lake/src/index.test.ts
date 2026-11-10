import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  AccessDeniedException,
  GetDataLakeOrganizationConfigurationCommand,
  ListDataLakesCommand,
  ListLogSourcesCommand,
  ListSubscribersCommand,
  SecurityLakeClient,
  ThrottlingException,
} from "@aws-sdk/client-securitylake";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import SecurityLakeScanner from ".";
import type { GraphState } from "./graph";

const ADMIN = "222222222222";
const MEMBER = "333333333333";
const REGION = "eu-west-1";
const LAKE_ARN = `arn:aws:securitylake:${REGION}:${ADMIN}:data-lake/default`;
const BUCKET_ARN = `arn:aws:s3:::aws-security-data-lake-${REGION}-abc`;
const KMS_KEY = `arn:aws:kms:${REGION}:${ADMIN}:key/1234`;
const SUBSCRIBER_ARN = `arn:aws:securitylake:${REGION}:${ADMIN}:subscriber/sub-1`;

function newConnector(): Connector {
  return buildFsConnector(mkdtempSync(join(tmpdir(), "infrascan-test-state-")));
}

function contextFor(account: string): AwsContext {
  return { account, region: REGION, partition: "aws" };
}

const denied = () =>
  new AccessDeniedException({ message: "denied", $metadata: {} });

const dataLake = (region: string, account: string) => ({
  dataLakeArn: `arn:aws:securitylake:${region}:${account}:data-lake/default`,
  region,
  s3BucketArn: BUCKET_ARN,
  encryptionConfiguration: { kmsKeyId: KMS_KEY },
  lifecycleConfiguration: {
    expiration: { days: 365 },
    transitions: [{ storageClass: "STANDARD_IA", days: 30 }],
  },
  replicationConfiguration: {
    regions: ["us-east-1"],
    roleArn: `arn:aws:iam::${account}:role/replication`,
  },
  createStatus: "COMPLETED" as const,
  updateStatus: { status: "COMPLETED" as const },
});

async function scan(
  connector: Connector,
  context: AwsContext,
  client: SecurityLakeClient,
) {
  for (const getter of SecurityLakeScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector, context: AwsContext) {
  const nodes: GraphState[] = [];
  for (const entity of SecurityLakeScanner.entities ?? []) {
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

function header(node: GraphState) {
  return {
    id: node.$graph.id,
    nodeType: node.$graph.nodeType,
    nodeClass: node.$graph.nodeClass,
    parent: node.$graph.parent,
    location: node.location?.code,
    tenant: node.tenant.tenantId,
    category: node.resource.category,
    subcategory: node.resource.subcategory,
    service: node.serviceStatus.service,
  };
}

function expectedHeader(account: string) {
  return {
    id: `${account}-${REGION}-securitylake`,
    nodeType: "securitylake-status",
    nodeClass: "informational",
    parent: account,
    location: REGION,
    tenant: account,
    category: "securitylake",
    subcategory: "status",
    service: "securitylake",
  };
}

t.test(
  "Delegated administrator reports its data lake, sources, org configuration and subscribers",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(ADMIN);
    const client = SecurityLakeScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.on(ListDataLakesCommand).resolves({
      dataLakes: [dataLake(REGION, ADMIN)],
    });
    mocked
      .on(ListLogSourcesCommand)
      .resolves({
        sources: [
          {
            account: ADMIN,
            region: REGION,
            sources: [
              {
                awsLogSource: {
                  sourceName: "CLOUD_TRAIL_MGMT",
                  sourceVersion: "2.0",
                },
              },
              {
                customLogSource: {
                  sourceName: "firewall",
                  sourceVersion: "1.0",
                  provider: {
                    roleArn: "arn:aws:iam::1:role/x",
                    location: "s3://x",
                  },
                },
              },
            ],
          },
        ],
        nextToken: "page-2",
      })
      .on(ListLogSourcesCommand, { regions: [REGION], nextToken: "page-2" })
      .resolves({
        sources: [
          {
            account: MEMBER,
            region: REGION,
            sources: [
              {
                awsLogSource: { sourceName: "VPC_FLOW", sourceVersion: "2.0" },
              },
            ],
          },
        ],
      });
    mocked.on(GetDataLakeOrganizationConfigurationCommand).resolves({
      autoEnableNewAccount: [
        {
          region: REGION,
          sources: [{ sourceName: "CLOUD_TRAIL_MGMT", sourceVersion: "2.0" }],
        },
        {
          region: "us-east-1",
          sources: [{ sourceName: "ROUTE53", sourceVersion: "2.0" }],
        },
      ],
    });
    mocked.on(ListSubscribersCommand).resolves({
      subscribers: [
        {
          subscriberId: "sub-1",
          subscriberArn: SUBSCRIBER_ARN,
          subscriberName: "siem",
          subscriberIdentity: {
            principal: MEMBER,
            externalId: "secret-external-id",
          },
          sources: [
            { awsLogSource: { sourceName: "VPC_FLOW", sourceVersion: "2.0" } },
          ],
          accessTypes: ["S3"],
          subscriberStatus: "ACTIVE",
          createdAt: new Date("2024-01-01T00:00:00Z"),
        },
      ],
    });
    await scan(connector, context, client);

    t.same(
      mocked.commandCalls(ListDataLakesCommand)[0].args[0].input,
      { regions: [REGION] },
      "data lakes are listed for the scanned region",
    );
    t.equal(mocked.commandCalls(ListLogSourcesCommand).length, 2);

    const raw = await connector.resolveStateForServiceFunction(
      ADMIN,
      REGION,
      "SecurityLake",
      "ListSubscribers",
    );
    t.notOk(
      JSON.stringify(raw).includes("secret-external-id"),
      "the subscriber external id is not recorded in state",
    );

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const [node] = nodes;
    t.same(header(node), expectedHeader(ADMIN));
    t.same(node.serviceStatus, {
      service: "securitylake",
      status: "enabled",
      failedCalls: {},
    });
    t.same(node.securitylake.dataLake, {
      arn: LAKE_ARN,
      region: REGION,
      s3BucketArn: BUCKET_ARN,
      kmsKeyId: KMS_KEY,
      lifecycle: {
        expirationDays: 365,
        transitions: [{ storageClass: "STANDARD_IA", days: 30 }],
      },
      replication: {
        regions: ["us-east-1"],
        roleArn: `arn:aws:iam::${ADMIN}:role/replication`,
      },
      createStatus: "COMPLETED",
      updateStatus: "COMPLETED",
    });
    t.equal(node.encryption?.keyId, KMS_KEY);
    t.same(node.securitylake.logSources, [
      {
        account: ADMIN,
        region: REGION,
        sources: [
          { type: "aws", name: "CLOUD_TRAIL_MGMT", version: "2.0" },
          { type: "custom", name: "firewall", version: "1.0" },
        ],
      },
      {
        account: MEMBER,
        region: REGION,
        sources: [{ type: "aws", name: "VPC_FLOW", version: "2.0" }],
      },
    ]);
    t.same(node.securitylake.organizationAutoEnableSources, [
      { type: "aws", name: "CLOUD_TRAIL_MGMT", version: "2.0" },
    ]);
    t.same(node.securitylake.subscribers, [
      {
        id: "sub-1",
        arn: SUBSCRIBER_ARN,
        name: "siem",
        principal: MEMBER,
        accessTypes: ["S3"],
        sources: [{ type: "aws", name: "VPC_FLOW", version: "2.0" }],
        status: "ACTIVE",
        createdAt: Date.parse("2024-01-01T00:00:00Z"),
        updatedAt: null,
      },
    ]);
    t.notOk(JSON.stringify(node).includes("secret-external-id"));
  },
);

t.test(
  "Account with its own data lake lists the denied administrator-only calls",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(MEMBER);
    const client = SecurityLakeScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(denied());
    mocked.on(ListDataLakesCommand).resolves({
      dataLakes: [dataLake(REGION, MEMBER)],
    });
    mocked.on(ListLogSourcesCommand).resolves({ sources: [] });
    await scan(connector, context, client);

    const [node] = await nodesFor(connector, context);
    t.same(header(node), expectedHeader(MEMBER));
    t.equal(node.serviceStatus.status, "enabled");
    t.same(node.serviceStatus.failedCalls, {
      GetDataLakeOrganizationConfiguration: "AccessDeniedException",
      ListSubscribers: "AccessDeniedException",
    });
    t.same(node.securitylake.logSources, []);
    t.equal(node.securitylake.organizationAutoEnableSources, undefined);
    t.equal(node.securitylake.subscribers, undefined);
  },
);

t.test("Region without a data lake is disabled", async (t) => {
  const connector = newConnector();
  const context = contextFor(MEMBER);
  const client = SecurityLakeScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  // A data lake in another region does not count for the scanned one.
  mocked.on(ListDataLakesCommand).resolves({
    dataLakes: [dataLake("us-east-1", MEMBER)],
  });
  await scan(connector, context, client);

  // Nothing to describe without a data lake in the region.
  t.equal(mocked.commandCalls(ListLogSourcesCommand).length, 0);
  t.equal(mocked.commandCalls(ListSubscribersCommand).length, 0);
  t.equal(
    mocked.commandCalls(GetDataLakeOrganizationConfigurationCommand).length,
    0,
  );

  const [node] = await nodesFor(connector, context);
  t.same(header(node), expectedHeader(MEMBER));
  t.same(node.serviceStatus, {
    service: "securitylake",
    status: "disabled",
    failedCalls: {},
  });
  t.equal(node.securitylake.dataLake, undefined);
});

t.test(
  "A failed ListDataLakes gives unknown and still emits the node",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(MEMBER);
    const client = SecurityLakeScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.on(ListDataLakesCommand).rejects(denied());
    await scan(connector, context, client);

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const [node] = nodes;
    t.same(header(node), expectedHeader(MEMBER));
    t.same(node.serviceStatus, {
      service: "securitylake",
      status: "unknown",
      statusReason: "AccessDeniedException",
      failedCalls: { ListDataLakes: "AccessDeniedException" },
    });
  },
);

t.test("Throttling is reported as unknown, never disabled", async (t) => {
  const connector = newConnector();
  const context = contextFor(MEMBER);
  const client = SecurityLakeScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked
    .on(ListDataLakesCommand)
    .rejects(new ThrottlingException({ message: "slow down", $metadata: {} }));
  await scan(connector, context, client);

  const [node] = await nodesFor(connector, context);
  t.equal(node.serviceStatus.status, "unknown");
  t.equal(node.serviceStatus.statusReason, "ThrottlingException");
});
