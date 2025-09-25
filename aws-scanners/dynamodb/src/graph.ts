import type {
  DescribeTableCommandInput,
  DescribeTableCommandOutput,
  GlobalSecondaryIndexDescription,
  IndexStatus,
  KeyType,
  LocalSecondaryIndexDescription,
  ProjectionType,
  ReplicaDescription,
  ReplicaStatus,
  ScalarAttributeType,
  TableDescription,
} from "@aws-sdk/client-dynamodb";
import { evaluateSelector, toLowerCase, Size } from "@infrascan/core";
import {
  type TranslatedEntity,
  type BaseState,
  type State,
  type WithCallContext,
  type QualifiedMeasure,
  type SizeUnit,
} from "@infrascan/shared-types";

export interface KeySchema {
  attributeName?: string;
  keyType?: Lowercase<KeyType>;
}

export interface Throughput {
  maxReadRequestUnits?: number;
  maxWriteRequestUnits?: number;
}

export interface Projection {
  nonKeyAttributes?: string[];
  type?: Lowercase<ProjectionType>;
}

export interface ProvisionedThroughput {
  lastDecreaseDateTime?: Date;
  lastIncreaseDateTime?: Date;
  numberOfDecreasesToday?: number;
  readCapacityUnits?: number;
  writeCapacityUnits?: number;
}

export interface WarmThroughput {
  readUnitsPerSecond?: number;
  writeUnitsPerSecond?: number;
  status?: Lowercase<Exclude<IndexStatus, "CREATING" | "DELETING">>;
}

export interface Index {
  arn: string;
  name: string;
  size?: QualifiedMeasure<SizeUnit>;
  itemCount?: number;
  keySchema?: KeySchema[];
  projection?: Projection;
}

export interface DynamoGSI extends Index {
  status?: Lowercase<IndexStatus>;
  onDemandThroughput?: Throughput;
  provisionedThroughput?: ProvisionedThroughput;
  warmThroughput?: WarmThroughput;
}

export interface DynamoIndexes {
  globalSecondary?: DynamoGSI[];
  localSecondary?: Index[];
}

export interface Attribute {
  name?: string;
  type?: ScalarAttributeType;
}

export interface Archive {
  arn?: string;
  dateTime?: Date;
  reason?: string;
}

export interface ReplicaDetails {
  isReplica: true;
  source: string;
  status?: Lowercase<ReplicaStatus>;
}
export interface PrimaryDetails {
  isReplica: boolean;
}
export type TableTypeDetails = ReplicaDetails | PrimaryDetails;

export interface DynamoState {
  tableType: TableTypeDetails;
  indexes: DynamoIndexes;
  archive: Archive;
  attributes?: Attribute[];
  size?: QualifiedMeasure<SizeUnit>;
}

export type DynamoTable = BaseState<DescribeTableCommandInput> & {
  dynamo: DynamoState;
};
export type GraphState = DynamoTable;

function mapBaseIndex(
  receivedIndex:
    | LocalSecondaryIndexDescription
    | GlobalSecondaryIndexDescription,
): Index {
  return {
    arn: receivedIndex.IndexArn!,
    name: receivedIndex.IndexName!,
    size:
      receivedIndex.IndexSizeBytes != null
        ? {
            unit: Size.Bytes,
            value: receivedIndex.IndexSizeBytes,
          }
        : undefined,
    itemCount: receivedIndex.ItemCount,
    keySchema: receivedIndex.KeySchema?.map((schema) => ({
      attributeName: schema.AttributeName,
      keyType: schema.KeyType != null ? toLowerCase(schema.KeyType) : undefined,
    })),
    projection: {
      nonKeyAttributes: receivedIndex.Projection?.NonKeyAttributes,
      type:
        receivedIndex.Projection?.ProjectionType != null
          ? toLowerCase(receivedIndex.Projection?.ProjectionType)
          : undefined,
    },
  };
}

function mapGlobalSecondaryIndex(
  receivedIndex: GlobalSecondaryIndexDescription,
): DynamoGSI {
  return {
    ...mapBaseIndex(receivedIndex),
    status:
      receivedIndex.IndexStatus != null
        ? toLowerCase(receivedIndex.IndexStatus)
        : undefined,
    onDemandThroughput: {
      maxReadRequestUnits:
        receivedIndex.OnDemandThroughput?.MaxReadRequestUnits,
      maxWriteRequestUnits:
        receivedIndex.OnDemandThroughput?.MaxWriteRequestUnits,
    },
    provisionedThroughput: {
      lastDecreaseDateTime:
        receivedIndex.ProvisionedThroughput?.LastDecreaseDateTime,
      lastIncreaseDateTime:
        receivedIndex.ProvisionedThroughput?.LastIncreaseDateTime,
      numberOfDecreasesToday:
        receivedIndex.ProvisionedThroughput?.NumberOfDecreasesToday,
      readCapacityUnits: receivedIndex.ProvisionedThroughput?.ReadCapacityUnits,
      writeCapacityUnits:
        receivedIndex.ProvisionedThroughput?.WriteCapacityUnits,
    },
  };
}

/**
 * Alias the keys of a replica to allow it to be handled as though its a primary table.
 */
function mapReplicaDescription(replica: ReplicaDescription): TableDescription {
  return {
    GlobalSecondaryIndexes: replica.GlobalSecondaryIndexes,
    SSEDescription: {
      KMSMasterKeyArn: replica.KMSMasterKeyId,
    },
    OnDemandThroughput: replica.OnDemandThroughputOverride,
    ProvisionedThroughput: replica.ProvisionedThroughputOverride,
    TableClassSummary: replica.ReplicaTableClassSummary,
  };
}

export const DynamoDbTableEntity: TranslatedEntity<
  DynamoTable,
  State<DescribeTableCommandOutput, DescribeTableCommandInput>,
  WithCallContext<
    TableDescription & { tableType: TableTypeDetails },
    DescribeTableCommandInput
  >
> = {
  version: "0.1.1",
  debugLabel: "dynamodb",
  provider: "aws",
  command: "DescribeTable",
  category: "dynamodb",
  subcategory: "table",
  nodeType: "dynamodb-table",
  selector: "DynamoDB|DescribeTable|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      DynamoDbTableEntity.selector,
      state,
    );
  },

  translate(val) {
    const tables = [];
    const table = val._result;
    if (table.Table != null) {
      tables.push(
        Object.assign(table.Table, {
          tableType: { isReplica: false },
          $metadata: val._metadata,
          $parameters: val._parameters,
        }),
      );
    }
    // If the table has associated replicas - map their keys so they can be treated as actual tables, with a reference back to the primary
    if (table.Table?.Replicas != null) {
      table.Table.Replicas.forEach((replica) => {
        const replicaAsTable = mapReplicaDescription(replica);
        tables.push(
          Object.assign(replicaAsTable, {
            tableType: {
              isReplica: true,
              source: table.Table!.TableArn!,
              status:
                replica.ReplicaStatus != null
                  ? toLowerCase(replica.ReplicaStatus)
                  : undefined,
            },
            $metadata: {
              ...val._metadata,
              region: replica.RegionName ?? val._metadata.region,
            },
            $parameters: val._parameters,
          }),
        );
      });
    }
    return tables;
  },

  components: {
    $metadata(val) {
      return {
        version: DynamoDbTableEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.TableArn!,
        label: val.TableName!,
        nodeClass: "visual",
        nodeType: DynamoDbTableEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return {
        command: DynamoDbTableEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: DynamoDbTableEntity.provider,
        partition: val.$metadata.partition,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    resource(val) {
      return {
        id: val.TableArn!,
        name: val.TableName!,
        category: DynamoDbTableEntity.category,
        subcategory: DynamoDbTableEntity.subcategory,
      };
    },

    audit(val) {
      return {
        createdAt:
          val.CreationDateTime != null ? val.CreationDateTime : undefined,
      };
    },

    encryption(val) {
      return {
        keyId: val.SSEDescription?.KMSMasterKeyArn,
      };
    },

    dynamo(val) {
      const indexes: DynamoIndexes = {};
      if (val.GlobalSecondaryIndexes != null) {
        indexes.globalSecondary = val.GlobalSecondaryIndexes.map(
          mapGlobalSecondaryIndex,
        );
      }
      if (val.LocalSecondaryIndexes != null) {
        indexes.localSecondary = val.LocalSecondaryIndexes.map(mapBaseIndex);
      }
      return {
        tableType: val.tableType,
        indexes,
        archive: {
          arn: val.ArchivalSummary?.ArchivalBackupArn,
          dateTime: val.ArchivalSummary?.ArchivalDateTime,
          reason: val.ArchivalSummary?.ArchivalReason,
        },
        attributes: val.AttributeDefinitions?.map((attribute) => ({
          name: attribute.AttributeName,
          type: attribute.AttributeType,
        })),
        size:
          val.TableSizeBytes != null
            ? {
                unit: Size.Bytes,
                value: val.TableSizeBytes,
              }
            : undefined,
      };
    },
  },
};
