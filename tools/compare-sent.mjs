import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const example = Buffer.from(
  readFileSync('C:/Users/Moshe/Desktop/PROTOCOLO CONFIG CRR FROM PC/Example.txt', 'utf8').trim(),
  'hex',
);
const sent = Buffer.from(readFileSync(join(root, 'user-sent.hex'), 'utf8').trim(), 'hex');

console.log('Lengths  example', example.length, 'sent', sent.length);

function nzStart(buf) {
  for (let i = 0; i < buf.length; i++) if (buf[i]) return i;
  return -1;
}
console.log('First non-zero example @', nzStart(example), 'sent @', nzStart(sent));

console.log('\nExample head 64:', example.slice(0, 64).toString('hex'));
console.log('Sent head 64:   ', sent.slice(0, 64).toString('hex'));
console.log('\nExample @4090:', example.slice(4085, 4120).toString('hex'));
console.log('Sent @4090:   ', sent.slice(4085, 4120).toString('hex'));
console.log('\nExample tail 80:', example.slice(-80).toString('hex'));
console.log('Sent tail 80:   ', sent.slice(-80).toString('hex'));

const HDR = 17;
const SLOT = 367;
for (let i = 0; i < 15; i++) {
  const base = HDR + i * SLOT;
  const exType = example[base];
  const snType = sent[base];
  const exCh = example[base + SLOT - 2].toString(16) + example[base + SLOT - 1].toString(16);
  const snCh = sent[base + SLOT - 2].toString(16) + sent[base + SLOT - 1].toString(16);
  if (exType !== snType || exCh !== snCh) {
    console.log(`Addr${i + 1} diff type ex=${exType.toString(16)} sn=${snType.toString(16)} ch ex=${exCh} sn=${snCh}`);
  }
}

let diffs = 0;
const regions = { header: 0, slots: 0, trailer: 0 };
for (let i = 0; i < Math.max(example.length, sent.length); i++) {
  const a = example[i] ?? -1;
  const b = sent[i] ?? -1;
  if (a === b) continue;
  diffs++;
  if (i < HDR) regions.header++;
  else if (i >= example.length - 3) regions.trailer++;
  else regions.slots++;
  if (diffs <= 25) {
    console.log(`diff @${i} (0x${i.toString(16)}) ex=${a >= 0 ? a.toString(16).padStart(2, '0') : '--'} sn=${b >= 0 ? b.toString(16).padStart(2, '0') : '--'}`);
  }
}
console.log('\nTotal diffs', diffs, regions);

// Is sent a suffix of example?
for (let off = 0; off < example.length; off++) {
  let ok = true;
  for (let j = 0; j < sent.length; j++) {
    if (sent[j] !== example[off + j]) {
      ok = false;
      break;
    }
  }
  if (ok) console.log('SENT matches EXAMPLE at offset', off, '(0x' + off.toString(16) + ')');
}
