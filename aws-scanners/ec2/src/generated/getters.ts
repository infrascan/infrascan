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
import {
  DescribeNetworkInterfacesCommand,
  DescribeNetworkInterfacesCommandInput,
  DescribeNetworkInterfacesCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeNatGatewaysCommand,
  DescribeNatGatewaysCommandInput,
  DescribeNatGatewaysCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeVpcAttributeCommand,
  DescribeVpcAttributeCommandInput,
  DescribeVpcAttributeCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeRouteTablesCommand,
  DescribeRouteTablesCommandInput,
  DescribeRouteTablesCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeInternetGatewaysCommand,
  DescribeInternetGatewaysCommandInput,
  DescribeInternetGatewaysCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeEgressOnlyInternetGatewaysCommand,
  DescribeEgressOnlyInternetGatewaysCommandInput,
  DescribeEgressOnlyInternetGatewaysCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeVpcEndpointsCommand,
  DescribeVpcEndpointsCommandInput,
  DescribeVpcEndpointsCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeNetworkAclsCommand,
  DescribeNetworkAclsCommandInput,
  DescribeNetworkAclsCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeVpcPeeringConnectionsCommand,
  DescribeVpcPeeringConnectionsCommandInput,
  DescribeVpcPeeringConnectionsCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeTransitGatewaysCommand,
  DescribeTransitGatewaysCommandInput,
  DescribeTransitGatewaysCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeTransitGatewayAttachmentsCommand,
  DescribeTransitGatewayAttachmentsCommandInput,
  DescribeTransitGatewayAttachmentsCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeVpnGatewaysCommand,
  DescribeVpnGatewaysCommandInput,
  DescribeVpnGatewaysCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeManagedPrefixListsCommand,
  DescribeManagedPrefixListsCommandInput,
  DescribeManagedPrefixListsCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  GetManagedPrefixListEntriesCommand,
  GetManagedPrefixListEntriesCommandInput,
  GetManagedPrefixListEntriesCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeDhcpOptionsCommand,
  DescribeDhcpOptionsCommandInput,
  DescribeDhcpOptionsCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeFlowLogsCommand,
  DescribeFlowLogsCommandInput,
  DescribeFlowLogsCommandOutput,
} from "@aws-sdk/client-ec2";
import {
  DescribeAddressesCommand,
  DescribeAddressesCommandInput,
  DescribeAddressesCommandOutput,
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
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeVpcsCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
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

export async function DescribeNetworkInterfaces(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeNetworkInterfaces");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [{ Key: "MaxResults", Value: 10 }];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeNetworkInterfacesCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: DescribeNetworkInterfacesCommandInput = parameters;
      preparedParams["NextToken"] = pagingToken;
      try {
        const cmd = new DescribeNetworkInterfacesCommand(preparedParams);
        const result: DescribeNetworkInterfacesCommandOutput =
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
    "DescribeNetworkInterfaces",
    state,
  );
}

export async function DescribeNatGateways(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeNatGateways");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [{ Key: "MaxResults", Value: 10 }];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeNatGatewaysCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: DescribeNatGatewaysCommandInput = parameters;
      preparedParams["NextToken"] = pagingToken;
      try {
        const cmd = new DescribeNatGatewaysCommand(preparedParams);
        const result: DescribeNatGatewaysCommandOutput = await client.send(cmd);
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
    "DescribeNatGateways",
    state,
  );
}
export async function DescribeVpcAttribute(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeVpcAttribute");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "VpcId",
      Selector: "EC2|DescribeVpcs|[]._result.Vpcs[].[VpcId, VpcId][]",
    },
    {
      Key: "Attribute",
      Selector:
        "EC2|DescribeVpcs|[]._result.Vpcs[].['enableDnsSupport', 'enableDnsHostnames'][]",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as DescribeVpcAttributeCommandInput[];
  for (const parameters of parameterQueue) {
    const preparedParams: DescribeVpcAttributeCommandInput = parameters;
    try {
      const cmd = new DescribeVpcAttributeCommand(preparedParams);
      const result: DescribeVpcAttributeCommandOutput = await client.send(cmd);
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
  }
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EC2",
    "DescribeVpcAttribute",
    state,
  );
}

export async function DescribeRouteTables(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeRouteTables");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeRouteTablesCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeRouteTablesCommand(preparedParams);
      const result: DescribeRouteTablesCommandOutput = await client.send(cmd);
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
    "DescribeRouteTables",
    state,
  );
}

export async function DescribeInternetGateways(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeInternetGateways");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeInternetGatewaysCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeInternetGatewaysCommand(preparedParams);
      const result: DescribeInternetGatewaysCommandOutput = await client.send(
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
    "DescribeInternetGateways",
    state,
  );
}

export async function DescribeEgressOnlyInternetGateways(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeEgressOnlyInternetGateways");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeEgressOnlyInternetGatewaysCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeEgressOnlyInternetGatewaysCommand(preparedParams);
      const result: DescribeEgressOnlyInternetGatewaysCommandOutput =
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
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EC2",
    "DescribeEgressOnlyInternetGateways",
    state,
  );
}

export async function DescribeVpcEndpoints(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeVpcEndpoints");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeVpcEndpointsCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeVpcEndpointsCommand(preparedParams);
      const result: DescribeVpcEndpointsCommandOutput = await client.send(cmd);
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
    "DescribeVpcEndpoints",
    state,
  );
}

export async function DescribeNetworkAcls(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeNetworkAcls");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeNetworkAclsCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeNetworkAclsCommand(preparedParams);
      const result: DescribeNetworkAclsCommandOutput = await client.send(cmd);
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
    "DescribeNetworkAcls",
    state,
  );
}

export async function DescribeVpcPeeringConnections(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeVpcPeeringConnections");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeVpcPeeringConnectionsCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeVpcPeeringConnectionsCommand(preparedParams);
      const result: DescribeVpcPeeringConnectionsCommandOutput =
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
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EC2",
    "DescribeVpcPeeringConnections",
    state,
  );
}

export async function DescribeTransitGateways(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeTransitGateways");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeTransitGatewaysCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeTransitGatewaysCommand(preparedParams);
      const result: DescribeTransitGatewaysCommandOutput = await client.send(
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
    "DescribeTransitGateways",
    state,
  );
}

export async function DescribeTransitGatewayAttachments(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeTransitGatewayAttachments");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeTransitGatewayAttachmentsCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeTransitGatewayAttachmentsCommand(preparedParams);
      const result: DescribeTransitGatewayAttachmentsCommandOutput =
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
  getterDebug("Recording state");
  await stateConnector.onServiceScanCompleteCallback(
    context.account,
    context.region,
    "EC2",
    "DescribeTransitGatewayAttachments",
    state,
  );
}
export async function DescribeVpnGateways(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeVpnGateways");
  const state: GenericState[] = [];
  getterDebug("DescribeVpnGateways");
  const preparedParams: DescribeVpnGatewaysCommandInput = {};
  try {
    const cmd = new DescribeVpnGatewaysCommand(preparedParams);
    const result: DescribeVpnGatewaysCommandOutput = await client.send(cmd);
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
    "DescribeVpnGateways",
    state,
  );
}

export async function DescribeManagedPrefixLists(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeManagedPrefixLists");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeManagedPrefixListsCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeManagedPrefixListsCommand(preparedParams);
      const result: DescribeManagedPrefixListsCommandOutput = await client.send(
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
    "DescribeManagedPrefixLists",
    state,
  );
}

export async function GetManagedPrefixListEntries(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:GetManagedPrefixListEntries");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  const resolvers = [
    {
      Key: "PrefixListId",
      Selector:
        "EC2|DescribeManagedPrefixLists|[]._result.PrefixLists[?OwnerId != 'AWS'].PrefixListId[]",
    },
  ];
  const parameterQueue = (await resolveFunctionCallParameters(
    context.account,
    context.region,
    resolvers,
    stateConnector,
  )) as GetManagedPrefixListEntriesCommandInput[];
  for (const parameters of parameterQueue) {
    let pagingToken: string | undefined;
    do {
      const preparedParams: GetManagedPrefixListEntriesCommandInput =
        parameters;
      preparedParams["NextToken"] = pagingToken;
      try {
        const cmd = new GetManagedPrefixListEntriesCommand(preparedParams);
        const result: GetManagedPrefixListEntriesCommandOutput =
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
    "GetManagedPrefixListEntries",
    state,
  );
}

export async function DescribeDhcpOptions(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeDhcpOptions");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeDhcpOptionsCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeDhcpOptionsCommand(preparedParams);
      const result: DescribeDhcpOptionsCommandOutput = await client.send(cmd);
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
    "DescribeDhcpOptions",
    state,
  );
}

export async function DescribeFlowLogs(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeFlowLogs");
  const state: GenericState[] = [];
  getterDebug("Fetching state");
  let pagingToken: string | undefined;
  do {
    const preparedParams: DescribeFlowLogsCommandInput = {};
    preparedParams["NextToken"] = pagingToken;
    try {
      const cmd = new DescribeFlowLogsCommand(preparedParams);
      const result: DescribeFlowLogsCommandOutput = await client.send(cmd);
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
    "DescribeFlowLogs",
    state,
  );
}
export async function DescribeAddresses(
  client: EC2Client,
  stateConnector: Connector,
  context: AwsContext,
): Promise<void> {
  const getterDebug = debug("ec2:DescribeAddresses");
  const state: GenericState[] = [];
  getterDebug("DescribeAddresses");
  const preparedParams: DescribeAddressesCommandInput = {};
  try {
    const cmd = new DescribeAddressesCommand(preparedParams);
    const result: DescribeAddressesCommandOutput = await client.send(cmd);
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
    "DescribeAddresses",
    state,
  );
}
