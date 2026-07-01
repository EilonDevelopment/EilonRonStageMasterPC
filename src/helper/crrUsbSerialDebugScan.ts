/**
 * Serial Debug: surface IDN_ identify strings and non-valid FF A5 windows.
 */
import { CRR_IDENTITY_RESPONSE, bytesToAscii, formatCrrIdnScanLabel } from './crrProtocol';
import { CRR_USB_FRAME_LENGTH, isCrrG4UsbWeightFrame } from './prrPacketFramer';
import {
  g4ChecksumValid,
  g4DecodeLcId,
  g4PacketStartsAtA5,
  g4SliceFromUsbFrame,
} from './crrUsbWeight';
import { frameBytesToHex } from './crrUsbSerialDebug';

export type SerialDebugScanEvent =
  | { kind: 'idn'; text: string }
  | { kind: 'ff_a5_candidate'; text: string };

const MAX_SCAN_BUFFER = 4096;
const OVERLAP = CRR_USB_FRAME_LENGTH;

function ffA5RejectReason(frame: Uint8Array): string {
  if (frame.length === 15) {
    if (frame[13] !== 0x0e || frame[14] !== 0xff) {
      return `footer ${frame[13].toString(16).padStart(2, '0')} ${frame[14].toString(16).padStart(2, '0')} (expected 0E FF)`;
    }
    const g4 = g4SliceFromUsbFrame(frame);
    if (!g4 || !g4PacketStartsAtA5(g4)) return 'no G4 slice';
    if (!g4ChecksumValid(g4)) return `checksum fail (got ${g4[9].toString(16).padStart(2, '0').toUpperCase()})`;
    return 'not accepted as G4 weight frame';
  }
  if (frame.length === 13) {
    if (frame[10] !== 0x0e || frame[11] !== 0xff) {
      return `footer ${frame[10].toString(16).padStart(2, '0')} ${frame[11].toString(16).padStart(2, '0')} (expected 0E FF)`;
    }
    const g4 = g4SliceFromUsbFrame(frame);
    if (!g4 || !g4PacketStartsAtA5(g4)) return 'no G4 slice';
    if (!g4ChecksumValid(g4)) return `checksum fail (got ${g4[9].toString(16).padStart(2, '0').toUpperCase()})`;
    return 'not accepted as G4 weight frame';
  }
  return 'unknown';
}

function optionalLcIdLabel(frame: Uint8Array): string {
  const g4 = g4SliceFromUsbFrame(frame);
  if (!g4 || !g4PacketStartsAtA5(g4)) return '';
  const id = g4DecodeLcId(g4);
  return id > 0 ? ` | ID ${id}?` : '';
}

export class SerialDebugRxScanner {
  private buffer: number[] = [];

  private readonly loggedKeys = new Set<string>();

  reset(): void {
    this.buffer = [];
    this.loggedKeys.clear();
  }

  push(chunk: Uint8Array, portPath: string): SerialDebugScanEvent[] {
    const events: SerialDebugScanEvent[] = [];
    for (let i = 0; i < chunk.length; i += 1) {
      this.buffer.push(chunk[i]);
    }
    if (this.buffer.length > MAX_SCAN_BUFFER) {
      this.buffer = this.buffer.slice(-512);
      this.loggedKeys.clear();
    }

    events.push(...this.scanIdentity(portPath));
    events.push(...this.scanFfA5Candidates(portPath));

    return events;
  }

  private scanIdentity(portPath: string): SerialDebugScanEvent[] {
    const merged = new Uint8Array(this.buffer);
    const ascii = bytesToAscii(merged);
    const asciiUpper = ascii.toUpperCase();
    const events: SerialDebugScanEvent[] = [];
    let searchFrom = 0;

    while (searchFrom < asciiUpper.length) {
      const idx = asciiUpper.indexOf('IDN_', searchFrom);
      if (idx < 0) break;

      const key = `idn:${idx}:${ascii.slice(idx, idx + 12)}`;
      if (!this.loggedKeys.has(key)) {
        this.loggedKeys.add(key);
        const hexStart = Math.max(0, idx - 12);
        const hexEnd = Math.min(merged.length, idx + 32);
        const snippet = merged.slice(hexStart, hexEnd);
        const asciiSnippet = bytesToAscii(snippet).replace(/\./g, '·');
        const idnSlice = ascii.slice(idx, Math.min(ascii.length, idx + 8));
        const label = formatCrrIdnScanLabel(idnSlice);
        events.push({
          kind: 'idn',
          text: `[${portPath}] ${label} | context HEX ${frameBytesToHex(snippet)} | ${asciiSnippet}`,
        });
      }

      searchFrom = idx + 4;
      if (idx + 8 <= this.buffer.length) {
        this.buffer = this.buffer.slice(Math.min(this.buffer.length, idx + 8));
        break;
      }
    }

    return events;
  }

  private scanFfA5Candidates(portPath: string): SerialDebugScanEvent[] {
    const events: SerialDebugScanEvent[] = [];
    const scanFrom = Math.max(0, this.buffer.length - OVERLAP - 64);

    for (let i = scanFrom; i <= this.buffer.length - CRR_USB_FRAME_LENGTH; i += 1) {
      if (this.buffer[i] !== 0xff || this.buffer[i + 1] !== 0xa5) continue;

      const frame = new Uint8Array(this.buffer.slice(i, i + CRR_USB_FRAME_LENGTH));
      if (isCrrG4UsbWeightFrame(frame)) continue;

      const hex = frameBytesToHex(frame);
      const key = `ff15:${hex}`;
      if (this.loggedKeys.has(key)) continue;
      this.loggedKeys.add(key);

      events.push({
        kind: 'ff_a5_candidate',
        text: `[${portPath}] FF A5 candidate (15 B) | HEX ${hex}${optionalLcIdLabel(frame)} | ${ffA5RejectReason(frame)}`,
      });
    }

    for (let i = scanFrom; i <= this.buffer.length - 13; i += 1) {
      if (this.buffer[i] !== 0xa5) continue;
      if (i > 0 && this.buffer[i - 1] === 0xff) continue;

      const frame = new Uint8Array(this.buffer.slice(i, i + 13));
      if (isCrrG4UsbWeightFrame(frame)) continue;

      const hex = frameBytesToHex(frame);
      const key = `ff13:${hex}`;
      if (this.loggedKeys.has(key)) continue;
      this.loggedKeys.add(key);

      events.push({
        kind: 'ff_a5_candidate',
        text: `[${portPath}] A5 candidate (13 B) | HEX ${hex}${optionalLcIdLabel(frame)} | ${ffA5RejectReason(frame)}`,
      });
    }

    return events;
  }
}
