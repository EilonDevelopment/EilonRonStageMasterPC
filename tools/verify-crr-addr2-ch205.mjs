/**
 * Verify Addr2-only CC-2.4 ch205 baud250 (all other slots OFF).
 * LabVIEW capture user-addr2-lv.hex had Addr4 accidentally RS485 — use app payload + chk 0x3D.
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

const reference = Buffer.from(readFileSync(join(root, 'user-addr2-app.hex'), 'utf8').trim(), 'hex');

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

const ours = Buffer.from(buildCrrLogicalConfigPacket(cfg));

let payloadDiffs = 0;
for (let i = 0; i < reference.length - 3; i += 1) {
  if (reference[i] !== ours[i]) payloadDiffs += 1;
}

const expectedChk = 0x3e;
const chkOk = ours[ours.length - 3] === expectedChk;

try {
  unlinkSync(bundlePath);
} catch {
  /* ignore */
}

if (payloadDiffs === 0 && chkOk) {
  console.log('OK — Addr2 ch205 payload matches (Addr4 OFF), checksum 0x3E.');
  process.exit(0);
}
console.error(`FAIL — payloadDiffs=${payloadDiffs} chk=${ours[ours.length - 3].toString(16)} (want 3e)`);
process.exit(1);
