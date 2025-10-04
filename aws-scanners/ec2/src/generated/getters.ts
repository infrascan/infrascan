import { resolveFunctionCallParameters } from "@infrascan/core";
import { EC2Client, EC2ServiceException } from "@aws-sdk/client-ec2";
import {
  DescribeVpcsCommand,
  DescribeVpcsCommandInput,
  DescribeVpcsCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeSubnetsCommand,
  DescribeSubnetsCommandInput,
  DescribeSubnetsCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeSecurityGroupsCommand,
  DescribeSecurityGroupsCommandInput,
  DescribeSecurityGroupsCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeLaunchTemplatesCommand,
  DescribeLaunchTemplatesCommandInput,
  DescribeLaunchTemplatesCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeLaunchTemplateVersionsCommand,
  DescribeLaunchTemplateVersionsCommandInput,
  DescribeLaunchTemplateVersionsCommandOutput,
} from "@aws-sdk/client-ec2";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import debug from "debug";

export async function DescribeVpcs(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeVpcs");
  const state: GenericState[] = [];
  getterDebug("DescribeVpcs");
  const preparedParams: DescribeVpcsCommandInput = {};
  try {
    const cmd = new DescribeVpcsCommand(preparedParams);
    const result: DescribeVpcsCommandOutput = await client.send(cmd);
    state.push({
      _metadata: {
        account: context.account,
        region: context.region,
        timestamp: Date.now(),
      },
      _parameters: preparedParams,
      _result: result,
    });
  } catch (err: unknown) {
    if (err instanceof EC2ServiceException) {
      if (err?.$retryable) {
        console.log("Encountered retryable error", err);
      } else {
        console.log("Encountered unretryable error", err);
      }
    } else {
      console.log("Encountered unexpected error", err);
    }
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EC2",
    "DescribeVpcs",
    state,
  );
}

export async function DescribeSubnets(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeSubnets");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "Filters", Selector: "EC2|DescribeVpcs|[]._result.Vpcs[].VpcId" },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeSubnetsCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: DescribeSubnetsCommandInput = parameters;
      preparedParams["NextToken"] = pagingToken;
      try {
        const cmd = new DescribeSubnetsCommand(preparedParams);
        const result: DescribeSubnetsCommandOutput = await client.send(cmd);
        state.push({
          _metadata: {
            account: context.account,
            region: context.region,
            timestamp: Date.now(),
          },
          _parameters: preparedParams,
          _result: result,
        });
        pagingToken = result["NextToken"];
        if (pagingToken != null) {
          getterDebug("Found pagination token in response");
        } else {
          getterDebug("No pagination token found in response");
        }
      } catch (err: unknown) {
        if (err instanceof EC2ServiceException) {
          if (err?.$retryable) {
            console.log("Encountered retryable error", err);
          } else {
            console.log("Encountered unretryable error", err);
          }
        } else {
          console.log("Encountered unexpected error", err);
        }
        pagingToken = undefined;
      }
    } while (pagingToken != null);
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EC2",
    "DescribeSubnets",
    state,
  );
}

export async function DescribeSecurityGroups(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeSecurityGroups");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeSecurityGroupsCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeSecurityGroupsCommand(preparedParams);
      const result: DescribeSecurityGroupsCommandOutput = await client.send(
        cmd,
      );
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: Date.now(),
        },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result["NextToken"];
      if (pagingToken != null) {
        getterDebug("Found pagination token in response");
      } else {
        getterDebug("No pagination token found in response");
      }
    } catch (err: unknown) {
      if (err instanceof EC2ServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
      pagingToken = undefined;
    }
  } while (pagingToken != null);
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EC2",
    "DescribeSecurityGroups",
    state,
  );
}

export async function DescribeLaunchTemplates(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeLaunchTemplates");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeLaunchTemplatesCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeLaunchTemplatesCommand(preparedParams);
      const result: DescribeLaunchTemplatesCommandOutput = await client.send(
        cmd,
      );
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: Date.now(),
        },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result["NextToken"];
      if (pagingToken != null) {
        getterDebug("Found pagination token in response");
      } else {
        getterDebug("No pagination token found in response");
      }
    } catch (err: unknown) {
      if (err instanceof EC2ServiceException) {
        if (err?.$retryable) {
          console.log("Encountered retryable error", err);
        } else {
          console.log("Encountered unretryable error", err);
        }
      } else {
        console.log("Encountered unexpected error", err);
      }
      pagingToken = undefined;
    }
  } while (pagingToken != null);
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EC2",
    "DescribeLaunchTemplates",
    state,
  );
}

export async function DescribeLaunchTemplateVersions(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeLaunchTemplateVersions");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "LaunchTemplateId",
      Selector:
        "EC2|DescribeLaunchTemplates|[]._result.LaunchTemplates[].LaunchTemplateId",
    },
    { Key: "Versions", Value: ["$Latest", "$Default"] },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeLaunchTemplateVersionsCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: DescribeLaunchTemplateVersionsCommandInput =
        parameters;
      preparedParams["NextToken"] = pagingToken;
      try {
        const cmd = new DescribeLaunchTemplateVersionsCommand(preparedParams);
        const result: DescribeLaunchTemplateVersionsCommandOutput =
          await client.send(cmd);
        state.push({
          _metadata: {
            account: context.account,
            region: context.region,
            timestamp: Date.now(),
          },
          _parameters: preparedParams,
          _result: result,
        });
        pagingToken = result["NextToken"];
        if (pagingToken != null) {
          getterDebug("Found pagination token in response");
        } else {
          getterDebug("No pagination token found in response");
        }
      } catch (err: unknown) {
        if (err instanceof EC2ServiceException) {
          if (err?.$retryable) {
            console.log("Encountered retryable error", err);
          } else {
            console.log("Encountered unretryable error", err);
          }
        } else {
          console.log("Encountered unexpected error", err);
        }
        pagingToken = undefined;
      }
    } while (pagingToken != null);
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EC2",
    "DescribeLaunchTemplateVersions",
    state,
  );
}
