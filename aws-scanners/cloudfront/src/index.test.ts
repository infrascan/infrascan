import { mkdtempSync } from "fs";
import t from "tap";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import { ListDistributionsCommand } from "@aws-sdk/client-cloudfront";
import buildFsConnector from "@infrascan/fs-connector";
import { generateNodesFromEntity } from "@infrascan/core";
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
        ok(node.location?.code);
        equal(node.$source?.command, entity.command);
        equal(node.resource.category, entity.category);
        equal(node.resource.subcategory, entity.subcategory);
        equal(node.dns?.domains.length, 1);
        equal(node.dns?.domains[0], mockDistribution.DomainName);
      }
    }
  },
);
