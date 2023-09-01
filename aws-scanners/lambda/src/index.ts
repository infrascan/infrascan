import * as Lambda from "@aws-sdk/client-lambda";
import { ListFunctions, GetFunction } from "./generated/getters.ts";
import { generateNodes } from "./generated/nodes.ts";

import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";

function getClient(credentials: AwsCredentialIdentityProvider, region: string): Lambda.LambdaClient {
	return new Lambda.LambdaClient({ credentials, region });
}

export default {
	provider: "aws",
	service: "lambda",
	key: "Lambda",
	getClient,
	callPerRegion: true,
	getters: [ListFunctions, GetFunction],
	nodes: generateNodes,
}
