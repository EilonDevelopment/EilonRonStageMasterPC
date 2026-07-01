/**
 * CRR USB serial framing — extract 15-byte weight frames from the COM stream.
 *
 * USB frame (15 B): `FF A5` + 11-byte G4 payload + `0E FF`.
 * Bytes after `A5` are G4 data (flags, LC ID, weight) — not a fixed `F7 04` header.
 */
import {
  g4ChecksumValid,
  g4PacketStartsAtA5,
  g4SliceFromUsbFrame,
} from './crrUsbWeight';
import { crrUsbRuntime } from './crrUsbRuntime';

export const CRR_USB_FRAME_LENGTH = 15;
export const CRR_USB_G4_FRAME_LENGTH = 15;
export const G4_PACKET_LENGTH = 11;
export const BLE_PACKET_LENGTH = 11;

const SYNC_FF = 0xff;
const SYNC_A5 = 0xa5;
/** Legacy weight path only (F7 08 … EF EF FF) — not the G4 `0E FF` footer. */
const MSG_WEIGHT = 0xf7;
const SUBTYPE_WEIGHT_LEGACY = 0x08;
const MARKER_W = 0x57;
const LEGACY_FOOTER = [0xef, 0xef, 0xff] as const;

const MAX_BUFFER_BYTES = 16_384;
const MAX_FRAMES_PER_CHUNK = 512;

export type LcIdResolver = (decodedId: number) => number | null;
export type CrrFramerBatchComplete = () => void;
export type CrrFrameHandler = (frame: Uint8Array) => void;

function hasG4UsbFooter(frame: ArrayLike<number>): boolean {
  const n = frame.length;
  if (n < G4_PACKET_LENGTH + 2) return false;
  if (frame[n - 1] === 0xff && frame[n - 2] === 0x0e) return true;
  if (frame[n - 1] === 0xff && frame[n - 2] === 0xff) return true;
  return false;
}

function isFfA5UsbSync(frame: ArrayLike<number>, offset = 0): boolean {
  return frame[offset] === SYNC_FF && frame[offset + 1] === SYNC_A5;
}

function isA5G4Sync(frame: ArrayLike<number>, offset = 0): boolean {
  return frame[offset] === SYNC_A5;
}

function isValidG4Usb15Frame(frame: ArrayLike<number>): boolean {
  if (frame.length !== CRR_USB_FRAME_LENGTH) return false;
  if (!isFfA5UsbSync(frame, 0)) return false;
  if (!hasG4UsbFooter(frame)) return false;
  const g4 = g4SliceFromUsbFrame(frame);
  return !!g4 && g4PacketStartsAtA5(g4) && g4ChecksumValid(g4);
}

function isValidG4Usb13Frame(frame: ArrayLike<number>): boolean {
  if (frame.length !== 13) return false;
  if (!isA5G4Sync(frame, 0)) return false;
  if (frame[10] !== 0x0e || frame[11] !== 0xff) return false;
  const g4 = g4SliceFromUsbFrame(frame);
  return !!g4 && g4PacketStartsAtA5(g4) && g4ChecksumValid(g4);
}

/** @deprecated Use {@link isFfA5UsbSync}. Old code wrongly required USB[2..3] === F7 04. */
function isCrrWeightStreamHeader(frame: ArrayLike<number>, offset = 0): boolean {
  return isFfA5UsbSync(frame, offset);
}

/** @deprecated Use {@link isA5G4Sync}. */
function isA5CrrWeightStreamHeader(frame: ArrayLike<number>, offset = 0): boolean {
  return isA5G4Sync(frame, offset);
}

/** Valid CRR USB G4 weight frame: FF A5 sync + G4 checksum + footer. */
export function isCrrG4UsbWeightFrame(frame: ArrayLike<number>): boolean {
  return isValidG4Usb15Frame(frame) || isValidG4Usb13Frame(frame);
}

/** @deprecated alias */
export function isCrrG5UsbFrame(frame: ArrayLike<number>): boolean {
  return isCrrG4UsbWeightFrame(frame);
}

/** @deprecated alias */
export function isCrrG4BcdUsbFrame(frame: ArrayLike<number>): boolean {
  return isCrrG4UsbWeightFrame(frame);
}

/** @deprecated alias */
export function isValidG4CrrUsbFrame(frame: ArrayLike<number>): boolean {
  return isCrrG4UsbWeightFrame(frame);
}

export function isRecognizedG4CrrUsbFrame(frame: ArrayLike<number>): boolean {
  return isCrrG4UsbWeightFrame(frame);
}

/** @deprecated alias */
export function isFfA5V4At(buffer: ArrayLike<number>, offset = 0): boolean {
  return isFfA5UsbSync(buffer, offset);
}

/** @deprecated alias */
export function isA5V4At(buffer: ArrayLike<number>, offset = 0): boolean {
  return isA5G4Sync(buffer, offset);
}

export class CrrPacketFramer {
  private buffer: number[] = [];

  constructor(
    private readonly onFrame: CrrFrameHandler,
    private readonly resolveLcId: LcIdResolver,
    private readonly onBatchComplete?: CrrFramerBatchComplete
  ) {}

  getBufferLength(): number {
    return this.buffer.length;
  }

  push(chunk: Uint8Array): void {
    for (let i = 0; i < chunk.length; i += 1) {
      this.buffer.push(chunk[i]);
    }
    if (this.buffer.length > MAX_BUFFER_BYTES) {
      this.buffer = this.buffer.slice(-256);
    }

    let frames = 0;
    while (frames < MAX_FRAMES_PER_CHUNK) {
      const extracted = this.tryExtractFrame();
      if (!extracted) break;
      crrUsbRuntime.stats.framerCandidates += 1;
      this.onFrame(extracted);
      frames += 1;
    }
    this.onBatchComplete?.();
  }

  reset(): void {
    this.buffer = [];
  }

  private slideBufferToNextSync(): void {
    for (let i = 1; i < this.buffer.length - 1; i += 1) {
      if (isFfA5UsbSync(this.buffer, i)) {
        this.buffer = this.buffer.slice(i);
        return;
      }
      if (isA5G4Sync(this.buffer, i)) {
        this.buffer = this.buffer.slice(i);
        return;
      }
    }
    if (this.buffer.length > 14) {
      this.buffer = this.buffer.slice(-14);
    }
  }

  private tryExtractFrame(): Uint8Array | null {
    let scanPos = 0;

    while (scanPos <= this.buffer.length - CRR_USB_FRAME_LENGTH) {
      if (isFfA5UsbSync(this.buffer, scanPos)) {
        const frame = new Uint8Array(this.buffer.slice(scanPos, scanPos + CRR_USB_FRAME_LENGTH));
        if (isValidG4Usb15Frame(frame)) {
          this.buffer = this.buffer.slice(scanPos + CRR_USB_FRAME_LENGTH);
          return frame;
        }
      }

      if (isA5G4Sync(this.buffer, scanPos) && this.buffer.length - scanPos >= 13) {
        const frame = new Uint8Array(this.buffer.slice(scanPos, scanPos + 13));
        if (isValidG4Usb13Frame(frame)) {
          this.buffer = this.buffer.slice(scanPos + 13);
          return frame;
        }
      }

      if (
        this.buffer[scanPos] === SYNC_FF
        && this.buffer[scanPos + 1] === SYNC_A5
        && this.buffer[scanPos + 2] === MSG_WEIGHT
        && this.buffer[scanPos + 3] === SUBTYPE_WEIGHT_LEGACY
      ) {
        const frame = new Uint8Array(this.buffer.slice(scanPos, scanPos + CRR_USB_FRAME_LENGTH));
        if (
          frame[4] === MARKER_W
          && frame[12] === LEGACY_FOOTER[0]
          && frame[13] === LEGACY_FOOTER[1]
          && frame[14] === LEGACY_FOOTER[2]
        ) {
          this.buffer = this.buffer.slice(scanPos + CRR_USB_FRAME_LENGTH);
          return frame;
        }
      }

      scanPos += 1;
    }

    this.slideBufferToNextSync();
    return null;
  }
}

/** @deprecated USB CRR uses {@link CrrPacketFramer}. */
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
