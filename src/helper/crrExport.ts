import { normalizeProjectId } from './functions';
import {
  RF_MODULE_TYPE_OPTIONS,
  loadCrrSettingsFromStorage,
  type CrrModuleType,
  type CrrSettingsConfig,
} from './crrSettingsModel';
import type { ILC } from './types';

/** Wire value: do not export LC readings to slave / BLE / S.P. paths. */
export const CRR_EXPORT_NONE = 0;
/** Wire value: export through every configured export-capable Addr. */
export const CRR_EXPORT_ALL = 0xff;

const EXPORT_CAPABLE = new Set<CrrModuleType>([
  'SLAVE_CC24',
  'SLAVE_SI900',
  'BLE121LR',
  'SP_CC24',
  'SP_SI900',
  'SP_RS485',
]);

export type CrrExportDestination = {
  /** 0-based slot index in CRR settings. */
  addrIndex: number;
  /** Addr label shown in UI (1–15). */
  addrNum: number;
  moduleType: CrrModuleType;
};

export type CrrExportSelectOption = {
  value: number;
  label: string;
};

export type CrrExportAdjustment = {
  lcId: string;
  from: number;
  to: number;
};

export function isCrrExportCapableModuleType(type: CrrModuleType): boolean {
  return EXPORT_CAPABLE.has(type);
}

export function listCrrExportDestinations(config: CrrSettingsConfig): CrrExportDestination[] {
  const out: CrrExportDestination[] = [];
  config.slots.forEach((slot, index) => {
    if (isCrrExportCapableModuleType(slot.moduleType)) {
      out.push({
        addrIndex: index,
        addrNum: index + 1,
        moduleType: slot.moduleType,
      });
    }
  });
  return out;
}

export function moduleTypeExportLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  type: CrrModuleType,
): string {
  const opt = RF_MODULE_TYPE_OPTIONS.find((o) => o.value === type);
  return opt ? t(`CrrSettings.${opt.labelKey}`) : type;
}

export function buildCrrExportSelectOptions(
  config: CrrSettingsConfig,
  t: (key: string, opts?: Record<string, unknown>) => string,
): CrrExportSelectOption[] {
  const dests = listCrrExportDestinations(config);
  const options: CrrExportSelectOption[] = [
    { value: CRR_EXPORT_NONE, label: t('Setting.CrrExportNone') },
  ];
  dests.forEach((dest, i) => {
    const index = i + 1;
    options.push({
      value: index,
      label: t('Setting.CrrExportDestOption', {
        index,
        addr: dest.addrNum,
        module: moduleTypeExportLabel(t, dest.moduleType),
      }),
    });
  });
  if (dests.length > 0) {
    options.push({ value: CRR_EXPORT_ALL, label: t('Setting.CrrExportAll') });
  }
  return options;
}

export function normalizeCrrExportStored(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return CRR_EXPORT_NONE;
  return Math.floor(n) & 0xff;
}

/** Clamp export index when CRR Settings no longer has enough destinations. */
export function sanitizeCrrExportValue(
  raw: unknown,
  destCount: number,
): { value: number; adjusted: boolean } {
  let v = normalizeCrrExportStored(raw);
  if (destCount <= 0) {
    return { value: CRR_EXPORT_NONE, adjusted: v !== CRR_EXPORT_NONE };
  }
  if (v === CRR_EXPORT_NONE || v === CRR_EXPORT_ALL) {
    return { value: v, adjusted: false };
  }
  if (v > destCount) {
    return { value: destCount, adjusted: true };
  }
  return { value: v, adjusted: false };
}

export function getLcCrrExportWireByte(
  lc: Pick<ILC, 'crr_export'>,
  config?: CrrSettingsConfig,
): number {
  const cfg = config ?? loadCrrSettingsFromStorage();
  const destCount = listCrrExportDestinations(cfg).length;
  return sanitizeCrrExportValue(lc.crr_export ?? CRR_EXPORT_NONE, destCount).value;
}

export function formatCrrExportLabel(
  exportValue: unknown,
  config: CrrSettingsConfig,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const v = normalizeCrrExportStored(exportValue);
  if (v === CRR_EXPORT_NONE) return t('Setting.CrrExportNoneShort');
  if (v === CRR_EXPORT_ALL) return t('Setting.CrrExportAllShort');
  const dests = listCrrExportDestinations(config);
  const dest = dests[v - 1];
  if (!dest) return String(v);
  return t('Setting.CrrExportDestShort', {
    index: v,
    addr: dest.addrNum,
    module: moduleTypeExportLabel(t, dest.moduleType),
  });
}

export function applyCrrExportSanitization(
  lcs: ILC[],
  projectId: string,
  config?: CrrSettingsConfig,
): { lcs: ILC[]; adjustments: CrrExportAdjustment[] } {
  const cfg = config ?? loadCrrSettingsFromStorage();
  const destCount = listCrrExportDestinations(cfg).length;
  const pid = normalizeProjectId(projectId);
  const adjustments: CrrExportAdjustment[] = [];
  const next = lcs.map((lc) => {
    if (normalizeProjectId(lc.project_id) !== pid) return lc;
    const from = normalizeCrrExportStored(lc.crr_export);
    const { value, adjusted } = sanitizeCrrExportValue(from, destCount);
    if (!adjusted) return lc;
    adjustments.push({ lcId: String(lc.id), from, to: value });
    return { ...lc, crr_export: value };
  });
  return { lcs: next, adjustments };
}
