import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  DescribeManagedPrefixListsCommand,
  DescribeRouteTablesCommand,
  DescribeSecurityGroupsCommand,
  GetManagedPrefixListEntriesCommand,
} from "@aws-sdk/client-ec2";
import buildFsConnector from "@infrascan/fs-connector";
import { evaluateSelector, generateNodesFromEntity } from "@infrascan/core";
import EC2Scanner from ".";
import {
  DescribeManagedPrefixLists,
  DescribeRouteTables,
  DescribeSecurityGroups,
} from "./generated/getters";
import { GetManagedPrefixListEntries } from "./getters";
import { ManagedPrefixListEntity } from "./graph";

const account = "123456789012";
const region = "eu-west-1";
const context = { account, region };

const prefixLists = [
  // Customer managed: always fetched, whether referenced or not
  { PrefixListId: "pl-cust1", PrefixListName: "corp", OwnerId: account },
  {
    PrefixListId: "pl-cust2",
    PrefixListName: "partner",
    OwnerId: "999999999999",
  },
  // AWS managed: only fetched when referenced
  {
    PrefixListId: "pl-aws-sg",
    PrefixListName: "com.amazonaws.global.cloudfront.origin-facing",
    OwnerId: "AWS",
  },
  {
    PrefixListId: "pl-aws-rt",
    PrefixListName: `com.amazonaws.${region}.s3`,
    OwnerId: "AWS",
  },
  {
    PrefixListId: "pl-aws-both",
    PrefixListName: `com.amazonaws.${region}.dynamodb`,
    OwnerId: "AWS",
  },
  {
    PrefixListId: "pl-aws-none",
    PrefixListName: `com.amazonaws.${region}.vpc-lattice`,
    OwnerId: "AWS",
  },
];

function setup({ withReferences }: { withReferences: boolean }) {
  const connector = buildFsConnector(
    mkdtempSync(join(tmpdir(), "infrascan-ec2-prefix-entries-")),
  );
  const client = EC2Scanner.getClient(fromProcess(), context);
  const mocked = mockClient(client);
  mocked.onAnyCommand().resolves({});
  mocked
    .on(DescribeManagedPrefixListsCommand)
    .resolves({ PrefixLists: prefixLists });
  if (withReferences) {
    mocked.on(DescribeRouteTablesCommand).resolves({
      RouteTables: [
        {
          RouteTableId: "rtb-1",
          Routes: [
            { DestinationCidrBlock: "10.0.0.0/16", GatewayId: "local" },
            { DestinationPrefixListId: "pl-aws-rt", GatewayId: "vpce-s3" },
            { DestinationPrefixListId: "pl-aws-both", GatewayId: "vpce-ddb" },
          ],
        },
        {
          RouteTableId: "rtb-2",
          Routes: [
            { DestinationPrefixListId: "pl-aws-both", GatewayId: "vpce-ddb" },
          ],
        },
      ],
    });
    mocked.on(DescribeSecurityGroupsCommand).resolves({
      SecurityGroups: [
        {
          GroupId: "sg-alb",
          IpPermissions: [
            {
              IpProtocol: "tcp",
              FromPort: 443,
              ToPort: 443,
              PrefixListIds: [{ PrefixListId: "pl-aws-both" }],
            },
          ],
          // Referenced only by an egress rule
          IpPermissionsEgress: [
            {
              IpProtocol: "tcp",
              FromPort: 443,
              ToPort: 443,
              PrefixListIds: [
                { PrefixListId: "pl-aws-sg" },
                { PrefixListId: "pl-aws-both" },
              ],
            },
          ],
        },
        {
          GroupId: "sg-app",
          IpPermissionsEgress: [
            {
              IpProtocol: "-1",
              PrefixListIds: [
                { PrefixListId: "pl-aws-both" },
                // Referenced but not returned by DescribeManagedPrefixLists: skipped
                { PrefixListId: "pl-not-listed" },
              ],
            },
          ],
        },
      ],
    });
  }
  mocked
    .on(GetManagedPrefixListEntriesCommand, {
      PrefixListId: "pl-cust1",
      NextToken: undefined,
    })
    .resolves({ Entries: [{ Cidr: "10.1.0.0/16" }], NextToken: "page-2" })
    .on(GetManagedPrefixListEntriesCommand, {
      PrefixListId: "pl-cust1",
      NextToken: "page-2",
    })
    .resolves({ Entries: [{ Cidr: "10.2.0.0/16" }], NextToken: "page-3" })
    .on(GetManagedPrefixListEntriesCommand, {
      PrefixListId: "pl-cust1",
      NextToken: "page-3",
    })
    .resolves({ Entries: [{ Cidr: "10.3.0.0/16" }] })
    .on(GetManagedPrefixListEntriesCommand, { PrefixListId: "pl-cust2" })
    .resolves({ Entries: [{ Cidr: "192.0.2.0/24" }] })
    .on(GetManagedPrefixListEntriesCommand, { PrefixListId: "pl-aws-sg" })
    .resolves({ Entries: [{ Cidr: "130.176.0.0/18" }] })
    // One list failing does not stop the lists after it
    .on(GetManagedPrefixListEntriesCommand, { PrefixListId: "pl-aws-rt" })
    .rejects(new Error("InvalidPrefixListID.NotFound"))
    .on(GetManagedPrefixListEntriesCommand, { PrefixListId: "pl-aws-both" })
    .resolves({ Entries: [{ Cidr: "52.94.24.0/23" }] });
  return { connector, client, mocked };
}

async function run(withReferences: boolean) {
  const { connector, client, mocked } = setup({ withReferences });
  await DescribeSecurityGroups(client, connector, context);
  await DescribeRouteTables(client, connector, context);
  await DescribeManagedPrefixLists(client, connector, context);
  await GetManagedPrefixListEntries(client, connector, context);
  const nodes: Record<string, any> = {};
  for await (const node of generateNodesFromEntity(
    connector,
    context,
    ManagedPrefixListEntity,
  )) {
    nodes[(node as any).prefixList.prefixListId] = node;
  }
  return { connector, mocked, nodes };
}

t.test(
  "Entries are fetched for customer lists and referenced AWS managed lists",
  async ({ same, equal }) => {
    const { connector, mocked, nodes } = await run(true);

    // Sorted, deduplicated across routes and ingress/egress rules, one parameter object per page
    same(
      mocked
        .commandCalls(GetManagedPrefixListEntriesCommand)
        .map((call) => call.args[0].input),
      [
        { PrefixListId: "pl-aws-both", NextToken: undefined },
        { PrefixListId: "pl-aws-rt", NextToken: undefined },
        { PrefixListId: "pl-aws-sg", NextToken: undefined },
        { PrefixListId: "pl-cust1", NextToken: undefined },
        { PrefixListId: "pl-cust1", NextToken: "page-2" },
        { PrefixListId: "pl-cust1", NextToken: "page-3" },
        { PrefixListId: "pl-cust2", NextToken: undefined },
      ],
    );

    // State keeps the shape the prefix list entity joins on: one item per page with its own parameters
    same(
      await evaluateSelector(
        account,
        region,
        "EC2|GetManagedPrefixListEntries|[]._parameters",
        connector,
      ),
      [
        { PrefixListId: "pl-aws-both" },
        { PrefixListId: "pl-aws-sg" },
        { PrefixListId: "pl-cust1" },
        { PrefixListId: "pl-cust1", NextToken: "page-2" },
        { PrefixListId: "pl-cust1", NextToken: "page-3" },
        { PrefixListId: "pl-cust2" },
      ],
    );

    // Referenced only by a security group egress rule
    same(nodes["pl-aws-sg"].prefixList.entries, [
      { cidr: "130.176.0.0/18", description: undefined },
    ]);
    // Referenced by routes and rules, fetched once
    same(nodes["pl-aws-both"].prefixList.entries, [
      { cidr: "52.94.24.0/23", description: undefined },
    ]);
    // Referenced only by a route, but the call failed: no entries, and later lists were still fetched
    equal(nodes["pl-aws-rt"].prefixList.entries, undefined);
    same(
      nodes["pl-cust1"].prefixList.entries.map(
        (entry: { cidr: string }) => entry.cidr,
      ),
      ["10.1.0.0/16", "10.2.0.0/16", "10.3.0.0/16"],
    );
    same(nodes["pl-cust2"].prefixList.entries, [
      { cidr: "192.0.2.0/24", description: undefined },
    ]);
    // Unreferenced AWS managed list: never called
    equal(nodes["pl-aws-none"].prefixList.entries, undefined);
  },
);

t.test(
  "Without route table or security group state only customer lists are fetched",
  async ({ same }) => {
    const { mocked } = await run(false);
    same(
      mocked
        .commandCalls(GetManagedPrefixListEntriesCommand)
        .map((call) => call.args[0].input.PrefixListId),
      ["pl-cust1", "pl-cust1", "pl-cust1", "pl-cust2"],
    );
  },
);

t.test(
  "The hand-written getter runs after the state it reads",
  async ({ ok }) => {
    const names = EC2Scanner.getters.map((getter) => getter.name);
    const entries = names.indexOf("GetManagedPrefixListEntries");
    ok(entries > names.indexOf("DescribeManagedPrefixLists"));
    ok(entries > names.indexOf("DescribeRouteTables"));
    ok(entries > names.indexOf("DescribeSecurityGroups"));
  },
);
