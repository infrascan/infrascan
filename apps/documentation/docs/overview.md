---
title: Overview
---

# Infrascan Overview

Infrascan is a set of open source tools designed to help you make sense of your cloud infrastructure.

This is currently enabled through an SDK which scans resources in AWS accounts, and converts the scan output into a system diagram as shown below:

![Example System Diagram](/img/infrastructure-diagram.png)

Infrascan generates these diagrams through two steps: an initial scan of the resources in an account, and a subsequent graphing pass which converts the scanned state into a set of nodes and edges to be rendered.

## Design

Infrascan follows a highly modular design. The [SDK](./@infrascan/sdk) implements a simple runtime, with the logic for scanning resources contained within small scanner libraries (see [AWS Scanners](./@infrascan/aws) for examples).

The majority of scanners have auto-generated implementations from a single config. The config defines the client needed for the service, the API calls to make, and the paths to the nodes and edges within the scanned state. These template files are implemented in typescript to dynamically enforce that the API calls required are available on the client used for the service. The codegen is implemented using [ejs](https://ejs.co/) template files for the common logic.
