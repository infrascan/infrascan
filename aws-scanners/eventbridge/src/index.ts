import { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import type { ServiceModule } from "@infrascan/shared-types";
import { getClient } from "./generated/client";
import {
  ListEventBuses,
  DescribeEventBus,
  ListRules,
  ListApiDestinations,
  ListConnections,
  getIamRoles,
} from "./generated/getters";
import { ListTargetsByRule } from "./getters";
import { getEdges } from "./edges";
import { ApiDestinationEntity, EventBusEntity, EventRuleEntity } from "./graph";

const EventBridgeScanner: ServiceModule<EventBridgeClient, "aws"> = {
  provider: "aws",
  service: "eventbridge",
  key: "EventBridge",
  getClient,
  callPerRegion: true,
  getters: [
    ListEventBuses,
    DescribeEventBus,
    ListRules,
    ListTargetsByRule,
    ListApiDestinations,
    ListConnections,
  ],
  getEdges,
  getIamRoles,
  entities: [EventBusEntity, EventRuleEntity, ApiDestinationEntity],
};

export type {
  GraphState,
  EventBridge,
  EventBusDetails,
  RuleDetails,
  RuleTarget,
  ApiDestinationDetails,
} from "./graph";

export default EventBridgeScanner;
