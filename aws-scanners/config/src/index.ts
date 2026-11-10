import type { ConfigServiceClient } from "@aws-sdk/client-config-service";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./client";
import {
  DescribeAggregationAuthorizations,
  DescribeConfigRules,
  DescribeConfigurationAggregators,
  DescribeConfigurationRecorders,
  DescribeConfigurationRecorderStatus,
  DescribeConformancePacks,
  DescribeDeliveryChannels,
  DescribeOrganizationConfigRules,
  DescribeOrganizationConformancePacks,
  ListConfigurationRecorders,
} from "./getters";
import { getEdges } from "./edges";
import { AggregatorEntity, StatusEntity } from "./graph";

const ConfigScanner: ServiceModule<ConfigServiceClient, "aws"> = {
  provider: "aws",
  service: "config",
  key: "ConfigService",
  getClient,
  callPerRegion: true,
  // Order matters: the recorder calls read the service-linked recorders listed by ListConfigurationRecorders.
  getters: [
    ListConfigurationRecorders,
    DescribeConfigurationRecorders,
    DescribeConfigurationRecorderStatus,
    DescribeDeliveryChannels,
    DescribeConfigurationAggregators,
    DescribeAggregationAuthorizations,
    DescribeOrganizationConfigRules,
    DescribeOrganizationConformancePacks,
    DescribeConformancePacks,
    DescribeConfigRules,
  ],
  getEdges,
  entities: [StatusEntity, AggregatorEntity],
};

export type {
  GraphState,
  ServiceStatus,
  StatusState,
  ConfigStatusDetails,
  RecorderDetails,
  DeliveryChannelDetails,
  AggregationAuthorizationDetails,
  OrganizationConfigRuleDetails,
  OrganizationConformancePackDetails,
  ConformancePackDetails,
  ConfigRuleDetails,
  AggregatorState,
  AggregatorDetails,
} from "./graph";
export type { CallError, CallState } from "./state";
export default ConfigScanner;
