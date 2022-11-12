import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { STS } from 'aws-sdk';
import { GetCallerIdentityResponse } from 'aws-sdk/clients/sts';

export interface Tag {
  Key: string,
  Value: string
}

const OUTPUT_DIR = "state";

if(!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR);
}

export function persistToFileFactory(accountId: string, serviceName: string) {
  const fileName = `${OUTPUT_DIR}/${accountId}-us-east-1-${serviceName}.json`;
  return function(state: any) {
    writeFileSync(fileName, JSON.stringify(state, undefined, 2), {  });
  }
}

export function readStateFromFile(accountId: string, serviceName: string): any {
  const fileName = `${OUTPUT_DIR}/${accountId}-us-east-1-${serviceName}.json`;
  const contents = readFileSync(fileName);
  return JSON.parse(contents.toString());
}

export async function whoami(): Promise<GetCallerIdentityResponse> {
  const stsClient = new STS();
  return await stsClient.getCallerIdentity().promise();
}