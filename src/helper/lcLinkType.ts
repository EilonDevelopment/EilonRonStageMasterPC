import type { ILC } from './types';

/** How the CRR reaches this load cell (matches LabVIEW LC Type / Wire). */
export type LcLinkType = 'rf' | 'rs485';

export function normalizeLcLinkType(raw: unknown): LcLinkType {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (v === 'rs485' || v === '485' || v === 'wire' || v === 'wired') {
    return 'rs485';
  }
  return 'rf';
}

export function isRs485Lc(lc: Pick<ILC, 'link_type'> | undefined | null): boolean {
  return normalizeLcLinkType(lc?.link_type) === 'rs485';
}

export function lcLinkTypeLabel(linkType: LcLinkType, t: (key: string) => string): string {
  return linkType === 'rs485' ? t('Setting.LinkTypeRs485') : t('Setting.LinkTypeRf');
}
