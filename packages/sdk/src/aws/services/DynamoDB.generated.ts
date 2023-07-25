import { DynamoDBClient, ListTablesCommandInput, ListTablesCommandOutput, ListTablesCommand, DescribeTableCommandInput, DescribeTableCommandOutput, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { scanIamRole, IAMStorage } from "../helpers/iam";
import { IAM } from "@aws-sdk/client-iam";
import { resolveFunctionCallParameters } from "../helpers/state";
import { Formatters } from "@infrascan/config";
import type { ServiceScanCompleteCallbackFn, ResolveStateFromServiceFn, GenericState } from "@infrascan/shared-types";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";

// This file is autogenerated using infrascan-codegen. Do not manually edit this file.
async function performScan(credentials: AwsCredentialIdentityProvider, account: string, region: string, iamClient: IAM, iamStorage: IAMStorage, onServiceCallComplete: ServiceScanCompleteCallbackFn, resolveStateForServiceCall: ResolveStateFromServiceFn) {
  const DynamoDB = new DynamoDBClient({ region, credentials });
  const ListTablesState: GenericState[] = [];
  try {
    console.log("dynamodb ListTables");
    let ListTablesPagingToken: string | undefined = undefined;
    do {
      const ListTablesCmd = new ListTablesCommand({} as ListTablesCommandInput);
      const result: ListTablesCommandOutput = await DynamoDB.send(ListTablesCmd);
      const formattedResult = Formatters.DynamoDB.listTables(result);
      ListTablesState.push({ _metadata: { account, region }, _parameters: {}, _result: formattedResult });
    } while (ListTablesPagingToken != null);
  }
  catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    }
    else {
      console.log("Encountered unretryable error", err);
    }
  }
  await onServiceCallComplete(account, region, "DynamoDB", "ListTables", ListTablesState);

  const DescribeTableState: GenericState[] = [];
  const DescribeTableParameterResolvers = [{ "Key": "TableName", "Selector": "DynamoDB|ListTables|[]._result[]" }];
  const DescribeTableParameters = (await resolveFunctionCallParameters(account, region, DescribeTableParameterResolvers, resolveStateForServiceCall)) as DescribeTableCommandInput[];
  for (const requestParameters of DescribeTableParameters) {
    try {
      console.log("dynamodb DescribeTable");
      let DescribeTablePagingToken: string | undefined = undefined;
      do {
        const DescribeTableCmd = new DescribeTableCommand(requestParameters);
        const result: DescribeTableCommandOutput = await DynamoDB.send(DescribeTableCmd);
        const formattedResult = Formatters.DynamoDB.describeTable(result);
        DescribeTableState.push({ _metadata: { account, region }, _parameters: requestParameters, _result: formattedResult });
      } while (DescribeTablePagingToken != null);
    }
    catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      }
      else {
        console.log("Encountered unretryable error", err);
      }
    }
  }
  await onServiceCallComplete(account, region, "DynamoDB", "DescribeTable", DescribeTableState);

}

const NODE_SELECTORS = ["DynamoDB|DescribeTable|[].{id:_result.TableArn}"];

export { performScan, NODE_SELECTORS };