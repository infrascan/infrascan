import { evaluateSelector, resolveFunctionCallParameters } from "@infrascan/core";
import { IAMClient, IAMServiceException } from "@aws-sdk/client-iam";
import {
  ListRolesCommand,
  ListRolesCommandInput,
  ListRolesCommandOutput,
} from "@aws-sdk/client-iam";
import {
  ListRolePoliciesCommand,
  ListRolePoliciesCommandInput,
  ListRolePoliciesCommandOutput,
} from "@aws-sdk/client-iam";
import {
  GetRolePolicyCommand,
  GetRolePolicyCommandInput,
  GetRolePolicyCommandOutput,
} from "@aws-sdk/client-iam";
import {
  ListAttachedRolePoliciesCommand,
  ListAttachedRolePoliciesCommandInput,
  ListAttachedRolePoliciesCommandOutput,
} from "@aws-sdk/client-iam";
import type {
  Connector,
  GenericState,
  AwsContext,
  State,
} from "@infrascan/shared-types";
import debug from "debug";

export async function ListRoles(
  client: IAMClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("iam:ListRoles");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: ListRolesCommandInput = {};
    preparedParams["Marker"] = pagingToken;
    try {
      const cmd = new ListRolesCommand(preparedParams);
      const result: ListRolesCommandOutput = await client.send(cmd);
      state.push({
        _metadata: {
          account: context.account,
          region: context.region,
          timestamp: Date.now(),
        },
        _parameters: preparedParams,
        _result: result,
      });
      pagingToken = result["Marker"];
      if (pagingToken != null) {
        getterDebug("Found pagination token in response");
      } else {
        getterDebug("No pagination token found in response");
      }
    } catch (err: unknown) {
      if (err instanceof IAMServiceException) {
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
    "IAM",
    "ListRoles",
    state,
  );
}

export async function ListRolePolicies(
  client: IAMClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("iam:ListRolePolicies");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "RoleName",
      Selector: "IAM|ListRoles|[]._result.Roles[].RoleName",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as ListRolePoliciesCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: ListRolePoliciesCommandInput = {
        ...parameters,
        Marker: pagingToken,
      };
      try {
        const cmd = new ListRolePoliciesCommand(preparedParams);
        const result: ListRolePoliciesCommandOutput = await client.send(cmd);
        state.push({
          _metadata: {
            account: context.account,
            region: context.region,
            timestamp: Date.now(),
          },
          _parameters: preparedParams,
          _result: result,
        });
        pagingToken = result["Marker"];
        if (pagingToken != null) {
          getterDebug("Found pagination token in response");
        } else {
          getterDebug("No pagination token found in response");
        }
      } catch (err: unknown) {
        if (err instanceof IAMServiceException) {
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
    "IAM",
    "ListRolePolicies",
    state,
  );
}

/**
 * Custom getter — GetRolePolicy requires correlated (RoleName, PolicyName) pairs
 * from each ListRolePolicies result, which can't be expressed as an index-paired
 * cross-product via resolveFunctionCallParameters. We read the stored
 * ListRolePolicies state directly and iterate role → policies.
 */
export async function GetRolePolicy(
  client: IAMClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("iam:GetRolePolicy");
  const state: GenericState[] = [];
  getterDebug("Fetching state");

  const listRolePoliciesState = await evaluateSelector<
    State<ListRolePoliciesCommandOutput, ListRolePoliciesCommandInput>
  >(context.account, context.region, "IAM|ListRolePolicies|[]", stateConnector);

  for (const entry of listRolePoliciesState) {
    const roleName = entry._parameters?.RoleName;
    if (roleName == null) {
      continue;
    }
    for (const policyName of entry._result.PolicyNames ?? []) {
      const preparedParams: GetRolePolicyCommandInput = {
        RoleName: roleName,
        PolicyName: policyName,
      };
      try {
        const cmd = new GetRolePolicyCommand(preparedParams);
        const result: GetRolePolicyCommandOutput = await client.send(cmd);
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
        if (err instanceof IAMServiceException) {
          if (err?.$retryable) {
            console.log("Encountered retryable error", err);
          } else {
            console.log("Encountered unretryable error", err);
          }
        } else {
          console.log("Encountered unexpected error", err);
        }
      }
    }
  }

  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "IAM",
    "GetRolePolicy",
    state,
  );
}

export async function ListAttachedRolePolicies(
  client: IAMClient,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("iam:ListAttachedRolePolicies");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "RoleName",
      Selector: "IAM|ListRoles|[]._result.Roles[].RoleName",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as ListAttachedRolePoliciesCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: ListAttachedRolePoliciesCommandInput = {
        ...parameters,
        Marker: pagingToken,
      };
      try {
        const cmd = new ListAttachedRolePoliciesCommand(preparedParams);
        const result: ListAttachedRolePoliciesCommandOutput =
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
        pagingToken = result["Marker"];
        if (pagingToken != null) {
          getterDebug("Found pagination token in response");
        } else {
          getterDebug("No pagination token found in response");
        }
      } catch (err: unknown) {
        if (err instanceof IAMServiceException) {
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
    "IAM",
    "ListAttachedRolePolicies",
    state,
  );
}
