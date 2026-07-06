/**
 * Verify createDefaultCrrSettings() encodes byte-identical to Example.txt.
 * Run: node tools/verify-crr-default-vs-example.mjs
 */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(root, '.crr-encoder-bundle.mjs');

execSync(
  `npx esbuild "${join(root, '../src/helper/crrSettingsModel.ts')}" --bundle --platform=node --format=esm --outfile="${bundlePath}"`,
  { cwd: root, stdio: 'pipe' },
);

const { buildCrrLogicalConfigPacket, createDefaultCrrSettings } = await import(pathToFileURL(bundlePath).href);

const example = Buffer.from(
  readFileSync('C:/Users/Moshe/Desktop/PROTOCOLO CONFIG CRR FROM PC/Example.txt', 'utf8').trim(),
  'hex',
);
const ours = Buffer.from(buildCrrLogicalConfigPacket(createDefaultCrrSettings()));

const diffs = [];
for (let i = 0; i < example.length; i += 1) {
  if (example[i] !== ours[i]) diffs.push(i);
}

try {
  unlinkSync(bundlePath);
} catch {
  /* ignore */
}

if (diffs.length === 0) {
  console.log('OK — default config matches Example.txt byte-for-byte (5525 B).');
  process.exit(0);
}

console.error(`FAIL — ${diffs.length} byte diffs vs Example.txt`);
for (const i of diffs.slice(0, 30)) {
  console.error(
    `  @${i} (0x${i.toString(16)}) ex=0x${example[i].toString(16).padStart(2, '0')} ours=0x${ours[i].toString(16).padStart(2, '0')}`,
  );
}
process.exit(1);
