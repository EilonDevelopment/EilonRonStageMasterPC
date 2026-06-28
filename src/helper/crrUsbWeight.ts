/**
 * CRR USB weight decode — G4 5-byte fixed-point (`G4_Tx Protocol.doc`).
 *
 * USB frame: `FF A5 F7 04 … 0E FF` (15 bytes).
 * - [0]=FF start, [1]=A5 G4, [2]=F7 flags/units, [3-4]=ID
 * - [5-9]=weight BE (byte 5 most significant); bit7 of byte 5 = sign (1 negative)
 * - [10]=checksum (nibble sum of G4 bytes [0..8])
 */

export const G4_UNIT_N_TON = 0x01;
export const G4_UNIT_DEC_N = 0x02;
export const G4_UNIT_K_NTON = 0x03;
export const G4_UNIT_LBS = 0x04;
export const G4_UNIT_LBS_X10 = 0x05;
export const G4_UNIT_S_TON = 0x06;
export const G4_UNIT_MTON = 0x07;
export const G4_UNIT_KG = 0x0a;

const G4_BATTERY_PERCENT: Record<number, number> = {
  1: 0,
  5: 10,
  7: 20,
  9: 40,
  11: 60,
  13: 80,
  15: 100,
};

export function g4PacketStartsAtA5(g4: ArrayLike<number>): boolean {
  return g4.length >= 11 && g4[0] === 0xa5;
}

export function g4SliceFromUsbFrame(frame: ArrayLike<number>): Uint8Array | null {
  if (frame.length >= 12 && frame[0] === 0xff && frame[1] === 0xa5) {
    return new Uint8Array(Array.from(frame).slice(1, 12));
  }
  if (frame.length >= 11 && frame[0] === 0xa5) {
    return new Uint8Array(Array.from(frame).slice(0, 11));
  }
  return null;
}

export function g4FlagsByte(g4: ArrayLike<number>): number {
  return g4[1] & 0xff;
}

export function g4UnitsCode(g4: ArrayLike<number>): number {
  return g4FlagsByte(g4) & 0x0f;
}

export function g4BatteryCode(g4: ArrayLike<number>): number {
  return (g4FlagsByte(g4) >> 4) & 0x0f;
}

export function g4BatteryPercent(g4: ArrayLike<number>): number {
  return G4_BATTERY_PERCENT[g4BatteryCode(g4)] ?? 100;
}

/** ID decode: ID[3]=(ID&0x7f), ID>>=7; ID[2]=(ID&0x7f). */
export function g4DecodeLcId(g4: ArrayLike<number>): number {
  const low = g4[3] & 0x7f;
  const high = g4[2] & 0x7f;
  return low | (high << 7);
}

/** 5-byte weight in G4 packet [4..8] (USB bytes [5..9]): BE magnitude, sign in bit7 of [4]. */
export function g4DecodeWeightSignedRaw(g4: ArrayLike<number>): number | null {
  if (g4.length < 9) return null;
  const negative = (g4[4] & 0x80) !== 0;
  let magnitude = 0;
  for (let i = 4; i <= 8; i += 1) {
    const byte = i === 4 ? g4[i] & 0x7f : g4[i] & 0xff;
    magnitude = magnitude * 256 + byte;
  }
  return negative ? -magnitude : magnitude;
}

function g4SignedRawToValueInUnits(signedRaw: number, unitsCode: number): number {
  switch (unitsCode) {
    case G4_UNIT_MTON:
    case G4_UNIT_N_TON:
    case G4_UNIT_K_NTON:
    case G4_UNIT_S_TON:
    case G4_UNIT_DEC_N:
      return signedRaw / 10000;
    case G4_UNIT_KG:
    case G4_UNIT_LBS:
      return signedRaw / 10;
    case G4_UNIT_LBS_X10:
      return signedRaw / 100;
    default:
      return signedRaw / 10000;
  }
}

/** Weight in payload units (M.TON when units code = 7). */
export function g4DecodeWeightInUnits(g4: ArrayLike<number>): number | null {
  const signedRaw = g4DecodeWeightSignedRaw(g4);
  if (signedRaw === null) return null;
  return g4SignedRawToValueInUnits(signedRaw, g4UnitsCode(g4));
}

/** Ch.Sum = 0xFF − Σ(nibble_lo + nibble_hi) for bytes [0..8]. */
export function g4ChecksumValid(g4: ArrayLike<number>): boolean {
  if (g4.length < 10) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += (g4[i] & 0x0f) + ((g4[i] >> 4) & 0x0f);
  }
  return ((0xff - sum) & 0xff) === (g4[9] & 0xff);
}

/** Convert G4 payload units → M.TON for `bt_parse` (bytes 6–9 ÷ 10000). */
export function g4WeightToMton(valueInUnits: number, unitsCode: number): number {
  switch (unitsCode) {
    case G4_UNIT_MTON:
    case G4_UNIT_N_TON:
    case G4_UNIT_K_NTON:
    case G4_UNIT_S_TON:
      return valueInUnits;
    case G4_UNIT_KG:
      return valueInUnits / 1000;
    case G4_UNIT_LBS:
      return valueInUnits / 2204.62;
    case G4_UNIT_LBS_X10:
      return (valueInUnits / 10) / 2204.62;
    case G4_UNIT_DEC_N:
      return valueInUnits / 10;
    default:
      return valueInUnits;
  }
}

/** Pack M.TON × 10000 into bt_parse bytes 6–9. */
export function g4MtonToWeightBytes(mton: number): Uint8Array {
  const raw = Math.round(mton * 10000) | 0;
  return new Uint8Array([
    (raw >> 24) & 0xff,
    (raw >> 16) & 0xff,
    (raw >> 8) & 0xff,
    raw & 0xff,
  ]);
}

/** Pack signed G4 raw into bt_parse bytes 6–9 (hexToInt signed / 10000 → M.TON). */
export function g4SignedRawToWeightBytes(signedRaw: number): Uint8Array {
  const w = signedRaw | 0;
  return new Uint8Array([(w >> 24) & 0xff, (w >> 16) & 0xff, (w >> 8) & 0xff, w & 0xff]);
}

export type CrrUsbDecodedWeight = {
  mton: number;
  valueInUnits: number;
  signedRaw: number;
  encoding: 'g4-fixed';
};

/** Decode CRR USB 15-byte weight frame → M.TON for Monitor. */
export function crrUsbDecodeWeightFromFrame(frame: ArrayLike<number>): CrrUsbDecodedWeight | null {
  const g4 = g4SliceFromUsbFrame(frame);
  if (!g4 || !g4PacketStartsAtA5(g4) || !g4ChecksumValid(g4)) return null;

  const signedRaw = g4DecodeWeightSignedRaw(g4);
  if (signedRaw === null) return null;

  const units = g4UnitsCode(g4);
  const valueInUnits = g4SignedRawToValueInUnits(signedRaw, units);
  return {
    mton: g4WeightToMton(valueInUnits, units),
    valueInUnits,
    signedRaw,
    encoding: 'g4-fixed',
  };
}
