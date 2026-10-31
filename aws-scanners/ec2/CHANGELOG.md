# @infrascan/aws-ec2-scanner

## 0.9.0

### Minor Changes

- [#152](https://github.com/infrascan/infrascan/pull/152) [`fae33ebe215aba1b5fec4601b8a66dad59475eab`](https://github.com/infrascan/infrascan/commit/fae33ebe215aba1b5fec4601b8a66dad59475eab) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add graph nodes for route tables, network ACLs, VPC endpoints, internet and egress-only internet gateways, VPN gateways, VPC peering connections, transit gateways and their attachments, managed prefix lists (with entries for customer managed lists), DHCP options, flow logs and Elastic IPs. The scanner now also calls `DescribeVpcAttribute`, `DescribeRouteTables`, `DescribeInternetGateways`, `DescribeEgressOnlyInternetGateways`, `DescribeVpcEndpoints`, `DescribeNetworkAcls`, `DescribeVpcPeeringConnections`, `DescribeTransitGateways`, `DescribeTransitGatewayAttachments`, `DescribeVpnGateways`, `DescribeManagedPrefixLists`, `GetManagedPrefixListEntries`, `DescribeDhcpOptions`, `DescribeFlowLogs` and `DescribeAddresses` (see the README for the IAM permissions), and paginates `DescribeVpcs`. VPC nodes gain `enableDnsSupport` / `enableDnsHostnames`, security groups gain `network.egressRules`, network interfaces a `networkInterface` component and NAT gateways a `natGateway` component. Existing node ids and fields are unchanged.

## 0.8.1

### Patch Changes

- [#149](https://github.com/infrascan/infrascan/pull/149) [`d00b4eb21607aff73ab6fb3916a650d4f27adb81`](https://github.com/infrascan/infrascan/commit/d00b4eb21607aff73ab6fb3916a650d4f27adb81) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Record the VPC of subnets and security groups in `network.vpc.id`.

## 0.8.0

### Minor Changes

- [#140](https://github.com/infrascan/infrascan/pull/140) [`165992be8b0f166577002c66d4079308b0bb236a`](https://github.com/infrascan/infrascan/commit/165992be8b0f166577002c66d4079308b0bb236a) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Upgrade @aws-sdk dependencies and standardize versions in pnpm catalog.

### Patch Changes

- [#138](https://github.com/infrascan/infrascan/pull/138) [`a0aa145035349b9a9a4e82013daedea3f7f45925`](https://github.com/infrascan/infrascan/commit/a0aa145035349b9a9a4e82013daedea3f7f45925) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Normalize timestamp fields in entity ETLs to a numeric millisecond epoch with `tryNormalizeDateEpoch`. With the `Serialized` lifecycle type now typing rehydrated state honestly (persisted `Date` fields are ISO strings at ETL time), these sites are updated to normalize at runtime rather than assume a live `Date` — a belt-and-suspenders pairing with the compile-time type, since TypeScript does not enforce types at runtime. This also fixes the graphing crash where `Date`-typed fields (e.g. ec2 launch template `CreateTime`, lambda `StartingPositionTimestamp`) had `toISOString()` called on what was actually a string. Timestamp node properties (`audit.createdAt`, dynamodb throughput/archive dates, lambda `startingPositionTimestamp`) are now numeric epochs; the sqs scanner already computed an epoch and now emits it as a number rather than a string.

- Updated dependencies [[`a0aa145035349b9a9a4e82013daedea3f7f45925`](https://github.com/infrascan/infrascan/commit/a0aa145035349b9a9a4e82013daedea3f7f45925), [`165992be8b0f166577002c66d4079308b0bb236a`](https://github.com/infrascan/infrascan/commit/165992be8b0f166577002c66d4079308b0bb236a)]:
  - @infrascan/core@0.7.0

## 0.7.1

### Patch Changes

- Updated dependencies [[`87e6cc3b6f3342902aeab7b3c6e1349865bd8be1`](https://github.com/infrascan/infrascan/commit/87e6cc3b6f3342902aeab7b3c6e1349865bd8be1)]:
  - @infrascan/core@0.6.0

## 0.7.0

### Minor Changes

- [#130](https://github.com/infrascan/infrascan/pull/130) [`ae9bfbc219dad11f38c4449f0e2478f3e8585878`](https://github.com/infrascan/infrascan/commit/ae9bfbc219dad11f38c4449f0e2478f3e8585878) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add support for scanning network interfaces and nat gateways

## 0.6.0

### Minor Changes

- [#127](https://github.com/infrascan/infrascan/pull/127) [`dd08208963705f2211ea1db16983bb4034ee5446`](https://github.com/infrascan/infrascan/commit/dd08208963705f2211ea1db16983bb4034ee5446) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Introduce launch templates into EC2 scans, extend audit component to include version numbers

## 0.5.0

### Minor Changes

- [#123](https://github.com/infrascan/infrascan/pull/123) [`d05dc6ffe36f6b219964407b63b002520cf89795`](https://github.com/infrascan/infrascan/commit/d05dc6ffe36f6b219964407b63b002520cf89795) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Introduce informational node support

## 0.4.1

### Patch Changes

- [#107](https://github.com/infrascan/infrascan/pull/107) [`4530ad2554c3b44c4fec85dfe3b2da10440593f6`](https://github.com/infrascan/infrascan/commit/4530ad2554c3b44c4fec85dfe3b2da10440593f6) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Expose types of state produced from graph scans

## 0.4.0

### Minor Changes

- [#89](https://github.com/infrascan/infrascan/pull/89) [`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Migrate graph output to a standard schema for easier search/filter

### Patch Changes

- Updated dependencies [[`913867b73a72791c79a69ebfec8bf94331654c1d`](https://github.com/infrascan/infrascan/commit/913867b73a72791c79a69ebfec8bf94331654c1d)]:
  - @infrascan/core@0.5.0

## 0.3.2

### Patch Changes

- [#86](https://github.com/infrascan/infrascan/pull/86) [`d3110c2`](https://github.com/infrascan/infrascan/commit/d3110c2197be872ca72667aad552f33dead5271c) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add debug logging to scanner modules. Debug logs can be enabled using the DEBUG environment variable. Service specific logs are namespaced under the service key.

- [#84](https://github.com/infrascan/infrascan/pull/84) [`437026c`](https://github.com/infrascan/infrascan/commit/437026cc278ec4b380bcaf3a7a675f3762ce3bea) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Bump aws client sdk versions to remove vulnerable dependency

- Updated dependencies [[`d3110c2`](https://github.com/infrascan/infrascan/commit/d3110c2197be872ca72667aad552f33dead5271c), [`437026c`](https://github.com/infrascan/infrascan/commit/437026cc278ec4b380bcaf3a7a675f3762ce3bea)]:
  - @infrascan/core@0.4.1

## 0.3.1

### Patch Changes

- Updated dependencies [[`e28a6d9`](https://github.com/infrascan/infrascan/commit/e28a6d91eb36fa83e9a40a667eb39a15b2a45ccb)]:
  - @infrascan/core@0.4.0

## 0.3.0

### Minor Changes

- [#77](https://github.com/infrascan/infrascan/pull/77) [`21d4ecf`](https://github.com/infrascan/infrascan/commit/21d4ecf4b7fec31f4ac7b2cc5857aa5d2b725075) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Migrate all packages to consume new graph model

### Patch Changes

- Updated dependencies [[`21d4ecf`](https://github.com/infrascan/infrascan/commit/21d4ecf4b7fec31f4ac7b2cc5857aa5d2b725075)]:
  - @infrascan/core@0.3.0

## 0.2.5

### Patch Changes

- [#69](https://github.com/infrascan/infrascan/pull/69) [`647a680`](https://github.com/infrascan/infrascan/commit/647a680af9efc08107a6f315a0d0aedb630559ec) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Add account prefix to region nodes to avoid cross account conflicts. Use common API for formatting nodes in EC2 to prevent orphaned VPC nodes.

- Updated dependencies [[`647a680`](https://github.com/infrascan/infrascan/commit/647a680af9efc08107a6f315a0d0aedb630559ec)]:
  - @infrascan/core@0.2.3

## 0.2.4

### Patch Changes

- [#67](https://github.com/infrascan/infrascan/pull/67) [`2941c7d`](https://github.com/infrascan/infrascan/commit/2941c7dfd5eecaec1a57483b0c2c34e7c5fba6a0) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update EC2 scanner to correctly build the hierarchy between VPC, AZ, and subnets

## 0.2.3

### Patch Changes

- [#56](https://github.com/infrascan/infrascan/pull/56) [`4b6911d`](https://github.com/infrascan/infrascan/commit/4b6911d07cfc846389c30317becdf63e95768386) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update to include support scanner level retry strategies

## 0.2.2

### Patch Changes

- [#41](https://github.com/infrascan/infrascan/pull/41) [`c84fa87`](https://github.com/infrascan/infrascan/commit/c84fa87fa66fef97533ea597f431c8fe135cf1b2) Thanks [@lfarrel6](https://github.com/lfarrel6)! - Update documentation and add missing keywords to package.json

- Updated dependencies [[`c84fa87`](https://github.com/infrascan/infrascan/commit/c84fa87fa66fef97533ea597f431c8fe135cf1b2)]:
  - @infrascan/core@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`f7700f1`](https://github.com/infrascan/infrascan/commit/f7700f11568e413ba2ccefc990fc683bdfdeb01d)]:
  - @infrascan/core@0.2.1

## 0.2.0

### Minor Changes

- 7d71a0e: Restructure the project into per service scanner modules. Each module must be registered with the SDK for the service to be scanned and graphed.

  The initial implementation for Infrascan used a single config file which defined the scanning approach for every service, and their graph structure. It very quickly became difficult to debug, and reason about. The core logic was also completely untestable in any sane way.

  This release is a rewrite of the entire project. The SDK by default will do nothing. Each individual service's scanner has to be registered into an instance of the SDK for it to be scanned or graphed. This reduces the SDK complexity massively, as it only needs to step through the registered services and call into their APIs.

### Patch Changes

- Updated dependencies [7d71a0e]
  - @infrascan/core@0.2.0
