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

  /**
   * Constructor for the Infrascan S3 Connector. The connector is used to sync state with S3 during scans and subsequent graphing.
   * To reduce overhead of S3 calls when fetching state for a graph, the connector comes with a bounded FIFO cache.
   * @param {ConstructorArgs} S3ConstructorArgs Object containing the S3 Client, bucket prefix, bucket name, and cache size limit.
   */
  constructor({ S3, prefix, bucket, cacheLimit }: ConstructorArgs) {
    this.S3 = S3;
    this.prefix = prefix;
    this.bucket = bucket;
    this.cache = new Cache(cacheLimit ?? 10);
  }

  /**
   * Performs an S3 putObject call with the provided state.
   * @param filePath Destination for the s3 put operation
   * @param state State to store
   * @returns {Promise<PutObjectCommandOutput>} Result of S3 put object call
   */
  async recordServiceCall(
    filePath: string,
    state: any,
  ): Promise<PutObjectCommandOutput> {
    const putObjectCmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: filePath,
      Body: JSON.stringify(state),
    });
    const putObjectResponse = await this.S3.send(putObjectCmd);
    this.cache.set(filePath, state);
    return putObjectResponse;
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
   * Create the S3 Object path for a given service call. Uses the format: `prefix/service-functionName/account/region.json`.
   * This format makes it easier for retrieving global state by service and function call where only list by prefix is supported.
   *
   * For example:
   * - /1234567890/us-east-1/Lambda/listFunctions.json cannot be globally listed by prefix, only by account and region
   * - /Lambda-listFunctions/1234567890/us-east-1.json can be listed by function which allows for cross account resolution
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
