/**
 * Verify Addr1-only encoder matches LabVIEW Wireshark capture (checksum 0x3E).
 */
import { readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(root, '.crr-encoder-bundle.mjs');

execSync(
  `npx esbuild "${join(root, '../src/helper/crrSettingsModel.ts')}" --bundle --platform=node --format=esm --outfile="${bundlePath}"`,
  { cwd: root, stdio: 'pipe' },
);

const { buildCrrLogicalConfigPacket } = await import(pathToFileURL(bundlePath).href);

const labview = Buffer.from(readFileSync(join(root, 'user-labview-addr1-only.hex'), 'utf8').trim(), 'hex');

const cfg = {
  crrSerial: 0x0008a534,
  slots: Array.from({ length: 15 }, () => ({
    moduleType: 'OFF',
    channel: 0,
    baudRate: '10',
    registers: new Array(47).fill(0),
  })),
  options: {
    setPoint: false,
    singleCable: true,
    slave: true,
    slaveOneByOne: false,
    master: false,
    internet: false,
    ethernet: false,
    sdCard: false,
  },
};
cfg.slots[0] = {
  moduleType: 'CC24',
  channel: 235,
  baudRate: '250',
  registers: new Array(47).fill(0),
};

const ours = Buffer.from(buildCrrLogicalConfigPacket(cfg));
let diffs = 0;
for (let i = 0; i < labview.length; i += 1) {
  if (labview[i] !== ours[i]) diffs += 1;
}

try {
  unlinkSync(bundlePath);
} catch {
  /* ignore */
}

if (diffs === 0) {
  console.log('OK — Addr1-only matches LabVIEW capture byte-for-byte (chk 0x3E).');
  process.exit(0);
}

console.error(`FAIL — ${diffs} byte diffs vs LabVIEW`);
process.exit(1);
