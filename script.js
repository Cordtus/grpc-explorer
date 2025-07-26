// script.js
import 'dotenv/config';
import { credentials } from '@grpc/grpc-js';
import { Client as ReflectionClient } from 'grpc-reflection-js';
import fs from 'fs/promises';
import path from 'path';

const OUT_DIR = './output';
const RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// read comma-separated endpoints from GRPC env var
const grpcEnv = process.env.GRPC;
if (!grpcEnv) {
  console.error('Error: GRPC env var not set. e.g. GRPC=host1:443,host2:443');
  process.exit(1);
}
const endpoints = grpcEnv.split(',').map(s => s.trim()).filter(Boolean);
if (endpoints.length === 0) {
  console.error('Error: GRPC env var is empty or malformed.');
  process.exit(1);
}

// create reflection client for a given endpoint
function makeReflClient(target) {
  console.log(`→ Creating reflection client for ${target}`);
  return new ReflectionClient(target, credentials.createSsl());
}

// try fnName(...args) against each endpoint, with retries per endpoint
async function fetchWithFailover(fnName, ...args) {
  for (const ep of endpoints) {
    console.log(`\n>> [${fnName}] trying endpoint ${ep}`);
    const client = makeReflClient(ep);
    for (let attempt = 1; attempt <= RETRIES; attempt++) {
      try {
        const result = await client[fnName](...args);
        console.log(`✔ [${fnName}] success on ${ep} (attempt ${attempt})`);
        return result;
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

// ensure directory exists
async function ensureDir(dir) {
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
}

// write file, creating parent dirs
async function writeFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

async function main() {
  console.log('=== Listing services ===');
  const services = await fetchWithFailover('listServices');
  console.log(`Found ${services.length} services\n`);

  await ensureDir(OUT_DIR);
  const manifest = [];

  for (const svc of services) {
    if (svc.startsWith('grpc.reflection')) continue;
    console.log(`\n=== Processing service: ${svc} ===`);

    console.log(`-> Fetching descriptor for ${svc}`);
    const root = await fetchWithFailover('fileContainingSymbol', svc);

    const serviceDef = root.lookupService(svc);
    const svcDir = path.join(OUT_DIR, ...svc.split('.'));

    // write service RPC definitions
    console.log(`-> Writing RPC definitions for ${serviceDef.name}`);
    let svcProto = `service ${serviceDef.name} {\n`;
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
      let msgProto = '';
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

      manifest.push({ service: svc, path: svcDir });
  }

  console.log('\n=== Writing manifest ===');
  await writeFile(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`\n✅ Generation complete. Definitions written to ${OUT_DIR}`);
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
