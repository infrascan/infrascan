import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  AccessDeniedException,
  AccountClient,
  GetAlternateContactCommand,
  ListRegionsCommand,
  ResourceNotFoundException,
  TooManyRequestsException,
} from "@aws-sdk/client-account";
import { generateNodesFromEntity } from "@infrascan/core";
import buildFsConnector from "@infrascan/fs-connector";
import type { AwsContext, BaseState, Connector } from "@infrascan/shared-types";
import AccountScanner from ".";
import type { GraphState } from "./graph";

const ACCOUNT = "333333333333";
const PII = [
  "Jane Doe",
  "CISO",
  "security@example.com",
  "+1-555-0100",
  "Billing Person",
  "billing@example.com",
];

function newConnector(): Connector {
  return buildFsConnector(mkdtempSync(join(tmpdir(), "infrascan-test-state-")));
}

const context: AwsContext = {
  account: ACCOUNT,
  region: "us-east-1",
  partition: "aws",
};

const denied = () =>
  new AccessDeniedException({ message: "denied", $metadata: {} });
const notFound = () =>
  new ResourceNotFoundException({ message: "not found", $metadata: {} });

async function scan(connector: Connector, client: AccountClient) {
  for (const getter of AccountScanner.getters) {
    await getter(client, connector, context);
  }
}

async function nodesFor(connector: Connector) {
  const nodes: GraphState[] = [];
  for (const entity of AccountScanner.entities ?? []) {
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
    location: node.location,
    tenant: node.tenant.tenantId,
    category: node.resource.category,
    subcategory: node.resource.subcategory,
    service: node.serviceStatus.service,
  };
}

const expectedHeader = {
  id: `${ACCOUNT}-account`,
  nodeType: "account-status",
  nodeClass: "informational",
  parent: ACCOUNT,
  location: undefined,
  tenant: ACCOUNT,
  category: "account",
  subcategory: "status",
  service: "account",
};

async function assertNoPii(
  t: { notOk: (value: unknown, message?: string) => void },
  connector: Connector,
  node: GraphState,
) {
  const state = await connector.resolveStateForServiceFunction(
    ACCOUNT,
    "us-east-1",
    "Account",
    "GetAlternateContact",
  );
  for (const value of PII) {
    t.notOk(JSON.stringify(node).includes(value), `${value} not in node`);
    t.notOk(JSON.stringify(state).includes(value), `${value} not in state`);
  }
}

t.test(
  "Readable account reports its regions and which contacts are set",
  async (t) => {
    const connector = newConnector();
    const client = AccountScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked
      .on(ListRegionsCommand)
      .resolves({
        Regions: [
          { RegionName: "us-east-1", RegionOptStatus: "ENABLED_BY_DEFAULT" },
          { RegionName: "af-south-1", RegionOptStatus: "DISABLED" },
        ],
        NextToken: "page-2",
      })
      .on(ListRegionsCommand, { NextToken: "page-2" })
      .resolves({
        Regions: [{ RegionName: "eu-south-1", RegionOptStatus: "ENABLED" }],
      });
    mocked
      .on(GetAlternateContactCommand, { AlternateContactType: "SECURITY" })
      .resolves({
        AlternateContact: {
          AlternateContactType: "SECURITY",
          Name: "Jane Doe",
          Title: "CISO",
          EmailAddress: "security@example.com",
          PhoneNumber: "+1-555-0100",
        },
      })
      .on(GetAlternateContactCommand, { AlternateContactType: "BILLING" })
      .resolves({
        AlternateContact: {
          AlternateContactType: "BILLING",
          Name: "Billing Person",
          EmailAddress: "billing@example.com",
        },
      })
      .on(GetAlternateContactCommand, { AlternateContactType: "OPERATIONS" })
      .rejects(notFound());
    await scan(connector, client);

    t.equal(mocked.commandCalls(ListRegionsCommand).length, 2);
    t.notOk(
      mocked
        .commandCalls(ListRegionsCommand)
        .some((c) => c.args[0].input.AccountId != null),
      "regions are listed for the calling account only",
    );

    const nodes = await nodesFor(connector);
    t.equal(nodes.length, 1);
    const [node] = nodes;
    t.same(header(node), expectedHeader);
    t.same(node.serviceStatus, {
      service: "account",
      status: "enabled",
      failedCalls: {},
    });
    t.same(node.account, {
      regions: [
        { name: "us-east-1", optStatus: "ENABLED_BY_DEFAULT" },
        { name: "af-south-1", optStatus: "DISABLED" },
        { name: "eu-south-1", optStatus: "ENABLED" },
      ],
      alternateContacts: {
        security: "set",
        billing: "set",
        operations: "not-set",
      },
    });
    await assertNoPii(t, connector, node);
  },
);

t.test(
  "Denied alternate contacts are unknown and listed in failedCalls",
  async (t) => {
    const connector = newConnector();
    const client = AccountScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.on(ListRegionsCommand).resolves({
      Regions: [
        { RegionName: "us-east-1", RegionOptStatus: "ENABLED_BY_DEFAULT" },
      ],
    });
    mocked
      .on(GetAlternateContactCommand)
      .rejects(denied())
      .on(GetAlternateContactCommand, { AlternateContactType: "BILLING" })
      .rejects(notFound());
    await scan(connector, client);

    const [node] = await nodesFor(connector);
    t.same(header(node), expectedHeader);
    t.equal(node.serviceStatus.status, "enabled");
    t.same(node.serviceStatus.failedCalls, {
      GetAlternateContact: "AccessDeniedException",
    });
    t.same(node.account.alternateContacts, {
      security: "unknown",
      billing: "not-set",
      operations: "unknown",
    });
  },
);

t.test("No alternate contact set", async (t) => {
  const connector = newConnector();
  const client = AccountScanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked.on(ListRegionsCommand).rejects(denied());
  mocked.on(GetAlternateContactCommand).rejects(notFound());
  await scan(connector, client);

  const [node] = await nodesFor(connector);
  t.same(header(node), expectedHeader);
  // The contacts could be read, so the account's settings are readable even though ListRegions was denied.
  t.same(node.serviceStatus, {
    service: "account",
    status: "enabled",
    failedCalls: { ListRegions: "AccessDeniedException" },
  });
  t.equal(node.account.regions, undefined);
  t.same(node.account.alternateContacts, {
    security: "not-set",
    billing: "not-set",
    operations: "not-set",
  });
});

t.test(
  "Every call denied gives unknown and still emits the node",
  async (t) => {
    const connector = newConnector();
    const client = AccountScanner.getClient(fromProcess(), context);
    const mocked = mockClient(client);
    mocked.on(ListRegionsCommand).rejects(denied());
    mocked
      .on(GetAlternateContactCommand)
      .rejects(
        new TooManyRequestsException({ message: "slow down", $metadata: {} }),
      );
    await scan(connector, client);

    const nodes = await nodesFor(connector);
    t.equal(nodes.length, 1);
    const [node] = nodes;
    t.same(header(node), expectedHeader);
    t.same(node.serviceStatus, {
      service: "account",
      status: "unknown",
      statusReason: "AccessDeniedException",
      failedCalls: {
        ListRegions: "AccessDeniedException",
        GetAlternateContact: "TooManyRequestsException",
      },
    });
    t.same(node.account, {
      alternateContacts: {
        security: "unknown",
        billing: "unknown",
        operations: "unknown",
      },
    });
  },
);

t.test("No node is emitted for an account never scanned", async (t) => {
  t.same(await nodesFor(newConnector()), []);
});
