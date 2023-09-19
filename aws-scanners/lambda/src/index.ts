import { LambdaClient } from "@aws-sdk/client-lambda";
import type { ServiceModule } from "@infrascan/shared-types";
import { ListFunctions, GetFunction } from "./generated/getters";
import { getClient } from "./generated/client";
import { getNodes } from "./generated/graph";

const LambdaScanner: ServiceModule<LambdaClient, "aws"> = {
	provider: "aws",
	service: "lambda",
	key: "Lambda",
	getClient,
	callPerRegion: true,
	getters: [ListFunctions, GetFunction],
	getNodes,
}

export default LambdaScanner;
