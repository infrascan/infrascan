import {
  DescribeDhcpOptionsCommandInput,
  DescribeDhcpOptionsCommandOutput,
  DhcpOptions,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  BaseState,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface DhcpOptionsDetails {
  ownerId?: string;
  /**
   * e.g. `domain-name`, `domain-name-servers`, `ntp-servers`, `netbios-name-servers`, `netbios-node-type`
   */
  configurations: { key?: string; values: string[] }[];
}

export interface DhcpOptionsState
  extends BaseState<DescribeDhcpOptionsCommandInput> {
  dhcpOptions?: DhcpOptionsDetails;
}

export const DhcpOptionsEntity: TranslatedEntity<
  DhcpOptionsState,
  State<DescribeDhcpOptionsCommandOutput, DescribeDhcpOptionsCommandInput>,
  WithCallContext<DhcpOptions, DescribeDhcpOptionsCommandInput>
> = {
  version: "0.1.0",
  debugLabel: "ec2-dhcp-options",
  provider: "aws",
  command: "DescribeDhcpOptions",
  category: "ec2",
  subcategory: "dhcp-options",
  nodeType: "ec2-dhcp-options",
  selector: "EC2|DescribeDhcpOptions|[]",

  getState(state, context) {
    return evaluateSelector(
      context.account,
      context.region,
      DhcpOptionsEntity.selector,
      state,
    );
  },

  translate(val) {
    return (
      val._result.DhcpOptions?.map((dhcpOptions) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...dhcpOptions,
      })) ?? []
    );
  },

  components: {
    $metadata(val) {
      return {
        version: DhcpOptionsEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },

    $graph(val) {
      return {
        id: val.DhcpOptionsId!,
        label: val.DhcpOptionsId!,
        nodeClass: "informational",
        nodeType: DhcpOptionsEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },

    tenant(val) {
      return {
        provider: DhcpOptionsEntity.provider,
        partition: val.$metadata.partition,
        tenantId: val.$metadata.account,
      };
    },

    resource(val) {
      return {
        id: val.DhcpOptionsId!,
        name: val.DhcpOptionsId!,
        category: DhcpOptionsEntity.category,
        subcategory: DhcpOptionsEntity.subcategory,
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
        command: DhcpOptionsEntity.command,
        parameters: val.$parameters,
      };
    },

    location(val) {
      return {
        code: val.$metadata.region,
      };
    },

    dhcpOptions(val) {
      return {
        ownerId: val.OwnerId,
        configurations:
          val.DhcpConfigurations?.map((config) => ({
            key: config.Key,
            values:
              config.Values?.map((value) => value.Value).filter(
                (value): value is string => value != null,
              ) ?? [],
          })) ?? [],
      };
    },
  },
};
