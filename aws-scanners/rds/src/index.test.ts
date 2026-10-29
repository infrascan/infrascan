import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  DescribeDBInstancesCommand,
  DescribeDBClustersCommand,
  DescribeDBSubnetGroupsCommand,
  DescribeDBProxiesCommand,
  DescribeDBProxyTargetsCommand,
  DescribeGlobalClustersCommand,
} from "@aws-sdk/client-rds";
import buildFsConnector from "@infrascan/fs-connector";
import { generateNodesFromEntity, Graph } from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  Connector,
  SelectedEdge,
} from "@infrascan/shared-types";
import RDSScanner from ".";
import {
  RDSInstance,
  RDSInstanceEntity,
  RDSClusterEntity,
  RDSClusterState,
  RDSProxyEntity,
  RDSProxyState,
  RDSGlobalClusterEntity,
  RDSGlobalClusterState,
} from "./graph";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);

const testContext: AwsContext = {
  region: "us-east-1",
  account: "0".repeat(12),
};
const arnPrefix = `arn:aws:rds:${testContext.region}:${testContext.account}`;
const regionNodeId = `${testContext.account}-${testContext.region}`;

function mockScanner(context = testContext) {
  const client = RDSScanner.getClient(fromProcess(), context);
  const mockedClient = mockClient(client);
  return { client, mockedClient };
}

async function scan(
  client: ReturnType<typeof RDSScanner.getClient>,
  connector: Connector,
  context = testContext,
) {
  for (const scannerFn of RDSScanner.getters) {
    await scannerFn(client, connector, context);
  }
}

async function collectNodes(
  connector: Connector,
  context = testContext,
): Promise<Record<string, BaseState[]>> {
  const nodes: Record<string, BaseState[]> = {};
  for (const entity of RDSScanner.entities ?? []) {
    nodes[entity.nodeType] = [];
    for await (const node of generateNodesFromEntity(
      connector,
      context,
      entity,
    )) {
      nodes[entity.nodeType].push(node);
    }
  }
  return nodes;
}

function findEdge(edges: SelectedEdge[], source: string, target: string) {
  return edges.find((edge) => edge.source === source && edge.target === target);
}

const auroraClusterArn = `${arnPrefix}:cluster:aurora-prod`;
const serverlessClusterArn = `${arnPrefix}:cluster:aurora-sls`;
const serverlessV1ClusterArn = `${arnPrefix}:cluster:aurora-sls-v1`;
const multiAzClusterArn = `${arnPrefix}:cluster:maz-pg`;
const secondaryClusterArn = `arn:aws:rds:eu-west-1:${testContext.account}:cluster:aurora-prod-eu`;
const globalClusterArn = `arn:aws:rds::${testContext.account}:global-cluster:global-db`;
const auroraProxyArn = `${arnPrefix}:db-proxy:prx-0000000000000000a`;
const mysqlProxyArn = `${arnPrefix}:db-proxy:prx-0000000000000000b`;
const emptyProxyArn = `${arnPrefix}:db-proxy:prx-0000000000000000c`;
const masterSecretArn = `arn:aws:secretsmanager:${testContext.region}:${testContext.account}:secret:rds!cluster-abc`;
const proxySecretArn = `arn:aws:secretsmanager:${testContext.region}:${testContext.account}:secret:proxy-creds`;
const kmsKeyArn = `arn:aws:kms:${testContext.region}:${testContext.account}:key/1111`;

function instance(id: string, clusterId?: string, extra = {}) {
  return {
    DBInstanceIdentifier: id,
    DBInstanceArn: `${arnPrefix}:db:${id}`,
    DBClusterIdentifier: clusterId,
    Engine: clusterId === "maz-pg" ? "postgres" : "aurora-postgresql",
    ...extra,
  };
}

t.test(
  "State is pulled correctly from RDS, and formatted as expected",
  async ({ equal, ok, same, match, notOk }) => {
    const connector = buildFsConnector(mkdtempSync(baseDirectory));
    const { client, mockedClient } = mockScanner();

    mockedClient.on(DescribeDBInstancesCommand).resolves({
      DBInstances: [
        instance("aurora-prod-1", "aurora-prod"),
        instance("aurora-prod-2", "aurora-prod"),
        instance("aurora-sls-1", "aurora-sls", {
          DBInstanceClass: "db.serverless",
        }),
        instance("maz-pg-1", "maz-pg"),
        instance("maz-pg-2", "maz-pg"),
        instance("maz-pg-3", "maz-pg"),
        {
          Engine: "mysql",
          DBInstanceIdentifier: "standalone-mysql",
          DBInstanceArn: `${arnPrefix}:db:standalone-mysql`,
          DBName: "appdb",
          DBSubnetGroup: {
            VpcId: "vpc-1",
            Subnets: [{ SubnetIdentifier: "subnet-a" }],
          },
          VpcSecurityGroups: [{ VpcSecurityGroupId: "sg-mysql" }],
        },
      ],
    });

    // Paginated: first page holds the Aurora clusters, second page the rest
    mockedClient
      .on(DescribeDBClustersCommand)
      .resolvesOnce({
        Marker: "page-2",
        DBClusters: [
          {
            DBClusterIdentifier: "aurora-prod",
            DBClusterArn: auroraClusterArn,
            DbClusterResourceId: "cluster-ABC",
            Engine: "aurora-postgresql",
            EngineVersion: "16.4",
            EngineMode: "provisioned",
            Status: "available",
            Endpoint: "aurora-prod.cluster-x.us-east-1.rds.amazonaws.com",
            ReaderEndpoint:
              "aurora-prod.cluster-ro-x.us-east-1.rds.amazonaws.com",
            CustomEndpoints: [
              "analytics.cluster-custom-x.us-east-1.rds.amazonaws.com",
            ],
            Port: 5432,
            MultiAZ: true,
            AvailabilityZones: ["us-east-1a", "us-east-1b"],
            DBClusterMembers: [
              {
                DBInstanceIdentifier: "aurora-prod-1",
                IsClusterWriter: true,
                PromotionTier: 1,
              },
              { DBInstanceIdentifier: "aurora-prod-2", IsClusterWriter: false },
            ],
            DBSubnetGroup: "aurora-subnets",
            VpcSecurityGroups: [
              { VpcSecurityGroupId: "sg-aurora", Status: "active" },
            ],
            StorageEncrypted: true,
            KmsKeyId: kmsKeyArn,
            MasterUserSecret: {
              SecretArn: masterSecretArn,
              SecretStatus: "active",
              KmsKeyId: kmsKeyArn,
            },
            IAMDatabaseAuthenticationEnabled: true,
            BackupRetentionPeriod: 7,
            DeletionProtection: true,
            GlobalClusterIdentifier: "global-db",
            PubliclyAccessible: false,
            ClusterCreateTime: new Date("2024-01-01T00:00:00.000Z"),
            TagList: [{ Key: "team", Value: "payments" }],
          },
          {
            DBClusterIdentifier: "aurora-sls",
            DBClusterArn: serverlessClusterArn,
            Engine: "aurora-mysql",
            EngineMode: "provisioned",
            ServerlessV2ScalingConfiguration: {
              MinCapacity: 0,
              MaxCapacity: 16,
              SecondsUntilAutoPause: 300,
            },
            DBClusterMembers: [
              { DBInstanceIdentifier: "aurora-sls-1", IsClusterWriter: true },
            ],
            DBSubnetGroup: "aurora-subnets",
          },
          {
            DBClusterIdentifier: "aurora-sls-v1",
            DBClusterArn: serverlessV1ClusterArn,
            Engine: "aurora-mysql",
            EngineMode: "serverless",
            ScalingConfigurationInfo: {
              MinCapacity: 1,
              MaxCapacity: 8,
              AutoPause: true,
              SecondsUntilAutoPause: 600,
              TimeoutAction: "RollbackCapacityChange",
            },
            DBClusterMembers: [],
          },
        ],
      })
      .resolvesOnce({
        DBClusters: [
          {
            DBClusterIdentifier: "maz-pg",
            DBClusterArn: multiAzClusterArn,
            Engine: "postgres",
            EngineVersion: "16.3",
            DBClusterInstanceClass: "db.m6gd.large",
            StorageType: "io1",
            AllocatedStorage: 100,
            Iops: 1000,
            MultiAZ: true,
            Endpoint: "maz-pg.cluster-x.us-east-1.rds.amazonaws.com",
            ReaderEndpoint: "maz-pg.cluster-ro-x.us-east-1.rds.amazonaws.com",
            DBClusterMembers: [
              { DBInstanceIdentifier: "maz-pg-1", IsClusterWriter: true },
              { DBInstanceIdentifier: "maz-pg-2", IsClusterWriter: false },
              { DBInstanceIdentifier: "maz-pg-3", IsClusterWriter: false },
            ],
            DBSubnetGroup: "maz-subnets",
            PubliclyAccessible: true,
          },
        ],
      });

    mockedClient.on(DescribeDBSubnetGroupsCommand).resolves({
      DBSubnetGroups: [
        {
          DBSubnetGroupName: "aurora-subnets",
          VpcId: "vpc-1",
          Subnets: [
            { SubnetIdentifier: "subnet-a" },
            { SubnetIdentifier: "subnet-b" },
          ],
        },
        {
          DBSubnetGroupName: "maz-subnets",
          VpcId: "vpc-2",
          Subnets: [{ SubnetIdentifier: "subnet-c" }],
        },
      ],
    });

    mockedClient.on(DescribeDBProxiesCommand).resolves({
      DBProxies: [
        {
          DBProxyName: "aurora-proxy",
          DBProxyArn: auroraProxyArn,
          EngineFamily: "POSTGRESQL",
          Endpoint: "aurora-proxy.proxy-x.us-east-1.rds.amazonaws.com",
          RequireTLS: true,
          RoleArn: `arn:aws:iam::${testContext.account}:role/proxy-role`,
          VpcId: "vpc-1",
          VpcSubnetIds: ["subnet-a", "subnet-b"],
          VpcSecurityGroupIds: ["sg-proxy"],
          Auth: [
            {
              AuthScheme: "SECRETS",
              SecretArn: proxySecretArn,
              IAMAuth: "REQUIRED",
            },
          ],
        },
        {
          DBProxyName: "mysql-proxy",
          DBProxyArn: mysqlProxyArn,
          EngineFamily: "MYSQL",
          RequireTLS: false,
        },
        {
          DBProxyName: "empty-proxy",
          DBProxyArn: emptyProxyArn,
          EngineFamily: "MYSQL",
        },
      ],
    });

    mockedClient
      .on(DescribeDBProxyTargetsCommand, { DBProxyName: "aurora-proxy" })
      .resolves({
        Targets: [
          {
            Type: "TRACKED_CLUSTER",
            RdsResourceId: "aurora-prod",
          },
          {
            Type: "RDS_INSTANCE",
            RdsResourceId: "aurora-prod-1",
            TrackedClusterId: "aurora-prod",
            TargetArn: `${arnPrefix}:db:aurora-prod-1`,
            Role: "READ_WRITE",
            TargetHealth: { State: "AVAILABLE" },
          },
        ],
      });
    mockedClient
      .on(DescribeDBProxyTargetsCommand, { DBProxyName: "mysql-proxy" })
      .resolves({
        Targets: [
          {
            Type: "RDS_INSTANCE",
            RdsResourceId: "standalone-mysql",
            TargetArn: `${arnPrefix}:db:standalone-mysql`,
          },
        ],
      });
    mockedClient
      .on(DescribeDBProxyTargetsCommand, { DBProxyName: "empty-proxy" })
      .resolves({ Targets: [] });

    mockedClient.on(DescribeGlobalClustersCommand).resolves({
      GlobalClusters: [
        {
          GlobalClusterIdentifier: "global-db",
          GlobalClusterArn: globalClusterArn,
          Engine: "aurora-postgresql",
          EngineVersion: "16.4",
          StorageEncrypted: true,
          GlobalClusterMembers: [
            { DBClusterArn: auroraClusterArn, IsWriter: true },
            {
              DBClusterArn: secondaryClusterArn,
              IsWriter: false,
              SynchronizationStatus: "connected",
            },
          ],
          TagList: [{ Key: "team", Value: "payments" }],
        },
      ],
    });

    await scan(client, connector);

    equal(mockedClient.commandCalls(DescribeDBInstancesCommand).length, 1);
    equal(mockedClient.commandCalls(DescribeDBClustersCommand).length, 2);
    equal(
      mockedClient.commandCalls(DescribeDBClustersCommand)[1].args[0].input
        .Marker,
      "page-2",
    );
    equal(mockedClient.commandCalls(DescribeDBSubnetGroupsCommand).length, 1);
    equal(mockedClient.commandCalls(DescribeDBProxiesCommand).length, 1);
    equal(mockedClient.commandCalls(DescribeDBProxyTargetsCommand).length, 3);
    equal(mockedClient.commandCalls(DescribeGlobalClustersCommand).length, 1);

    const nodes = await collectNodes(connector);

    // Base components shared by all entities
    for (const entity of RDSScanner.entities ?? []) {
      ok(nodes[entity.nodeType].length > 0, `${entity.nodeType} has nodes`);
      for (const node of nodes[entity.nodeType]) {
        ok(node.$metadata.version);
        equal(node.tenant.tenantId, testContext.account);
        equal(node.tenant.provider, "aws");
        ok(node.location?.code);
        equal(node.$source?.command, entity.command);
        equal(node.resource.category, entity.category);
        equal(node.resource.subcategory, entity.subcategory);
        equal(node.$graph.nodeType, entity.nodeType);
        equal(node.$graph.id, node.resource.id);
      }
    }

    // Instances
    const instances = nodes[RDSInstanceEntity.nodeType] as RDSInstance[];
    equal(instances.length, 7);
    const standalone = instances.find(
      (node) => node.$graph.id === "standalone-mysql",
    )!;
    equal(standalone.$graph.label, "appdb");
    equal(standalone.$graph.parent, regionNodeId);
    equal(standalone.rds.engine?.type, "mysql");
    equal(standalone.network?.vpc?.id, "vpc-1");
    same(standalone.network?.securityGroups, ["sg-mysql"]);
    same(standalone.network?.targetSubnets, ["subnet-a"]);
    const auroraWriter = instances.find(
      (node) => node.$graph.id === "aurora-prod-1",
    )!;
    equal(auroraWriter.$graph.parent, auroraClusterArn);
    // Instances without a DBName fall back to their identifier as a label
    equal(auroraWriter.$graph.label, "aurora-prod-1");
    equal(
      instances.find((node) => node.$graph.id === "maz-pg-2")!.$graph.parent,
      multiAzClusterArn,
    );

    // Clusters
    const clusters = nodes[RDSClusterEntity.nodeType] as RDSClusterState[];
    equal(clusters.length, 4);
    const aurora = clusters.find(
      (node) => node.$graph.id === auroraClusterArn,
    )!;
    equal(aurora.$graph.label, "aurora-prod");
    equal(aurora.$graph.parent, regionNodeId);
    equal(aurora.rds.cluster.type, "aurora");
    same(aurora.rds.engine, {
      type: "aurora-postgresql",
      version: "16.4",
      mode: "provisioned",
    });
    same(aurora.rds.cluster.endpoints, {
      writer: "aurora-prod.cluster-x.us-east-1.rds.amazonaws.com",
      reader: "aurora-prod.cluster-ro-x.us-east-1.rds.amazonaws.com",
      custom: ["analytics.cluster-custom-x.us-east-1.rds.amazonaws.com"],
      port: 5432,
    });
    same(aurora.rds.cluster.members, [
      { instanceId: "aurora-prod-1", isWriter: true, promotionTier: 1 },
      { instanceId: "aurora-prod-2", isWriter: false },
    ]);
    equal(aurora.rds.cluster.multiAZ, true);
    equal(aurora.rds.cluster.storage.encrypted, true);
    equal(aurora.encryption?.keyId, kmsKeyArn);
    same(aurora.rds.cluster.masterUserSecret, {
      secretArn: masterSecretArn,
      status: "active",
      kmsKeyId: kmsKeyArn,
    });
    equal(aurora.rds.cluster.iamDatabaseAuthenticationEnabled, true);
    equal(aurora.rds.cluster.backupRetentionPeriod, 7);
    equal(aurora.rds.cluster.deletionProtection, true);
    equal(aurora.rds.cluster.globalClusterIdentifier, "global-db");
    notOk(aurora.rds.cluster.scaling);
    same(aurora.tags, [{ key: "team", value: "payments" }]);
    equal(aurora.network?.vpc?.id, "vpc-1");
    same(aurora.network?.securityGroups, ["sg-aurora"]);
    same(aurora.network?.targetSubnets, ["subnet-a", "subnet-b"]);
    equal(aurora.network?.publicIp?.status, "disabled");
    same(aurora.location?.zone, ["us-east-1a", "us-east-1b"]);
    equal(aurora.audit?.createdAt, Date.parse("2024-01-01T00:00:00.000Z"));
    equal(aurora.dns?.domains.length, 3);

    const serverless = clusters.find(
      (node) => node.$graph.id === serverlessClusterArn,
    )!;
    equal(serverless.rds.cluster.type, "aurora");
    same(serverless.rds.cluster.scaling, {
      serverlessV2: {
        minCapacity: 0,
        maxCapacity: 16,
        secondsUntilAutoPause: 300,
      },
    });
    const serverlessV1 = clusters.find(
      (node) => node.$graph.id === serverlessV1ClusterArn,
    )!;
    equal(serverlessV1.rds.engine?.mode, "serverless");
    match(serverlessV1.rds.cluster.scaling?.serverlessV1, {
      minCapacity: 1,
      maxCapacity: 8,
      autoPause: true,
      timeoutAction: "RollbackCapacityChange",
    });
    same(serverlessV1.rds.cluster.members, []);

    const multiAz = clusters.find(
      (node) => node.$graph.id === multiAzClusterArn,
    )!;
    equal(multiAz.rds.cluster.type, "multi-az");
    equal(multiAz.rds.cluster.instanceClass, "db.m6gd.large");
    equal(multiAz.resource.description, "db.m6gd.large");
    same(multiAz.rds.cluster.storage, {
      type: "io1",
      allocatedGiB: 100,
      iops: 1000,
    });
    equal(multiAz.rds.cluster.members.length, 3);
    equal(multiAz.network?.vpc?.id, "vpc-2");
    equal(multiAz.network?.publicIp?.status, "enabled");

    // Proxies
    const proxies = nodes[RDSProxyEntity.nodeType] as RDSProxyState[];
    equal(proxies.length, 3);
    const auroraProxy = proxies.find(
      (node) => node.$graph.id === auroraProxyArn,
    )!;
    equal(auroraProxy.$graph.label, "aurora-proxy");
    equal(auroraProxy.$graph.parent, regionNodeId);
    equal(auroraProxy.rds.proxy.engineFamily, "POSTGRESQL");
    equal(auroraProxy.rds.proxy.requireTLS, true);
    equal(
      auroraProxy.rds.proxy.endpoint,
      "aurora-proxy.proxy-x.us-east-1.rds.amazonaws.com",
    );
    same(auroraProxy.dns?.domains, [
      "aurora-proxy.proxy-x.us-east-1.rds.amazonaws.com",
    ]);
    match(auroraProxy.rds.proxy.auth, [
      { authScheme: "SECRETS", secretArn: proxySecretArn, iamAuth: "REQUIRED" },
    ]);
    same(auroraProxy.iam?.roles, [
      {
        label: "proxy-role",
        arn: `arn:aws:iam::${testContext.account}:role/proxy-role`,
      },
    ]);
    equal(auroraProxy.network?.vpc?.id, "vpc-1");
    same(auroraProxy.network?.targetSubnets, ["subnet-a", "subnet-b"]);
    same(auroraProxy.network?.securityGroups, ["sg-proxy"]);
    equal(auroraProxy.rds.proxy.targets.length, 2);
    match(auroraProxy.rds.proxy.targets[1], {
      type: "RDS_INSTANCE",
      role: "READ_WRITE",
      trackedClusterId: "aurora-prod",
      health: { state: "AVAILABLE" },
    });
    const emptyProxy = proxies.find(
      (node) => node.$graph.id === emptyProxyArn,
    )!;
    same(emptyProxy.rds.proxy.targets, []);
    same(emptyProxy.rds.proxy.auth, []);
    same(emptyProxy.network?.securityGroups, []);

    // Global clusters
    const globalClusters = nodes[
      RDSGlobalClusterEntity.nodeType
    ] as RDSGlobalClusterState[];
    equal(globalClusters.length, 1);
    const globalCluster = globalClusters[0];
    equal(globalCluster.$graph.id, globalClusterArn);
    equal(globalCluster.$graph.parent, testContext.account);
    equal(globalCluster.location?.code, "us-east-1");
    same(
      globalCluster.rds.globalCluster.members.map(
        ({ clusterArn, isWriter }) => ({ clusterArn, isWriter }),
      ),
      [
        { clusterArn: auroraClusterArn, isWriter: true },
        { clusterArn: secondaryClusterArn, isWriter: false },
      ],
    );

    // Edges
    const edges = await RDSScanner.getEdges!(connector);
    // cluster -> member instances
    const writerEdge = findEdge(edges, auroraClusterArn, "aurora-prod-1");
    ok(writerEdge);
    equal(writerEdge?.metadata?.label, "aurora-prod Writer");
    equal(
      findEdge(edges, auroraClusterArn, "aurora-prod-2")?.metadata?.label,
      "aurora-prod Reader",
    );
    ok(findEdge(edges, serverlessClusterArn, "aurora-sls-1"));
    ok(findEdge(edges, multiAzClusterArn, "maz-pg-1"));
    ok(findEdge(edges, multiAzClusterArn, "maz-pg-2"));
    ok(findEdge(edges, multiAzClusterArn, "maz-pg-3"));
    // proxy -> tracked cluster (resolved from the cluster identifier), deduplicated across targets
    equal(
      edges.filter(
        (edge) =>
          edge.source === auroraProxyArn && edge.target === auroraClusterArn,
      ).length,
      1,
    );
    // instances tracked as part of a cluster don't get their own edge
    notOk(findEdge(edges, auroraProxyArn, "aurora-prod-1"));
    // proxy -> standalone instance
    ok(findEdge(edges, mysqlProxyArn, "standalone-mysql"));
    // proxy with no targets
    equal(edges.filter((edge) => edge.source === emptyProxyArn).length, 0);
    // global cluster -> regional clusters
    equal(
      findEdge(edges, globalClusterArn, auroraClusterArn)?.metadata?.label,
      "global-db Primary",
    );
    equal(
      findEdge(edges, globalClusterArn, secondaryClusterArn)?.metadata?.label,
      "global-db Secondary",
    );
    // No edges for Secrets Manager or KMS, they're recorded in state only
    notOk(edges.some((edge) => edge.target.includes(":secretsmanager:")));
    notOk(edges.some((edge) => edge.target.includes(":kms:")));
    equal(edges.length, 10);

    // Node IDs line up when inserted into the graph in entity order: cluster members nest under their cluster,
    // and every edge resolves to nodes (other than the secondary cluster in an unscanned region).
    const graph = Graph();
    graph.addNode({
      $graph: { id: testContext.account },
    } as unknown as BaseState);
    graph.addNode({
      $graph: { id: regionNodeId, parent: testContext.account },
    } as unknown as BaseState);
    for (const entity of RDSScanner.entities ?? []) {
      for (const node of nodes[entity.nodeType]) {
        graph.addNode(node);
      }
    }
    equal(graph.getNode("aurora-prod-1")?.parent?.$graph.id, auroraClusterArn);
    equal(graph.getNode("standalone-mysql")?.parent?.$graph.id, regionNodeId);
    for (const edge of edges) {
      if (edge.target === secondaryClusterArn) {
        continue;
      }
      graph.addEdge({ ...edge, metadata: edge.metadata ?? {} });
    }
    equal(graph.edges.length, 9);
  },
);

t.test(
  "Missing and partial fields are handled without throwing",
  async ({ equal, same, notOk }) => {
    const connector = buildFsConnector(mkdtempSync(baseDirectory));
    const { client, mockedClient } = mockScanner();

    mockedClient.on(DescribeDBInstancesCommand).resolves({
      DBInstances: [
        // Member of a cluster but no instance ARN to derive the partition from
        { DBInstanceIdentifier: "orphan-1", DBClusterIdentifier: "partial" },
      ],
    });
    mockedClient.on(DescribeDBClustersCommand).resolves({
      DBClusters: [
        // No ARN: can't be identified, so is skipped
        { DBClusterIdentifier: "no-arn" },
        // Bare minimum cluster, subnet group isn't returned by DescribeDBSubnetGroups
        {
          DBClusterArn: `${arnPrefix}:cluster:partial`,
          DBSubnetGroup: "missing-subnet-group",
          DBClusterMembers: [{ IsClusterWriter: true }],
        },
      ],
    });
    mockedClient.on(DescribeDBSubnetGroupsCommand).resolves({});
    mockedClient.on(DescribeDBProxiesCommand).resolves({
      DBProxies: [
        { DBProxyName: "no-arn-proxy" },
        { DBProxyArn: `${arnPrefix}:db-proxy:prx-partial` },
      ],
    });
    mockedClient
      .on(DescribeDBProxyTargetsCommand, { DBProxyName: "no-arn-proxy" })
      .resolves({
        Targets: [{ Type: "TRACKED_CLUSTER", RdsResourceId: "partial" }],
      });
    mockedClient.on(DescribeGlobalClustersCommand).resolves({
      GlobalClusters: [
        { GlobalClusterArn: globalClusterArn },
        { GlobalClusterIdentifier: "no-arn-global" },
      ],
    });

    await scan(client, connector);
    const nodes = await collectNodes(connector);

    const [instanceNode] = nodes[RDSInstanceEntity.nodeType];
    equal(instanceNode.$graph.parent, `${arnPrefix}:cluster:partial`);
    equal(instanceNode.$graph.label, "orphan-1");

    const clusters = nodes[RDSClusterEntity.nodeType] as RDSClusterState[];
    equal(clusters.length, 1);
    const [cluster] = clusters;
    equal(cluster.$graph.label, `${arnPrefix}:cluster:partial`);
    equal(cluster.rds.cluster.type, "other");
    same(cluster.rds.cluster.members, []);
    same(cluster.rds.cluster.endpoints, { custom: [] });
    notOk(cluster.rds.cluster.masterUserSecret);
    notOk(cluster.network?.vpc?.id);
    same(cluster.network?.targetSubnets, []);
    same(cluster.network?.securityGroups, []);
    same(cluster.tags, []);
    same(cluster.dns?.domains, []);
    equal(cluster.audit?.createdAt, null);

    const proxies = nodes[RDSProxyEntity.nodeType] as RDSProxyState[];
    equal(proxies.length, 1);
    equal(proxies[0].$graph.label, `${arnPrefix}:db-proxy:prx-partial`);
    same(proxies[0].rds.proxy.targets, []);
    same(proxies[0].iam?.roles, []);
    // DescribeDBProxyTargets is only called for proxies with a name
    equal(mockedClient.commandCalls(DescribeDBProxyTargetsCommand).length, 1);

    // A global cluster without a writer is still emitted
    const globalClusters = nodes[
      RDSGlobalClusterEntity.nodeType
    ] as RDSGlobalClusterState[];
    equal(globalClusters.length, 1);
    same(globalClusters[0].rds.globalCluster.members, []);
    equal(globalClusters[0].location?.code, testContext.region);

    // The proxy which has targets has no ARN, so no edges can be produced for it.
    const edges = await RDSScanner.getEdges!(connector);
    same(edges, []);
  },
);

t.test(
  "Global clusters are only emitted from their writer's region, edges are deduplicated",
  async ({ equal }) => {
    const connector = buildFsConnector(mkdtempSync(baseDirectory));
    const secondaryContext = {
      region: "eu-west-1",
      account: testContext.account,
    };
    const globalClusterResponse = {
      GlobalClusters: [
        {
          GlobalClusterIdentifier: "global-db",
          GlobalClusterArn: globalClusterArn,
          GlobalClusterMembers: [
            { DBClusterArn: auroraClusterArn, IsWriter: true },
            { DBClusterArn: secondaryClusterArn, IsWriter: false },
          ],
        },
      ],
    };
    for (const context of [testContext, secondaryContext]) {
      const { client, mockedClient } = mockScanner(context);
      mockedClient
        .on(DescribeGlobalClustersCommand)
        .resolves(globalClusterResponse);
      mockedClient.on(DescribeDBInstancesCommand).resolves({});
      mockedClient.on(DescribeDBClustersCommand).resolves({});
      mockedClient.on(DescribeDBSubnetGroupsCommand).resolves({});
      mockedClient.on(DescribeDBProxiesCommand).resolves({});
      await scan(client, connector, context);
    }

    const primaryNodes = await collectNodes(connector, testContext);
    equal(primaryNodes[RDSGlobalClusterEntity.nodeType].length, 1);
    const secondaryNodes = await collectNodes(connector, secondaryContext);
    equal(secondaryNodes[RDSGlobalClusterEntity.nodeType].length, 0);

    const edges = await RDSScanner.getEdges!(connector);
    equal(edges.length, 2);
  },
);

t.test(
  "Proxy targets fall back to the target ARN, or build the cluster ARN when the cluster wasn't scanned",
  async ({ ok, equal }) => {
    const connector = buildFsConnector(mkdtempSync(baseDirectory));
    const { client, mockedClient } = mockScanner();
    const unscannedClusterArn = `${arnPrefix}:cluster:unscanned`;
    const targetArnClusterArn = `${arnPrefix}:cluster:by-target-arn`;

    mockedClient.on(DescribeDBInstancesCommand).resolves({});
    mockedClient.on(DescribeDBClustersCommand).resolves({});
    mockedClient.on(DescribeDBSubnetGroupsCommand).resolves({});
    mockedClient.on(DescribeGlobalClustersCommand).resolves({});
    mockedClient.on(DescribeDBProxiesCommand).resolves({
      DBProxies: [{ DBProxyName: "proxy", DBProxyArn: auroraProxyArn }],
    });
    mockedClient.on(DescribeDBProxyTargetsCommand).resolves({
      Targets: [
        { Type: "TRACKED_CLUSTER", RdsResourceId: "unscanned" },
        { Type: "TRACKED_CLUSTER", TargetArn: targetArnClusterArn },
        {
          Type: "RDS_SERVERLESS_ENDPOINT",
          TrackedClusterId: "unscanned",
        },
        { Type: "RDS_INSTANCE", TargetArn: `${arnPrefix}:db:from-arn` },
        { Type: "RDS_INSTANCE" },
      ],
    });

    await scan(client, connector);
    const edges = await RDSScanner.getEdges!(connector);
    ok(findEdge(edges, auroraProxyArn, unscannedClusterArn));
    ok(findEdge(edges, auroraProxyArn, targetArnClusterArn));
    ok(findEdge(edges, auroraProxyArn, "from-arn"));
    equal(edges.length, 3);
  },
);
