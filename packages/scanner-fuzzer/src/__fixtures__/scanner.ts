/* eslint-disable @typescript-eslint/no-explicit-any */
// Test-only fixture, the Lambda client is a dev dependency
// eslint-disable-next-line import/no-extraneous-dependencies
import { LambdaClient, ListFunctionsCommand } from "@aws-sdk/client-lambda";
import type { BaseState, TranslatedEntity } from "@infrascan/shared-types";
import type { AwsScanner } from "../scanners";

export interface FixtureFaults {
  getter?: boolean;
  component?: boolean;
  edges?: boolean;
  nullRole?: boolean;
}

/**
 * A minimal scanner with switchable faults, for testing the fuzzer itself.
 * It lists Lambda functions and graphs each one.
 */
export function buildFixtureScanner(faults: FixtureFaults = {}): AwsScanner {
  const entity = {
    version: "0.0.0",
    debugLabel: "fixture-function",
    provider: "aws",
    command: "ListFunctions",
    category: "fixture",
    subcategory: "function",
    nodeType: "fixture-function",
    selector: "Fixture|ListFunctions|[]",
    async getState(connector: any, context: any) {
      return connector.resolveStateForServiceFunction(
        context.account,
        context.region,
        "Fixture",
        "ListFunctions",
      );
    },
    translate(state: any) {
      return (state._result.Functions ?? []).map((fn: any) => ({
        ...fn,
        $metadata: state._metadata,
      }));
    },
    components: {
      $graph(val: any) {
        return {
          id: `fixture-${val.$metadata.timestamp}-${Math.round(
            val.MemorySize ?? 0,
          )}-${val.FunctionName ?? "x"}`,
          label: "fixture",
          nodeClass: "visual",
          nodeType: "fixture-function",
          parent: `${val.$metadata.account}-${val.$metadata.region}`,
        };
      },
      tenant(val: any) {
        return { tenantId: val.$metadata.account, provider: "aws" };
      },
      location(val: any) {
        return { code: val.$metadata.region };
      },
      $metadata(val: any) {
        return { version: "0.0.0", timestamp: val.$metadata.timestamp };
      },
      resource(val: any) {
        if (faults.component) {
          // Assumes a property the API doesn't guarantee
          return { id: val.Missing.Property, name: "x", category: "fixture" };
        }
        return { id: "x", name: "x", category: "fixture" };
      },
    },
  } as unknown as TranslatedEntity<BaseState, any, any>;

  return {
    provider: "aws",
    service: "fixture",
    key: "Fixture",
    callPerRegion: true,
    getClient: (credentials, context) =>
      new LambdaClient({ credentials, region: context.region }),
    getters: [
      async function ListFunctions(client: any, connector, context) {
        const result = await client
          .send(new ListFunctionsCommand({}))
          .catch(() => ({ Functions: [] }));
        if (faults.getter) {
          throw new Error("getter assumed a property exists");
        }
        await connector.onServiceScanCompleteCallback(
          context.account,
          context.region,
          "Fixture",
          "ListFunctions",
          [
            {
              _metadata: {
                account: context.account,
                region: context.region,
                timestamp: 1,
              },
              _parameters: {},
              _result: result,
            },
          ],
        );
      },
    ],
    getIamRoles: async () =>
      faults.nullRole
        ? [{ roleArn: null as unknown as string, executor: "x" }]
        : [],
    getEdges: async () => {
      if (faults.edges) {
        throw new TypeError(
          "Cannot read properties of undefined (reading 'split')",
        );
      }
      return [];
    },
    entities: [entity],
  };
}
