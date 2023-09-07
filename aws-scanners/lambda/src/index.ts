import { LambdaClient } from "@aws-sdk/client-lambda";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { ServiceModule } from "@infrascan/shared-types";
import { ListFunctions, GetFunction } from "./generated/getters";

function getClient(credentials: AwsCredentialIdentityProvider, region: string): LambdaClient {
	return new LambdaClient({ credentials, region });
}

const LambdaScanner: ServiceModule<LambdaClient> = {
	provider: "aws",
	service: "lambda",
	key: "Lambda",
	getClient,
	callPerRegion: true,
	getters: [ListFunctions, GetFunction],
	nodes: ["Lambda|ListFunctions|[]._result.Functions[].{id: FunctionArn,name:FunctionName}"],
}

export default LambdaScanner;
