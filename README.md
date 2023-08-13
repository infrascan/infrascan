# Infrascan

Infrascan is a set of open-source tools to help you make sense of your cloud infrastructure.

This repo contains the Infrascan SDK, Config, and CLI, as well as private packages used during development.

## Project Structure

The packages involved in Infrascan development are split across three top-level workspaces:

- `apps`
  - `render` — a playground for quickly visualizing Infrascan graph outputs, available at [render.infrascan.io](https://render.infrascan.io).
- `internal`
  - `codegen` — a small [ts-morph](https://github.com/dsherret/ts-morph) project which converts the per service configs from `@infrascan/config` into typescript modules.
  - `shared-types` — a set of type definitions shared across multiple packages
  - `tsconfig` — the base tsconfig definition for the typescript projects in this repo, as recommended by [turbo build](https://turbo.build/repo/docs/handbook/linting/typescript#sharing-tsconfigjson).
  - `eslint-config-custom` — the base tsconfig definition for the typescript projects in this repo, as recommended by [turbo build](https://turbo.build/repo/docs/handbook/linting/typescript#sharing-tsconfigjson).
- `packages`
  - `cli` — a minimal CLI to scan and graph your infrastructure, saving output to your local FS.
  - `config` — definitions of the per service scanners and graphers, used to generate the SDK.
  - `sdk` — the SDK used to generate scans and graphs of your AWS Infrastructure.
