// script.js
import 'dotenv/config';
import { credentials } from '@grpc/grpc-js';
import { Client as ReflectionClient } from 'grpc-reflection-js';
import protobuf from 'protobufjs';
import fs from 'fs/promises';
import path from 'path';

// Determine endpoint: CLI arg overrides .env
const GRPC = process.argv[2] || process.env.GRPC;
if (!GRPC) {
  console.error(
    'Usage: GRPC=<host:port> yarn generate  OR  yarn generate <host:port>'
  );
  process.exit(1);
}

const OUT_DIR = './output';

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (_) {}
}

async function writeFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf8');
}

async function main() {
  // 1️⃣ Connect with TLS
  const refl = new ReflectionClient(GRPC, credentials.createSsl());

  // 2️⃣ List services
  const svcs = await refl.listServices();

  const manifest = [];
  await ensureDir(OUT_DIR);

  for (const svc of svcs) {
    // skip reflection services
    if (svc.startsWith('grpc.reflection')) continue;

    // 3️⃣ Fetch descriptor for service
    const root = await refl.fileContainingSymbol(svc);
    const serviceDef = root.lookupService(svc);
    const svcDir = path.join(OUT_DIR, ...svc.split('.'));

    // 4️⃣ Write service RPC definitions
    let svcProto = `service ${serviceDef.name} {\n`;
    for (const [mName, m] of Object.entries(serviceDef.methods)) {
      const reqStream = m.requestStream ? 'stream ' : '';
      const resStream = m.responseStream ? 'stream ' : '';
      svcProto += `  rpc ${mName} (${reqStream}${m.requestType}) returns (${resStream}${m.responseType});\n`;
    }
    svcProto += `}\n`;
    await writeFile(
      path.join(svcDir, `${serviceDef.name}.svc.proto`),
      svcProto
    );

    // 5️⃣ Write message type definitions
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
    await writeFile(
      path.join(svcDir, `${serviceDef.name}.msg.proto`),
      msgProto
    );

    manifest.push({ service: svc, path: svcDir });
  }

  // 6️⃣ Write manifest.json
  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );

  console.log('Generated definitions in', OUT_DIR);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

