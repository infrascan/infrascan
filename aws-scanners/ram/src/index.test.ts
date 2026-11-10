import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  GetResourceSharesCommand,
  ListPrincipalsCommand,
  ListResourcesCommand,
  RAMClient,
} from "@aws-sdk/client-ram";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import RAMScanner from ".";
import type { GraphState, ResourceShareDetails, StatusState } from "./graph";

const MANAGEMENT = "111111111111";
const NETWORK = "222222222222";
const WORKLOAD = "333333333333";
const REGION = "us-east-1";
const ORG_ARN = `arn:aws:organizations::${MANAGEMENT}:organization/o-abc123`;
const OU_ARN = `arn:aws:organizations::${MANAGEMENT}:ou/o-abc123/ou-ab12-prod`;
const ROLE_ARN = `arn:aws:iam::${WORKLOAD}:role/consumer`;
const shareArn = (account: string, id: string) =>
  `arn:aws:ram:${REGION}:${account}:resource-share/${id}`;
const SUBNETS = shareArn(NETWORK, "subnets");
const OLD = shareArn(NETWORK, "old");
const INCOMING = shareArn(MANAGEMENT, "ipam");

function awsError(name: string): Error {
  const error = new Error(`${name} message`);
  error.name = name;
  return error;
}

function newConnector(): Connector {
  return buildFsConnector(mkdtempSync(join(tmpdir(), "infrascan-test-state-")));
}

function contextFor(account: string): AwsContext {
  return { account, region: REGION };
}

async function scan(
  connector: Connector,
  context: AwsContext,
  client: RAMClient,
) {
  for (const getter of RAMScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector, context: AwsContext) {
  const nodes: GraphState[] = [];
  for (const entity of RAMScanner.entities ?? []) {
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

const statusOf = (nodes: GraphState[]) =>
  nodes.find((node) => node.$graph.nodeType === "ram-status") as StatusState;

const shareDetails = (node?: GraphState) =>
  (node as { ram: { resourceShare: ResourceShareDetails } }).ram.resourceShare;

t.test(
  "Owned shares become nodes with their principals, resources and edges",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(NETWORK);
    const client = RAMScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked
      .on(GetResourceSharesCommand, { resourceOwner: "SELF" })
      .resolvesOnce({
        resourceShares: [
          {
            resourceShareArn: SUBNETS,
            name: "subnets",
            owningAccountId: NETWORK,
            allowExternalPrincipals: false,
            status: "ACTIVE",
            featureSet: "STANDARD",
            creationTime: new Date("2024-01-01T00:00:00Z"),
            tags: [{ key: "team", value: "network" }],
          },
        ],
        nextToken: "page-2",
      })
      .resolves({
        resourceShares: [
          {
            resourceShareArn: OLD,
            name: "old",
            owningAccountId: NETWORK,
            status: "DELETED",
          },
        ],
      })
      .on(GetResourceSharesCommand, { resourceOwner: "OTHER-ACCOUNTS" })
      .resolves({
        resourceShares: [
          {
            resourceShareArn: INCOMING,
            name: "ipam",
            owningAccountId: MANAGEMENT,
            status: "ACTIVE",
            allowExternalPrincipals: true,
          },
        ],
      });
    mocked.on(ListPrincipalsCommand).resolves({
      principals: [
        { id: WORKLOAD, resourceShareArn: SUBNETS, external: false },
        { id: OU_ARN, resourceShareArn: SUBNETS, external: false },
        { id: ORG_ARN, resourceShareArn: SUBNETS, external: false },
        { id: ROLE_ARN, resourceShareArn: SUBNETS, external: false },
        {
          id: "logs.amazonaws.com",
          resourceShareArn: SUBNETS,
          external: false,
        },
      ],
    });
    mocked.on(ListResourcesCommand).resolves({
      resources: [
        {
          arn: `arn:aws:ec2:${REGION}:${NETWORK}:subnet/subnet-1`,
          type: "ec2:Subnet",
          resourceShareArn: SUBNETS,
          status: "AVAILABLE",
          resourceRegionScope: "REGIONAL",
        },
      ],
    });
    await scan(connector, context, client);

    t.same(
      mocked.commandCalls(GetResourceSharesCommand).map((c) => c.args[0].input),
      [
        { resourceOwner: "SELF" },
        { resourceOwner: "SELF", nextToken: "page-2" },
        { resourceOwner: "OTHER-ACCOUNTS" },
      ],
    );
    t.same(mocked.commandCalls(ListPrincipalsCommand)[0].args[0].input, {
      resourceOwner: "SELF",
    });
    t.same(mocked.commandCalls(ListResourcesCommand)[0].args[0].input, {
      resourceOwner: "SELF",
      resourceRegionScope: "ALL",
    });

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 3, "status and two owned shares");
    for (const node of nodes) {
      t.equal(node.$graph.nodeClass, "informational");
      t.equal(node.$graph.parent, NETWORK);
      t.equal(node.tenant.tenantId, NETWORK);
      t.equal(node.location?.code, REGION);
      t.equal(node.resource.category, "ram");
    }
    const byId = new Map(nodes.map((node) => [node.$graph.id, node]));
    t.notOk(byId.has(INCOMING), "incoming shares are not nodes");

    const status = statusOf(nodes);
    t.equal(status.$graph.id, `${NETWORK}-${REGION}-ram`);
    t.equal(status.resource.subcategory, "status");
    t.same(status.serviceStatus, {
      service: "ram",
      status: "enabled",
      statusReason: undefined,
      failedCalls: {},
    });
    t.same(status.ram.status.incomingResourceShares, [
      {
        arn: INCOMING,
        name: "ipam",
        owningAccountId: MANAGEMENT,
        status: "ACTIVE",
      },
    ]);

    const subnets = byId.get(SUBNETS);
    t.equal(subnets?.$graph.nodeType, "ram-resource-share");
    t.same(subnets?.tags, [{ key: "team", value: "network" }]);
    t.equal(subnets?.audit?.createdAt, Date.parse("2024-01-01T00:00:00Z"));
    const details = shareDetails(subnets);
    t.equal(details.allowExternalPrincipals, false);
    t.equal(details.featureSet, "STANDARD");
    t.same(
      details.principals.map(({ id }) => id),
      [WORKLOAD, OU_ARN, ORG_ARN, ROLE_ARN, "logs.amazonaws.com"],
    );
    t.same(details.resources, [
      {
        arn: `arn:aws:ec2:${REGION}:${NETWORK}:subnet/subnet-1`,
        type: "ec2:Subnet",
        status: "AVAILABLE",
        regionScope: "REGIONAL",
        resourceGroupArn: undefined,
      },
    ]);
    t.equal(shareDetails(byId.get(OLD)).status, "DELETED");

    const edges = await RAMScanner.getEdges!(connector);
    t.same(
      edges.map(({ source, target, metadata }) => [
        source,
        target,
        metadata?.label,
      ]),
      [
        [SUBNETS, WORKLOAD, "shared-with"],
        [SUBNETS, OU_ARN, "shared-with"],
        [SUBNETS, ORG_ARN, "shared-with"],
      ],
      "IAM and service principals are facts, not edges",
    );
  },
);

t.test("An account without shares reports disabled", async (t) => {
  const connector = newConnector();
  const context = contextFor(WORKLOAD);
  const client = RAMScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked.on(GetResourceSharesCommand).resolves({ resourceShares: [] });
  mocked.on(ListPrincipalsCommand).resolves({ principals: [] });
  mocked.on(ListResourcesCommand).resolves({ resources: [] });
  await scan(connector, context, client);

  const nodes = await nodesFor(connector, context);
  t.equal(nodes.length, 1);
  const status = statusOf(nodes);
  t.equal(status.$graph.parent, WORKLOAD);
  t.equal(status.serviceStatus.status, "disabled");
  t.same(status.ram.status.incomingResourceShares, []);
  t.same(await RAMScanner.getEdges!(connector), []);
});

t.test("Denied calls give an unknown status, not disabled", async (t) => {
  const connector = newConnector();
  const context = contextFor(WORKLOAD);
  const client = RAMScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked.onAnyCommand().rejects(awsError("AccessDeniedException"));
  await scan(connector, context, client);

  const state = await connector.resolveStateForServiceFunction(
    WORKLOAD,
    REGION,
    "RAM",
    "GetResourceShares",
  );
  t.equal(state.length, 2);
  t.equal(state[0]._error.name, "AccessDeniedException");

  const nodes = await nodesFor(connector, context);
  t.equal(nodes.length, 1);
  const status = statusOf(nodes);
  t.equal(status.$graph.id, `${WORKLOAD}-${REGION}-ram`);
  t.equal(status.tenant.tenantId, WORKLOAD);
  t.equal(status.location?.code, REGION);
  t.same(status.serviceStatus, {
    service: "ram",
    status: "unknown",
    statusReason: "AccessDeniedException",
    failedCalls: {
      GetResourceShares: "AccessDeniedException",
      ListPrincipals: "AccessDeniedException",
      ListResources: "AccessDeniedException",
    },
  });
});

t.test(
  "An incoming share is enough to report enabled when the owned listing fails",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = RAMScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked
      .on(GetResourceSharesCommand, { resourceOwner: "SELF" })
      .rejects(awsError("AccessDeniedException"))
      .on(GetResourceSharesCommand, { resourceOwner: "OTHER-ACCOUNTS" })
      .resolves({
        resourceShares: [
          {
            resourceShareArn: SUBNETS,
            name: "subnets",
            owningAccountId: NETWORK,
            status: "ACTIVE",
          },
        ],
      });
    mocked.on(ListPrincipalsCommand).resolves({ principals: [] });
    mocked.on(ListResourcesCommand).resolves({ resources: [] });
    await scan(connector, context, client);

    const status = statusOf(await nodesFor(connector, context));
    t.equal(status.serviceStatus.status, "enabled");
    t.same(status.serviceStatus.failedCalls, {
      GetResourceShares: "AccessDeniedException",
    });
    t.equal(
      status.ram.status.incomingResourceShares[0].owningAccountId,
      NETWORK,
    );
  },
);
