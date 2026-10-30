import { mkdtempSync } from "fs";
import t from "tap";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import { ListDistributionsCommand } from "@aws-sdk/client-cloudfront";
import buildFsConnector from "@infrascan/fs-connector";
import {
  formatS3NodeId,
  generateNodesFromEntity,
  Graph,
} from "@infrascan/core";
import type { BaseState } from "@infrascan/shared-types";
import CloudfrontScanner from ".";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from Cloudfront, and formatted as expected",
  async ({ ok, equal }) => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const cloudfrontClient = CloudfrontScanner.getClient(
      fromProcess(),
      testContext,
    );

    const mockedCloudfrontClient = mockClient(cloudfrontClient);

    // Mock each of the functions used to pull state
    const distributionArn = "arn:aws:0000000:us-east-1:cloudfront:distribution";
    const mockDistribution = {
      Id: "",
      ARN: distributionArn,
      Status: "",
      LastModifiedTime: new Date(),
      DomainName: "foo.com",
      Aliases: {
        Quantity: 0,
      },
      Origins: {
        Quantity: 0,
        Items: [],
      },
      DefaultCacheBehavior: {
        TargetOriginId: "",
        ViewerProtocolPolicy: "",
      },
      CacheBehaviors: {
        Quantity: 0,
      },
      CustomErrorResponses: {
        Quantity: 0,
      },
      Comment: "",
      PriceClass: "",
      Enabled: true,
      ViewerCertificate: {},
      Staging: false,
      Restrictions: {
        GeoRestriction: { RestrictionType: "", Quantity: 0 },
      },
      WebACLId: "",
      HttpVersion: "",
      IsIPV6Enabled: true,
    };
    mockedCloudfrontClient.on(ListDistributionsCommand).resolves({
      DistributionList: {
        Marker: "",
        MaxItems: 10,
        Quantity: 1,
        IsTruncated: false,
        Items: [mockDistribution],
      },
    });

    await Promise.all(
      CloudfrontScanner.getters.map((getter) =>
        getter(cloudfrontClient, connector, testContext),
      ),
    );

    const callCount = mockedCloudfrontClient.commandCalls(
      ListDistributionsCommand,
    ).length;
    equal(callCount, 1);

    for (const entity of CloudfrontScanner.entities ?? []) {
      const nodeProducer = generateNodesFromEntity(
        connector,
        testContext,
        entity,
      );
      for await (const node of nodeProducer) {
        ok(node.$graph.id);
        ok(node.$graph.label);
        ok(node.$metadata.version);
        equal(node.tenant.tenantId, testContext.account);
        equal(node.tenant.provider, "aws");
        // CloudFront is a global service, so distributions sit directly under the account node
        equal(node.$graph.parent, testContext.account);
        equal(node.$source?.command, entity.command);
        equal(node.resource.category, entity.category);
        equal(node.resource.subcategory, entity.subcategory);
        equal(node.dns?.domains.length, 1);
        equal(node.dns?.domains[0], mockDistribution.DomainName);
      }
    }
  },
);

t.test(
  "CloudFront is scanned once as a global service, and its nodes and edges resolve without a region node",
  async ({ equal, same }) => {
    // Global scanners are called once, with the scan's default region as context
    equal(CloudfrontScanner.callPerRegion, false);

    const globalConnector = buildFsConnector(mkdtempSync(baseDirectory));
    const defaultContext = {
      region: "us-east-1",
      account: "1".repeat(12),
    };
    const bucketName = "static-assets";
    const distributionArn = `arn:aws:cloudfront::${defaultContext.account}:distribution/EDFDVBD6EXAMPLE`;

    const cloudfrontClient = CloudfrontScanner.getClient(
      fromProcess(),
      defaultContext,
    );
    const mockedCloudfrontClient = mockClient(cloudfrontClient);
    mockedCloudfrontClient.on(ListDistributionsCommand).resolves({
      DistributionList: {
        Marker: "",
        MaxItems: 10,
        Quantity: 1,
        IsTruncated: false,
        Items: [
          {
            Id: "EDFDVBD6EXAMPLE",
            ARN: distributionArn,
            Status: "Deployed",
            LastModifiedTime: new Date(),
            DomainName: "d111111abcdef8.cloudfront.net",
            Aliases: { Quantity: 0 },
            Origins: {
              Quantity: 1,
              Items: [
                {
                  Id: "s3-origin",
                  DomainName: `${bucketName}.s3.amazonaws.com`,
                },
              ],
            },
            DefaultCacheBehavior: {
              TargetOriginId: "s3-origin",
              ViewerProtocolPolicy: "redirect-to-https",
            },
            CacheBehaviors: { Quantity: 0 },
            CustomErrorResponses: { Quantity: 0 },
            Comment: "",
            PriceClass: "PriceClass_All",
            Enabled: true,
            ViewerCertificate: {},
            Staging: false,
            Restrictions: {
              GeoRestriction: { RestrictionType: "none", Quantity: 0 },
            },
            WebACLId: "",
            HttpVersion: "http2",
            IsIPV6Enabled: true,
          },
        ],
      },
    });

    for (const getter of CloudfrontScanner.getters) {
      await getter(cloudfrontClient, globalConnector, defaultContext);
    }
    equal(
      mockedCloudfrontClient.commandCalls(ListDistributionsCommand).length,
      1,
    );

    // S3 is also global, so its state is recorded against the default region
    await globalConnector.onServiceScanCompleteCallback(
      defaultContext.account,
      defaultContext.region,
      "S3",
      "ListBuckets",
      [
        {
          _metadata: { ...defaultContext, timestamp: Date.now() },
          _parameters: {},
          _result: { Buckets: [{ Name: bucketName }] },
        },
      ],
    );

    // Global services are added to the graph before any region nodes exist
    const graph = Graph();
    graph.addNode({
      $graph: { id: defaultContext.account },
    } as unknown as BaseState);
    graph.addNode({
      $graph: {
        id: formatS3NodeId(bucketName),
        parent: defaultContext.account,
      },
    } as unknown as BaseState);

    const nodes: BaseState[] = [];
    for (const entity of CloudfrontScanner.entities ?? []) {
      for await (const node of generateNodesFromEntity(
        globalConnector,
        defaultContext,
        entity,
      )) {
        nodes.push(node);
        graph.addNode(node);
      }
    }
    equal(nodes.length, 1);
    equal(nodes[0].$graph.parent, defaultContext.account);
    equal(
      graph.getNode(distributionArn)?.parent?.$graph.id,
      defaultContext.account,
    );

    const edges = await CloudfrontScanner.getEdges!(globalConnector);
    same(
      edges.map(({ source, target }) => ({ source, target })),
      [{ source: distributionArn, target: formatS3NodeId(bucketName) }],
    );
    for (const edge of edges) {
      graph.addEdge({ ...edge, metadata: edge.metadata ?? {} });
    }
    equal(graph.edges.length, 1);
  },
);
