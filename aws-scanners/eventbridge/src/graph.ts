import type {
  ApiDestination,
  Connection,
  DescribeEventBusCommandInput,
  DescribeEventBusCommandOutput,
  ListApiDestinationsCommandInput,
  ListApiDestinationsCommandOutput,
  ListRulesCommandInput,
  ListRulesCommandOutput,
  ListTargetsByRuleCommandInput,
  ListTargetsByRuleCommandOutput,
  Rule,
  Target,
} from "@aws-sdk/client-eventbridge";
import { evaluateSelector, tryNormalizeDateEpoch } from "@infrascan/core";
import type {
  BaseState,
  Serialized,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface RuleTarget {
  id?: string;
  arn?: string;
  roleArn?: string;
  deadLetterTargetArn?: string;
  retryPolicy?: {
    maximumRetryAttempts?: number;
    maximumEventAgeInSeconds?: number;
  };
}

export interface EventBusDetails {
  description?: string;
  lastModifiedAt?: number | null;
}

export interface RuleDetails {
  eventBusName?: string;
  state?: string;
  description?: string;
  eventPattern?: string;
  // `source` values from the event pattern, e.g. `aws.s3`. Prefix and other
  // content-filter matchers are left out.
  eventPatternSources?: string[];
  scheduleExpression?: string;
  managedBy?: string;
  targets: RuleTarget[];
}

export interface ApiDestinationDetails {
  state?: string;
  invocationEndpoint?: string;
  httpMethod?: string;
  invocationRateLimitPerSecond?: number;
  lastModifiedAt?: number | null;
  connection?: {
    arn?: string;
    name?: string;
    state?: string;
    authorizationType?: string;
  };
}

export interface EventBridge {
  eventBus?: EventBusDetails;
  rule?: RuleDetails;
  apiDestination?: ApiDestinationDetails;
}

export type EventBridgeEntity = BaseState<unknown> & {
  eventbridge: EventBridge;
};
export type GraphState = EventBridgeEntity;

export const EventBusEntity: TranslatedEntity<
  EventBridgeEntity,
  State<DescribeEventBusCommandOutput, DescribeEventBusCommandInput>,
  WithCallContext<DescribeEventBusCommandOutput, DescribeEventBusCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "eventbridge-event-bus",
  provider: "aws",
  command: "DescribeEventBus",
  category: "eventbridge",
  subcategory: "event-bus",
  nodeType: "eventbridge-event-bus",
  selector: "EventBridge|DescribeEventBus|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      EventBusEntity.selector,
      state,
    );
  },

  translate(val) {
    if (val._result.Arn == null) {
      return [];
    }
    return [
      {
        ...val._result,
        $metadata: val._metadata,
        $parameters: val._parameters,
      },
    ];
  },

  components: {
    $metadata(val) {
      return {
        version: EventBusEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.Arn!,
        label: val.Name!,
        nodeClass: "visual",
        nodeType: EventBusEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return {
        command: EventBusEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: EventBusEntity.provider,
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
        id: val.Arn!,
        name: val.Name!,
        description: val.Description,
        category: EventBusEntity.category,
        subcategory: EventBusEntity.subcategory,
        policy: val.Policy,
      };
    },

    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.CreationTime),
      };
    },

    encryption(val) {
      return {
        keyId: val.KmsKeyIdentifier,
      };
    },

    deadLetter(val) {
      return {
        targetId: val.DeadLetterConfig?.Arn,
      };
    },

    eventbridge(val) {
      return {
        eventBus: {
          description: val.Description,
          lastModifiedAt: tryNormalizeDateEpoch(val.LastModifiedTime),
        },
      };
    },
  },
};

type RuleState = State<ListRulesCommandOutput, ListRulesCommandInput> & {
  // Targets for each rule in this page, keyed by rule name
  _targets: Record<string, Target[]>;
};

type RuleWithTargets = WithCallContext<
  Rule & { Targets: Target[] },
  ListRulesCommandInput
>;

function getEventPatternSources(eventPattern?: string): string[] | undefined {
  if (eventPattern == null) {
    return undefined;
  }
  try {
    const { source } = JSON.parse(eventPattern);
    if (typeof source === "string") {
      return [source];
    }
    if (Array.isArray(source)) {
      return source.filter(
        (matcher): matcher is string => typeof matcher === "string",
      );
    }
  } catch {
    // An unparseable pattern shouldn't fail the whole entity
  }
  return undefined;
}

export const EventRuleEntity: TranslatedEntity<
  EventBridgeEntity,
  RuleState,
  RuleWithTargets
> = {
  version: "0.1.0",
  debugLabel: "eventbridge-rule",
  provider: "aws",
  command: "ListRules",
  category: "eventbridge",
  subcategory: "rule",
  nodeType: "eventbridge-rule",
  selector: "EventBridge|ListRules|[]",

  async getState(state, context) {
    const rulesState = await evaluateSelector<
      Serialized<State<ListRulesCommandOutput, ListRulesCommandInput>>
    >(context.account, context.region, EventRuleEntity.selector, state);
    const targetsState = await evaluateSelector<
      Serialized<
        State<ListTargetsByRuleCommandOutput, ListTargetsByRuleCommandInput>
      >
    >(
      context.account,
      context.region,
      "EventBridge|ListTargetsByRule|[]",
      state,
    );

    // Targets are paginated per rule, so a single rule can have several pages
    const targetsByRule = new Map<string, Target[]>();
    for (const targetPage of targetsState) {
      const key = `${targetPage._parameters?.EventBusName}|${targetPage._parameters?.Rule}`;
      const existing = targetsByRule.get(key) ?? [];
      existing.push(...(targetPage._result.Targets ?? []));
      targetsByRule.set(key, existing);
    }

    return rulesState.map((rulePage) => {
      const targets: Record<string, Target[]> = {};
      for (const rule of rulePage._result.Rules ?? []) {
        const busName =
          rule.EventBusName ?? rulePage._parameters?.EventBusName;
        targets[rule.Name!] = targetsByRule.get(`${busName}|${rule.Name}`) ?? [];
      }
      return { ...rulePage, _targets: targets };
    });
  },

  translate(val) {
    return (val._result.Rules ?? [])
      .filter((rule) => rule.Arn != null)
      .map((rule) => ({
        ...rule,
        EventBusName: rule.EventBusName ?? val._parameters?.EventBusName,
        Targets: val._targets[rule.Name!] ?? [],
        $metadata: val._metadata,
        $parameters: val._parameters,
      }));
  },

  components: {
    $metadata(val) {
      return {
        version: EventRuleEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.Arn!,
        label: val.Name!,
        nodeClass: "visual",
        nodeType: EventRuleEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return {
        command: EventRuleEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: EventRuleEntity.provider,
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
        id: val.Arn!,
        name: val.Name!,
        description: val.Description,
        category: EventRuleEntity.category,
        subcategory: EventRuleEntity.subcategory,
      };
    },

    iam(val) {
      return {
        roles: val.RoleArn != null ? [{ label: "rule", arn: val.RoleArn }] : [],
      };
    },

    eventbridge(val) {
      return {
        rule: {
          eventBusName: val.EventBusName,
          state: val.State,
          description: val.Description,
          eventPattern: val.EventPattern,
          eventPatternSources: getEventPatternSources(val.EventPattern),
          scheduleExpression: val.ScheduleExpression,
          managedBy: val.ManagedBy,
          // Input, InputTransformer and HttpParameters are left out on purpose:
          // they're user payloads and can carry secrets.
          targets: val.Targets.map((target) => ({
            id: target.Id,
            arn: target.Arn,
            roleArn: target.RoleArn,
            deadLetterTargetArn: target.DeadLetterConfig?.Arn,
            retryPolicy:
              target.RetryPolicy != null
                ? {
                    maximumRetryAttempts:
                      target.RetryPolicy.MaximumRetryAttempts,
                    maximumEventAgeInSeconds:
                      target.RetryPolicy.MaximumEventAgeInSeconds,
                  }
                : undefined,
          })),
        },
      };
    },
  },
};

type ApiDestinationState = State<
  ListApiDestinationsCommandOutput,
  ListApiDestinationsCommandInput
> & {
  _connections: Connection[];
};

type ApiDestinationWithConnection = WithCallContext<
  ApiDestination & { Connection?: Connection },
  ListApiDestinationsCommandInput
>;

export const ApiDestinationEntity: TranslatedEntity<
  EventBridgeEntity,
  ApiDestinationState,
  ApiDestinationWithConnection
> = {
  version: "0.1.0",
  debugLabel: "eventbridge-api-destination",
  provider: "aws",
  command: "ListApiDestinations",
  category: "eventbridge",
  subcategory: "api-destination",
  nodeType: "eventbridge-api-destination",
  selector: "EventBridge|ListApiDestinations|[]",

  async getState(state, context) {
    const destinationsState = await evaluateSelector<
      Serialized<
        State<ListApiDestinationsCommandOutput, ListApiDestinationsCommandInput>
      >
    >(context.account, context.region, ApiDestinationEntity.selector, state);
    const connections = await evaluateSelector<
      Serialized<Connection>
    >(
      context.account,
      context.region,
      "EventBridge|ListConnections|[]._result.Connections[]",
      state,
    );
    return destinationsState.map((destinationPage) => ({
      ...destinationPage,
      _connections: connections,
    }));
  },

  translate(val) {
    return (val._result.ApiDestinations ?? [])
      .filter((destination) => destination.ApiDestinationArn != null)
      .map((destination) => ({
        ...destination,
        Connection: val._connections.find(
          (connection) =>
            connection.ConnectionArn === destination.ConnectionArn,
        ),
        $metadata: val._metadata,
        $parameters: val._parameters,
      }));
  },

  components: {
    $metadata(val) {
      return {
        version: ApiDestinationEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.ApiDestinationArn!,
        label: val.Name!,
        nodeClass: "visual",
        nodeType: ApiDestinationEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    $source(val) {
      return {
        command: ApiDestinationEntity.command,
        parameters: val.$parameters,
      };
    },

    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: ApiDestinationEntity.provider,
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
        id: val.ApiDestinationArn!,
        name: val.Name!,
        category: ApiDestinationEntity.category,
        subcategory: ApiDestinationEntity.subcategory,
      };
    },

    audit(val) {
      return {
        createdAt: tryNormalizeDateEpoch(val.CreationTime),
      };
    },

    eventbridge(val) {
      return {
        apiDestination: {
          state: val.ApiDestinationState,
          invocationEndpoint: val.InvocationEndpoint,
          httpMethod: val.HttpMethod,
          invocationRateLimitPerSecond: val.InvocationRateLimitPerSecond,
          lastModifiedAt: tryNormalizeDateEpoch(val.LastModifiedTime),
          connection:
            val.ConnectionArn != null
              ? {
                  arn: val.ConnectionArn,
                  name: val.Connection?.Name,
                  state: val.Connection?.ConnectionState,
                  authorizationType: val.Connection?.AuthorizationType,
                }
              : undefined,
        },
      };
    },
  },
};
