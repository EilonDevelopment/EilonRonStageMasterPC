/**
 * Serial Debug: annotate complete CRR USB G4 weight frames.
 */
import { isRecognizedG4CrrUsbFrame } from './prrPacketFramer';
import {
  crrUsbDecodeWeightFromFrame,
  g4ChecksumValid,
  g4DecodeLcId,
  g4PacketStartsAtA5,
  g4SliceFromUsbFrame,
} from './crrUsbWeight';

export function frameBytesToHex(frame: ArrayLike<number>): string {
  return Array.from(frame)
    .map((b) => (b & 0xff).toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function formatWeightKgMton(kg: number, mton: number): string {
  const kgStr = Number.isFinite(kg) ? kg.toFixed(1) : '?';
  const mtonStr = Number.isFinite(mton) ? mton.toFixed(4) : '?';
  return `${kgStr} kg (${mtonStr} M.TON)`;
}

function rejectReason(g4: Uint8Array | null): string {
  if (!g4 || !g4PacketStartsAtA5(g4)) {
    return 'no es trama CRR G4 (FF A5 … 0E FF)';
  }
  if (!g4ChecksumValid(g4)) {
    return 'checksum';
  }
  return 'trama';
}

/** Decode label shown beside a complete 15-byte (or 13-byte A5) CRR weight frame. */
export function annotateCrrUsbWeightFrame(frame: Uint8Array): string {
  const hex = frameBytesToHex(frame);
  const parts: string[] = [`HEX ${hex}`];

  const g4 = g4SliceFromUsbFrame(frame);
  const lcId = g4 && g4PacketStartsAtA5(g4) ? g4DecodeLcId(g4) : null;
  if (lcId != null && lcId > 0) {
    parts.push(`ID ${lcId}`);
  }

  const decoded = crrUsbDecodeWeightFromFrame(frame);
  if (decoded) {
    parts.push(`${formatWeightKgMton(decoded.mton * 1000, decoded.mton)} [G4]`);
  } else if (g4 && g4PacketStartsAtA5(g4) && g4ChecksumValid(g4)) {
    parts.push('no valido (decode)');
  }

  if (!isRecognizedG4CrrUsbFrame(frame)) {
    parts.push(`no valido (${rejectReason(g4)})`);
  }

  return parts.join('  |  ');
}

export function formatCrrUsbFrameRxLog(portPath: string, frame: Uint8Array): string {
  return `[${portPath}] ${frame.length} B | ${annotateCrrUsbWeightFrame(frame)}`;
}
