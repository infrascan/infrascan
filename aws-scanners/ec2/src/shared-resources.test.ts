import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  DescribeManagedPrefixListsCommand,
  DescribeTransitGatewayAttachmentsCommand,
  DescribeTransitGatewaysCommand,
  DescribeVpcPeeringConnectionsCommand,
  DescribeVpcsCommand,
  GetManagedPrefixListEntriesCommand,
  ManagedPrefixList,
  TransitGateway,
  TransitGatewayAttachment,
  VpcPeeringConnection,
} from "@aws-sdk/client-ec2";
import buildFsConnector from "@infrascan/fs-connector";
import {
  Graph,
  NodeConflictError,
  generateNodesFromEntity,
} from "@infrascan/core";
import type { BaseState, Connector } from "@infrascan/shared-types";
import EC2Scanner from ".";

const accountA = "111111111111";
const accountB = "222222222222";
const unscannedAccount = "333333333333";
const euWest1 = "eu-west-1";
const usEast1 = "us-east-1";

type Scan = { account: string; regions: string[] };

interface RegionState {
  vpcs?: string[];
  transitGateways?: TransitGateway[];
  attachments?: TransitGatewayAttachment[];
  peeringConnections?: VpcPeeringConnection[];
  prefixLists?: ManagedPrefixList[];
}

const s3List: ManagedPrefixList = {
  PrefixListId: "pl-s3",
  PrefixListName: `com.amazonaws.${euWest1}.s3`,
  OwnerId: "AWS",
  AddressFamily: "IPv4",
};
// A customer managed list owned by A and shared with B through RAM
const sharedList: ManagedPrefixList = {
  PrefixListId: "pl-shared",
  PrefixListName: "corp",
  OwnerId: accountA,
  AddressFamily: "IPv4",
  MaxEntries: 5,
};
// A transit gateway owned by A and shared with B
const sharedTgw: TransitGateway = {
  TransitGatewayId: "tgw-shared",
  OwnerId: accountA,
  State: "available",
};
// B's VPC attached to A's transit gateway: reported by both accounts
const attachmentForB: TransitGatewayAttachment = {
  TransitGatewayAttachmentId: "tgw-attach-b",
  TransitGatewayId: "tgw-shared",
  TransitGatewayOwnerId: accountA,
  ResourceType: "vpc",
  ResourceId: "vpc-b",
  ResourceOwnerId: accountB,
  State: "available",
};
// A connection between two scanned accounts: reported by both
const crossAccountPeering: VpcPeeringConnection = {
  VpcPeeringConnectionId: "pcx-ab",
  Status: { Code: "active" },
  RequesterVpcInfo: { VpcId: "vpc-a", OwnerId: accountA, Region: euWest1 },
  AccepterVpcInfo: { VpcId: "vpc-b", OwnerId: accountB, Region: euWest1 },
};
// A connection between two regions of the same account: reported in both regions
const crossRegionPeering: VpcPeeringConnection = {
  VpcPeeringConnectionId: "pcx-xr",
  Status: { Code: "active" },
  RequesterVpcInfo: { VpcId: "vpc-a", OwnerId: accountA, Region: euWest1 },
  AccepterVpcInfo: { VpcId: "vpc-a2", OwnerId: accountA, Region: usEast1 },
};

const state: Record<string, RegionState> = {
  [`${accountA}-${euWest1}`]: {
    vpcs: ["vpc-a"],
    transitGateways: [sharedTgw],
    attachments: [
      attachmentForB,
      {
        TransitGatewayAttachmentId: "tgw-attach-a",
        TransitGatewayId: "tgw-shared",
        TransitGatewayOwnerId: accountA,
        ResourceType: "vpc",
        ResourceId: "vpc-a",
        ResourceOwnerId: accountA,
      },
      // One end of an inter-region transit gateway peering, reported against the local transit gateway
      {
        TransitGatewayAttachmentId: "tgw-attach-peer",
        TransitGatewayId: "tgw-shared",
        TransitGatewayOwnerId: accountA,
        ResourceType: "peering",
        ResourceId: "tgw-use1",
        ResourceOwnerId: accountA,
      },
    ],
    peeringConnections: [crossAccountPeering, crossRegionPeering],
    prefixLists: [s3List, sharedList],
  },
  [`${accountA}-${usEast1}`]: {
    vpcs: ["vpc-a2"],
    transitGateways: [{ TransitGatewayId: "tgw-use1", OwnerId: accountA }],
    attachments: [
      {
        TransitGatewayAttachmentId: "tgw-attach-peer",
        TransitGatewayId: "tgw-use1",
        TransitGatewayOwnerId: accountA,
        ResourceType: "peering",
        ResourceId: "tgw-shared",
        ResourceOwnerId: accountA,
      },
    ],
    peeringConnections: [crossRegionPeering],
    prefixLists: [
      {
        PrefixListId: "pl-s3-use1",
        PrefixListName: `com.amazonaws.${usEast1}.s3`,
        OwnerId: "AWS",
      },
    ],
  },
  [`${accountB}-${euWest1}`]: {
    vpcs: ["vpc-b"],
    transitGateways: [
      sharedTgw,
      // Shared from an account that is not scanned
      { TransitGatewayId: "tgw-other", OwnerId: unscannedAccount },
    ],
    attachments: [attachmentForB],
    peeringConnections: [crossAccountPeering],
    prefixLists: [s3List, sharedList],
  },
};

const scans: Scan[] = [
  { account: accountA, regions: [euWest1, usEast1] },
  { account: accountB, regions: [euWest1] },
];

async function scanAll(): Promise<Connector> {
  const connector = buildFsConnector(
    mkdtempSync(join(tmpdir(), "infrascan-ec2-shared-")),
  );
  for (const { account, regions } of scans) {
    for (const region of regions) {
      const context = { account, region };
      const regionState = state[`${account}-${region}`];
      const client = EC2Scanner.getClient(fromProcess(), context);
      const mocked = mockClient(client);
      mocked.onAnyCommand().resolves({});
      mocked.on(DescribeVpcsCommand).resolves({
        Vpcs: regionState.vpcs?.map((VpcId) => ({ VpcId })),
      });
      mocked
        .on(DescribeTransitGatewaysCommand)
        .resolves({ TransitGateways: regionState.transitGateways });
      mocked
        .on(DescribeTransitGatewayAttachmentsCommand)
        .resolves({ TransitGatewayAttachments: regionState.attachments });
      mocked
        .on(DescribeVpcPeeringConnectionsCommand)
        .resolves({ VpcPeeringConnections: regionState.peeringConnections });
      mocked
        .on(DescribeManagedPrefixListsCommand)
        .resolves({ PrefixLists: regionState.prefixLists });
      mocked
        .on(GetManagedPrefixListEntriesCommand, { PrefixListId: "pl-s3" })
        .resolves({ Entries: [{ Cidr: "52.218.0.0/17" }] })
        .on(GetManagedPrefixListEntriesCommand, { PrefixListId: "pl-shared" })
        .resolves({ Entries: [{ Cidr: "203.0.113.0/24" }] });
      for (const getter of EC2Scanner.getters) {
        await getter(client, connector, context);
      }
    }
  }
  return connector;
}

/**
 * Build the graph the way the SDK does: account node, then per region the region node and every entity's nodes,
 * recording every insert error instead of logging it.
 */
async function buildGraph(connector: Connector, order: Scan[]) {
  const graph = Graph();
  const errors: string[] = [];
  const conflicting: BaseState[] = [];
  const insert = (node: BaseState) => {
    try {
      graph.addNode(node);
    } catch (err) {
      if (err instanceof NodeConflictError) {
        conflicting.push(node);
      }
      errors.push(
        `${node.$graph.id}: ${
          err instanceof NodeConflictError
            ? "NodeConflictError"
            : (err as Error).message
        }`,
      );
    }
  };
  for (const { account, regions } of order) {
    insert({ $graph: { id: account } } as unknown as BaseState);
    for (const region of regions) {
      insert({
        $graph: { id: `${account}-${region}`, parent: account },
      } as unknown as BaseState);
      for (const entity of EC2Scanner.entities ?? []) {
        for await (const node of generateNodesFromEntity(
          connector,
          { account, region },
          entity,
        )) {
          insert(node);
        }
      }
    }
  }
  return { graph, errors, conflicting };
}

/**
 * A node without the per-scan bookkeeping (`$metadata` timestamp)
 */
function facts(node: unknown) {
  const { $metadata, incomingEdges, outgoingEdges, parent, children, ...rest } =
    node as Record<string, unknown>;
  return rest;
}

const expected: [string, string | undefined, string][] = [
  // [node id, parent, tenant]
  ["tgw-shared", `${accountA}-${euWest1}`, accountA],
  ["tgw-use1", `${accountA}-${usEast1}`, accountA],
  // The owner was not scanned: a root node, still owned by its OwnerId
  ["tgw-other", undefined, unscannedAccount],
  // Owned by the attached VPC's account
  ["tgw-attach-b", `${accountB}-${euWest1}`, accountB],
  ["tgw-attach-a", `${accountA}-${euWest1}`, accountA],
  // Each end of the transit gateway peering, keyed by its own transit gateway
  ["tgw-attach-peer:tgw-shared", `${accountA}-${euWest1}`, accountA],
  ["tgw-attach-peer:tgw-use1", `${accountA}-${usEast1}`, accountA],
  // Owned by the requester
  ["pcx-ab", `${accountA}-${euWest1}`, accountA],
  ["pcx-xr", `${accountA}-${euWest1}`, accountA],
  // AWS managed lists belong to no scanned account
  ["pl-s3", undefined, "AWS"],
  ["pl-s3-use1", undefined, "AWS"],
  ["pl-shared", `${accountA}-${euWest1}`, accountA],
];

t.test(
  "Resources reported by several accounts and regions map to one node, whatever the scan order",
  async ({ same, equal, ok }) => {
    const connector = await scanAll();

    for (const order of [scans, [...scans].reverse()]) {
      const label = order.map(({ account }) => account).join(" then ");
      const { graph, errors, conflicting } = await buildGraph(connector, order);
      // Every account reports the AWS managed list with the same content, so the only conflict is an identical copy
      // of a node that is already in the graph: nothing is dropped
      same(
        errors,
        ["pl-s3: NodeConflictError"],
        `${label}: no node is dropped`,
      );
      for (const duplicate of conflicting) {
        same(
          facts(duplicate),
          facts(graph.getNode(duplicate.$graph.id)),
          `${label}: ${duplicate.$graph.id} duplicate is identical`,
        );
      }
      for (const [id, parent, tenant] of expected) {
        const node = graph.getNode(id);
        ok(node, `${label}: ${id} exists`);
        equal(node?.parent?.$graph.id, parent, `${label}: ${id} parent`);
        equal(node?.tenant.tenantId, tenant, `${label}: ${id} tenant`);
      }
      // The AWS managed list has its entries whichever account's copy is used
      same(
        (graph.getNode("pl-s3") as unknown as Record<string, any>)?.prefixList
          ?.entries,
        [{ cidr: "52.218.0.0/17", description: undefined }],
      );
      equal(
        (
          graph.getNode("tgw-attach-peer:tgw-use1") as unknown as Record<
            string,
            any
          >
        )?.transitGatewayAttachment?.attachmentId,
        "tgw-attach-peer",
      );
    }
  },
);

t.test(
  "A shared resource is skipped by the observing scan only when its owner reported it",
  async ({ same }) => {
    const connector = await scanAll();
    const ids = async (account: string, region: string, nodeType: string) => {
      const entity = (EC2Scanner.entities ?? []).find(
        (candidate) => candidate.nodeType === nodeType,
      )!;
      const found: string[] = [];
      for await (const node of generateNodesFromEntity(
        connector,
        { account, region },
        entity,
      )) {
        found.push(node.$graph.id);
      }
      return found;
    };
    // B sees A's transit gateway, attachment-owner A sees B's attachment, accepter sides see the peering connections:
    // their owners emit them
    same(await ids(accountB, euWest1, "ec2-transit-gateway"), ["tgw-other"]);
    same(await ids(accountA, euWest1, "ec2-transit-gateway-attachment"), [
      "tgw-attach-a",
      "tgw-attach-peer:tgw-shared",
    ]);
    same(await ids(accountB, euWest1, "ec2-vpc-peering-connection"), []);
    same(await ids(accountA, usEast1, "ec2-vpc-peering-connection"), []);
    same(await ids(accountB, euWest1, "ec2-managed-prefix-list"), ["pl-s3"]);
  },
);
