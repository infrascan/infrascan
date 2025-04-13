import { mkdtempSync } from "fs";
import { env } from "process";
import { join } from "path";
import { tmpdir } from "os";
import t from "tap";
import { mockClient } from "aws-sdk-client-mock";
import { fromProcess } from "@aws-sdk/credential-providers";
import { DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import buildFsConnector from "@infrascan/fs-connector";
import RDSScanner from ".";
import { generateNodesFromEntity } from "@infrascan/core";
import { RDSInstance, RDSInstanceEntity } from "./graph";

const stateDirectoryPrefix = "infrascan-test-state-";
const baseDirectory =
  env.DEBUG_STATE != null
    ? stateDirectoryPrefix
    : join(tmpdir(), stateDirectoryPrefix);
const tmpDir = mkdtempSync(baseDirectory);
const connector = buildFsConnector(tmpDir);

t.test(
  "State is pulled correctly from RDS, and formatted as expected",
  async ({ equal, ok }) => {
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

    equal(mockedRDSClient.commandCalls(DescribeDBInstancesCommand).length, 1);

    for (const entity of RDSScanner.entities ?? []) {
      const nodeProducer = generateNodesFromEntity(
        connector,
        testContext,
        entity,
      );
      for await (const node of nodeProducer) {
        equal(node.$graph.id, dbId);
        equal(node.$graph.label, dbName);
        ok(node.$metadata.version);
        equal(node.tenant.tenantId, testContext.account);
        equal(node.tenant.provider, "aws");
        ok(node.location?.code);
        equal(node.$source?.command, entity.command);
        equal(node.resource.category, entity.category);
        equal(node.resource.subcategory, entity.subcategory);
        equal((node as unknown as RDSInstance).rds.engine?.type, "postgres");
      }
    }
  },
);
