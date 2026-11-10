import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  AccessDeniedException,
  BatchGetAccountStatusCommand,
  DescribeOrganizationConfigurationCommand,
  GetDelegatedAdminAccountCommand,
  Inspector2Client,
  ListDelegatedAdminAccountsCommand,
  ListMembersCommand,
  type Status,
} from "@aws-sdk/client-inspector2";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import InspectorScanner from ".";
import type { InspectorStatusState } from "./graph";

const AUDIT = "222222222222";
const WORKLOAD = "333333333333";
const SANDBOX = "444444444444";
const REGION = "eu-west-1";

function newConnector(): Connector {
  return buildFsConnector(mkdtempSync(join(tmpdir(), "infrascan-test-state-")));
}

function contextFor(account: string): AwsContext {
  return { account, region: REGION };
}

const denied = () =>
  new AccessDeniedException({ message: "denied", $metadata: {} });

function state(status: Status) {
  return { status, errorCode: undefined, errorMessage: undefined };
}

function accountStatus(account: string, status: Status) {
  return {
    accounts: [
      {
        accountId: account,
        state: state(status),
        resourceState: {
          ec2: state(status),
          ecr: state(status),
          lambda: state("DISABLED"),
        },
      },
    ],
    failedAccounts: [],
  };
}

async function scan(
  connector: Connector,
  context: AwsContext,
  client: Inspector2Client,
) {
  for (const getter of InspectorScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector, context: AwsContext) {
  const nodes: InspectorStatusState[] = [];
  for (const entity of InspectorScanner.entities ?? []) {
    for await (const node of generateNodesFromEntity(
      connector,
      context,
      entity,
    )) {
      nodes.push(node as BaseState as InspectorStatusState);
    }
  }
  return nodes;
}

interface Asserts {
  ok(value: unknown, message?: string): boolean;
  equal(found: unknown, wanted: unknown, message?: string): boolean;
}

function assertStatusNode(
  t: Asserts,
  node: InspectorStatusState | undefined,
  account: string,
) {
  t.ok(node, "status node emitted");
  t.equal(node?.$graph.id, `${account}-${REGION}-inspector2`);
  t.equal(node?.$graph.nodeType, "inspector2-status");
  t.equal(node?.$graph.nodeClass, "informational");
  t.equal(node?.$graph.parent, account);
  t.equal(node?.location?.code, REGION);
  t.equal(node?.tenant.tenantId, account);
  t.equal(node?.resource.category, "inspector2");
  t.equal(node?.resource.subcategory, "status");
  t.equal(node?.serviceStatus.service, "inspector2");
}

t.test(
  "Delegated administrator: organization configuration and members land on its status node",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(AUDIT);
    const client = InspectorScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked
      .on(BatchGetAccountStatusCommand)
      .resolves(accountStatus(AUDIT, "ENABLED"));
    mocked.on(GetDelegatedAdminAccountCommand).resolves({
      delegatedAdmin: { accountId: AUDIT, relationshipStatus: "ENABLED" },
    });
    mocked.on(ListDelegatedAdminAccountsCommand).rejects(denied());
    mocked.on(DescribeOrganizationConfigurationCommand).resolves({
      autoEnable: { ec2: true, ecr: false, lambda: true },
      maxAccountLimitReached: false,
    });
    mocked
      .on(ListMembersCommand, { nextToken: undefined })
      .resolves({
        members: [
          {
            accountId: WORKLOAD,
            relationshipStatus: "ENABLED",
            delegatedAdminAccountId: AUDIT,
            updatedAt: new Date("2024-03-01T00:00:00Z"),
          },
        ],
        nextToken: "page-2",
      })
      .on(ListMembersCommand, { nextToken: "page-2" })
      .resolves({
        members: [
          {
            accountId: SANDBOX,
            relationshipStatus: "CREATED",
            delegatedAdminAccountId: AUDIT,
          },
        ],
      });
    await scan(connector, context, client);

    t.same(
      mocked.commandCalls(BatchGetAccountStatusCommand)[0].args[0].input,
      {},
    );
    t.equal(mocked.commandCalls(ListMembersCommand).length, 2);
    t.equal(
      mocked.commandCalls(ListMembersCommand)[0].args[0].input.onlyAssociated,
      false,
    );

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const node = nodes[0];
    assertStatusNode(t, node, AUDIT);
    t.equal(node.serviceStatus.status, "enabled");
    t.equal(node.serviceStatus.statusReason, undefined);
    t.equal(node.serviceStatus.administratorAccountId, AUDIT);
    t.equal(node.serviceStatus.relationshipStatus, "ENABLED");
    t.same(node.serviceStatus.failedCalls, {
      ListDelegatedAdminAccounts: "AccessDeniedException",
    });

    const details = node.inspector2;
    t.same(details.state, { status: "ENABLED" });
    t.same(details.resourceState, {
      ec2: { status: "ENABLED" },
      ecr: { status: "ENABLED" },
      lambda: { status: "DISABLED" },
    });
    t.same(details.organizationConfiguration, {
      autoEnable: { ec2: true, ecr: false, lambda: true },
      maxAccountLimitReached: false,
    });
    t.same(details.members, [
      {
        accountId: WORKLOAD,
        relationshipStatus: "ENABLED",
        delegatedAdminAccountId: AUDIT,
        updatedAt: Date.parse("2024-03-01T00:00:00Z"),
      },
      {
        accountId: SANDBOX,
        relationshipStatus: "CREATED",
        delegatedAdminAccountId: AUDIT,
        updatedAt: null,
      },
    ]);
    t.equal(details.delegatedAdminAccounts, undefined);
    t.equal(InspectorScanner.getEdges, undefined);
  },
);

t.test(
  "Member account: enabled, administrator recorded, admin-only calls listed as failed",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = InspectorScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(denied());
    mocked
      .on(BatchGetAccountStatusCommand)
      .resolves(accountStatus(WORKLOAD, "ENABLED"));
    mocked.on(GetDelegatedAdminAccountCommand).resolves({
      delegatedAdmin: { accountId: AUDIT, relationshipStatus: "ENABLED" },
    });
    await scan(connector, context, client);

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    const node = nodes[0];
    assertStatusNode(t, node, WORKLOAD);
    t.equal(node.serviceStatus.status, "enabled");
    t.equal(node.serviceStatus.administratorAccountId, AUDIT);
    t.same(node.serviceStatus.failedCalls, {
      ListDelegatedAdminAccounts: "AccessDeniedException",
      DescribeOrganizationConfiguration: "AccessDeniedException",
      ListMembers: "AccessDeniedException",
    });
    t.equal(node.inspector2.organizationConfiguration, undefined);
    t.equal(node.inspector2.members, undefined);
  },
);

t.test("Management account: delegated administrators listed", async (t) => {
  const connector = newConnector();
  const context = contextFor("111111111111");
  const client = InspectorScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked.onAnyCommand().rejects(denied());
  mocked
    .on(BatchGetAccountStatusCommand)
    .resolves(accountStatus("111111111111", "DISABLED"));
  mocked.on(ListDelegatedAdminAccountsCommand).resolves({
    delegatedAdminAccounts: [{ accountId: AUDIT, status: "ENABLED" }],
  });
  await scan(connector, context, client);

  const nodes = await nodesFor(connector, context);
  t.same(nodes[0].inspector2.delegatedAdminAccounts, [
    { accountId: AUDIT, status: "ENABLED" },
  ]);
});

t.test("Inspector disabled → status disabled", async (t) => {
  t.test("disabled", async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = InspectorScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(denied());
    mocked
      .on(BatchGetAccountStatusCommand)
      .resolves(accountStatus(WORKLOAD, "DISABLED"));
    await scan(connector, context, client);

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    assertStatusNode(t, nodes[0], WORKLOAD);
    t.equal(nodes[0].serviceStatus.status, "disabled");
    t.equal(nodes[0].serviceStatus.statusReason, undefined);
    t.equal(nodes[0].serviceStatus.administratorAccountId, undefined);
  });

  t.test(
    "transitional state is unknown with the state as reason",
    async (t) => {
      const connector = newConnector();
      const context = contextFor(WORKLOAD);
      const client = InspectorScanner.getClient(fromProcess(), context);
      const mocked = mockClient(client);
      mocked.onAnyCommand().rejects(denied());
      mocked
        .on(BatchGetAccountStatusCommand)
        .resolves(accountStatus(WORKLOAD, "ENABLING"));
      await scan(connector, context, client);

      const nodes = await nodesFor(connector, context);
      t.equal(nodes[0].serviceStatus.status, "unknown");
      t.equal(nodes[0].serviceStatus.statusReason, "ENABLING");
    },
  );

  t.test("account reported under failedAccounts", async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = InspectorScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(denied());
    mocked.on(BatchGetAccountStatusCommand).resolves({
      accounts: [],
      failedAccounts: [
        {
          accountId: WORKLOAD,
          errorCode: "ACCESS_DENIED",
          errorMessage: "denied",
          resourceStatus: { ec2: "DISABLED", ecr: "DISABLED" },
        },
      ],
    });
    await scan(connector, context, client);

    const nodes = await nodesFor(connector, context);
    t.equal(nodes[0].serviceStatus.status, "unknown");
    t.equal(nodes[0].serviceStatus.statusReason, "ACCESS_DENIED");
    t.same(nodes[0].inspector2.failedAccount?.resourceStatus, {
      ec2: "DISABLED",
      ecr: "DISABLED",
    });
  });
});

t.test(
  "Status call denied → status unknown with the error name, node still emitted",
  async (t) => {
    const connector = newConnector();
    const context = contextFor(WORKLOAD);
    const client = InspectorScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.onAnyCommand().rejects(denied());
    await scan(connector, context, client);

    const recorded = await connector.resolveStateForServiceFunction(
      WORKLOAD,
      REGION,
      "Inspector2",
      "BatchGetAccountStatus",
    );
    t.equal(recorded[0]._error.name, "AccessDeniedException");

    const nodes = await nodesFor(connector, context);
    t.equal(nodes.length, 1);
    assertStatusNode(t, nodes[0], WORKLOAD);
    t.equal(nodes[0].serviceStatus.status, "unknown");
    t.equal(nodes[0].serviceStatus.statusReason, "AccessDeniedException");
    t.equal(
      nodes[0].serviceStatus.failedCalls.BatchGetAccountStatus,
      "AccessDeniedException",
    );
    t.equal(nodes[0].inspector2.state, undefined);
  },
);

t.test("No state recorded → no node", async (t) => {
  const connector = newConnector();
  t.same(await nodesFor(connector, contextFor(WORKLOAD)), []);
});
