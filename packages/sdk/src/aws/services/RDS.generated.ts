import { RDSClient, DescribeDBInstancesCommandInput, DescribeDBInstancesCommandOutput, DescribeDBInstancesCommand } from "@aws-sdk/client-rds";
import { scanIamRole, IAMStorage } from "../helpers/iam";
import { IAM } from "@aws-sdk/client-iam";
import { Formatters } from "@infrascan/config";
import type { ServiceScanCompleteCallbackFn, ResolveStateForServiceFunction, GenericState } from "@infrascan/shared-types";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";

// This file is autogenerated using infrascan-codegen. Do not manually edit this file.
async function performScan(credentials: AwsCredentialIdentityProvider, account: string, region: string, iamClient: IAM, iamStorage: IAMStorage, onServiceCallComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateForServiceFunction) {
  const RDS = new RDSClient({ region, credentials });
  const DescribeDBInstancesState: GenericState[] = [];
  try {
    console.log("rds DescribeDBInstances");
    let DescribeDBInstancesPagingToken: string | undefined = undefined;
    do {
      const DescribeDBInstancesCmd = new DescribeDBInstancesCommand({} as DescribeDBInstancesCommandInput);
      const result: DescribeDBInstancesCommandOutput = await RDS.send(DescribeDBInstancesCmd);
      const formattedResult = Formatters.RDS.describeDBInstances(result);
      DescribeDBInstancesState.push({ _metadata: { account, region }, _parameters: {}, _result: formattedResult });
    } while (DescribeDBInstancesPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
    else {
      console.log("Encountered unretryable error", err);
    }
  }
  await onServiceCallComplete(account, region, "RDS", "DescribeDBInstances", DescribeDBInstancesState);

}

const NODE_SELECTORS = ["RDS|DescribeDBInstances|[]._result | [].{id:DBInstanceIdentifier,name:DBName}"];

export { performScan, NODE_SELECTORS };
