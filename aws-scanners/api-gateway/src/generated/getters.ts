import { resolveFunctionCallParameters } from "@infrascan/core";
import {
  ApiGatewayV2Client,
  ApiGatewayV2ServiceException,
} from "@aws-sdk/client-apigatewayv2";
import {
  GetApisCommand,
  GetApisCommandInput,
  GetApisCommandOutput,
} from "@aws-sdk/client-apigatewayv2";
import {
  GetDomainNamesCommand,
  GetDomainNamesCommandInput,
  GetDomainNamesCommandOutput,
} from "@aws-sdk/client-apigatewayv2";
import {
  GetRoutesCommand,
  GetRoutesCommandInput,
  GetRoutesCommandOutput,
} from "@aws-sdk/client-apigatewayv2";
import {
  GetIntegrationsCommand,
  GetIntegrationsCommandInput,
  GetIntegrationsCommandOutput,
} from "@aws-sdk/client-apigatewayv2";
import {
  GetAuthorizersCommand,
  GetAuthorizersCommandInput,
  GetAuthorizersCommandOutput,
} from "@aws-sdk/client-apigatewayv2";
import {
  GetStagesCommand,
  GetStagesCommandInput,
  GetStagesCommandOutput,
} from "@aws-sdk/client-apigatewayv2";
import type {
  Connector,
  GenericState,
  AwsContext,
} from "@infrascan/shared-types";
import debug from "debug";

export async function GetApis(
  client: ApiGatewayV2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("apigatewayv2:GetApis");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: GetApisCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new GetApisCommand(preparedParams);
      const result: GetApisCommandOutput = await client.send(cmd);
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
      if (err instanceof ApiGatewayV2ServiceException) {
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
    "ApiGatewayV2",
    "GetApis",
    state,
  );
}

export async function GetDomainNames(
  client: ApiGatewayV2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("apigatewayv2:GetDomainNames");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: GetDomainNamesCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new GetDomainNamesCommand(preparedParams);
      const result: GetDomainNamesCommandOutput = await client.send(cmd);
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
      if (err instanceof ApiGatewayV2ServiceException) {
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
    "ApiGatewayV2",
    "GetDomainNames",
    state,
  );
}

export async function GetRoutes(
  client: ApiGatewayV2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("apigatewayv2:GetRoutes");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "ApiId", Selector: "ApiGatewayV2|GetApis|[]._result.Items[].ApiId" },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as GetRoutesCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: GetRoutesCommandInput = parameters;
      preparedParams["NextToken"] = pagingToken;
      try {
        const cmd = new GetRoutesCommand(preparedParams);
        const result: GetRoutesCommandOutput = await client.send(cmd);
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
        if (err instanceof ApiGatewayV2ServiceException) {
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
    "ApiGatewayV2",
    "GetRoutes",
    state,
  );
}

export async function GetIntegrations(
  client: ApiGatewayV2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("apigatewayv2:GetIntegrations");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "ApiId", Selector: "ApiGatewayV2|GetApis|[]._result.Items[].ApiId" },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as GetIntegrationsCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: GetIntegrationsCommandInput = parameters;
      preparedParams["NextToken"] = pagingToken;
      try {
        const cmd = new GetIntegrationsCommand(preparedParams);
        const result: GetIntegrationsCommandOutput = await client.send(cmd);
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
        if (err instanceof ApiGatewayV2ServiceException) {
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
    "ApiGatewayV2",
    "GetIntegrations",
    state,
  );
}

export async function GetAuthorizers(
  client: ApiGatewayV2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("apigatewayv2:GetAuthorizers");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "ApiId", Selector: "ApiGatewayV2|GetApis|[]._result.Items[].ApiId" },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as GetAuthorizersCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: GetAuthorizersCommandInput = parameters;
      preparedParams["NextToken"] = pagingToken;
      try {
        const cmd = new GetAuthorizersCommand(preparedParams);
        const result: GetAuthorizersCommandOutput = await client.send(cmd);
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
        if (err instanceof ApiGatewayV2ServiceException) {
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
    "ApiGatewayV2",
    "GetAuthorizers",
    state,
  );
}

export async function GetStages(
  client: ApiGatewayV2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("apigatewayv2:GetStages");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    { Key: "ApiId", Selector: "ApiGatewayV2|GetApis|[]._result.Items[].ApiId" },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as GetStagesCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: GetStagesCommandInput = parameters;
      preparedParams["NextToken"] = pagingToken;
      try {
        const cmd = new GetStagesCommand(preparedParams);
        const result: GetStagesCommandOutput = await client.send(cmd);
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
        if (err instanceof ApiGatewayV2ServiceException) {
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
    "ApiGatewayV2",
    "GetStages",
    state,
  );
}
