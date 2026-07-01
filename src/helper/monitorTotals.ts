import { normalizeProjectId } from './functions';
import type { IGroup, ILC } from './types';

function projectUnitKey(units: string | undefined): 'mton' | 'kg' | 'lbs' {
  const u = String(units ?? 'KG').replace(/\./g, '').toLowerCase().trim();
  if (u === 'mton') return 'mton';
  if (u === 'lbs') return 'lbs';
  return 'kg';
}

function displayFractionDigits(units: string | undefined): number {
  return projectUnitKey(units) === 'mton' ? 3 : 0;
}

function getDisplayValueNum(item: ILC, tareEnabled: boolean): number {
  if (item.value === 'Tr.Err' || item.value === 'Tr. Err' || Number(item.value) === -99999999) {
    return Number.NaN;
  }
  const useNet = tareEnabled && item.status_tare && item.weightnotare != null && item.weightnotare !== '';
  const raw = useNet ? item.weightnotare : item.value;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
}

function getGrossValueNum(item: ILC): number {
  if (item.value === 'Tr.Err' || item.value === 'Tr. Err' || Number(item.value) === -99999999) {
    return Number.NaN;
  }
  const n = Number(item.value);
  return Number.isFinite(n) ? n : Number.NaN;
}

export type MonitorTotalsResult = {
  groups: IGroup[];
  groupsChanged: boolean;
  totalDisplayHtml: string;
  hasTotalError: boolean;
};

/** Recompute group sums and Total Weight header from current LC values (USB + BLE). */
export function computeMonitorTotals(
  projectLcs: ILC[],
  groups: IGroup[],
  projectId: string,
  projectUnits: string | undefined,
  tareEnabled: boolean,
): MonitorTotalsResult {
  const pid = normalizeProjectId(projectId);
  const fx = displayFractionDigits(projectUnits);
  const projectGroups = groups.filter((g) => normalizeProjectId(g.project_id) === pid);
  let nextGroups = [...groups];
  let groupsChanged = false;

  projectGroups.forEach((group) => {
    const lcsInGroup = projectLcs.filter((item) =>
      item.groups?.split(',').map((s) => s.trim()).includes(String(group.id))
    );

    const hasErrorInGroup = lcsInGroup.some((item) =>
      item.value === 'Tr.Err' || item.value === 'Tr. Err' || Number(item.value) === -99999999
    );

    const groupDisplaySum = lcsInGroup.reduce((acc, item) => {
      const n = getDisplayValueNum(item, tareEnabled);
      return Number.isFinite(n) ? acc + n : acc;
    }, 0);

    const finalSumStr = hasErrorInGroup ? 'Tr.Err' : groupDisplaySum.toFixed(fx);
    const gIdx = nextGroups.findIndex((g) => g.id === group.id);
    if (gIdx !== -1 && nextGroups[gIdx].sum !== finalSumStr) {
      nextGroups[gIdx] = { ...nextGroups[gIdx], sum: finalSumStr };
      groupsChanged = true;
    }
  });

  const totalSumLcs = projectLcs.filter((item) => !!item.total_sum || String(item.total_sum) === '1');
  const hasTotalError = totalSumLcs.some((item) =>
    item.value === 'Tr.Err' || item.value === 'Tr. Err' || Number(item.value) === -99999999
  );

  const totalSumDisplayValue = totalSumLcs.reduce((acc, item) => {
    const n = getDisplayValueNum(item, tareEnabled);
    return Number.isFinite(n) ? acc + n : acc;
  }, 0);

  const totalDisplayHtml = hasTotalError
    ? '<span class="text-xs font-bold bg-danger text-white px-1.5 py-0.5 rounded">Tr. Err</span>'
    : (projectUnitKey(projectUnits) === 'mton'
      ? totalSumDisplayValue.toFixed(3)
      : totalSumDisplayValue.toFixed(0));

  return {
    groups: nextGroups,
    groupsChanged,
    totalDisplayHtml,
    hasTotalError,
  };
}
