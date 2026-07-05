/**
 * LabVIEW "Save Parameters to CRR" — two-packet USB flow (Wireshark capture).
 * P1: config blob (~0x101B). P2: commit (~0x5B0) with byte-sum checksum + 0xAA.
 *
 * Hardware findings (COM6 CRR, verified):
 *  1. Do NOT send identify 0x34 before save — CRR ignores the commit.
 *  2. The Wireshark capture is prefixed by a USB transport header whose length is
 *     the little-endian uint16 at offset 0 (0x001B = 27 bytes). The real CRR serial
 *     packet begins right after it, at the 0xFF×6 broadcast preamble. Sending the
 *     full capture (with header) fails; sending the header-stripped bytes returns
 *     " IDN_ 1". The "session prefix" (bytes 2–7) lives INSIDE that header and never
 *     reaches the CRR, which is why overriding it never changed the result.
 */
import { CRR_PACKET_TERMINATOR } from './crrProtocol';
import type { CrrSettingsConfig } from './crrSettingsModel';
import { buildCrrLogicalConfigPacket, buildCrrSettingsWirePackets } from './crrSettingsModel';
import { LABVIEW_SAVE_CAPTURE3_P1 } from './labviewSaveCapture3';

/** Full LabVIEW/USB capture sizes (transport header + CRR packet). */
export const LABVIEW_SAVE_P1_SIZE = 0x101b;
export const LABVIEW_SAVE_P2_SIZE = 0x5b0;

/** USB transport header length = little-endian uint16 at capture offset 0 (0x001B). */
export const LABVIEW_SAVE_TRANSPORT_HEADER_SIZE = 0x1b;

/** CRR wire sizes actually sent over the serial port (capture size − header). */
export const LABVIEW_SAVE_P1_WIRE_SIZE = LABVIEW_SAVE_P1_SIZE - LABVIEW_SAVE_TRANSPORT_HEADER_SIZE;
export const LABVIEW_SAVE_P2_WIRE_SIZE = LABVIEW_SAVE_P2_SIZE - LABVIEW_SAVE_TRANSPORT_HEADER_SIZE;

export const LABVIEW_SAVE_P1_OPCODE = 0x0010;
export const LABVIEW_SAVE_P2_OPCODE = 0x9505;

/** Pause between LabVIEW save packet 1 and 2 (CRR flash write time). */
export const LABVIEW_SAVE_INTER_PACKET_DELAY_MS = 1200;

/** Default session bytes 2–7 placeholder — override from a fresh Wireshark capture. */
export const LABVIEW_SAVE_DEFAULT_SESSION_HEX = '1B 00 50 8A F1 07 81 AB FF FF 00 00 00 00 09 00';

/** Wireshark P2 header skeleton (opcode 0x9505 at 0x17–0x18); session copied from P1. */
const P2_HEADER = new Uint8Array([
  0x1b, 0x00, 0x50, 0x8a, 0xf1, 0x07, 0x81, 0xab, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x01,
  0x00, 0x28, 0x00, 0x02, 0x03, 0x95, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

/** LabVIEW P2 trailer: low-byte sum of body bytes 0x10…0x5AC. */
export function calcLabviewSaveP2Checksum(packet: Uint8Array): number {
  let sum = 0;
  const end = Math.min(packet.length, 0x5ad);
  for (let i = 0x10; i < end; i += 1) {
    sum += packet[i] & 0xff;
  }
  return sum & 0xff;
}

export type LabviewSaveConfigPatch = {
  /** RF channel byte (offset 0x37). */
  channel?: number;
  /** PA index byte (offset 0x38), not raw UI watts. */
  powerIndex?: number;
  /** Override bytes 0x00–0x0F (LabVIEW session prefix from Wireshark). */
  sessionPrefix16?: Uint8Array;
};

export type LabviewSavePackets = {
  p1: Uint8Array;
  p2: Uint8Array;
};

/** Parse up to 16 bytes for LabVIEW session prefix (Wireshark line 0000, bytes 0–15). */
export function parseLabviewSessionPrefixHex(text: string): Uint8Array | null {
  const compact = text
    .trim()
    .replace(/0x/gi, '')
    .replace(/[\s,;:-]+/g, '');
  if (!compact || !/^[0-9A-Fa-f]+$/.test(compact)) return null;
  const normalized = compact.length % 2 === 0 ? compact : `0${compact}`;
  if (normalized.length > 32) return null;
  const bytes = new Uint8Array(16);
  const copyLen = normalized.length / 2;
  for (let i = 0; i < copyLen; i += 1) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Parse Wireshark "Hex Dump" (offset + bytes + ASCII) or a plain hex stream.
 * Keeps only whitespace-separated 2-hex-char tokens.
 */
export function parseCapturedHexDump(text: string): Uint8Array | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lines = trimmed.split(/\r?\n/);
  const looksLikeDump = lines.length > 1 && /\s/.test(trimmed);
  if (!looksLikeDump) {
    const compact = trimmed
      .replace(/0x/gi, '')
      .replace(/[\s,;:-]+/g, '');
    if (!compact || !/^[0-9A-Fa-f]+$/.test(compact)) return null;
    const normalized = compact.length % 2 === 0 ? compact : `0${compact}`;
    const bytes = new Uint8Array(normalized.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  const bytes: number[] = [];
  for (const line of lines) {
    const tokens = line.trim().split(/\s+/);
    for (const tok of tokens) {
      if (/^[0-9A-Fa-f]{2}$/.test(tok)) {
        bytes.push(parseInt(tok, 16));
      }
    }
  }
  return bytes.length > 0 ? Uint8Array.from(bytes) : null;
}

export function formatLabviewSessionPrefix(bytes: Uint8Array): string {
  return Array.from(bytes.subarray(0, 16))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

/** CAP3 template session (bytes 0–15) — use as-is when no Wireshark session is pasted. */
export function getLabviewSaveTemplateSessionPrefix(): Uint8Array {
  return LABVIEW_SAVE_CAPTURE3_P1.subarray(0, 16);
}

/** True when pasted session differs from the CAP3 template (body would be mismatched). */
export function isCustomLabviewSessionPrefix(prefix?: Uint8Array | null): boolean {
  if (!prefix || prefix.length < 16) return false;
  const template = getLabviewSaveTemplateSessionPrefix();
  for (let i = 0; i < 16; i += 1) {
    if (prefix[i] !== template[i]) return true;
  }
  return false;
}

function applySessionPrefix(pkt: Uint8Array, prefix?: Uint8Array): void {
  if (!prefix || prefix.length === 0) return;
  pkt.set(prefix.subarray(0, Math.min(16, prefix.length)), 0);
}

function applyChannelPatch(pkt: Uint8Array, channel: number): void {
  const ch = channel & 0xff;
  pkt[0x37] = ch;
  pkt[0x199] = ch;
  pkt[0x19a] = ch;
}

/** Build P1 from Wireshark CAP3 template with optional session/channel/power patches. */
export function buildLabviewSaveConfigPacketP1(patch?: LabviewSaveConfigPatch): Uint8Array {
  const simplePatch = patch;
  const pkt = new Uint8Array(LABVIEW_SAVE_CAPTURE3_P1);

  if (simplePatch?.channel != null) {
    applyChannelPatch(pkt, simplePatch.channel);
  }
  if (simplePatch?.powerIndex != null) {
    pkt[0x38] = simplePatch.powerIndex & 0xff;
  }
  applySessionPrefix(pkt, simplePatch?.sessionPrefix16);

  return pkt;
}

/** Build P2 commit packet; copies bytes 0–15 from P1 (session magic) and recalculates checksum. */
export function buildLabviewSaveCommitPacketP2(
  configPacket?: Uint8Array,
  sessionPrefix16?: Uint8Array,
): Uint8Array {
  const pkt = new Uint8Array(LABVIEW_SAVE_P2_SIZE);
  pkt.set(P2_HEADER, 0);
  if (configPacket && configPacket.length >= 16) {
    pkt.set(configPacket.subarray(0, 16), 0);
    pkt[0x17] = 0x95;
    pkt[0x18] = 0x05;
  } else if (sessionPrefix16) {
    applySessionPrefix(pkt, sessionPrefix16);
    pkt[0x17] = 0x95;
    pkt[0x18] = 0x05;
  }

  pkt[0x5ad] = calcLabviewSaveP2Checksum(pkt);
  pkt[0x5ae] = CRR_PACKET_TERMINATOR;
  pkt[0x5af] = CRR_PACKET_TERMINATOR;
  return pkt;
}

/**
 * Strip the USB transport header from a full LabVIEW capture, returning the CRR
 * serial packet (starts at the 0xFF×6 preamble). Header length = LE uint16 at
 * offset 0; falls back to the known 27-byte header when the field looks invalid.
 */
export function toCrrWireSavePacket(fullCapture: Uint8Array): Uint8Array {
  if (fullCapture.length < 2) return fullCapture.slice();
  let headerLen = fullCapture[0] | (fullCapture[1] << 8);
  if (headerLen <= 0 || headerLen >= fullCapture.length) {
    headerLen = LABVIEW_SAVE_TRANSPORT_HEADER_SIZE;
  }
  return fullCapture.slice(headerLen);
}

/** Build both save packets as FULL captures (with transport header) — for inspection. */
export function buildLabviewSaveFullPackets(patch?: LabviewSaveConfigPatch | CrrSettingsConfig): LabviewSavePackets {
  if (patch && 'slots' in patch) {
    const { p1, p2 } = buildCrrSettingsWirePackets(patch);
    return { p1, p2 };
  }
  const p1 = buildLabviewSaveConfigPacketP1(patch);
  const sessionPrefix = patch && 'sessionPrefix16' in patch ? patch.sessionPrefix16 : undefined;
  const p2 = buildLabviewSaveCommitPacketP2(p1, sessionPrefix);
  return { p1, p2 };
}

/**
 * Single contiguous CRR save blob for the serial port (5525 B = P1 wire + P2 wire).
 * LabVIEW sends this as one USB transfer; the CRR expects one continuous stream.
 */
export function buildLabviewSaveWireBlob(patch?: LabviewSaveConfigPatch | CrrSettingsConfig): Uint8Array {
  if (patch && 'slots' in patch) {
    return buildCrrLogicalConfigPacket(patch);
  }
  const { p1, p2 } = buildLabviewSavePackets(patch);
  const blob = new Uint8Array(p1.length + p2.length);
  blob.set(p1, 0);
  blob.set(p2, p1.length);
  return blob;
}

/**
 * Build the CRR wire packets actually sent over the serial port (transport header
 * stripped). Prefer {@link buildLabviewSaveWireBlob} for TX — send as one atomic write.
 */
export function buildLabviewSavePackets(patch?: LabviewSaveConfigPatch | CrrSettingsConfig): LabviewSavePackets {
  if (patch && 'slots' in patch) {
    return buildCrrSettingsWirePackets(patch);
  }
  const { p1, p2 } = buildLabviewSaveFullPackets(patch);
  return {
    p1: toCrrWireSavePacket(p1),
    p2: toCrrWireSavePacket(p2),
  };
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
  const isWire = bytes.length < LABVIEW_SAVE_P1_SIZE - 8;
  const wireTag = isWire ? ' wire' : '';
  if (which === 'P1') {
    const chOff = isWire ? 0x37 - LABVIEW_SAVE_TRANSPORT_HEADER_SIZE : 0x37;
    const ch = bytes[chOff];
    const pwr = bytes[chOff + 1];
    return `Save P1 config${wireTag} | ${bytes.length} B | Ch=${ch} PwrIdx=${pwr} | opcode 0x${LABVIEW_SAVE_P1_OPCODE.toString(16)}`;
  }
  const chk = bytes[bytes.length - 3];
  const term = bytes[bytes.length - 2];
  return `Save P2 commit${wireTag} | ${bytes.length} B | chk=0x${chk.toString(16).toUpperCase()} term=0x${term.toString(16).toUpperCase()} | opcode 0x${LABVIEW_SAVE_P2_OPCODE.toString(16)}`;
}
