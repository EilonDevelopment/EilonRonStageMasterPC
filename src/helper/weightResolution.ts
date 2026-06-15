import { LC_Serials } from "./constants";

type UnitKey = "kg" | "lbs" | "mton";

const normalizeUnitKey = (unitRaw: string | undefined): UnitKey => {
  const u = String(unitRaw || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "");
  if (u === "lb" || u === "lbs") return "lbs";
  if (u === "ton" || u === "mton" || u === "mtons") return "mton";
  return "kg";
};

const decimalPlacesFromStep = (stepRaw: number): number => {
  if (!Number.isFinite(stepRaw) || stepRaw <= 0) return 0;
  const s = stepRaw.toString();
  if (!s.includes(".")) return 0;
  return Math.min(6, s.split(".")[1].replace(/0+$/, "").length);
};

const getLcSerialById = (lcIdRaw: number) => {
  const lcId = Number(lcIdRaw);
  if (!Number.isFinite(lcId)) return null;
  for (const entry of LC_Serials as any[]) {
    const ranges = Array.isArray(entry?.range) ? entry.range : [];
    for (const r of ranges) {
      const from = Number(r?.from);
      const to = Number(r?.to);
      if (Number.isFinite(from) && Number.isFinite(to) && lcId >= from && lcId <= to) {
        return entry;
      }
    }
  }
  return null;
};

export const getResolutionForLcId = (lcId: number, unitRaw: string | undefined): number | null => {
  const entry = getLcSerialById(lcId) as any;
  if (!entry) return null;
  const unitKey = normalizeUnitKey(unitRaw);
  const res = Number(entry?.resolution?.[unitKey]);
  if (Number.isFinite(res) && res > 0) return res;
  return null;
};

export const quantizeByResolution = (valueRaw: number, resolutionRaw: number): number => {
  const value = Number(valueRaw);
  const resolution = Number(resolutionRaw);
  if (!Number.isFinite(value)) return valueRaw;
  if (!Number.isFinite(resolution) || resolution <= 0) return value;
  return Math.round(value / resolution) * resolution;
};

export const quantizeWeightByLcId = (valueRaw: number, lcId: number, unitRaw: string | undefined): number => {
  const resolution = getResolutionForLcId(lcId, unitRaw);
  if (resolution == null) return Number(valueRaw);
  return quantizeByResolution(Number(valueRaw), resolution);
};

export const formatWeightByLcResolution = (
  valueRaw: number,
  lcId: number,
  unitRaw: string | undefined,
  fallbackDecimals = 0
): string => {
  const resolution = getResolutionForLcId(lcId, unitRaw);
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return String(valueRaw);
  const quantized = resolution != null ? quantizeByResolution(value, resolution) : value;
  const decimals = resolution != null ? decimalPlacesFromStep(resolution) : fallbackDecimals;
  return quantized.toFixed(decimals);
};

/**
 * Format overload/underload/PSW (stored in project weight units) using the same LC capacity resolution
 * table as live BLE — use after unit conversion or for static UI display.
 */
export const formatThresholdStringForLc = (
  valueRaw: number,
  lcIdRaw: string | number | undefined,
  projectUnitsRaw: string | undefined
): string => {
  const n = Number(valueRaw);
  if (!Number.isFinite(n)) return String(valueRaw);
  const lcId = Number(lcIdRaw);
  const uk = normalizeUnitKey(projectUnitsRaw);
  const fallback = uk === 'mton' ? 3 : 0;
  if (!Number.isFinite(lcId)) return n.toFixed(fallback);
  return formatWeightByLcResolution(n, lcId, projectUnitsRaw, fallback);
};

/** Group `overload` is not tied to a single LC — snap to a stable step for the target weight unit. */
export const formatGroupOverloadStringForUnit = (valueRaw: number, projectUnitsRaw: string | undefined): string => {
  const n = Number(valueRaw);
  if (!Number.isFinite(n)) return String(valueRaw);
  const uk = normalizeUnitKey(projectUnitsRaw);
  if (uk === 'mton') return quantizeByResolution(n, 0.001).toFixed(3);
  return quantizeByResolution(n, 1).toFixed(0);
};

const LBS_PER_KG = 2.20462;

type CanonicalUpper = 'KG' | 'LBS' | 'M.TON';

const normalizeWeightUnitUpper = (unitRaw: unknown): CanonicalUpper | null => {
  const u = String(unitRaw ?? '').toUpperCase().replace(/\s+/g, '');
  if (u === 'KG' || u === 'KGS') return 'KG';
  if (u === 'LBS' || u === 'LB') return 'LBS';
  if (u === 'M.TON' || u === 'MTON' || u === 'MTONS') return 'M.TON';
  return null;
};

const toKgFromStoredValue = (valueRaw: unknown, unitRaw: unknown): number | null => {
  const n = Number(valueRaw);
  if (!Number.isFinite(n)) return null;
  const u = normalizeWeightUnitUpper(unitRaw);
  if (u === 'KG') return n;
  if (u === 'LBS') return n / LBS_PER_KG;
  if (u === 'M.TON') return n * 1000;
  return null;
};

/**
 * Dual-line "KG / LBS" text using LC_Serials resolution (aligned with live BLE + Reports).
 * If `unitRaw` is not a recognized mass unit, returns `${value} ${unit}`.
 */
export const formatDualWeightWithLcResolution = (
  valueRaw: unknown,
  unitRaw: unknown,
  lcIdRaw?: string | number | null
): string => {
  const kg = toKgFromStoredValue(valueRaw, unitRaw);
  if (kg == null) return `${valueRaw ?? ''} ${unitRaw ?? ''}`.trim();
  const lcId = Number(lcIdRaw);
  const kgResolution = Number.isFinite(lcId) ? getResolutionForLcId(lcId, 'kg') : null;
  const quantizedKg = kgResolution != null ? quantizeByResolution(kg, kgResolution) : kg;
  const lbs = quantizedKg * LBS_PER_KG;
  const lbsResolution = Number.isFinite(lcId) ? getResolutionForLcId(lcId, 'lbs') : null;
  const quantizedLbs = lbsResolution != null ? quantizeByResolution(lbs, lbsResolution) : lbs;
  const kgText = Number.isFinite(lcId)
    ? formatWeightByLcResolution(quantizedKg, lcId, 'kg', 2)
    : quantizedKg.toFixed(2);
  const lbsText = Number.isFinite(lcId)
    ? formatWeightByLcResolution(quantizedLbs, lcId, 'lbs', 2)
    : quantizedLbs.toFixed(2);
  return `${kgText} KG\n${lbsText} LBS`;
};

