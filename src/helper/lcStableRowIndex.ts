import type { ILC } from './types';

/** DB primary key for lookup in the rank map (stable per physical LC row). */
export function lcRankKey(row: Pick<ILC, 'lc_id' | 'id'>): string {
  return String(row.lc_id ?? row.id ?? '');
}

/**
 * Creation / insert order: `lc_id` is Dexie `++lc_id` (monotonic per DB).
 * Sorting by numeric `lc_id` within a project ≈ order the LC rows were created.
 */
export function compareLcCreationOrder(a: Pick<ILC, 'lc_id'>, b: Pick<ILC, 'lc_id'>): number {
  const na = Number(a.lc_id);
  const nb = Number(b.lc_id);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a.lc_id ?? '').localeCompare(String(b.lc_id ?? ''), undefined, { numeric: true });
}

/**
 * Map lcRankKey → 1-based index by creation order (`lc_id`).
 * Same # always belongs to the same LC row regardless of grid sort or display `id`.
 */
export function stableRowIndexMap<T extends Pick<ILC, 'lc_id' | 'id'>>(list: T[]): Map<string, number> {
  const sorted = [...list].sort((x, y) => compareLcCreationOrder(x, y));
  const map = new Map<string, number>();
  sorted.forEach((row, i) => {
    const k = lcRankKey(row);
    if (k) map.set(k, i + 1);
  });
  return map;
}

/** Attach `__stableIndex` to each row (rank among `list` only). */
export function withStableRowIndex<T extends Pick<ILC, 'lc_id' | 'id'>>(list: T[]): (T & { __stableIndex: number })[] {
  const map = stableRowIndexMap(list);
  return list.map((row) => ({
    ...row,
    __stableIndex: map.get(lcRankKey(row)) ?? 0,
  }));
}
