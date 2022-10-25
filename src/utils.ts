import { writeFileSync, mkdirSync, existsSync } from 'fs';

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