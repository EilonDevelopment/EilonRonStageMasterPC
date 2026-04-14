import { format } from 'date-fns';

export interface ReportGroupQuery {
  ok: boolean;
  overload: boolean;
  danger: boolean;
  underload: boolean;
  trerr: boolean;
  report_interval_seconds: number;
}

/** Rows processed per slice before yielding to the event loop (filters). */
const FILTER_CHUNK = 2500;
/** Rows assigned to interval groups before yielding. */
const GROUP_YIELD_EVERY = 2000;

const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

/** BLE link status rows (not load-cell measurements); always pass through when filters are on. */
export function isPrrLinkLog(log: any): boolean {
  const t = String(log?.log_type ?? '').toLowerCase();
  return t === 'prr_connected' || t === 'prr_disconnected';
}

function makeByFilter(query: ReportGroupQuery) {
  const { ok, overload, danger, underload, trerr } = query;
  const hasLogType = (log: any) =>
    log.log_type != null &&
    String(log.log_type).trim() !== '' &&
    String(log.log_type).toLowerCase() !== 'agg';
  const logType = (log: any) => String(log.log_type).toLowerCase();
  const n = (x: any) => Number(x);
  const isAggRow = (log: any) => String(log?.log_type ?? '').toLowerCase() === 'agg';

  return (log: any) => {
    const valueN = n(log.value);
    const overloadN = n(log.overload);
    const underloadN = n(log.underload);

    if (isAggRow(log) && (Number.isNaN(overloadN) || Number.isNaN(underloadN))) {
      if (trerr && valueN === -99999999) return true;
      if (ok) return true;
      return false;
    }

    if (ok && (hasLogType(log) ? logType(log) === 'ok' : valueN >= underloadN && valueN <= overloadN)) return true;
    if (overload && (hasLogType(log) ? logType(log) === 'overload' : valueN > overloadN)) return true;
    if (danger) {
      const isDangerByType = hasLogType(log) && logType(log) === 'danger';
      const isDangerByValue = overloadN > 0 && valueN >= overloadN * 1.3;
      if (isDangerByType || isDangerByValue) return true;
    }
    if (underload && (hasLogType(log) ? logType(log) === 'underload' : valueN < underloadN && valueN !== -99999999))
      return true;
    if (trerr && (hasLogType(log) ? logType(log) === 'err' : valueN === -99999999)) return true;
    return false;
  };
}

function isValidLogRow(log: any): boolean {
  const value = parseFloat(log.value);
  const realval = parseFloat(log.realval);
  return !isNaN(value) || !isNaN(realval);
}

/**
 * Synchronous grouping — fine for small arrays; large sets should use {@link buildReportGroupsAsync}.
 */
export function buildReportGroupsSync(
  allLogs: any[],
  query: ReportGroupQuery
): { groups: Record<string, any[]> | null; rowCount: number } {
  const byFilter = makeByFilter(query);
  const hasAnyFilter = query.ok || query.overload || query.danger || query.underload || query.trerr;
  const mergedLogs = hasAnyFilter
    ? allLogs.filter((log) => isPrrLinkLog(log) || byFilter(log))
    : allLogs;
  const validLogs = mergedLogs.filter(isValidLogRow);
  if (validLogs.length === 0) return { groups: null, rowCount: 0 };

  const intervalMs = Math.max(1000, (query.report_interval_seconds || 60) * 1000);
  const groups: Record<string, any[]> = {};
  for (const log of validLogs) {
    const intervalStart = Math.floor(Number(log.log_date) / intervalMs) * intervalMs;
    const key = format(new Date(intervalStart), 'yyyy-MM-dd HH:mm:ss');
    if (!groups[key]) groups[key] = [];
    groups[key].push(log);
  }
  return { groups, rowCount: mergedLogs.length };
}

/**
 * Same result as {@link buildReportGroupsSync} but yields to the browser so taps/scroll stay responsive.
 * Call `isCancelled()` between chunks; if true, stop and return `{ groups: null, rowCount: 0, cancelled: true }`.
 */
export async function buildReportGroupsAsync(
  allLogs: any[],
  query: ReportGroupQuery,
  isCancelled: () => boolean
): Promise<{ groups: Record<string, any[]> | null; rowCount: number; cancelled?: boolean }> {
  const byFilter = makeByFilter(query);
  const hasAnyFilter = query.ok || query.overload || query.danger || query.underload || query.trerr;

  let mergedLogs: any[];
  if (!hasAnyFilter) {
    mergedLogs = allLogs;
  } else {
    mergedLogs = [];
    for (let i = 0; i < allLogs.length; i += FILTER_CHUNK) {
      if (isCancelled()) return { groups: null, rowCount: 0, cancelled: true };
      mergedLogs.push(
        ...allLogs.slice(i, i + FILTER_CHUNK).filter((log) => isPrrLinkLog(log) || byFilter(log))
      );
      await yieldToMain();
    }
  }

  const validLogs: any[] = [];
  for (let i = 0; i < mergedLogs.length; i += FILTER_CHUNK) {
    if (isCancelled()) return { groups: null, rowCount: 0, cancelled: true };
    validLogs.push(...mergedLogs.slice(i, i + FILTER_CHUNK).filter(isValidLogRow));
    await yieldToMain();
  }

  if (validLogs.length === 0) return { groups: null, rowCount: 0 };

  const intervalMs = Math.max(1000, (query.report_interval_seconds || 60) * 1000);
  const groups: Record<string, any[]> = {};

  for (let i = 0; i < validLogs.length; i++) {
    if (isCancelled()) return { groups: null, rowCount: 0, cancelled: true };
    if (i > 0 && i % GROUP_YIELD_EVERY === 0) await yieldToMain();

    const log = validLogs[i];
    const intervalStart = Math.floor(Number(log.log_date) / intervalMs) * intervalMs;
    const key = format(new Date(intervalStart), 'yyyy-MM-dd HH:mm:ss');
    if (!groups[key]) groups[key] = [];
    groups[key].push(log);
  }

  return { groups, rowCount: mergedLogs.length };
}
