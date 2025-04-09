import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import {
  ListHostedZonesByNameCommand,
  ListResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";
import buildFsConnector from "@infrascan/fs-connector";
import Route53Scanner from ".";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from Route53, and formatted as expected",
  async () => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const route53Client = Route53Scanner.getClient(fromProcess(), testContext);

    const mockedRoute53Client = mockClient(route53Client);

    // Mock each of the functions used to pull state
    const hostedZoneId = "00000000000000";
    mockedRoute53Client.on(ListHostedZonesByNameCommand).resolves({
      HostedZones: [
        {
          Id: hostedZoneId,
          Name: "mydomain.com",
          CallerReference: undefined,
        },
      ],
    });

    const cloudfrontRecordName = "cf.mydomain.com";
    const cloudfrontDnsName = "cf-mydomain.cloudfront.net.";
    const elbRecordName = "elb.mydomain.com";
    const elbDnsName = "elb-mydomain.elb.amazonaws.com.";
    const apiGatewayRecordName = "gateway.mydomain.com";
    const apiGatewayDnsName =
      "gateway-mydomain.execute-api.eu-west-1.amazonaws.com.";
    const s3RecordName = "bucket.mydomain.com";
    const s3DnsName = "s3-website-bucket-mydomain.amazonaws.com.";
    mockedRoute53Client.on(ListResourceRecordSetsCommand).resolves({
      ResourceRecordSets: [
        {
          Name: cloudfrontRecordName,
          Type: "A",
          AliasTarget: {
            DNSName: cloudfrontDnsName,
            HostedZoneId: hostedZoneId,
            EvaluateTargetHealth: false,
          },
        },
        {
          Name: elbRecordName,
          Type: "A",
          AliasTarget: {
            DNSName: elbDnsName,
            HostedZoneId: hostedZoneId,
            EvaluateTargetHealth: false,
          },
        },
        {
          Name: apiGatewayRecordName,
          Type: "A",
          AliasTarget: {
            DNSName: apiGatewayDnsName,
            HostedZoneId: hostedZoneId,
            EvaluateTargetHealth: false,
          },
        },
        {
          Name: s3RecordName,
          Type: "A",
          AliasTarget: {
            DNSName: s3DnsName,
            HostedZoneId: hostedZoneId,
            EvaluateTargetHealth: false,
          },
        },
      ],
    });

    for (const scannerFn of Route53Scanner.getters) {
      await scannerFn(route53Client, connector, testContext);
    }

    t.equal(
      mockedRoute53Client.commandCalls(ListHostedZonesByNameCommand).length,
      1,
    );

    t.equal(
      mockedRoute53Client.commandCalls(ListResourceRecordSetsCommand).length,
      1,
    );

    const listResourceRecordSets = mockedRoute53Client
      .commandCalls(ListResourceRecordSetsCommand)
      .at(0)?.args;
    t.equal(listResourceRecordSets?.[0].input.HostedZoneId, hostedZoneId);

    connector.onServiceScanCompleteCallback(
      testContext.account,
      testContext.region,
      "CloudFront",
      "ListDistributions",
      [
        {
          _result: {
            DistributionList: {
              Items: [
                {
                  DomainName: cloudfrontRecordName,
                  ARN: "arn:aws:cloudfront:us-east-1:000000000:distribution/test-dist",
                },
              ],
            },
          },
        },
      ],
    );

    // TODO; have a better way to seed/use fixtures for cross-service edges
    if (Route53Scanner.getEdges != null) {
      const edges = await Route53Scanner.getEdges(connector);
      t.equal(edges.length, 0);
    }
  },
);

t.test(
  "No hosted zones returned from ListHostedZonesByNameCommand",
  async () => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const route53Client = Route53Scanner.getClient(fromProcess(), testContext);

    const mockedRoute53Client = mockClient(route53Client);

    // Mock each of the functions used to pull state
    mockedRoute53Client.on(ListHostedZonesByNameCommand).resolves({
      HostedZones: [],
    });

    for (const scannerFn of Route53Scanner.getters) {
      await scannerFn(route53Client, connector, testContext);
    }

    t.equal(
      mockedRoute53Client.commandCalls(ListHostedZonesByNameCommand).length,
      1,
    );

    t.equal(
      mockedRoute53Client.commandCalls(ListResourceRecordSetsCommand).length,
      0,
    );

    // TODO; have a better way to seed/use fixtures for cross-service edges
    if (Route53Scanner.getEdges != null) {
      const edges = await Route53Scanner.getEdges(connector);
      t.equal(edges.length, 0);
    }
  },
);
