/**
 * Verify Addr2 CC-2.4 ch235 baud250 + Addr4 RS485 ch0 checksum 0x3D (nibble sum).
 */
import { unlinkSync } from 'node:fs';
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
cfg.slots[1] = { moduleType: 'CC24', channel: 235, baudRate: '250', registers: new Array(47).fill(0) };
cfg.slots[3] = { moduleType: 'RS485', channel: 0, baudRate: '10', registers: new Array(47).fill(0) };

const pkt = Buffer.from(buildCrrLogicalConfigPacket(cfg));
const chk = pkt[pkt.length - 3];

try {
  unlinkSync(bundlePath);
} catch {
  /* ignore */
}

if (chk === 0x3d) {
  console.log('OK — Addr2 ch235 + RS485 Addr4 ch0 checksum 0x3D.');
  process.exit(0);
}
console.error(`FAIL — checksum 0x${chk.toString(16)} (want 3d)`);
process.exit(1);
