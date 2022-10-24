import { Lambda, IAM } from 'aws-sdk';
import { scanIamRole } from './iam';

function parseLayerName(layerArn: string): string | undefined {
  return layerArn.split(':').pop();
}

export async function scanLambdas(lambdaClient: Lambda, iamClient: IAM): Promise<any> {
  const lambdaState: Array<any> = [];
  
  // Pull all lambdas in scope
  console.log('Start Lambda.listFunctions');
  const lambdas = await lambdaClient.listFunctions().promise();
  console.debug('Found',lambdas.Functions?.length,'Lambdas');
  console.log('End Lambda.listFunctions');
  if(lambdas.Functions) {
    for(let lambdaFunc of lambdas.Functions) {
      const functionState: any = {};
      functionState["function"] = lambdaFunc;
      // Scan the roles associated with each function
      if(lambdaFunc.Role) {
        console.log('Start IAM scan Role');
        const functionRole = await scanIamRole(iamClient, lambdaFunc.Role);
        console.log('End IAM scan role');
        functionState["role"] = functionRole;
      }

      functionState["layers"] = [];
      if(lambdaFunc.Layers) {
        // pull information about specific layers
        for(let layer of lambdaFunc.Layers) {
          if(layer.Arn) {
            const layerName = parseLayerName(layer.Arn);
            if(layerName){
              const versionsOfLayer = await lambdaClient.listLayerVersions({ LayerName: layerName }).promise();
              const sortedVersions = (versionsOfLayer.LayerVersions ?? []).sort((layerA, layerB) => (layerA.Version as number) - (layerB.Version as number));
              const latest = sortedVersions.pop()?.Version as number;
              if(latest) {
                const latestLayerVersion = await lambdaClient.getLayerVersion({ LayerName: layerName, VersionNumber: latest }).promise();
                functionState["layers"].push(latestLayerVersion);
              }
            }
          }
        }
      }

      lambdaState.push(functionState);
    }
  }
  
  return lambdaState;
}