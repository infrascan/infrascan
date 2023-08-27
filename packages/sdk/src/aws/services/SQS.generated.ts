import {
  SQSClient,
  ListQueuesCommandInput,
  ListQueuesCommandOutput,
  ListQueuesCommand,
  ListQueueTagsCommandInput,
  ListQueueTagsCommandOutput,
  ListQueueTagsCommand,
  GetQueueAttributesCommandInput,
  GetQueueAttributesCommandOutput,
  GetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { scanIamRole, IAMStorage } from "../helpers/iam";
import { IAM } from "@aws-sdk/client-iam";
import { resolveFunctionCallParameters } from "../helpers/state";
import { Formatters } from "@infrascan/config";
import type {
  ServiceScanCompleteCallbackFn,
  ResolveStateForServiceFunction,
  GenericState,
} from "@infrascan/shared-types";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";

// This file is autogenerated using infrascan-codegen. Do not manually edit this file.
async function performScan(
  credentials: AwsCredentialIdentityProvider,
  account: string,
  region: string,
  iamClient: IAM,
  iamStorage: IAMStorage,
  onServiceCallComplete: ServiceScanCompleteCallbackFn,
  resolveStateForServiceCall: ResolveStateForServiceFunction,
) {
  const SQS = new SQSClient({ region, credentials });
  const ListQueuesState: GenericState[] = [];
  try {
    console.log("sqs ListQueues");
    let ListQueuesPagingToken: string | undefined = undefined;
    do {
      const ListQueuesCmd = new ListQueuesCommand({} as ListQueuesCommandInput);
      const result: ListQueuesCommandOutput = await SQS.send(ListQueuesCmd);
      const formattedResult = Formatters.SQS.listQueues(result);
      ListQueuesState.push({
        _metadata: { account, region },
        _parameters: {},
        _result: formattedResult,
      });
    } while (ListQueuesPagingToken != null);
  } catch (err: any) {
    if (err?.retryable) {
      console.log("Encountered retryable error", err);
    } else {
      console.log("Encountered unretryable error", err);
    }
  }
  await onServiceCallComplete(
    account,
    region,
    "SQS",
    "ListQueues",
    ListQueuesState,
  );

  const ListQueueTagsState: GenericState[] = [];
  const ListQueueTagsParameterResolvers = [
    { Key: "QueueUrl", Selector: "SQS|ListQueues|[]._result[].QueueUrl" },
  ];
  const ListQueueTagsParameters = (await resolveFunctionCallParameters(
    account,
    region,
    ListQueueTagsParameterResolvers,
    resolveStateForServiceCall,
  )) as ListQueueTagsCommandInput[];
  for (const requestParameters of ListQueueTagsParameters) {
    try {
      console.log("sqs ListQueueTags");
      let ListQueueTagsPagingToken: string | undefined = undefined;
      do {
        const ListQueueTagsCmd = new ListQueueTagsCommand(requestParameters);
        const result: ListQueueTagsCommandOutput = await SQS.send(
          ListQueueTagsCmd,
        );
        const formattedResult = Formatters.SQS.listQueueTags(result);
        ListQueueTagsState.push({
          _metadata: { account, region },
          _parameters: requestParameters,
          _result: formattedResult,
        });
      } while (ListQueueTagsPagingToken != null);
    } catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    }
  }
  await onServiceCallComplete(
    account,
    region,
    "SQS",
    "ListQueueTags",
    ListQueueTagsState,
  );

  const GetQueueAttributesState: GenericState[] = [];
  const GetQueueAttributesParameterResolvers = [
    { Key: "QueueUrl", Selector: "SQS|ListQueues|[]._result[].QueueUrl" },
    { Key: "AttributeNames", Value: ["All"] },
  ];
  const GetQueueAttributesParameters = (await resolveFunctionCallParameters(
    account,
    region,
    GetQueueAttributesParameterResolvers,
    resolveStateForServiceCall,
  )) as GetQueueAttributesCommandInput[];
  for (const requestParameters of GetQueueAttributesParameters) {
    try {
      console.log("sqs GetQueueAttributes");
      let GetQueueAttributesPagingToken: string | undefined = undefined;
      do {
        const GetQueueAttributesCmd = new GetQueueAttributesCommand(
          requestParameters,
        );
        const result: GetQueueAttributesCommandOutput = await SQS.send(
          GetQueueAttributesCmd,
        );
        const formattedResult = Formatters.SQS.getQueueAttributes(result);
        GetQueueAttributesState.push({
          _metadata: { account, region },
          _parameters: requestParameters,
          _result: formattedResult,
        });
      } while (GetQueueAttributesPagingToken != null);
    } catch (err: any) {
      if (err?.retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    }
  }
  await onServiceCallComplete(
    account,
    region,
    "SQS",
    "GetQueueAttributes",
    GetQueueAttributesState,
  );
}

const NODE_SELECTORS = [
  "SQS|GetQueueAttributes|[]._result.{id:QueueArn,name:QueueName}",
];
const EDGE_SELECTORS = [
  {
    state: "SQS|GetQueueAttributes|[]",
    from: "_result.QueueArn",
    to: "_result.RedrivePolicy.{target:deadLetterTargetArn}",
  },
];

export { performScan, NODE_SELECTORS, EDGE_SELECTORS };
