import {
  DescribeFlowLogsCommandInput,
  DescribeFlowLogsCommandOutput,
  FlowLog,
} from "@aws-sdk/client-ec2";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface FlowLogDetails {
  /**
   * The VPC (`vpc-…`), subnet (`subnet-…`), network interface (`eni-…`) or transit gateway resource being logged
   */
  resourceId?: string;
  /**
   * `ACCEPT`, `REJECT` or `ALL`
   */
  trafficType?: string;
  status?: string;
  deliverLogsStatus?: string;
  deliverLogsErrorMessage?: string;
  destinationType?: string;
  destination?: string;
  logGroupName?: string;
  deliverLogsPermissionArn?: string;
  logFormat?: string;
  maxAggregationInterval?: number;
}

export interface FlowLogState extends BaseState<DescribeFlowLogsCommandInput> {
  flowLog?: FlowLogDetails;
}

export const FlowLogEntity: TranslatedEntity<
  FlowLogState,
  State<DescribeFlowLogsCommandOutput, DescribeFlowLogsCommandInput>,
  WithCallContext<FlowLog, DescribeFlowLogsCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-flow-log",
  provider: "aws",
  command: "DescribeFlowLogs",
  category: "ec2",
  subcategory: "flow-log",
  nodeType: "ec2-flow-log",
  selector: "EC2|DescribeFlowLogs|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      FlowLogEntity.selector,
      state,
    );
  },

  translate(val) {
    return (
      val._result.FlowLogs?.map((flowLog) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...flowLog,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: FlowLogEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.FlowLogId!,
        label: val.FlowLogId!,
        nodeClass: "informational",
        nodeType: FlowLogEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    tenant(val) {
      return {
        provider: FlowLogEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.FlowLogId!,
        name: val.FlowLogId!,
        category: FlowLogEntity.category,
        subcategory: FlowLogEntity.subcategory,
      };
    },

    tags(val) {
      return val.Tags?.map((tag) => ({
        key: tag.Key,
        value: tag.Value,
      }));
    },

    $source(val) {
      return {
        command: FlowLogEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.CreationTime),
      };
    },

    flowLog(val) {
      return {
        resourceId: val.ResourceId,
        trafficType: val.TrafficType,
        status: val.FlowLogStatus,
        deliverLogsStatus: val.DeliverLogsStatus,
        deliverLogsErrorMessage: val.DeliverLogsErrorMessage,
        destinationType: val.LogDestinationType,
        destination: val.LogDestination,
        logGroupName: val.LogGroupName,
        deliverLogsPermissionArn: val.DeliverLogsPermissionArn,
        logFormat: val.LogFormat,
        maxAggregationInterval: val.MaxAggregationInterval,
      };
    },
  },
};
