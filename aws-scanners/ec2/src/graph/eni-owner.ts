import type { NetworkInterface } from "@aws-sdk/client-ec2";
import type { Serialized } from "@infrascan/shared-types";

export type EniOwnerKind =
  | "ec2_instance"
  | "nat_gateway"
  | "vpc_endpoint"
  | "lambda"
  | "load_balancer"
  | "transit_gateway"
  | "rds"
  | "elasticache"
  | "efs"
  | "ecs_task"
  | "route53_resolver"
  | "api_gateway"
  | "global_accelerator"
  | "quicksight"
  | "iot_rules"
  | "codestar_connections"
  | "aws_managed"
  | "unattached"
  | "unknown";

export interface EniOwner {
  /**
   * What the interface belongs to
   */
  kind: EniOwnerKind;
  /**
   * Identifier of the owner when it can be determined, e.g. `i-…`, `nat-…`, `vpce-…`, a Lambda function name,
   * a load balancer `app|net|gwy/<name>/<id>` path or a `tgw-attach-…` id.
   */
  id?: string;
  /**
   * Which field the owner was derived from
   */
  inferredFrom: "attachment" | "interfaceType" | "description" | "status";
}

const interfaceTypeOwners: Record<string, EniOwnerKind> = {
  natGateway: "nat_gateway",
  nat_gateway: "nat_gateway",
  vpc_endpoint: "vpc_endpoint",
  gateway_load_balancer_endpoint: "vpc_endpoint",
  lambda: "lambda",
  network_load_balancer: "load_balancer",
  load_balancer: "load_balancer",
  gateway_load_balancer: "load_balancer",
  transit_gateway: "transit_gateway",
  api_gateway_managed: "api_gateway",
  global_accelerator_managed: "global_accelerator",
  quicksight: "quicksight",
  iot_rules_managed: "iot_rules",
  aws_codestar_connections_managed: "codestar_connections",
};

const descriptionOwners: [RegExp, EniOwnerKind, number?][] = [
  [/^Interface for NAT Gateway (nat-[0-9a-zA-Z]+)/, "nat_gateway", 1],
  [/^VPC Endpoint Interface (vpce-[0-9a-zA-Z]+)/, "vpc_endpoint", 1],
  [
    /^AWS Lambda VPC ENI-(.+?)(?:-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/,
    "lambda",
    1,
  ],
  [/^ELB ((?:app|net|gwy)\/[^/]+\/[0-9a-f]+)/, "load_balancer", 1],
  [/^ELB (\S+)/, "load_balancer", 1],
  [
    /^Network Interface for Transit Gateway Attachment (tgw-attach-[0-9a-zA-Z]+)/,
    "transit_gateway",
    1,
  ],
  [/^RDSNetworkInterface/, "rds"],
  [/^ElastiCache (\S+)/, "elasticache", 1],
  [/^EFS mount target for (fs-[0-9a-zA-Z]+)/, "efs", 1],
  [/^arn:aws[a-z-]*:ecs:/, "ecs_task"],
  [/^Route 53 Resolver: (rslvr-[a-z]+-[0-9a-zA-Z]+)/, "route53_resolver", 1],
];

function fromDescription(description: string): EniOwner | undefined {
  for (const [pattern, kind, group] of descriptionOwners) {
    const match = pattern.exec(description);
    if (match != null) {
      return {
        kind,
        id: group != null ? match[group] : undefined,
        inferredFrom: "description",
      };
    }
  }
  return undefined;
}

/**
 * Works out what owns a network interface, so a reader can tell whether an ENI used as a route target (or found
 * in a subnet) belongs to an EC2 instance, a NAT gateway, a VPC endpoint, a Lambda function, a load balancer etc.
 */
export function classifyEniOwner(eni: Serialized<NetworkInterface>): EniOwner {
  const description = eni.Description ?? "";
  const byDescription = fromDescription(description);
  const typeOwner =
    eni.InterfaceType != null
      ? interfaceTypeOwners[eni.InterfaceType]
      : undefined;
  if (typeOwner != null) {
    return {
      kind: typeOwner,
      id: byDescription?.kind === typeOwner ? byDescription.id : undefined,
      inferredFrom: "interfaceType",
    };
  }
  // Requester managed interfaces can carry an instance attachment owned by AWS, so prefer the description.
  if (byDescription != null) {
    return byDescription;
  }
  if (eni.Attachment?.InstanceId != null) {
    return {
      kind: "ec2_instance",
      id: eni.Attachment.InstanceId,
      inferredFrom: "attachment",
    };
  }
  if (eni.RequesterManaged) {
    return { kind: "aws_managed", id: eni.RequesterId, inferredFrom: "status" };
  }
  if (eni.Status === "available") {
    return { kind: "unattached", inferredFrom: "status" };
  }
  return { kind: "unknown", inferredFrom: "status" };
}
