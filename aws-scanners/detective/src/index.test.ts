import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  AccessDeniedException,
  DescribeOrganizationConfigurationCommand,
  DetectiveClient,
  ListDatasourcePackagesCommand,
  ListGraphsCommand,
  ListInvitationsCommand,
  ListMembersCommand,
  ListOrganizationAdminAccountsCommand,
  TooManyRequestsException,
} from "@aws-sdk/client-detective";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import DetectiveScanner from ".";
import type { GraphState } from "./graph";

const MANAGEMENT = "111111111111";
const ADMIN = "222222222222";
const MEMBER = "333333333333";
const REGION = "eu-west-1";
const GRAPH_ARN = `arn:aws:detective:${REGION}:${ADMIN}:graph:abc123`;

function newConnector(): Connector {
  return buildFsConnector(mkdtempSync(join(tmpdir(), "infrascan-test-state-")));
}

function contextFor(account: string): AwsContext {
  return { account, region: REGION, partition: "aws" };
}

const denied = () =>
  new AccessDeniedException({ message: "denied", $metadata: {} });

async function scan(
  connector: Connector,
  context: AwsContext,
  client: DetectiveClient,
) {
  for (const getter of DetectiveScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector, context: AwsContext) {
  const nodes: GraphState[] = [];
  for (const entity of DetectiveScanner.entities ?? []) {
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

/**
 * The fields every status node carries, so each test can compare them in one assertion.
 */
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
    id: `${account}-${REGION}-detective`,
    nodeType: "detective-status",
    nodeClass: "informational",
    parent: account,
    location: REGION,
    tenant: account,
    category: "detective",
    subcategory: "status",
    service: "detective",
  };
}

t.test(
  "Administrator account reports its graph, members, packages and org configuration",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(ADMIN);
    const client = DetectiveScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.on(ListGraphsCommand).resolves({
      GraphList: [
        { Arn: GRAPH_ARN, CreatedTime: new Date("2024-01-01T00:00:00Z") },
      ],
    });
    mocked
      .on(ListMembersCommand, { GraphArn: GRAPH_ARN })
      .resolves({
        MemberDetails: [
          {
            AccountId: MEMBER,
            EmailAddress: "member@example.com",
            GraphArn: GRAPH_ARN,
            AdministratorId: ADMIN,
            Status: "ENABLED",
            InvitationType: "ORGANIZATION",
            InvitedTime: new Date("2024-01-02T00:00:00Z"),
            UpdatedTime: new Date("2024-01-03T00:00:00Z"),
            VolumeUsageInBytes: 1000,
            DatasourcePackageIngestStates: { DETECTIVE_CORE: "STARTED" },
          },
        ],
        NextToken: "page-2",
      })
      .on(ListMembersCommand, { GraphArn: GRAPH_ARN, NextToken: "page-2" })
      .resolves({
        MemberDetails: [
          {
            AccountId: MANAGEMENT,
            GraphArn: GRAPH_ARN,
            AdministratorId: ADMIN,
            Status: "INVITED",
            InvitationType: "INVITATION",
          },
        ],
      });
    mocked
      .on(DescribeOrganizationConfigurationCommand)
      .resolves({ AutoEnable: true });
    mocked.on(ListDatasourcePackagesCommand).resolves({
      DatasourcePackages: {
        DETECTIVE_CORE: { DatasourcePackageIngestState: "STARTED" },
        EKS_AUDIT: { DatasourcePackageIngestState: "DISABLED" },
      },
    });
    // Only the management account can list the organization's Detective administrator.
    mocked.on(ListOrganizationAdminAccountsCommand).rejects(denied());
    mocked.on(ListInvitationsCommand).resolves({ Invitations: [] });
    await scan(connector, context, client);

    t.equal(mocked.commandCalls(ListMembersCommand).length, 2);

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const [node] = nodes;
    t.same(header(node), expectedHeader(ADMIN));
    t.same(node.serviceStatus, {
      service: "detective",
      status: "enabled",
      failedCalls: {
        ListOrganizationAdminAccounts: "AccessDeniedException",
      },
    });
    t.same(node.detective.graphs, [
      {
        arn: GRAPH_ARN,
        createdAt: Date.parse("2024-01-01T00:00:00Z"),
        organizationAutoEnable: true,
        members: [
          {
            accountId: MEMBER,
            administratorAccountId: ADMIN,
            status: "ENABLED",
            invitationType: "ORGANIZATION",
            invitedAt: Date.parse("2024-01-02T00:00:00Z"),
            updatedAt: Date.parse("2024-01-03T00:00:00Z"),
            datasourcePackageIngestStates: { DETECTIVE_CORE: "STARTED" },
          },
          {
            accountId: MANAGEMENT,
            administratorAccountId: ADMIN,
            status: "INVITED",
            invitationType: "INVITATION",
            invitedAt: null,
            updatedAt: null,
            datasourcePackageIngestStates: {},
          },
        ],
        datasourcePackages: [
          { datasourcePackage: "DETECTIVE_CORE", ingestState: "STARTED" },
          { datasourcePackage: "EKS_AUDIT", ingestState: "DISABLED" },
        ],
      },
    ]);
    t.same(node.detective.memberships, []);
    t.equal(node.detective.organizationAdminAccounts, undefined);
    t.notOk(
      JSON.stringify(node).includes("member@example.com"),
      "member emails are not recorded",
    );
    t.notOk(
      JSON.stringify(node).includes("1000"),
      "volume usage is not recorded",
    );
  },
);

t.test(
  "Member account reports its administrator and lists denied admin-only calls",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(MEMBER);
    const client = DetectiveScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(denied());
    mocked.on(ListInvitationsCommand).resolves({
      Invitations: [
        {
          AccountId: MEMBER,
          GraphArn: GRAPH_ARN,
          AdministratorId: ADMIN,
          Status: "ENABLED",
          InvitationType: "ORGANIZATION",
          UpdatedTime: new Date("2024-01-03T00:00:00Z"),
        },
      ],
    });
    await scan(connector, context, client);

    // No graph is administered, so nothing per graph is called.
    t.equal(mocked.commandCalls(ListMembersCommand).length, 0);
    t.equal(mocked.commandCalls(ListDatasourcePackagesCommand).length, 0);

    const [node] = await nodesFor(connector, context);
    t.same(header(node), expectedHeader(MEMBER));
    t.equal(node.serviceStatus.status, "enabled");
    t.equal(node.serviceStatus.administratorAccountId, ADMIN);
    t.equal(node.serviceStatus.relationshipStatus, "ENABLED");
    t.same(node.serviceStatus.failedCalls, {
      ListGraphs: "AccessDeniedException",
      ListOrganizationAdminAccounts: "AccessDeniedException",
    });
    t.same(node.detective.memberships, [
      {
        graphArn: GRAPH_ARN,
        administratorAccountId: ADMIN,
        status: "ENABLED",
        invitationType: "ORGANIZATION",
        invitedAt: null,
        updatedAt: Date.parse("2024-01-03T00:00:00Z"),
      },
    ]);
    t.same(node.detective.graphs, []);
  },
);

t.test("Management account with Detective disabled", async (t) => {
  const connector = newConnector();
  const context = contextFor(MANAGEMENT);
  const client = DetectiveScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked.on(ListGraphsCommand).resolves({ GraphList: [] });
  mocked.on(ListOrganizationAdminAccountsCommand).resolves({
    Administrators: [
      {
        AccountId: ADMIN,
        GraphArn: GRAPH_ARN,
        DelegationTime: new Date("2024-01-01T00:00:00Z"),
      },
    ],
  });
  mocked.on(ListInvitationsCommand).resolves({
    Invitations: [
      {
        AccountId: MANAGEMENT,
        GraphArn: GRAPH_ARN,
        AdministratorId: ADMIN,
        Status: "ACCEPTED_BUT_DISABLED",
        DisabledReason: "VOLUME_TOO_HIGH",
      },
    ],
  });
  await scan(connector, context, client);

  const [node] = await nodesFor(connector, context);
  t.same(header(node), expectedHeader(MANAGEMENT));
  t.same(node.serviceStatus, {
    service: "detective",
    status: "disabled",
    statusReason: "VOLUME_TOO_HIGH",
    administratorAccountId: ADMIN,
    relationshipStatus: "ACCEPTED_BUT_DISABLED",
    failedCalls: {},
  });
  t.same(node.detective.organizationAdminAccounts, [
    {
      accountId: ADMIN,
      graphArn: GRAPH_ARN,
      delegatedAt: Date.parse("2024-01-01T00:00:00Z"),
    },
  ]);
});

t.test("Account with no graph and no membership is disabled", async (t) => {
  const connector = newConnector();
  const context = contextFor(MEMBER);
  const client = DetectiveScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked.on(ListGraphsCommand).resolves({ GraphList: [] });
  mocked.on(ListOrganizationAdminAccountsCommand).rejects(denied());
  mocked.on(ListInvitationsCommand).resolves({ Invitations: [] });
  await scan(connector, context, client);

  const [node] = await nodesFor(connector, context);
  t.same(header(node), expectedHeader(MEMBER));
  t.equal(node.serviceStatus.status, "disabled");
  t.equal(node.serviceStatus.statusReason, undefined);
  t.equal(node.serviceStatus.administratorAccountId, undefined);
});

t.test(
  "Status calls that fail give unknown and still emit the node",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(MEMBER);
    const client = DetectiveScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.on(ListGraphsCommand).rejects(denied());
    mocked.on(ListOrganizationAdminAccountsCommand).rejects(denied());
    mocked
      .on(ListInvitationsCommand)
      .rejects(
        new TooManyRequestsException({ message: "slow down", $metadata: {} }),
      );
    await scan(connector, context, client);

    const state = await connector.resolveStateForServiceFunction(
      MEMBER,
      REGION,
      "Detective",
      "ListInvitations",
    );
    t.equal(state[0]._error.name, "TooManyRequestsException");

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const [node] = nodes;
    t.same(header(node), expectedHeader(MEMBER));
    t.equal(node.serviceStatus.status, "unknown");
    t.equal(node.serviceStatus.statusReason, "AccessDeniedException");
    t.same(node.serviceStatus.failedCalls, {
      ListGraphs: "AccessDeniedException",
      ListOrganizationAdminAccounts: "AccessDeniedException",
      ListInvitations: "TooManyRequestsException",
    });
  },
);

t.test(
  "No node is emitted for an account and region never scanned",
  async (t) => {
    const connector = newConnector();
    t.same(await nodesFor(connector, contextFor(MEMBER)), []);
  },
);
