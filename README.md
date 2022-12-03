# infrascan

Tool to generate a system map by connecting to your AWS account.

Infrascan currently works through 2 commands — scan and graph. Scan reads in data about your AWS account using AWS Profiles that you define, and generates a series of state files. Graph consumes the state files, and generates an interactive infrastructure diagram.

## Setup

Prerequisites: Node, an AWS account, AWS credentials
Optional: meilisearch

### Install

Install the required dependencies

```bash
npm i
```

### Configure

Create an infrascan config:

```json
[
  {
    "profile": "{AWS_PROFILE}",
    "account": "{AWS_ACCOUNT_ID}",
    "regions": ["us-east-1","eu-west-1",...],
    "services": ["S3","ECS","SQS","SNS",...]
  }
]
```

To run locally, you will need to provide credentials which have permissions to assume the profiles in the config. The easiest way to do this is using a shared credentials file.

### Run

Run a scan

```bash
CONFIG_PATH=config.json node src/index.js scan
```

Then generate a graph:

```bash
CONFIG_PATH=config.json node src/index.js graph
```

### Run with Meilisearch

The generated graph supports searching over the nodes, and isolating subgraphs. To use this feature, you'll need to run meilisearch locally.

Install meilisearch:

```bash
curl -L https://install.meilisearch.com | sh
```

Run meilisearch:

```bash
./meilisearch --master-key="test"
```

Seed meilisearch:

```bash
sh ./scripts/seed-meilisearch.sh
```

Update index with filterable attributes:

```bash
sh ./scripts/add-filters.sh
```

Begin searching!
