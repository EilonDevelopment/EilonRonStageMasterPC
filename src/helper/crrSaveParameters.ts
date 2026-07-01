/**
 * LabVIEW "Save Parameters to CRR" — two-packet USB flow (Wireshark capture).
 * P1: config blob (~0x101B). P2: commit (~0x5B0) with byte-sum checksum + 0xAA.
 */
import { CRR_PACKET_TERMINATOR } from './crrProtocol';

export const LABVIEW_SAVE_P1_SIZE = 0x101b;
export const LABVIEW_SAVE_P2_SIZE = 0x5b0;

export const LABVIEW_SAVE_P1_OPCODE = 0x0010;
export const LABVIEW_SAVE_P2_OPCODE = 0x9505;

/** Pause between LabVIEW save packet 1 and 2 (CRR flash write time). */
export const LABVIEW_SAVE_INTER_PACKET_DELAY_MS = 1200;

const P1_HEADER = new Uint8Array([
  0x1b, 0x00, 0x50, 0x8a, 0xf1, 0x07, 0x81, 0xab, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x01,
  0x00, 0x28, 0x00, 0x02, 0x03, 0x00, 0x10, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
]);

/** Wireshark P2 header (opcode 0x9505 at 0x17–0x18). */
const P2_HEADER = new Uint8Array([
  0x1b, 0x00, 0x50, 0x8a, 0xf1, 0x07, 0x81, 0xab, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x01,
  0x00, 0x28, 0x00, 0x02, 0x03, 0x95, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/** LabVIEW P2 trailer: low-byte sum of body bytes 0x10…0x5AC (Wireshark → 0xC8). */
export function calcLabviewSaveP2Checksum(packet: Uint8Array): number {
  let sum = 0;
  const end = Math.min(packet.length, 0x5ad);
  for (let i = 0x10; i < end; i += 1) {
    sum += packet[i] & 0xff;
  }
  return sum & 0xff;
}

/** Slot-1 payload from LabVIEW capture (Addr1 CC-2.4, Ch236, P500). */
const P1_SLOT1 = new Uint8Array([
  0x15, 0x8c, 0x31, 0x00, 0x54, 0x9a, 0x48, 0x03, 0xfc, 0x06, 0x03, 0x29, 0x2e, 0x06, 0x07, 0xd3, 0x91, 0xff,
  0x07, 0x05, 0x00, 0xec, 0x0c, 0x00, 0x5d, 0x93, 0xb1, 0x0e, 0x3b, 0x73, 0x42, 0xf8, 0x00, 0x07, 0x30, 0x18,
  0x1d, 0x1c, 0xc7, 0x40, 0xb0, 0x87, 0x6b, 0xf8, 0xb6, 0x10, 0xea, 0x0a, 0x00, 0x19, 0x41, 0x00, 0x59, 0x7f,
  0x3f, 0x88, 0x31, 0x0b, 0xff,
]);

export type LabviewSaveConfigPatch = {
  /** RF channel byte (offset 0x37). */
  channel?: number;
  /** PA index byte (offset 0x38), not raw UI watts. */
  powerIndex?: number;
};

/** Replay template P1 — LabVIEW Wireshark capture (single Addr1 active). */
export function buildLabviewSaveConfigPacketP1(patch?: LabviewSaveConfigPatch): Uint8Array {
  const pkt = new Uint8Array(LABVIEW_SAVE_P1_SIZE);
  pkt.set(P1_HEADER, 0);
  pkt.set(P1_SLOT1, 0x22);
  pkt[0x199] = 0xec;
  pkt[0x19a] = 0xec;
  pkt[0x1a6] = 0xcd;
  pkt[0x308] = 0xcd;
  pkt[0x309] = 0xcd;
  pkt[0x315] = 0x32;
  pkt[0x47c] = 0x32;
  pkt[0x47d] = 0x32;

  if (patch?.channel != null) {
    const ch = patch.channel & 0xff;
    pkt[0x37] = ch;
    pkt[0x199] = ch;
    pkt[0x19a] = ch;
  }
  if (patch?.powerIndex != null) {
    pkt[0x38] = patch.powerIndex & 0xff;
  }

  return pkt;
}

/** Build P2 commit packet; copies bytes 0–15 from P1 when provided (session magic). */
export function buildLabviewSaveCommitPacketP2(configPacket?: Uint8Array): Uint8Array {
  const pkt = new Uint8Array(LABVIEW_SAVE_P2_SIZE);
  pkt.set(P2_HEADER, 0);
  if (configPacket && configPacket.length >= 16) {
    pkt.set(configPacket.subarray(0, 16), 0);
    pkt[0x17] = 0x95;
    pkt[0x18] = 0x05;
  }

  pkt[0x5ad] = calcLabviewSaveP2Checksum(pkt);
  pkt[0x5ae] = CRR_PACKET_TERMINATOR;
  pkt[0x5af] = CRR_PACKET_TERMINATOR;
  return pkt;
}

export function formatLabviewSaveTxHex(bytes: Uint8Array): string {
  if (bytes.length <= 96) return bytesToHexShort(bytes);
  const head = bytesToHexShort(bytes.subarray(0, 32));
  const tail = bytesToHexShort(bytes.subarray(bytes.length - 16));
  return `${head} … ${tail}`;
}

function bytesToHexShort(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

export function formatLabviewSavePacketSummary(which: 'P1' | 'P2', bytes: Uint8Array): string {
  if (which === 'P1') {
    const ch = bytes[0x37];
    const pwr = bytes[0x38];
    return `Save P1 config | ${bytes.length} B | Ch=${ch} PwrIdx=${pwr} | opcode 0x${LABVIEW_SAVE_P1_OPCODE.toString(16)}`;
  }
  const chk = bytes[0x5ad];
  const term = bytes[0x5ae];
  return `Save P2 commit | ${bytes.length} B | chk=0x${chk.toString(16).toUpperCase()} term=0x${term.toString(16).toUpperCase()} | opcode 0x${LABVIEW_SAVE_P2_OPCODE.toString(16)}`;
}
