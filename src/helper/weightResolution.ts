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

