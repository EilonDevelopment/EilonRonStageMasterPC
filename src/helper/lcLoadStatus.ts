/** Gross-load safety bands (aligned with CommonLayout BLE threshold checks). */

export type LcGrossLoadBand = 'danger' | 'overload' | 'underload' | 'pre-overload' | 'normal';

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
