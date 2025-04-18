import {
  ApiGatewayV2Client,
  ApiGatewayV2ServiceException,
  GetApisCommand,
  GetApisCommandInput,
  GetApisCommandOutput,
  GetDomainNamesCommand,
  GetDomainNamesCommandInput,
  GetDomainNamesCommandOutput,
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
  getterDebug("GetApis");
  const preparedParams: GetApisCommandInput = {};
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
  }
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
  getterDebug("GetDomainNames");
  const preparedParams: GetDomainNamesCommandInput = {};
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
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "ApiGatewayV2",
    "GetDomainNames",
    state,
  );
}
