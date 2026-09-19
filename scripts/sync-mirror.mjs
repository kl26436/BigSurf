// Regenerate a functions/ CommonJS mirror from its pure client ESM module.
// node scripts/sync-mirror.mjs <client.js> <server.js>
import { readFileSync, writeFileSync } from 'node:fs';
import { toCommonJs } from './mirror-transform.mjs';

const [clientPath, serverPath] = process.argv.slice(2);
if (!clientPath || !serverPath) {
    console.error('usage: node scripts/sync-mirror.mjs <client.js> <server.js>');
    process.exit(1);
}
const source = readFileSync(clientPath, 'utf8');
writeFileSync(serverPath, toCommonJs(source, clientPath.replace(/\\/g, '/')));
console.log(`mirrored ${clientPath} → ${serverPath}`);
