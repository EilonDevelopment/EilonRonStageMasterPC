/**
 * CRR USB weight → G-5 (EilonCraneMaster `eilon_protocol.dart` readData, message[1]==0x5A).
 *
 * CRR envelope `FF A5 F7 04` is NOT the 11-byte BLE G-4 packet. It wraps G-5-class cells:
 *   [5..6] pivot 0x8000 (80 00), [7..8] anchor tail (usually 00 04),
 *   [9..10] wire uint16 BE.
 *
 * G-5 signed raw (kg = raw / 10, same as `eilon_protocol_codec.cpp`):
 *   raw = wire − (0x4380 + ((byte7 << 8) | byte8))
 *
 * Example wire 0x41B8, anchor 0x4384 → raw −460 → −46.0 kg (matches CraneMaster).
 */

export const CRR_G5_ANCHOR_BASE = 0x4380;

export function crrUsbWeightAnchorU16(frame: ArrayLike<number>): number {
  const tail = ((frame[7] & 0xff) << 8) | (frame[8] & 0xff);
  return (CRR_G5_ANCHOR_BASE + tail) & 0xffff;
}

export function crrUsbWireU16(frame: ArrayLike<number>, wireOffset = 9): number {
  return (((frame[wireOffset] & 0xff) << 8) | (frame[wireOffset + 1] & 0xff)) & 0xffff;
}

/** G-5 signed raw (÷10 → kg, ÷10000 → M.TON in bt_parse). */
export function crrUsbG5SignedRawFromFrame(frame: ArrayLike<number>, wireOffset = 9): number {
  const wire = crrUsbWireU16(frame, wireOffset);
  const anchor = crrUsbWeightAnchorU16(frame);
  return wire - anchor;
}

export function crrUsbG5WeightKgFromFrame(frame: ArrayLike<number>, wireOffset = 9): number {
  return crrUsbG5SignedRawFromFrame(frame, wireOffset) / 10;
}

/** Pack signed G-5 raw into bt_parse bytes 6–9 (hexToInt signed / 10000 → M.TON). */
export function g5SignedRawToWeightBytes(signedRaw: number): Uint8Array {
  const w = signedRaw | 0;
  return new Uint8Array([(w >> 24) & 0xff, (w >> 16) & 0xff, (w >> 8) & 0xff, w & 0xff]);
}
