import { Lambda, IAM } from 'aws-sdk';
import { scanIamRole } from './iam';
import { persistToFileFactory } from './utils';

export interface LambdaFunction {
  ResourceKey: 'Lambda',
  Arn: string,
  Name?: string,
  Runtime?: string,
  Role?: any,
  Layers?: any[]
}

function parseLayerName(layerArn: string): string | undefined {
  return layerArn.split(':').pop();
}

export async function scanLambdas(accountId: string, lambdaClient: Lambda, iamClient: IAM): Promise<LambdaFunction[]> {
  const saveToFile = persistToFileFactory(accountId, 'lambda');
  const lambdaState: LambdaFunction[] = [];
  
  // Pull all lambdas in scope
  console.log('Start Lambda.listFunctions');
  const lambdas = await lambdaClient.listFunctions().promise();
  console.debug('Found',lambdas.Functions?.length,'Lambdas');
  console.log('End Lambda.listFunctions');
  if(lambdas.Functions) {
    for(let lambdaFunc of lambdas.Functions) {
      if(lambdaFunc.FunctionArn) {
        const functionState: LambdaFunction = {
          ResourceKey: 'Lambda',
          Arn: lambdaFunc.FunctionArn,
          Name: lambdaFunc.FunctionName,
          Runtime: lambdaFunc.Runtime
        };

        
        let lambdaRole = lambdaFunc.Role;
        if(!lambdaRole) {
          const detailedLambda = await lambdaClient.getFunction({
            FunctionName: lambdaFunc.FunctionArn
          }).promise();
          lambdaRole = detailedLambda?.Configuration?.Role;
        }

        // Scan the roles associated with each function
        if(lambdaRole) {
          console.log('Start IAM scan Role');
          await scanIamRole(iamClient, lambdaFunc.Role);
          console.log('End IAM scan role');
          functionState["Role"] = lambdaFunc.Role;
        }

        functionState["Layers"] = [];
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
                  functionState["Layers"].push(latestLayerVersion);
                }
              }
            }
          }
        }

        lambdaState.push(functionState);
      }
    }
  }
  
  saveToFile(lambdaState);
  return lambdaState;
}