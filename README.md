# grpcExplorer

## Overview

`grpcExplorer` is a CLI tool that connects to a gRPC server via its reflection service, discovers all available services and RPC methods, and generates machine‑readable and human‑readable `.proto` snippets for each query service and its message types.

**Note**: These are not full representations or replacements for the full proto files but they can serve a similar purpose for simplified applications.

## Prerequisites

- Node.js v14 or later
- Yarn or npm
- A gRPC endpoint with reflection enabled

## Installation

1. Clone the repository:

   ```bash
   git clone <repo-url> grpcExplorer
   cd grpcExplorer
   ```

2. Install dependencies:

   ```bash
   yarn install
   # or
   npm install
   ```

3. Create a `.env` file in the project root (optional):

   ```ini
   GRPC=your.grpc.host:443
   ```

## Configuration

The tool supports two configuration modes:

### Single Network (Legacy)

Define a single network with multiple failover endpoints:

```ini
GRPC=host1:443,host2:443,host3:443
```

### Multiple Networks (Recommended)

Process multiple networks in parallel by defining them separately:

```ini
# Each GRPC_* variable defines a separate network
GRPC_NEUTRON=grpc.neutron.basementnodes.ca:443
GRPC_JUNO=grpc.juno.basementnodes.ca:443
GRPC_OSMOSIS=grpc.osmosis.example.com:443,backup.osmosis.example.com:443
```

## Usage

Generate definitions:

```bash
# using .env
yarn generate

# passing endpoint directly
yarn generate grpc.myhost.com:443
```

Generated files are placed under `./output`, organized by package path. A `manifest.json` lists each service and its output directory.

## Output Structure

```
output/
└── <chain-id>/                         # e.g., neutron-1, juno-1
    ├── manifest.json                    # Chain-specific manifest with metadata
    └── <package>/
        └── <ServiceName>/
            ├── <ServiceName>.svc.proto # RPC signatures
            └── <ServiceName>.msg.proto # Message definitions
```

Each chain gets its own subdirectory, allowing multiple chains to be generated without conflicts. The manifest includes the chain ID, network name, and generation metadata.

## Scripts

- `yarn generate` &mdash; run the discovery and code generation script

## Files

- `package.json` &mdash; project metadata and dependencies
- `script.mjs` &mdash; discovery and generation logic
- `dotenv` &mdash; loads `.env` for `SEIGRPC`

## License

MIT
