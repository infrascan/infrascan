import { mkdtempSync } from "fs";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import { ListDistributionsCommand } from "@aws-sdk/client-cloudfront";
import buildFsConnector from "@infrascan/fs-connector";
import CloudfrontScanner from "../src";

const tmpDir = mkdtempSync("infrascan-test-state-");
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from Cloudfront, and formatted as expected",
  async () => {
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
    mockedCloudfrontClient.on(ListDistributionsCommand).resolves({
      DistributionList: {
        Marker: "",
        MaxItems: 10,
        Quantity: 1,
        IsTruncated: false,
        Items: [
          {
            Id: "",
            ARN: distributionArn,
            Status: "",
            LastModifiedTime: new Date(),
            DomainName: "",
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
          },
        ],
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
    t.equal(callCount, 1);

    if (CloudfrontScanner.getNodes != null) {
      const nodes = await CloudfrontScanner.getNodes(connector, testContext);
      t.equal(nodes.length, 1);
      t.ok(nodes.find((node) => node.id === distributionArn));
    }
  },
);
