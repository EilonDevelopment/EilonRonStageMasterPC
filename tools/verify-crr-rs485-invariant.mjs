/**
 * RS-485: channel 0 → all-zero slot; non-zero channel → LabVIEW filler bytes.
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

function rs485Slot(channel) {
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
  cfg.slots[3] = { moduleType: 'RS485', channel, baudRate: '500', registers: new Array(47).fill(0) };
  return Buffer.from(buildCrrLogicalConfigPacket(cfg)).slice(17 + 3 * 367, 17 + 4 * 367);
}

const z = rs485Slot(0);
const eb = rs485Slot(235);

const zeroOk = z[0] === 0x01 && z.slice(1).every((b) => b === 0);
const ebOk = eb[0] === 0x01 && eb[11] === 0xeb && eb[365] === 0xeb && eb[366] === 0xeb;

try {
  unlinkSync(bundlePath);
} catch {
  /* ignore */
}

if (zeroOk && ebOk) {
  console.log('OK — RS485 ch0 all-zero; ch235 LabVIEW filler (eb).');
  process.exit(0);
}
console.error(`FAIL — zeroOk=${zeroOk} ebOk=${ebOk}`);
process.exit(1);
