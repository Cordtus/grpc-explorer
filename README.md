# grpcExplorer

## Overview

`grpcExplorer` is a CLI tool that connects to a gRPC server via its reflection service, discovers all available services and RPC methods, and generates machine‑readable and human‑readable `.proto` snippets for each service and its message types.

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

- You can define the target endpoint in `.env` as `GRPC=host:port`.
- Alternatively, pass the endpoint when running:
  ```bash
  yarn generate <host:port>
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
├── manifest.json
└── <package>
    └── <ServiceName>/
        ├── <ServiceName>.svc.proto    # RPC signatures
        └── <ServiceName>.msg.proto    # Message definitions
```

## Scripts

- `yarn generate` &mdash; run the discovery and code generation script

## Files

- `package.json` &mdash; project metadata and dependencies
- `script.mjs` &mdash; discovery and generation logic
- `dotenv` &mdash; loads `.env` for `SEIGRPC`

## License

MIT

