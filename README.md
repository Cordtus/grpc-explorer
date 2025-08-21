# grpcExplorer

## Overview

`grpcExplorer` is a CLI tool that connects to gRPC servers with reflection enabled, discovers available services and RPC methods, and generates human-readable `.proto` snippets organized by blockchain network. The tool supports multi-network parallel processing with automatic endpoint failover.

**Note**: These are not full representations or replacements for the full proto files but they can serve a similar purpose for simplified applications.

## Features

- **Multi-Network Parallel Processing**: Process multiple blockchain networks simultaneously
- **Automatic Endpoint Failover**: Multiple endpoints per network with automatic retry (3 attempts, 2-second delays)
- **Chain ID Detection**: Automatically detects chain IDs from endpoint names or queries
- **Service Discovery**: Uses gRPC reflection to discover all available services
- **Organized Output**: Preserves original package structure for easy navigation
- **Comprehensive Metadata**: Generates manifest files with service catalog and chain information
- **Proto Separation**: Splits RPC methods and message definitions into separate files for clarity

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

Generate proto definitions from configured endpoints:

```bash
# Using endpoints from .env file (processes all configured networks)
yarn generate

# Override with direct endpoint (single network mode)
yarn generate grpc.myhost.com:443
```

The direct endpoint parameter overrides any `.env` configuration and runs in single-network mode.

Generated files are organized under `./output/<chain-id>/`, preserving the original package structure. Each chain includes a `manifest.json` with service metadata.

## Output Structure

```
output/
└── <chain-id>/                         # e.g., neutron-1, juno-1
    ├── manifest.json                    # Chain metadata and service catalog
    └── <package>/                      # Original package structure preserved
        └── <path>/                     # e.g., cosmos/bank/v1beta1/
            └── <ServiceName>/          # Service name directory
                ├── <ServiceName>.svc.proto  # RPC method signatures
                └── <ServiceName>.msg.proto  # Message type definitions
```

### Example Output

```
output/
├── neutron-1/
│   ├── manifest.json
│   ├── cosmos/
│   │   ├── bank/v1beta1/Query/
│   │   │   ├── Query.svc.proto
│   │   │   └── Query.msg.proto
│   │   └── auth/v1beta1/Query/
│   │       ├── Query.svc.proto
│   │       └── Query.msg.proto
│   └── neutron/
│       └── dex/Query/
│           ├── Query.svc.proto
│           └── Query.msg.proto
└── juno-1/
    ├── manifest.json
    └── cosmos/...
```

### Manifest Structure

The `manifest.json` file contains:
- `chainId`: Detected chain identifier
- `networkName`: Network name from configuration
- `endpoint`: Successfully connected gRPC endpoint
- `generatedAt`: ISO timestamp of generation
- `services`: Array of discovered services with:
  - `service`: Full service name
  - `path`: Relative path to generated files
  - `methods`: Number of RPC methods in the service

## Scripts

- `yarn generate` &mdash; run the discovery and code generation script (accepts optional endpoint override)

## Files

- `package.json` &mdash; project metadata and dependencies  
- `script.js` &mdash; discovery and generation logic (ES module)
- `.env` &mdash; environment configuration for GRPC endpoints (optional)

## License

MIT
