/** Gross-load safety bands (aligned with CommonLayout BLE threshold checks). */

import type { ILC } from './types';

export type LcGrossLoadBand = 'danger' | 'overload' | 'underload' | 'pre-overload' | 'normal';

export const ZERO_BLOCK_CAPACITY_FRACTION = 0.3;

export type CapacityUnitKey = 'mton' | 'kg' | 'lbs';

export function projectUnitCapacityKey(units: string | undefined): CapacityUnitKey {
  const u = String(units ?? 'kg').replace(/\./g, '').toLowerCase().trim();
  if (u === 'mton' || u === 'kg' || u === 'lbs') return u;
  return 'kg';
}

/** Nominal LC capacity from stored row or ID lookup table (project units). */
export function getLcNominalCapacity(
  lc: Pick<ILC, 'id' | 'capacity'>,
  projectUnits: string | undefined,
  capacityFromIdTable?: Partial<Record<CapacityUnitKey, string | number>> | null | false,
): number {
  const key = projectUnitCapacityKey(projectUnits);
  const fromLc = lc.capacity?.[key];
  let n = parseFloat(String(fromLc ?? ''));
  if (Number.isFinite(n) && n > 0) return n;
  if (capacityFromIdTable && typeof capacityFromIdTable === 'object') {
    n = parseFloat(String(capacityFromIdTable[key] ?? ''));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return Number.NaN;
}

/** Block ZERO when |raw BLE gross| exceeds this fraction of nominal capacity (before zero offset). */
export function isGrossAboveZeroCapacityLimit(grossRaw: number, nominalCapacity: number): boolean {
  if (!Number.isFinite(grossRaw) || !Number.isFinite(nominalCapacity) || nominalCapacity <= 0) return false;
  return Math.abs(grossRaw) > nominalCapacity * ZERO_BLOCK_CAPACITY_FRACTION;
}

/** DB `realval` is stored in M.TON; live BLE buffer uses project display units. */
export function convertStoredRealvalToProjectUnits(
  rawMton: number,
  projectUnits: string | undefined,
  projectToMtonMultiply: number,
): number {
  if (!Number.isFinite(rawMton)) return Number.NaN;
  const units = String(projectUnits ?? 'KG').trim();
  if (units === 'M.TON') return rawMton;
  if (projectToMtonMultiply > 0) return rawMton / projectToMtonMultiply;
  return rawMton;
}

/**
 * Raw sensor load for ZERO guard: BLE `realval` before zero/tare/PSW offsets
 * (overload/danger use display `value` after zero — see getLcGrossLoadBand).
 */
export function getLcGrossWeightForZeroCheck(
  lc: Pick<ILC, 'realval'>,
  live: { realval?: unknown } | null | undefined,
  projectUnits: string | undefined,
  projectToMtonMultiply: number,
): number {
  const liveReal = live != null ? Number(live.realval) : Number.NaN;
  if (Number.isFinite(liveReal)) {
    return liveReal;
  }
  return convertStoredRealvalToProjectUnits(
    Number(lc.realval),
    projectUnits,
    projectToMtonMultiply,
  );
}

export const isLcTransmissionError = (valueRaw: unknown): boolean => {
  const raw = String(valueRaw ?? '').trim();
  return raw === 'Tr.Err' || raw === 'Tr. Err' || Number(valueRaw) === -99999999;
};

/** Overload × (pre_overload% / 100); null when pre-overload warning is disabled. */
export const getPreOverloadThreshold = (
  overloadRaw: unknown,
  preOverloadPctRaw: string | number | null | undefined
): number | null => {
  const pct = Number.parseInt(String(preOverloadPctRaw ?? ''), 10);
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return null;
  const overload = Number(overloadRaw);
  if (!Number.isFinite(overload) || overload <= 0) return null;
  return overload * (pct / 100);
};

export const getLcGrossLoadBand = (
  valueRaw: unknown,
  overloadRaw: unknown,
  underloadRaw: unknown,
  preOverloadPctRaw?: string | number | null
): LcGrossLoadBand => {
  if (isLcTransmissionError(valueRaw)) return 'normal';
  const value = Number(valueRaw);
  const overload = Number(overloadRaw);
  const underload = Number(underloadRaw);
  if (!Number.isFinite(value)) return 'normal';

  if (Number.isFinite(underload) && value < underload) return 'underload';

  if (Number.isFinite(overload) && overload > 0 && value > overload) {
    return value >= overload * 1.3 ? 'danger' : 'overload';
  }

  const preThreshold = getPreOverloadThreshold(overloadRaw, preOverloadPctRaw);
  if (preThreshold != null && value > preThreshold) return 'pre-overload';

  return 'normal';
};
