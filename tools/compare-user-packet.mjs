/**
 * Compare a captured wire hex file vs Example.txt with per-region breakdown.
 * Usage: node tools/compare-user-packet.mjs [hex-file]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const hexPath = process.argv[2] ?? join(root, 'user-full-sent.hex');

const example = Buffer.from(
  readFileSync('C:/Users/Moshe/Desktop/PROTOCOLO CONFIG CRR FROM PC/Example.txt', 'utf8').trim(),
  'hex',
);
const sent = Buffer.from(readFileSync(hexPath, 'utf8').trim().replace(/\s+/g, ''), 'hex');

const HDR = 17;
const SLOT = 367;
const CFG = 364;

console.log('Lengths  example', example.length, 'sent', sent.length);
console.log('Serial   ex', example.slice(10, 14).toString('hex'), 'sent', sent.slice(10, 14).toString('hex'));
console.log('Options  ex', example[16].toString(16), 'sent', sent[16].toString(16));
console.log('Checksum ex', example[example.length - 3].toString(16), 'sent', sent[sent.length - 3].toString(16));

function slotDiffCount(i) {
  const base = HDR + i * SLOT;
  let n = 0;
  for (let j = 0; j < SLOT; j += 1) {
    if (example[base + j] !== sent[base + j]) n += 1;
  }
  return n;
}

console.log('\n--- Per Addr ---');
for (let i = 0; i < 15; i += 1) {
  const base = HDR + i * SLOT;
  const n = slotDiffCount(i);
  if (n === 0 && example[base] === sent[base]) continue;
  const exType = example[base];
  const snType = sent[base];
  const exCh = example[base + SLOT - 2];
  const snCh = sent[base + SLOT - 2];
  console.log(
    `Addr ${i + 1}: ${n} diffs | type ex=0x${exType.toString(16)} sent=0x${snType.toString(16)} | ch ex=0x${exCh.toString(16)} sent=0x${snCh.toString(16)}`,
  );
  // first config diffs
  let shown = 0;
  for (let j = 1; j <= CFG && shown < 8; j += 1) {
    const ei = base + j;
    if (example[ei] !== sent[ei]) {
      console.log(`  cfg[${j}] ex=0x${example[ei].toString(16).padStart(2, '0')} sent=0x${sent[ei].toString(16).padStart(2, '0')}`);
      shown += 1;
    }
  }
}

let total = 0;
for (let i = 0; i < Math.max(example.length, sent.length); i += 1) {
  if ((example[i] ?? -1) !== (sent[i] ?? -1)) total += 1;
}
console.log('\nTotal byte diffs:', total);
