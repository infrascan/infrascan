import {
  S3Client,
  PutObjectCommand,
  PutObjectCommandOutput,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import Cache from "./cache";

export interface ConstructorArgs {
  S3: S3Client;
  prefix: string;
  bucket: string;
  cacheLimit?: number;
}

const isNotNull = <T>(value: T | null | undefined | void): value is T =>
  value != null;

export default class S3Connector {
  S3: S3Client;

  prefix: string;

  bucket: string;

  cache: Cache<any>;

  constructor({ S3, prefix, bucket, cacheLimit }: ConstructorArgs) {
    this.S3 = S3;
    this.prefix = prefix;
    this.bucket = bucket;
    this.cache = new Cache(cacheLimit ?? 10);
  }

  recordServiceCall(
    filePath: string,
    state: any,
  ): Promise<PutObjectCommandOutput> {
    const putObjectCmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: filePath,
      Body: JSON.stringify(state),
    });
    this.cache.set(filePath, state);
    return this.S3.send(putObjectCmd);
  }

  async readStateForCall(filePath: string): Promise<any> {
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath) as any;
    }

    const getStateCommand = new GetObjectCommand({
      Bucket: this.bucket,
      Key: filePath,
    });
    const rawState = await this.S3.send(getStateCommand);
    const state = await rawState?.Body?.transformToString("utf8");
    return state ? JSON.parse(state) : undefined;
  }

  /**
   * Format for file paths is somewhat unintuitive — the account and region are put at the end of the path
   * This makes it easier for retrieving global state by service and function call where only list by prefix is supported (e.g. S3)
   * Example:
   * - /1234567890/us-east-1/Lambda/listFunctions.json cannot be globally listed by prefix, only by account and region
   * - /Lambda/listFunctions/1234567890/us-east-1.json can be listed by function which allows for cross account resolution
   */
  buildFilePathForServiceCall(
    account: string,
    region: string,
    service: string,
    functionName: string,
  ): string {
    return `${this.prefix}/${service}-${functionName}/${account}/${region}.json`;
  }

  onServiceScanCompleteCallback(
    account: string,
    region: string,
    service: string,
    functionName: string,
    functionState: any,
  ): Promise<PutObjectCommandOutput> {
    const filePath = this.buildFilePathForServiceCall(
      account,
      region,
      service,
      functionName,
    );
    return this.recordServiceCall(filePath, functionState);
  }

  resolveStateForServiceFunction(
    account: string,
    region: string,
    service: string,
    functionCall: string,
  ): Promise<any> {
    const filePath = this.buildFilePathForServiceCall(
      account,
      region,
      service,
      functionCall,
    );
    return this.readStateForCall(filePath);
  }

  async listObjectsForService(
    service: string,
    functionCall: string,
  ): Promise<Array<string>> {
    const servicePrefix = `${this.prefix}/${service}-${functionCall}`;
    const listObjectCommand = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: servicePrefix,
    });
    const response = await this.S3.send(listObjectCommand);
    return response?.Contents?.map(({ Key }) => Key).filter(isNotNull) ?? [];
  }

  async getGlobalStateForServiceFunction(
    service: string,
    functionCall: string,
  ): Promise<Array<any | undefined>> {
    const allKeys = await this.listObjectsForService(service, functionCall);
    let globalState: Array<any> = [];
    // sequentially fetch objects — avoiding throttle
    for (let idx = 0; idx < allKeys.length; idx += 1) {
      const serviceState = await this.readStateForCall(allKeys[idx]);
      if (serviceState != null) {
        globalState = globalState.concat(serviceState);
      } else {
        console.log("No state returned for", allKeys[idx]);
      }
    }
    return globalState;
  }

  getMetadataPath(): string {
    return `${this.prefix}/metadata.json`;
  }

  writeMetadata(metadata: any): Promise<PutObjectCommandOutput> {
    return this.recordServiceCall(this.getMetadataPath(), metadata);
  }

  readMetadata(): Promise<any> {
    return this.readStateForCall(this.getMetadataPath());
  }

  getGraphPath(): string {
    return `${this.prefix}/graph.json`;
  }

  writeGraphData(graphBlob: any): Promise<PutObjectCommandOutput> {
    return this.recordServiceCall(this.getGraphPath(), graphBlob);
  }
}
