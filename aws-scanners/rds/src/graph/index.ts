import { RDSGlobalClusterEntity } from "./global-cluster";
import { RDSClusterEntity } from "./cluster";
import { RDSProxyEntity } from "./proxy";
import { RDSInstanceEntity } from "./instance";

export {
  RDSInstanceEntity,
  type RDSInstance,
  type GraphState,
  type RDSState,
  type EngineDetails,
  type AssociatedRole,
  type ActivityStream,
} from "./instance";
export {
  RDSClusterEntity,
  getClusterType,
  type RDSClusterState,
  type ClusterDetails,
  type ClusterType,
  type ClusterMember,
  type ClusterEndpoints,
  type ClusterScaling,
  type ClusterStorage,
  type ManagedSecret,
  type ServerlessV1Scaling,
  type ServerlessV2Scaling,
} from "./cluster";
export {
  RDSProxyEntity,
  type RDSProxyState,
  type ProxyDetails,
  type ProxyAuth,
  type ProxyTarget,
} from "./proxy";
export {
  RDSGlobalClusterEntity,
  getGlobalClusterHomeRegion,
  type RDSGlobalClusterState,
  type GlobalClusterDetails,
  type GlobalClusterMemberDetails,
} from "./global-cluster";

/**
 * Order matters: instances which belong to a cluster use the cluster node as their parent, so cluster nodes must be
 * added to the graph before instance nodes.
 */
export const entities = [
  RDSGlobalClusterEntity,
  RDSClusterEntity,
  RDSProxyEntity,
  RDSInstanceEntity,
];
