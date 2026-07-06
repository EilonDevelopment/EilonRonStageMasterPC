/**
 * Verify Addr2 CC-2.4 ch205 + Addr4 RS485 ch0 matches user app capture.
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

const reference = Buffer.from(
  readFileSync(join(root, 'user-app-ch205.hex'), 'utf8').trim().replace(/\s+/g, ''),
  'hex',
).subarray(0, 5525);

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
cfg.slots[1] = { moduleType: 'CC24', channel: 205, baudRate: '250', registers: new Array(47).fill(0) };
cfg.slots[3] = { moduleType: 'RS485', channel: 0, baudRate: '10', registers: new Array(47).fill(0) };

const ours = Buffer.from(buildCrrLogicalConfigPacket(cfg));
let diffs = 0;
for (let i = 0; i < reference.length; i += 1) {
  if (reference[i] !== ours[i]) diffs += 1;
}

try {
  unlinkSync(bundlePath);
} catch {
  /* ignore */
}

if (diffs === 0) {
  console.log('OK — matches user app capture (Addr2 ch205 + RS485 ch0, chk 0x3D).');
  process.exit(0);
}
console.error(`FAIL — ${diffs} byte diffs`);
process.exit(1);
