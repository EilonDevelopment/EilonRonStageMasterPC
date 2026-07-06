import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(root, '.crr-encoder-bundle.mjs');

execSync(
  `npx esbuild "${join(root, '../src/helper/crrSettingsModel.ts')}" --bundle --platform=node --format=esm --outfile="${bundlePath}"`,
  { cwd: root, stdio: 'pipe' },
);

const { buildCrrLogicalConfigPacket, createDefaultCrrSettings, calcCrrConfigChecksum } =
  await import(pathToFileURL(bundlePath).href);

const sentHex = readFileSync(join(root, 'user-addr1-only.hex'), 'utf8').trim().replace(/\s+/g, '');
const sent = Buffer.from(sentHex, 'hex');

const cfg = createDefaultCrrSettings();
for (let i = 0; i < 15; i++) {
  cfg.slots[i] = { moduleType: 'OFF', channel: 0, baudRate: '10', registers: new Array(47).fill(0) };
}
cfg.slots[0] = {
  moduleType: 'CC24',
  channel: 235,
  baudRate: '250',
  registers: new Array(47).fill(0),
};

const ours = Buffer.from(buildCrrLogicalConfigPacket(cfg));

function checksum(pkt) {
  let sum = 0;
  for (let i = 7; i < pkt.length - 3; i++) sum += pkt[i] & 0xff;
  return (sum - 0x10) & 0xff;
}

console.log('sent len', sent.length, 'ours len', ours.length);
console.log('sent checksum', sent[sent.length - 3].toString(16), 'calc on sent', checksum(sent).toString(16));
console.log('ours checksum', ours[ours.length - 3].toString(16), 'calc on ours', checksum(ours).toString(16));

const diffs = [];
for (let i = 0; i < Math.max(sent.length, ours.length); i++) {
  if (sent[i] !== ours[i]) diffs.push(i);
}
console.log('diffs vs encoder (all off + addr1 CC24 ch235 baud250):', diffs.length);
for (const i of diffs.slice(0, 25)) {
  console.log(`  @${i} sent=${sent[i]?.toString(16).padStart(2, '0')} ours=${ours[i]?.toString(16).padStart(2, '0')}`);
}

// Also compare with stale registers from default addr1 (baud 10 template)
const cfgStale = createDefaultCrrSettings();
for (let i = 1; i < 15; i++) {
  cfgStale.slots[i] = { moduleType: 'OFF', channel: 0, baudRate: '10', registers: new Array(47).fill(0) };
}
cfgStale.slots[0] = { ...cfgStale.slots[0], channel: 235, baudRate: '250' };
const stale = Buffer.from(buildCrrLogicalConfigPacket(cfgStale));
let staleMatch = 0;
for (let i = 0; i < sent.length; i++) if (sent[i] === stale[i]) staleMatch++;
console.log('match sent vs stale-registers encode:', staleMatch, '/', sent.length);
