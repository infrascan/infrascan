import {
  DescribeLaunchTemplateVersionsCommandInput,
  DescribeLaunchTemplateVersionsCommandOutput,
  LaunchTemplateVersion,
  ShutdownBehavior,
  _InstanceType,
} from "@aws-sdk/client-ec2";
import { evaluateSelector } from "@infrascan/core";
import type {
  AwsContext,
  BaseState,
  Connector,
  ReservedAddresses,
  State,
  TranslatedEntity,
  WithCallContext,
} from "@infrascan/shared-types";

export interface LaunchTemplateConfig {
  templateId?: string;
  templateName?: string;
  versionNumber?: number;
  versionDescription?: string;
  isDefaultVersion?: boolean;
}

export interface LaunchTemplateCompute {
  instanceType?: _InstanceType;
  imageId?: string;
  keyName?: string;
  kernelId?: string;
  ramDiskId?: string;
  ebsOptimized?: boolean;
  hibernationEnabled?: boolean;
  stopProtectionEnabled?: boolean;
  terminationProtectionEnabled?: boolean;
  shutdownBehavior?: ShutdownBehavior;
  userData?: string;
}

export interface LaunchTemplateNetworkInterface {
  deviceIndex?: number;
  description?: string;
  deleteOnTermination?: boolean;
  associatePublicIpAddress?: boolean;
  associateCarrierIpAddress?: boolean;
  groups?: string[];
  ipv6AddressCount?: number;
  ipv6Addresses?: string[];
  networkInterfaceId?: string;
  privateIpAddress?: string;
  privateIpAddresses?: string[];
  secondaryPrivateIpAddressCount?: number;
  subnetId?: string;
  networkCardIndex?: number;
  interfaceType?: string;
}

export interface LaunchTemplateCapacity {
  cpuCoreCount?: number;
  cpuThreadsPerCore?: number;
  creditSpecification?: string;
  monitoring?: boolean;
  placement?: {
    availabilityZone?: string;
    affinity?: string;
    groupName?: string;
    partitionNumber?: number;
    spreadDomain?: string;
    tenancy?: string;
    groupId?: string;
    hostResourceGroupArn?: string;
  };
}

export interface LaunchTemplateStorage {
  blockDeviceMappings?: {
    deviceName?: string;
    virtualName?: string;
    noDevice?: string;
    ebs?: {
      deleteOnTermination?: boolean;
      encrypted?: boolean;
      iops?: number;
      kmsKeyId?: string;
      snapshotId?: string;
      throughput?: number;
      volumeSize?: number;
      volumeType?: string;
    };
  }[];
}

export interface LaunchTemplateState
  extends BaseState<DescribeLaunchTemplateVersionsCommandInput> {
  compute: LaunchTemplateCompute;
  capacity: LaunchTemplateCapacity;
  storage: LaunchTemplateStorage;
}

export const LaunchTemplateEntity: TranslatedEntity<
  LaunchTemplateState,
  State<
    DescribeLaunchTemplateVersionsCommandOutput,
    DescribeLaunchTemplateVersionsCommandInput
  >,
  WithCallContext<
    LaunchTemplateVersion,
    DescribeLaunchTemplateVersionsCommandInput
  >
> = {
  version: "0.1.0",
  debugLabel: "ec2-launch-template",
  provider: "aws",
  command: "DescribeLaunchTemplateVersions",
  category: "ec2",
  subcategory: "launch-template",
  nodeType: "ec2-launch-template",
  selector: "EC2|DescribeLaunchTemplateVersions|[]",

  translate(val) {
    return (
      val._result.LaunchTemplateVersions?.map((version) => ({
        $metadata: val._metadata,
        $parameters: val._parameters,
        ...version,
      })) ?? []
    );
  },

  getState(state: Connector, context: AwsContext) {
    return evaluateSelector(
      context.account,
      context.region,
      LaunchTemplateEntity.selector,
      state,
    );
  },
  components: {
    $metadata(val) {
      return {
        version: LaunchTemplateEntity.version,
        timestamp: val.$metadata.timestamp,
      };
    },
    $graph(val) {
      return {
        id: val.LaunchTemplateId!,
        label: val.LaunchTemplateName || val.LaunchTemplateId!,
        nodeClass: "informational",
        nodeType: LaunchTemplateEntity.nodeType,
        parent: `${val.$metadata.account}-${val.$metadata.region}`,
      };
    },
    tenant(val) {
      return {
        tenantId: val.$metadata.account,
        provider: LaunchTemplateEntity.provider,
        partition: val.$metadata.partition,
      };
    },
    resource(val) {
      return {
        id: val.LaunchTemplateId!,
        name: val.LaunchTemplateName || val.LaunchTemplateId!,
        category: LaunchTemplateEntity.category,
        subcategory: LaunchTemplateEntity.subcategory,
        description: val.VersionDescription,
      };
    },
    $source(val) {
      return {
        command: LaunchTemplateEntity.command,
        parameters: val.$parameters,
      };
    },
    location(val) {
      return {
        code: val.$metadata.region,
        zone: val.LaunchTemplateData?.Placement?.AvailabilityZone
          ? [val.LaunchTemplateData.Placement.AvailabilityZone]
          : undefined,
      };
    },
    audit(val) {
      return {
        createdBy: val.CreatedBy,
        createdAt: val.CreateTime?.toISOString(),
        versionNumber: val.VersionNumber?.toString(10),
      };
    },
    tags(val) {
      return (
        val.LaunchTemplateData?.TagSpecifications?.flatMap(
          ({ Tags, ResourceType }) =>
            Tags?.map(({ Key, Value }) => ({
              key: ResourceType != null ? `${ResourceType}:${Key}` : Key,
              val: Value,
            })) ?? [],
        ) ?? []
      );
    },

    compute(val) {
      const data = val.LaunchTemplateData;

      return {
        instanceType: data?.InstanceType,
        imageId: data?.ImageId,
        keyName: data?.KeyName,
        kernelId: data?.KernelId,
        ramDiskId: data?.RamDiskId,
        ebsOptimized: data?.EbsOptimized,
        hibernationEnabled: data?.HibernationOptions?.Configured,
        stopProtectionEnabled: data?.DisableApiStop,
        terminationProtectionEnabled: data?.DisableApiTermination,
        shutdownBehavior: data?.InstanceInitiatedShutdownBehavior,
        userData: data?.UserData,
      };
    },

    network(val) {
      const data = val.LaunchTemplateData;
      if (!data) return undefined;

      const interfaces: LaunchTemplateNetworkInterface[] = [];
      const reservedAddresses: ReservedAddresses[] = [];

      if (data.NetworkInterfaces) {
        data.NetworkInterfaces.forEach((ni) => {
          interfaces.push({
            deviceIndex: ni.DeviceIndex,
            description: ni.Description,
            deleteOnTermination: ni.DeleteOnTermination,
            associatePublicIpAddress: ni.AssociatePublicIpAddress,
            associateCarrierIpAddress: ni.AssociateCarrierIpAddress,
            groups: ni.Groups,
            ipv6AddressCount: ni.Ipv6AddressCount,
            ipv6Addresses: ni.Ipv6Addresses?.map(
              (addr) => addr.Ipv6Address,
            ).filter(Boolean) as string[],
            networkInterfaceId: ni.NetworkInterfaceId,
            privateIpAddress: ni.PrivateIpAddress,
            privateIpAddresses: ni.PrivateIpAddresses?.map(
              (addr) => addr.PrivateIpAddress,
            ).filter(Boolean) as string[],
            secondaryPrivateIpAddressCount: ni.SecondaryPrivateIpAddressCount,
            subnetId: ni.SubnetId,
            networkCardIndex: ni.NetworkCardIndex,
            interfaceType: ni.InterfaceType,
          });
        });
      }

      return {
        interfaces: interfaces.length > 0 ? interfaces : undefined,
        securityGroups: data.SecurityGroupIds,
        reservedAddresses:
          reservedAddresses.length > 0 ? reservedAddresses : undefined,
      };
    },

    capacity(val) {
      const data = val.LaunchTemplateData;

      return {
        cpuCoreCount: data?.CpuOptions?.CoreCount,
        cpuThreadsPerCore: data?.CpuOptions?.ThreadsPerCore,
        creditSpecification: data?.CreditSpecification?.CpuCredits,
        monitoring: data?.Monitoring?.Enabled,
        placement: data?.Placement
          ? {
              availabilityZone: data.Placement.AvailabilityZone,
              affinity: data.Placement.Affinity,
              groupName: data.Placement.GroupName,
              partitionNumber: data.Placement.PartitionNumber,
              spreadDomain: data.Placement.SpreadDomain,
              tenancy: data.Placement.Tenancy,
              groupId: data.Placement.GroupId,
              hostResourceGroupArn: data.Placement.HostResourceGroupArn,
            }
          : undefined,
      };
    },

    storage(val) {
      const data = val.LaunchTemplateData;

      return {
        blockDeviceMappings: data?.BlockDeviceMappings?.map((bdm) => ({
          deviceName: bdm.DeviceName,
          virtualName: bdm.VirtualName,
          noDevice: bdm.NoDevice,
          ebs: bdm.Ebs
            ? {
                deleteOnTermination: bdm.Ebs.DeleteOnTermination,
                encrypted: bdm.Ebs.Encrypted,
                iops: bdm.Ebs.Iops,
                kmsKeyId: bdm.Ebs.KmsKeyId,
                snapshotId: bdm.Ebs.SnapshotId,
                throughput: bdm.Ebs.Throughput,
                volumeSize: bdm.Ebs.VolumeSize,
                volumeType: bdm.Ebs.VolumeType,
              }
            : undefined,
        })),
      };
    },
  },
};
