/**
 * CRR USB serial framing → 11-byte BLE payload for bt_parse.
 *
 * Observed CRR weight frames (no leading 0xFF):
 *   A5 F7 04 [id_lo] 00 00 00 04 [w_hi] [w_lo] ?? ?? 0E FF FF  (15 bytes)
 *
 * Legacy frames (optional):
 *   FF A5 F7 08 57 … EF EF FF  (15 bytes, BCD cell id)
 */
export const CRR_USB_FRAME_LENGTH = 15;
export const BLE_PACKET_LENGTH = 11;

const SYNC_A5 = 0xa5;
const SYNC_FF = 0xff;
const MSG_WEIGHT = 0xf7;
const SUBTYPE_WEIGHT_V4 = 0x04;
const SUBTYPE_WEIGHT_LEGACY = 0x08;
const MARKER_W = 0x57;
const LEGACY_FOOTER = [0xef, 0xef, 0xff] as const;
const FOOTER_FF = [0xff, 0xff] as const;

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

function isFooterFf(frame: ArrayLike<number>): boolean {
  const len = frame.length;
  return frame[len - 2] === FOOTER_FF[0] && frame[len - 1] === FOOTER_FF[1];
}

function isLegacyFooter(frame: ArrayLike<number>): boolean {
  return (
    frame[12] === LEGACY_FOOTER[0]
    && frame[13] === LEGACY_FOOTER[1]
    && frame[14] === LEGACY_FOOTER[2]
  );
}

function toBlePacket(type: number, lcId: number, weightRaw16: number, battery = 100): Uint8Array {
  const w = weightRaw16 & 0xffff;
  return new Uint8Array([
    0,
    0,
    type & 0xff,
    (lcId >> 16) & 0xff,
    (lcId >> 8) & 0xff,
    lcId & 0xff,
    0,
    0,
    (w >> 8) & 0xff,
    w & 0xff,
    battery & 0xff,
  ]);
}

/** Convert observed A5 F7 04 … FF FF frame to bt_parse layout. */
export function crrWeightFrameToBlePacket(
  frame: Uint8Array,
  resolveLcId: LcIdResolver
): Uint8Array | null {
  if (frame.length !== CRR_USB_FRAME_LENGTH) return null;

  // New format: A5 F7 04 [id_lo] 00 00 00 04 [weight u16 BE] … FF FF
  if (frame[0] === SYNC_A5 && frame[1] === MSG_WEIGHT && frame[2] === SUBTYPE_WEIGHT_V4) {
    if (!isFooterFf(frame)) return null;
    const lcId = resolveLcId(frame[3]);
    if (lcId === null || lcId <= 0) return null;
    const weightRaw = (frame[8] << 8) | frame[9];
    return toBlePacket(SUBTYPE_WEIGHT_V4, lcId, weightRaw);
  }

  // Legacy: FF A5 F7 08 57 … BCD id … EF EF FF
  if (
    frame[0] === SYNC_FF
    && frame[1] === SYNC_A5
    && frame[2] === MSG_WEIGHT
    && frame[3] === SUBTYPE_WEIGHT_LEGACY
    && frame[4] === MARKER_W
    && isLegacyFooter(frame)
  ) {
    const lcId = lcIdFromBcdBytes(frame[7], frame[8]);
    if (lcId === null || lcId <= 0) return null;
    const weightRaw = (frame[9] << 8) | frame[10];
    return toBlePacket(SUBTYPE_WEIGHT_LEGACY, lcId, weightRaw);
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
      this.buffer = this.buffer.slice(-CRR_USB_FRAME_LENGTH * 2);
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

  private tryExtractFrame(): Uint8Array | null {
    while (this.buffer.length >= CRR_USB_FRAME_LENGTH) {
      const startA5 = this.buffer[0] === SYNC_A5 && this.buffer[1] === MSG_WEIGHT;
      const startFf = this.buffer[0] === SYNC_FF && this.buffer[1] === SYNC_A5 && this.buffer[2] === MSG_WEIGHT;

      if (!startA5 && !startFf) {
        const nextA5 = this.buffer.indexOf(SYNC_A5, 1);
        const nextFf = this.buffer.indexOf(SYNC_FF, 1);
        const candidates = [nextA5, nextFf].filter((i) => i > 0);
        if (candidates.length === 0) {
          this.buffer = this.buffer.slice(-1);
          return null;
        }
        this.buffer = this.buffer.slice(Math.min(...candidates));
        continue;
      }

      const frame = new Uint8Array(this.buffer.slice(0, CRR_USB_FRAME_LENGTH));
      const validNew = frame[0] === SYNC_A5 && frame[2] === SUBTYPE_WEIGHT_V4 && isFooterFf(frame);
      const validLegacy = frame[0] === SYNC_FF && frame[3] === SUBTYPE_WEIGHT_LEGACY && isLegacyFooter(frame);

      if (validNew || validLegacy) {
        this.buffer = this.buffer.slice(CRR_USB_FRAME_LENGTH);
        return frame;
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
