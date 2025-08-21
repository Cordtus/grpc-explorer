// script.js
import 'dotenv/config';
import { credentials } from '@grpc/grpc-js';
import { Client as ReflectionClient } from 'grpc-reflection-js';
import fs from 'fs/promises';
import path from 'path';

const OUT_DIR = './output';
const RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// read GRPC endpoints from environment variables
// Supports both legacy GRPC=host1,host2 and new GRPC_NAME=host format
function getNetworkConfigs() {
  const configs = [];

  // Check for legacy single GRPC variable with comma-separated values
  if (process.env.GRPC) {
    const endpoints = process.env.GRPC.split(',').map(s => s.trim()).filter(Boolean);
    configs.push({
      name: 'default',
      endpoints: endpoints
    });
  }

  // Check for GRPC_* variables (one network per variable)
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('GRPC_') && value) {
      const networkName = key.substring(5).toLowerCase();
      const endpoints = value.split(',').map(s => s.trim()).filter(Boolean);
      configs.push({
        name: networkName,
        endpoints: endpoints
      });
    }
  }

  return configs;
}

const networkConfigs = getNetworkConfigs();
if (networkConfigs.length === 0) {
  console.error('Error: No GRPC configuration found. Set either GRPC=host:port or GRPC_NETWORK=host:port env vars');
  process.exit(1);
}

// create reflection client for a given endpoint
function makeReflClient(target) {
  console.log(`→ Creating reflection client for ${target}`);
  return new ReflectionClient(target, credentials.createSsl());
}

// try fnName(...args) against each endpoint, with retries per endpoint
async function fetchWithFailover(endpoints, fnName, ...args) {
  for (const ep of endpoints) {
    console.log(`\n>> [${fnName}] trying endpoint ${ep}`);
    const client = makeReflClient(ep);
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      try {
        const result = await client[fnName](...args);
        console.log(`✔ [${fnName}] success on ${ep} (attempt ${attempt})`);
        return { result, endpoint: ep };
      } catch (err) {
        const code = err.code || err.message;
        console.warn(`✖ [${fnName}] error on ${ep} (attempt ${attempt}): ${code}`);
        if (attempt < RETRIES) {
          console.log(`  waiting ${RETRY_DELAY_MS}ms before retry…`);
          await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
      }
    }
    console.error(`!! [${fnName}] endpoint ${ep} exhausted after ${RETRIES} attempts`);
  }
  throw new Error(`[${fnName}] all endpoints failed`);
}

// get chain ID from the endpoint - simplified approach
async function getChainId(endpoint) {
  try {
    console.log(`\n=== Fetching chain ID from ${endpoint} ===`);

    // For now, we'll use a simplified approach
    // In the future, this could be enhanced to make actual gRPC calls
    // to fetch the chain ID from the node info service

    // Try to detect common chain patterns from the endpoint
    if (endpoint.includes('cosmoshub')) {
      console.log(`✔ Detected Cosmos Hub from endpoint`);
      return 'cosmoshub-4';
    } else if (endpoint.includes('osmosis')) {
      console.log(`✔ Detected Osmosis from endpoint`);
      return 'osmosis-1';
    } else if (endpoint.includes('neutron')) {
      console.log(`✔ Detected Neutron from endpoint`);
      return 'neutron-1';
    } else if (endpoint.includes('juno')) {
      console.log(`✔ Detected Juno from endpoint`);
      return 'juno-1';
    } else if (endpoint.includes('akash')) {
      console.log(`✔ Detected Akash from endpoint`);
      return 'akashnet-2';
    }

    // Default: use sanitized endpoint as chain identifier
    const chainId = endpoint.split(':')[0].replace(/[^a-zA-Z0-9-]/g, '-');
    console.log(`✔ Using endpoint-based chain ID: ${chainId}`);
    return chainId;

  } catch (err) {
    console.warn(`Could not determine chain ID: ${err.message}`);
    // Use a sanitized version of the endpoint as fallback
    return endpoint.replace(/[:.]/g, '_');
  }
}

// ensure directory exists
async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
}

// write file, creating parent dirs
async function writeFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

async function processNetwork(networkConfig) {
  const { name, endpoints } = networkConfig;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== Processing network: ${name} ===`);
  console.log(`=== Endpoints: ${endpoints.join(', ')} ===`);
  console.log(`${'='.repeat(60)}\n`);

  // First, get the chain ID from the first available endpoint
  let chainId = null;
  let activeEndpoint = null;

  for (const endpoint of endpoints) {
    try {
      chainId = await getChainId(endpoint);
      activeEndpoint = endpoint;
      break;
    } catch (err) {
      console.warn(`Failed to get chain ID from ${endpoint}: ${err.message}`);
    }
  }

  if (!chainId) {
    console.error(`Could not determine chain ID for network ${name}`);
    return { network: name, status: 'failed', error: 'Could not determine chain ID' };
  }

  console.log(`\n=== Working with chain: ${chainId} ===`);
  console.log(`=== Active endpoint: ${activeEndpoint} ===`);

  // Create chain-specific output directory
  const chainDir = path.join(OUT_DIR, chainId);
  await ensureDir(chainDir);

  try {
    console.log('\n=== Listing services ===');
    const { result: services, endpoint: usedEndpoint } = await fetchWithFailover(endpoints, 'listServices');
    console.log(`Found ${services.length} services from ${usedEndpoint}\n`);

    const manifest = {
      chainId: chainId,
      networkName: name,
      endpoint: usedEndpoint,
      generatedAt: new Date().toISOString(),
      services: []
    };

    for (const svc of services) {
      if (svc.startsWith('grpc.reflection')) continue;
      console.log(`\n=== Processing service: ${svc} ===`);

      console.log(`-> Fetching descriptor for ${svc}`);
      const { result: root } = await fetchWithFailover(endpoints, 'fileContainingSymbol', svc);

      const serviceDef = root.lookupService(svc);
      const svcDir = path.join(chainDir, ...svc.split('.'));

      // write service RPC definitions
      console.log(`-> Writing RPC definitions for ${serviceDef.name}`);
      let svcProto = `// Chain: ${chainId}\n`;
      svcProto += `// Network: ${name}\n`;
      svcProto += `// Service: ${svc}\n`;
      svcProto += `// Generated: ${new Date().toISOString()}\n\n`;
      svcProto += `service ${serviceDef.name} {\n`;
        for (const [mName, m] of Object.entries(serviceDef.methods)) {
          const reqStream = m.requestStream ? 'stream ' : '';
          const resStream = m.responseStream ? 'stream ' : '';
          svcProto += `  rpc ${mName} (${reqStream}${m.requestType}) returns (${resStream}${m.responseType});\n`;
        }
        svcProto += `}\n`;
        await writeFile(path.join(svcDir, `${serviceDef.name}.svc.proto`), svcProto);

        // write message type definitions
        console.log(`-> Writing message definitions for ${serviceDef.name}`);
        const used = new Set();
        for (const m of Object.values(serviceDef.methods)) {
          used.add(m.requestType);
          used.add(m.responseType);
        }
        let msgProto = `// Chain: ${chainId}\n`;
        msgProto += `// Network: ${name}\n`;
        msgProto += `// Service: ${svc}\n`;
        msgProto += `// Generated: ${new Date().toISOString()}\n\n`;
        for (const typeName of used) {
          const msg = root.lookupType(typeName);
          if (!msg || !msg.fields) continue;
          msgProto += `message ${msg.name} {\n`;
            for (const f of Object.values(msg.fields)) {
              const rule = f.repeated ? 'repeated ' : '';
              msgProto += `  ${rule}${f.type} ${f.name} = ${f.id};\n`;
            }
            msgProto += `}\n\n`;
        }
        await writeFile(path.join(svcDir, `${serviceDef.name}.msg.proto`), msgProto);

        manifest.services.push({
          service: svc,
          path: svcDir.replace(OUT_DIR + '/', ''),
          methods: Object.keys(serviceDef.methods).length
        });
    }

    console.log('\n=== Writing manifest ===');
    await writeFile(path.join(chainDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    console.log(`\n✅ Generation complete for chain ${chainId}`);
    console.log(`📁 Definitions written to ${chainDir}`);

    return {
      network: name,
      chainId: chainId,
      status: 'success',
      servicesCount: manifest.services.length,
      outputDir: chainDir
    };
  } catch (err) {
    console.error(`\n❌ Failed to process network ${name}: ${err.message}`);
    return { network: name, chainId: chainId, status: 'failed', error: err.message };
  }
}

async function main() {
  console.log('🚀 Starting gRPC Explorer multi-network generation');
  console.log(`📊 Found ${networkConfigs.length} network(s) to process\n`);

  // Process all networks in parallel
  const results = await Promise.allSettled(
    networkConfigs.map(config => processNetwork(config))
  );

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('=== GENERATION SUMMARY ===');
  console.log('='.repeat(60));

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { network, chainId, status, servicesCount, outputDir, error } = result.value;
      if (status === 'success') {
        console.log(`✅ ${network} (${chainId}): ${servicesCount} services -> ${outputDir}`);
      } else {
        console.log(`❌ ${network}: ${error}`);
      }
    } else {
      console.log(`❌ Failed to process network: ${result.reason}`);
    }
  }

  console.log('\n🎉 All networks processed!');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
