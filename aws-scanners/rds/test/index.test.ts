import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import { DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import buildFsConnector from "@infrascan/fs-connector";
import RDSScanner from "../src";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from RDS, and formatted as expected",
  async () => {
    const testContext = {
      region: "us-east-1",
      account: "0".repeat(8),
    };
    const rdsClient = RDSScanner.getClient(fromProcess(), testContext);

    const mockedRDSClient = mockClient(rdsClient);

    // Mock each of the functions used to pull state
    const dbId = "test-database-id";
    const dbName = "test-database-name";
    mockedRDSClient.on(DescribeDBInstancesCommand).resolves({
      DBInstances: [
        {
          Engine: "postgres",
          DBInstanceIdentifier: dbId,
          DBName: dbName,
        },
      ],
    });

    for (const scannerFn of RDSScanner.getters) {
      await scannerFn(rdsClient, connector, testContext);
    }

    t.equal(mockedRDSClient.commandCalls(DescribeDBInstancesCommand).length, 1);

    if (RDSScanner.getNodes != null) {
      const nodes = await RDSScanner.getNodes(connector, testContext);
      t.equal(nodes.length, 1);
      t.equal(nodes[0].id, dbId);
      t.equal(nodes[0].data.name, dbName);
    }
  },
);
