import type { ILC } from './types';
import {
  formatWeightByLcResolution,
  getResolutionForLcId,
  quantizeByResolution,
} from './weightResolution';

export type CrrUsbWeightSample = {
  lcId: number;
  grossMton: number;
  battery: number;
  encoding: 'g4-fixed';
};

export type CrrUsbLcDisplayPatch = {
  value: string;
  weightnotare: string;
  realval: number;
  battery: string;
  max: number;
};

function normalizeUnits(unitsRaw: string | undefined): { u: string; fx: number } {
  const u = String(unitsRaw ?? 'M.TON').toLowerCase().replace(/\./g, '').trim().split(/\s+/)[0] ?? 'mton';
  const fx = u === 'mton' ? 3 : 0;
  return { u, fx };
}

/** Map decoded CRR gross M.TON → Monitor cell fields (calibration, zero, tare, units, resolution). */
export function computeCrrUsbLcDisplayPatch(
  lc: ILC,
  grossMton: number,
  battery: number,
  unitsRaw: string | undefined,
): CrrUsbLcDisplayPatch | null {
  const lcNum = Number.parseInt(String(lc.id), 10);
  if (!Number.isFinite(lcNum) || lcNum <= 10) return null;

  const calibrationOffset = Number.parseFloat(String(lc.calibration_offset ?? '1')) || 1;
  const statusTare = lc.status_tare;
  const psw = Number.parseFloat(String(lc.psw ?? '0')) || 0;
  let zero = Number(lc.zero) || 0;
  let tare = Number(lc.tare) || 0;

  const { u, fx } = normalizeUnits(unitsRaw);

  let weight = grossMton / calibrationOffset;
  let realval = grossMton / calibrationOffset;

  if (u === 'lbs') {
    weight = Number((weight * 2204.62).toFixed(0));
    realval = Number((realval * 2204.62).toFixed(0));
    zero = Number((zero * 2204.62).toFixed(0));
    tare = Number((tare * 2204.62).toFixed(0));
  } else if (u === 'kg') {
    weight = Number((weight * 1000).toFixed(0));
    realval = Number((realval * 1000).toFixed(0));
    zero = Number((zero * 1000).toFixed(0));
    tare = Number((tare * 1000).toFixed(0));
  } else {
    weight = Number(Number(weight).toFixed(3));
    realval = Number(Number(realval).toFixed(3));
    zero = Number(Number(zero).toFixed(3));
    tare = Number(Number(tare).toFixed(3));
  }

  let weightnotare: number;
  if (statusTare) {
    weightnotare = weight + tare + zero;
    weight = weight + zero;
  } else {
    weightnotare = weight + zero;
    weight = weight + zero;
  }

  if (psw) {
    weight += psw;
    weightnotare += psw;
  }

  const lcResolution = getResolutionForLcId(lcNum, u);
  const quantizedGross = lcResolution != null
    ? quantizeByResolution(weight, lcResolution)
    : weight;
  const quantizedNet = lcResolution != null
    ? quantizeByResolution(weightnotare, lcResolution)
    : weightnotare;

  const w = formatWeightByLcResolution(quantizedGross, lcNum, u, fx);
  const wn = formatWeightByLcResolution(quantizedNet, lcNum, u, fx);

  const currentMax = lc.max ? Number.parseFloat(String(lc.max)) : 0;
  const weightNum = Number.parseFloat(String(wn));
  const maxVal = Number.isFinite(weightNum) && weightNum > currentMax ? weightNum : currentMax;

  return {
    value: w,
    weightnotare: wn,
    realval,
    battery: String(Math.min(100, Math.max(0, Math.round(battery)))),
    max: maxVal,
  };
}
