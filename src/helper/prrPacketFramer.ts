/**
 * CRR USB serial framing → 11-byte BLE payload for bt_parse.
 *
 * CRR streams G-5-class cells in a PRR envelope (CraneMaster `eilon_protocol.dart` G-5):
 *   FF A5 F7 04 [id_lo] 80 00 00 04 [w_hi] [w_lo] [seq] [seq2] [tail1] [tail2]   (15 bytes)
 *
 * `F7` = weight stream, `04` = CRR subtype (not BLE G-4). Bytes 5–6 pivot 0x8000, 7–8 anchor
 * tail (usually `00 04`), wire uint16 BE @ 9–10. G-5 raw = wire − (0x4380 + bytes7–8); kg = raw/10.
 * Footer: `0E FF` or `FF FF` (bytes 13–14).
 *
 * Legacy BCD: FF A5 F7 08 57 … EF EF FF  (15 bytes)
 */
import {
  crrUsbG5SignedRawFromFrame,
  crrUsbWireU16,
  g5SignedRawToWeightBytes,
} from './crrUsbWeight';

export const CRR_USB_FRAME_LENGTH = 15;
export const CRR_USB_G4_FRAME_LENGTH = 15;
export const CRR_USB_FF_V4_FRAME_LENGTH = 14;
export const BLE_PACKET_LENGTH = 11;

const SYNC_A5 = 0xa5;
const SYNC_FF = 0xff;
const MSG_WEIGHT = 0xf7;
/** CRR USB stream subtype (G-5 cells); bt_parse packet type uses 0 = G-5 weight. */
const CRR_STREAM_SUBTYPE_G5 = 0x04;
const SUBTYPE_G5_WEIGHT = 0;
const SUBTYPE_WEIGHT_LEGACY = 0x08;
const MARKER_W = 0x57;
const G4_MARKER_BYTE = 0x04;
const LEGACY_FOOTER = [0xef, 0xef, 0xff] as const;

const MAX_BUFFER_BYTES = 16_384;
const MAX_FRAMES_PER_CHUNK = 64;

export type LcIdResolver = (idLowByte: number) => number | null;

function bcdByte(value: number): number | null {
  const hi = (value >> 4) & 0x0f;
  const lo = value & 0x0f;
  if (hi > 9 || lo > 9) return null;
  return hi * 10 + lo;
}

function lcIdFromBcdBytes(hiByte: number, loByte: number): number | null {
  const hi = bcdByte(hiByte);
  const lo = bcdByte(loByte);
  if (hi === null || lo === null) return null;
  return hi * 100 + lo;
}

function isFfA5G5At(buffer: ArrayLike<number>, offset = 0): boolean {
  return (
    buffer[offset] === SYNC_FF
    && buffer[offset + 1] === SYNC_A5
    && buffer[offset + 2] === MSG_WEIGHT
    && buffer[offset + 3] === CRR_STREAM_SUBTYPE_G5
  );
}

function isA5G5At(buffer: ArrayLike<number>, offset = 0): boolean {
  return (
    buffer[offset] === SYNC_A5
    && buffer[offset + 1] === MSG_WEIGHT
    && buffer[offset + 2] === CRR_STREAM_SUBTYPE_G5
  );
}

/** @deprecated alias */
export function isFfA5V4At(buffer: ArrayLike<number>, offset = 0): boolean {
  return isFfA5G5At(buffer, offset);
}

/** @deprecated alias */
export function isA5V4At(buffer: ArrayLike<number>, offset = 0): boolean {
  return isA5G5At(buffer, offset);
}

/** 15-byte CRR USB G-5 frame with `0E FF` or `FF FF` tail. */
export function isValidG4CrrUsbFrame(frame: ArrayLike<number>): boolean {
  if (frame.length !== CRR_USB_G4_FRAME_LENGTH) return false;
  if (!isFfA5G5At(frame, 0)) return false;
  if (frame[8] !== G4_MARKER_BYTE) return false;
  const tail0E = frame[13] === 0x0e && frame[14] === 0xff;
  const tailFF = frame[13] === 0xff && frame[14] === 0xff;
  return tail0E || tailFF;
}

function isLegacyFooter(frame: ArrayLike<number>): boolean {
  return (
    frame[12] === LEGACY_FOOTER[0]
    && frame[13] === LEGACY_FOOTER[1]
    && frame[14] === LEGACY_FOOTER[2]
  );
}

function toBlePacket(type: number, lcId: number, weightBytes: Uint8Array, battery = 100): Uint8Array {
  return new Uint8Array([
    0,
    0,
    type & 0xff,
    (lcId >> 16) & 0xff,
    (lcId >> 8) & 0xff,
    lcId & 0xff,
    weightBytes[0] & 0xff,
    weightBytes[1] & 0xff,
    weightBytes[2] & 0xff,
    weightBytes[3] & 0xff,
    battery & 0xff,
  ]);
}

/** Stash wire u16 in bytes 0–1 for USB debug. */
function toCrrG5BlePacket(
  lcId: number,
  signedRaw: number,
  wireU16: number,
  battery = 100
): Uint8Array {
  const weightBytes = g5SignedRawToWeightBytes(signedRaw);
  const wire = wireU16 & 0xffff;
  return new Uint8Array([
    (wire >> 8) & 0xff,
    wire & 0xff,
    SUBTYPE_G5_WEIGHT & 0xff,
    (lcId >> 16) & 0xff,
    (lcId >> 8) & 0xff,
    lcId & 0xff,
    weightBytes[0] & 0xff,
    weightBytes[1] & 0xff,
    weightBytes[2] & 0xff,
    weightBytes[3] & 0xff,
    battery & 0xff,
  ]);
}

function parseG5WeightFrame(
  frame: Uint8Array,
  idOffset: number,
  wireOffset: number,
  resolveLcId: LcIdResolver
): Uint8Array | null {
  if (wireOffset + 1 >= frame.length) return null;
  const lcId = resolveLcId(frame[idOffset]);
  if (lcId === null || lcId <= 0) return null;
  const signedRaw = crrUsbG5SignedRawFromFrame(frame, wireOffset);
  const wire = crrUsbWireU16(frame, wireOffset);
  return toCrrG5BlePacket(lcId, signedRaw, wire);
}

/** Convert CRR weight frame to bt_parse layout. */
export function crrWeightFrameToBlePacket(
  frame: Uint8Array,
  resolveLcId: LcIdResolver
): Uint8Array | null {
  if (isFfA5G5At(frame, 0)) {
    if (!isValidG4CrrUsbFrame(frame)) return null;
    return parseG5WeightFrame(frame, 4, 9, resolveLcId);
  }

  if (frame.length === CRR_USB_FRAME_LENGTH && isA5G5At(frame, 0)) {
    return parseG5WeightFrame(frame, 3, 8, resolveLcId);
  }

  if (
    frame.length === CRR_USB_FRAME_LENGTH
    && frame[0] === SYNC_FF
    && frame[1] === SYNC_A5
    && frame[2] === MSG_WEIGHT
    && frame[3] === SUBTYPE_WEIGHT_LEGACY
    && frame[4] === MARKER_W
    && isLegacyFooter(frame)
  ) {
    const lcId = lcIdFromBcdBytes(frame[7], frame[8]);
    if (lcId === null || lcId <= 0) return null;
    const weightRaw = (frame[9] << 8) | frame[10];
    const weightBytes = g5SignedRawToWeightBytes(weightRaw);
    return toBlePacket(SUBTYPE_WEIGHT_LEGACY, lcId, weightBytes);
  }

  return null;
}

export class CrrPacketFramer {
  private buffer: number[] = [];

  constructor(
    private readonly onPacket: (packet: Uint8Array) => void,
    private readonly resolveLcId: LcIdResolver
  ) {}

  push(chunk: Uint8Array): void {
    for (let i = 0; i < chunk.length; i += 1) {
      this.buffer.push(chunk[i]);
    }
    if (this.buffer.length > MAX_BUFFER_BYTES) {
      this.buffer = this.buffer.slice(-64);
    }

    let frames = 0;
    while (frames < MAX_FRAMES_PER_CHUNK) {
      const extracted = this.tryExtractFrame();
      if (!extracted) break;
      const ble = crrWeightFrameToBlePacket(extracted, this.resolveLcId);
      if (ble) {
        this.onPacket(ble);
      }
      frames += 1;
    }
  }

  reset(): void {
    this.buffer = [];
  }

  private findNextSync(): number {
    for (let i = 0; i < this.buffer.length - 3; i += 1) {
      if (isFfA5G5At(this.buffer, i) || isA5G5At(this.buffer, i)) {
        return i;
      }
    }
    if (this.buffer.length >= 3 && isA5G5At(this.buffer, this.buffer.length - 3)) {
      return this.buffer.length - 3;
    }
    return -1;
  }

  private tryExtractFrame(): Uint8Array | null {
    while (this.buffer.length >= CRR_USB_G4_FRAME_LENGTH) {
      const syncAt = this.findNextSync();
      if (syncAt < 0) {
        this.buffer = this.buffer.slice(-3);
        return null;
      }
      if (syncAt > 0) {
        this.buffer = this.buffer.slice(syncAt);
      }

      if (isFfA5G5At(this.buffer, 0)) {
        if (this.buffer.length < CRR_USB_G4_FRAME_LENGTH) return null;
        const frame = new Uint8Array(this.buffer.slice(0, CRR_USB_G4_FRAME_LENGTH));
        if (!isValidG4CrrUsbFrame(frame)) {
          this.buffer = this.buffer.slice(1);
          continue;
        }
        this.buffer = this.buffer.slice(CRR_USB_G4_FRAME_LENGTH);
        return frame;
      }

      if (isA5G5At(this.buffer, 0)) {
        if (this.buffer.length < CRR_USB_G4_FRAME_LENGTH) return null;
        const frame = new Uint8Array(this.buffer.slice(0, CRR_USB_G4_FRAME_LENGTH));
        const tail0E = frame[12] === 0x0e && frame[13] === 0xff;
        const tailFF = frame[12] === 0xff && frame[13] === 0xff;
        if (!tail0E && !tailFF) {
          this.buffer = this.buffer.slice(1);
          continue;
        }
        this.buffer = this.buffer.slice(CRR_USB_G4_FRAME_LENGTH);
        return frame;
      }

      if (
        this.buffer.length >= CRR_USB_FRAME_LENGTH
        && this.buffer[0] === SYNC_FF
        && this.buffer[1] === SYNC_A5
        && this.buffer[2] === MSG_WEIGHT
        && this.buffer[3] === SUBTYPE_WEIGHT_LEGACY
      ) {
        const frame = new Uint8Array(this.buffer.slice(0, CRR_USB_FRAME_LENGTH));
        if (isLegacyFooter(frame)) {
          this.buffer = this.buffer.slice(CRR_USB_FRAME_LENGTH);
          return frame;
        }
      }

      this.buffer = this.buffer.slice(1);
    }
    return null;
  }
}

/** @deprecated USB CRR uses {@link CrrPacketFramer}; kept for reference/tests. */
export const PRR_USB_PACKET_LENGTH = BLE_PACKET_LENGTH;

/** @deprecated USB CRR uses {@link CrrPacketFramer}. */
export class PrrPacketFramer {
  private buffer: number[] = [];

  constructor(
    private readonly packetLength: number,
    private readonly onPacket: (packet: Uint8Array) => void
  ) {}

  push(chunk: Uint8Array): void {
    for (let i = 0; i < chunk.length; i += 1) {
      this.buffer.push(chunk[i]);
    }
    while (this.buffer.length >= this.packetLength) {
      const packet = new Uint8Array(this.buffer.splice(0, this.packetLength));
      this.onPacket(packet);
    }
  }

  reset(): void {
    this.buffer = [];
  }
}
