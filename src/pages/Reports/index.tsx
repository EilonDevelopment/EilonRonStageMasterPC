import React, { FC, useEffect, useMemo, useRef, useState } from "react";
import { IonIcon, IonToggle } from "@ionic/react";
import { useTranslation } from "react-i18next";
import { codeSlashSharp, createOutline, cubeSharp, documentSharp, downloadSharp, mailSharp, refreshSharp, trashSharp } from "ionicons/icons";
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Device } from '@capacitor/device';

import CommonLayout from "../../Layout/CommonLayout";
import useAppData from "../../hooks/useAppData";
import Text from "../../components/Text";
import { IProject } from "../../helper/types";
import { normalizeProjectId } from "../../helper/functions";
import { buildReportGroupsAsync, type ReportGroupQuery } from "../../helper/reportGrouping";
import { formatDualWeightWithLcResolution } from "../../helper/weightResolution";
import { db } from '../../db'
import Swal from "sweetalert2";
import { eachDayOfInterval, endOfDay, format, getTime, startOfDay } from "date-fns"
import { EmailComposer } from "@awesome-cordova-plugins/email-composer";
import { toast } from 'react-toastify';
import ReportBrandingModal from '../../components/Modals/ReportBrandingModal';
import {
  buildCsvBrandingLines,
  buildReportRangeLabel,
  loadReportBranding,
  type ReportBrandingLabels,
} from '../../helper/reportBranding';
import { buildReportLogsPdfDocument } from '../../helper/reportPdfExport';
import './index.css';

interface LogFilter {
  ok: boolean;
  overload: boolean;
  danger: boolean;
  underload: boolean;
  err: boolean;
  start: Date;
  end: Date;
  hourStart: string;
  hourEnd: string;
}

/** Raw rows stay in IndexedDB; UI + exports never exceed this many logs. */
const MAX_REPORT_LOGS = 300_000;

/** Merge K arrays sorted by log_date descending into one list of at most `cap` items. */
function mergeSortedLogArraysDesc(arrays: any[][], cap: number): any[] {
  const heads = arrays.map(() => 0);
  const out: any[] = [];
  while (out.length < cap) {
    let bestIdx = -1;
    let bestTs = -Infinity;
    for (let i = 0; i < arrays.length; i++) {
      const h = heads[i];
      const arr = arrays[i];
      if (h >= arr.length) continue;
      const ts = Number(arr[h]?.log_date ?? 0);
      if (ts >= bestTs) {
        bestTs = ts;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    out.push(arrays[bestIdx][heads[bestIdx]++]);
  }
  return out;
}

const Report: FC = () => {
  const { platformType, projects, curProject, lcs, layoutRefreshRef } = useAppData();
  const { t } = useTranslation();
  const tr = (key: string, fallback: string) => {
    const value = t(key);
    return !value || value === key ? fallback : value;
  };
  const reportTraceStepRef = useRef(0);
  const reportTrace = (phase: string, extra?: Record<string, any>) => {
    const step = ++reportTraceStepRef.current;
    const details = extra ? ` | ${JSON.stringify(extra)}` : '';
    console.info(`[RSM_TRACE] [REPORTS ${step}] ${phase}${details}`);
  };

  const [projectList, setProjectList] = useState<IProject[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [filter, setFilter] = useState<LogFilter>({
    ok: true,
    overload: true,
    danger: true,
    underload: true,
    err: true,
    start: startOfDay(new Date()),
    end: endOfDay(new Date()),
    hourStart: '00:00',
    hourEnd: '23:59',
  });
  const [logList, setLogList] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [loadProgressPct, setLoadProgressPct] = useState<number>(0)
  const [loadProgressText, setLoadProgressText] = useState<string>('')
  /** Blocks UI during CSV/PDF/email prep (native Share + large files can take several seconds). */
  const [exportBusy, setExportBusy] = useState(false)
  const [brandingModalOpen, setBrandingModalOpen] = useState(false)
  const [rawLogs, setRawLogs] = useState<any[] | null>(null);
  const [reportUnitsSnapshot, setReportUnitsSnapshot] = useState<{ units: string; windmeter_units: string } | null>(null);
  const [storageTotal, setStorageTotal] = useState<number>(0)
  const [storageFree, setStorageFree] = useState<number>(0)
  const [reportsStorageUsed, setReportsStorageUsed] = useState<number>(0)
  const [storageMetricSource, setStorageMetricSource] = useState<'device' | 'origin_quota' | 'unknown'>('unknown')
  const PAGE_SIZE = 10
  const [page, setPage] = useState<number>(1)

  const reportIntervalSeconds = (projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(selectedId))?.report_interval_seconds ?? 60) || 60;
  const isSingleDayRange = format(filter.start, 'yyyy-MM-dd') === format(filter.end, 'yyyy-MM-dd');
  const activeTimeRange = useMemo(() => {
    if (!isSingleDayRange) return null;
    const parseHm = (value: string, fallback: number) => {
      const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
      if (!m) return fallback;
      return Number(m[1]) * 60 + Number(m[2]);
    };
    const startMin = parseHm(filter.hourStart, 0);
    const endMin = parseHm(filter.hourEnd, 23 * 60 + 59);
    if (startMin > endMin) return null;
    return { startMin, endMin };
  }, [isSingleDayRange, filter.hourStart, filter.hourEnd]);

  const [reloadNonce, setReloadNonce] = useState(0);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const totalUsedBytes = Math.max(0, storageTotal - storageFree);
  const reportsUsedBytesClamped = Math.min(totalUsedBytes, Math.max(0, reportsStorageUsed));
  const otherUsedBytes = Math.max(0, totalUsedBytes - reportsUsedBytesClamped);
  const freePct = storageTotal > 0 ? (storageFree / storageTotal) * 100 : 0;
  const isLowStorage = storageTotal > 0 && freePct <= 10;
  const formatGiB = (bytes: number) => `${(bytes / (1024 ** 3)).toFixed(2)} GB`;

  // Load only when user explicitly taps Refresh.
  useEffect(() => {
    if (reloadNonce === 0) return;
    if (!selectedId || !filter.start || !filter.end) {
      setLogList(null)
      setRawLogs(null)
      return;
    }
    if (getTime(filter.start) > getTime(filter.end)) {
      setLogList(null)
      setRawLogs(null)
      return;
    }
    if (isSingleDayRange && !activeTimeRange) {
      setLogList(null)
      setRawLogs(null)
      return;
    }
    void load_reports(selectedId, filter.start, filter.end, reportIntervalSeconds);
  }, [reloadNonce])

  // Helper function to merge and deduplicate logs.
  const mergeAndDeduplicateLogs = (logArrays: any) => {
    const getKey = (log: any) => {
      const hasId = log?.id != null && String(log.id).trim() !== '';
      if (hasId) return `id:${String(log.id)}`;
      const projectId = log?.project_id ?? '';
      const lcId = log?.lc_id ?? '';
      const logDate = log?.log_date ?? '';
      const logType = log?.log_type ?? '';
      const bucket = log?.bucket ?? '';
      return `pk:${String(projectId)}|${String(lcId)}|${String(logDate)}|${String(logType)}|${String(bucket)}`;
    };

    const logMap = new Map<string, any>();
    logArrays.forEach((logs: any) => {
      (logs || []).forEach((log: any) => {
        const key = getKey(log);
        if (!logMap.has(key)) logMap.set(key, log);
      });
    });
    return Array.from(logMap.values());
  }

  const normalizeLegacyLogDate = (row: any) => {
    const rawAny = row?.log_date;
    const rawNum = Number(rawAny ?? 0);
    if (Number.isFinite(rawNum) && rawNum > 0) {
      // Legacy rows may store epoch seconds; normalize to ms for UI/range/grouping.
      if (rawNum < 1_000_000_000_000) return { ...row, log_date: rawNum * 1000 };
      return row;
    }
    const parsed = Date.parse(String(rawAny ?? ''));
    if (Number.isFinite(parsed) && parsed > 0) {
      return { ...row, log_date: parsed };
    }
    return { ...row, log_date: 0 };
  };

  const fetchLogsForSingleDay = async (
    projectId: string,
    dayKey: string,
    query: ReportGroupQuery,
    onProgress?: (pct: number, text: string) => void,
    isCancelled?: () => boolean,
    opts?: {
      maxTotal: number;
      progressBase?: number;
      progressSpan?: number;
      dayIndex?: number;
      dayCount?: number;
      /** Rows already counted toward global cap (for message only). */
      globalRowsSoFar?: number;
      /** Optional HH:mm range in minutes, only for single-day queries. */
      dayTimeWindow?: { startMin: number; endMin: number } | null;
    }
  ): Promise<{ rows: any[]; cancelled: boolean; rowsReadFromDb: number }> => {
    const maxTotal = Math.max(1, opts?.maxTotal ?? MAX_REPORT_LOGS);
    const progressBase = opts?.progressBase ?? 0;
    const progressSpan = opts?.progressSpan ?? 70;
    const globalOff = opts?.globalRowsSoFar ?? 0;
    const dayLabel =
      opts?.dayIndex != null && opts?.dayCount != null
        ? `day ${opts.dayIndex + 1}/${opts.dayCount} (${dayKey})`
        : dayKey;

    const pidNorm = normalizeProjectId(projectId);
    const pidNum = Number(pidNorm);
    const pidCandidates: any[] = [];
    if (pidNorm) pidCandidates.push(pidNorm);
    if (Number.isFinite(pidNum)) pidCandidates.push(pidNum);

    const dayBase = new Date(dayKey + 'T12:00:00');
    const dayStartMs = getTime(startOfDay(dayBase));
    const dayEndMs = getTime(endOfDay(dayBase));
    const queryStartMs = opts?.dayTimeWindow ? dayStartMs + opts.dayTimeWindow.startMin * 60_000 : dayStartMs;
    const queryEndMs = opts?.dayTimeWindow
      ? Math.min(dayEndMs, dayStartMs + opts.dayTimeWindow.endMin * 60_000 + 59_999)
      : dayEndMs;

    const activeStatuses = (() => {
      const set = new Set<string>();
      if (query.ok) set.add('ok');
      if (query.overload) set.add('overload');
      if (query.danger) set.add('danger');
      if (query.underload) set.add('underload');
      if (query.trerr) set.add('err');
      return Array.from(set);
    })();

    const filterEnabled = query.ok || query.overload || query.danger || query.underload || query.trerr;

    let rowsReadFromDb = 0;
    const bumpProgress = (phaseLabel: string, dayKeptCount: number) => {
      const shown = Math.min(globalOff + dayKeptCount, MAX_REPORT_LOGS);
      const pct = progressBase + Math.min(progressSpan, Math.round((shown / MAX_REPORT_LOGS) * progressSpan));
      onProgress?.(
        pct,
        `${phaseLabel} · ${dayLabel} — ${shown.toLocaleString()} / ${MAX_REPORT_LOGS.toLocaleString()} logs (IndexedDB read ~${rowsReadFromDb.toLocaleString()} rows this day)`
      );
    };

    const queryByPidDay = (pidCandidate: any, upperMs = queryEndMs) =>
      db.daily_logs
        .where('[project_id+day_key+log_date]')
        .between([pidCandidate, dayKey, queryStartMs], [pidCandidate, dayKey, upperMs], true, true)
        .reverse();

    let merged: any[] = [];

    if (!filterEnabled) {
      for (const pidCandidate of pidCandidates) {
        if (isCancelled?.()) return { rows: [], cancelled: true, rowsReadFromDb };
        const rows = await queryByPidDay(pidCandidate).limit(maxTotal).toArray();
        rowsReadFromDb += rows?.length ?? 0;
        merged = rows || [];
        bumpProgress('Reading (all statuses)', merged.length);
        if (merged.length > 0) break;
      }
    } else {
      // Stream newest -> oldest with one indexed cursor path.
      // This avoids large per-status reads that can stall around 2%.
      const activeSet = new Set(activeStatuses.map((s) => String(s).toLowerCase()));
      const matchesFilter = (row: any) => {
        const lt = String(row?.log_type || '').toLowerCase();
        if (lt === 'prr_connected' || lt === 'prr_disconnected') return true;
        const status = String(row?.status_code || lt || '').toLowerCase();
        return activeSet.has(status);
      };
      const STREAM_CHUNK = 20_000;
      const MAX_SCANNED_ROWS = 600_000;
      for (const pidCandidate of pidCandidates) {
        if (isCancelled?.()) return { rows: [], cancelled: true, rowsReadFromDb };
        let upper = queryEndMs;
        let scannedForPid = 0;
        const keptRows: any[] = [];
        while (upper >= queryStartMs && keptRows.length < maxTotal && scannedForPid < MAX_SCANNED_ROWS) {
          if (isCancelled?.()) return { rows: [], cancelled: true, rowsReadFromDb };
          const slice = await queryByPidDay(pidCandidate, upper).limit(STREAM_CHUNK).toArray();
          if (!slice || slice.length === 0) break;
          rowsReadFromDb += slice.length;
          scannedForPid += slice.length;
          for (const row of slice) {
            if (matchesFilter(row)) {
              keptRows.push(row);
              if (keptRows.length >= maxTotal) break;
            }
          }
          bumpProgress('Scanning day stream', keptRows.length);
          const oldestTs = Number(slice[slice.length - 1]?.log_date ?? queryStartMs) - 1;
          if (!Number.isFinite(oldestTs) || oldestTs < queryStartMs) break;
          upper = oldestTs;
        }
        if (keptRows.length > 0) {
          merged = keptRows.slice(0, maxTotal);
          break;
        }
      }
      if (merged.length === 0) {
        reportTrace('fetchLogsForSingleDay: no rows for filtered day-stream scan', { dayKey, pidNorm, statuses: activeStatuses });
      }
    }

    let legacyRows: any[] = [];
    if (merged.length === 0) {
      const queryStartSec = Math.floor(queryStartMs / 1000);
      const queryEndSec = Math.floor(queryEndMs / 1000);
      const queryLegacyRows = async (table: any, pidCandidate: any, maxRows: number) => {
        const msRows = await table
          .where('[project_id+log_date]')
          .between([pidCandidate, queryStartMs], [pidCandidate, queryEndMs], true, true)
          .reverse()
          .limit(maxRows)
          .toArray()
          .catch(() => []);
        const secRows = await table
          .where('[project_id+log_date]')
          .between([pidCandidate, queryStartSec], [pidCandidate, queryEndSec], true, true)
          .reverse()
          .limit(maxRows)
          .toArray()
          .catch(() => []);
        let slowRows: any[] = [];
        if ((msRows.length + secRows.length) === 0) {
          // Final compatibility path: very old rows may store log_date as date string.
          // This is expensive, so run only if indexed scans returned nothing.
          slowRows = await table
            .filter((r: any) => {
              if (normalizeProjectId(r?.project_id) !== pidNorm) return false;
              const dt = normalizeLegacyLogDate(r).log_date;
              return Number(dt) >= queryStartMs && Number(dt) <= queryEndMs;
            })
            .reverse()
            .limit(maxRows)
            .toArray()
            .catch(() => []);
        }
        return {
          msRows,
          secRows,
          slowRows,
          merged: mergeAndDeduplicateLogs([msRows, secRows, slowRows]).map(normalizeLegacyLogDate),
        };
      };
      for (const pidCandidate of pidCandidates) {
        if (isCancelled?.()) return { rows: [], cancelled: true, rowsReadFromDb };
        const logsResult = await queryLegacyRows(db.logs, pidCandidate, maxTotal);
        const archiveResult = await queryLegacyRows(db.logs_archive, pidCandidate, maxTotal);
        rowsReadFromDb +=
          (logsResult.msRows?.length ?? 0) +
          (logsResult.secRows?.length ?? 0) +
          (logsResult.slowRows?.length ?? 0) +
          (archiveResult.msRows?.length ?? 0) +
          (archiveResult.secRows?.length ?? 0) +
          (archiveResult.slowRows?.length ?? 0);
        legacyRows = mergeAndDeduplicateLogs([
          logsResult.merged,
          archiveResult.merged,
        ])
          .sort((a: any, b: any) => Number(b.log_date) - Number(a.log_date))
          .slice(0, maxTotal);
        if (legacyRows.length > 0) {
          reportTrace('fetchLogsForSingleDay: recovered from legacy stores', {
            dayKey,
            pidNorm,
            fromLogsMs: logsResult.msRows.length,
            fromLogsSec: logsResult.secRows.length,
            fromLogsSlow: logsResult.slowRows.length,
            fromArchiveMs: archiveResult.msRows.length,
            fromArchiveSec: archiveResult.secRows.length,
            fromArchiveSlow: archiveResult.slowRows.length,
            kept: legacyRows.length,
          });
          break;
        }
      }
      if (legacyRows.length > 0) {
        onProgress?.(
          progressBase + progressSpan,
          `Legacy scan ${dayLabel} — ${legacyRows.length.toLocaleString()} rows (legacy stores)`
        );
      }
    }

    const combined = mergeAndDeduplicateLogs([merged, legacyRows]).sort(
      (a: any, b: any) => Number(b.log_date) - Number(a.log_date)
    );
    const rows = combined.slice(0, maxTotal);
    return { rows, cancelled: false, rowsReadFromDb };
  };

  const fetchProjectLogsForRange = async (
    projectId: string,
    rangeStart: Date,
    rangeEnd: Date,
    query: ReportGroupQuery,
    onProgress?: (pct: number, text: string) => void,
    isCancelled?: () => boolean
  ) => {
    const startD = startOfDay(rangeStart);
    const endD = endOfDay(rangeEnd);
    reportTrace('INICIO: fetchProjectLogsForRange', { projectId, start: format(startD, 'yyyy-MM-dd'), end: format(endD, 'yyyy-MM-dd') });
    onProgress?.(2, 'Preparing date range...');

    const days = eachDayOfInterval({ start: startD, end: endD });
    const dayKeysDesc = days.map((d) => format(d, 'yyyy-MM-dd')).sort((a, b) => b.localeCompare(a));
    const merged: any[] = [];
    const dayCount = dayKeysDesc.length;

    for (let i = 0; i < dayKeysDesc.length; i++) {
      if (isCancelled?.()) return { logs: [], totalBeforeCap: 0 };
      if (merged.length >= MAX_REPORT_LOGS) break;
      const dk = dayKeysDesc[i];
      const remaining = MAX_REPORT_LOGS - merged.length;
      const span = Math.max(8, Math.floor(68 / Math.max(1, dayCount)));
      const base = 5 + i * span;
      const dayResult = await fetchLogsForSingleDay(projectId, dk, query, onProgress, isCancelled, {
        maxTotal: remaining,
        progressBase: base,
        progressSpan: span,
        dayIndex: i,
        dayCount,
        globalRowsSoFar: merged.length,
        dayTimeWindow: dayCount === 1 ? activeTimeRange : null,
      });
      if (dayResult.cancelled) return { logs: [], totalBeforeCap: 0 };
      // Avoid spreading very large arrays into push (can throw RangeError / stack overflow
      // around hundreds of thousands of rows on some Android WebViews).
      const rowsToAppend = dayResult.rows.slice(0, remaining);
      for (let r = 0; r < rowsToAppend.length; r++) {
        merged.push(rowsToAppend[r]);
      }
    }

    const sorted = mergeAndDeduplicateLogs([merged]).sort((a: any, b: any) => Number(b.log_date) - Number(a.log_date));
    const capped = sorted.slice(0, MAX_REPORT_LOGS);
    reportTrace('FIN: fetchProjectLogsForRange', {
      projectId,
      days: dayCount,
      rows: capped.length,
      truncated: sorted.length > MAX_REPORT_LOGS,
    });
    return { logs: capped, totalBeforeCap: sorted.length };
  };

  const writeTextFileInChunks = async (fileName: string, chunks: string[]) => {
    await Filesystem.writeFile({
      path: fileName,
      data: '',
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    const CHUNK_SIZE = 300;
    for (let i = 0; i < chunks.length; i += CHUNK_SIZE) {
      const part = chunks.slice(i, i + CHUNK_SIZE).join('');
      await Filesystem.appendFile({
        path: fileName,
        data: part,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
    }
  };

  const loadReqIdRef = useRef(0);
  const filterBuildGenRef = useRef(0);
  const lastQueryRef = useRef<any>(null);

  const reportGroupQuery = (report_interval_seconds: number): ReportGroupQuery => ({
    ok: filter.ok,
    overload: filter.overload,
    danger: filter.danger,
    underload: filter.underload,
    trerr: filter.err,
    report_interval_seconds,
  });

  const load_reports = async (project_id: any, rangeStart: Date, rangeEnd: Date, report_interval_seconds = 60) => {
    reportTrace('INICIO: load_reports', {
      project_id,
      rangeStart: format(startOfDay(rangeStart), 'yyyy-MM-dd'),
      rangeEnd: format(endOfDay(rangeEnd), 'yyyy-MM-dd'),
      report_interval_seconds,
    });
    const reqId = ++loadReqIdRef.current;
    setLoading(true);
    setLoadProgressPct(1);
    setLoadProgressText('Preparing query...');
    lastQueryRef.current = {
      project_id,
      rangeStart,
      rangeEnd,
      report_interval_seconds,
    };

    const q = reportGroupQuery(report_interval_seconds);
    try {
      const selectedProject = projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(project_id));
      setReportUnitsSnapshot({
        units: String(selectedProject?.units ?? ''),
        windmeter_units: String(selectedProject?.windmeter_units ?? ''),
      });
      if (selectedProject && !selectedProject.cycle) {
        if (loadReqIdRef.current !== reqId) return;
        setLogList(null);
        setRawLogs(null);
        Swal.fire({
          title: tr('Report.CycleDisabled', 'Reports Cycle is disabled'),
          text: tr('Report.CycleDisabledMessage', 'Reports are not available. Please enable Reports Cycle in project settings to view reports.'),
          icon: 'info',
          heightAuto: false,
        });
        reportTrace('FIN: load_reports (cycle-disabled)', { project_id, reqId });
        return;
      }

      const { logs: allLogs, totalBeforeCap } = await fetchProjectLogsForRange(
        project_id,
        rangeStart,
        rangeEnd,
        q,
        (pct, text) => {
        if (loadReqIdRef.current !== reqId) return;
        setLoadProgressPct(pct);
        setLoadProgressText(text);
      },
        () => loadReqIdRef.current !== reqId
      );
      if (loadReqIdRef.current !== reqId) return;

        if (!allLogs || allLogs.length === 0) {
          setLogList(null);
          setRawLogs(null);
          Swal.fire({
            title: tr('Report.Export', 'Report'),
            text: 'No reports found for the selected date range and filters. Check status toggles (OK / Overload / Danger / Underload / Tr.Err).',
            icon: 'info',
            heightAuto: false,
          });
          reportTrace('FIN: load_reports (no-rows)', { project_id, reqId });
          return;
        }
        if (totalBeforeCap > MAX_REPORT_LOGS) {
          Swal.fire({
            title: tr('Report.Export', 'Report'),
            text: `Showing the newest ${MAX_REPORT_LOGS.toLocaleString()} logs (${totalBeforeCap.toLocaleString()} matched). Narrow the date range or filters to see older rows.`,
            icon: 'info',
            heightAuto: false,
          });
        }
        setRawLogs(allLogs);
        const groupResult = await buildReportGroupsAsync(
          allLogs,
          q,
          () => loadReqIdRef.current !== reqId,
          (phase, done, total) => {
            if (loadReqIdRef.current !== reqId) return;
            const safeTotal = Math.max(1, total);
            const phaseBase = 70;
            const phaseSpan = 30;
            const phasePct = Math.round((done / safeTotal) * phaseSpan);
            const pct = Math.min(99, phaseBase + phasePct);
            const phaseLabel =
              phase === 'filter' ? 'Filtering' : phase === 'validate' ? 'Validating' : 'Grouping';
            setLoadProgressPct(pct);
            setLoadProgressText(`${phaseLabel} ${Math.min(done, total).toLocaleString()} / ${total.toLocaleString()}`);
          }
        );
        if (loadReqIdRef.current !== reqId) return;
        if (groupResult.cancelled) return;
        const { groups } = groupResult;

        if (!groups) {
          setLogList(null);
          Swal.fire({
            title: tr('Report.Export', 'Report'),
            text: 'No reports found for the selected date range and filters. Check status toggles (OK / Overload / Danger / Underload / Tr.Err).',
            icon: 'info',
            heightAuto: false,
          });
          return;
        }

        setLogList(groups);
        setPage(1);
        setLoadProgressPct(100);
        setLoadProgressText('Finalizing...');
        reportTrace('FIN: load_reports', {
          project_id,
          reqId,
          rows: allLogs.length,
          groups: Object.keys(groups || {}).length,
        });
    } catch (error: any) {
      console.error('Error generating report: ' + error);
      if (loadReqIdRef.current !== reqId) return;
      Swal.fire({
        title: tr('Report.Load', 'Report'),
        text: tr('Report.LoadError', 'Failed to load report.'),
        icon: 'error',
        heightAuto: false,
      });
      reportTrace('ERROR: load_reports', {
        project_id,
        reqId,
        error: String(error?.message || error),
      });
      setLogList(null);
      setRawLogs(null);
    } finally {
      if (loadReqIdRef.current === reqId) {
        setLoading(false);
        setLoadProgressPct(0);
        setLoadProgressText('');
      }
    }
  }

  const ExportList = [
    { title: t('Report.Email'), icon: mailSharp, hidden: true },
    { title: t('Report.CSV'), icon: downloadSharp },
    { title: t('Report.JSON'), icon: codeSlashSharp, hidden: true },
    { title: t('Report.SQL'), icon: cubeSharp, hidden: true },
    { title: t('Report.PDF'), icon: documentSharp },
  ]

  const draw_report_table = () => {
    console.log("===draw_report_table===")
  }

  const sortedIntervalKeys = useMemo(() => {
    if (!logList || typeof logList !== 'object') return [] as string[];
    return (Object.keys(logList) as string[]).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );
  }, [logList]);

  const ReportTable = () => {
    if (!logList || loading) return null
    const intervalKeys = sortedIntervalKeys
    const totalIntervals = intervalKeys.length
    const totalPages = Math.max(1, Math.ceil(totalIntervals / PAGE_SIZE))
    const currentPage = Math.min(page, totalPages)
    const start = (currentPage - 1) * PAGE_SIZE
    const paginatedKeys = intervalKeys.slice(start, start + PAGE_SIZE)
    const paginatedByDate: Record<string, any[]> = {}
    paginatedKeys.forEach((key) => {
      const logs = [...(logList[key] || [])]
      logs.sort((a: any, b: any) => (String(a.lc_id || '')).localeCompare(String(b.lc_id || '')) || (a.log_date || 0) - (b.log_date || 0))
      paginatedByDate[key] = logs
    })

    return (
      <div className="w-full pb-5">
        {paginatedKeys.map((key, index) => (
          <div key={index} className="my-2">
            <Text classes="flex bg-primary text-white py-1 px-3" label={key} />
            <table className="table-auto w-full border-collapse border border-slate-400">
              <thead>
                <tr className="text-left">
                  <th className="border border-slate-300 text-dark dark:text-white px-3 py-1 font-medium ">{t("Report.Title")}</th>
                  <th className="border border-slate-300 text-dark dark:text-white px-3 py-1 font-medium ">{t("Report.ID")}</th>
                  <th className="border border-slate-300 text-dark dark:text-white px-3 py-1 font-medium w-36">Status</th>
                  <th className="border border-slate-300 text-dark dark:text-white px-3 py-1 font-medium w-28">Gross</th>
                  <th className="border border-slate-300 text-dark dark:text-white px-3 py-1 font-medium w-28">Net</th>
                  <th className="border border-slate-300 text-dark dark:text-white px-3 py-1 font-medium w-28">{t("Report.Battery")}</th>
                  <th className="border border-slate-300 text-dark dark:text-white px-3 py-1 font-medium w-48">{t("Report.Time")}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedByDate[key].map((sItem: any, sKey: any) => {
                  const lc = lcs.find((cItem: any) => cItem.id === sItem.lc_id?.toString());
                  const lt = String(sItem.log_type || '').toLowerCase();
                  const isPrrLink = lt === 'prr_connected' || lt === 'prr_disconnected';
                  const titleCell = isPrrLink
                    ? (lt === 'prr_connected' ? 'PRR connected' : 'PRR disconnected')
                    : lc?.title;
                  const idCell = isPrrLink ? (sItem.unit != null && String(sItem.unit) !== '' ? String(sItem.unit) : '—') : lc?.id;
                  const isTrErr = !isPrrLink && ((sItem.log_type != null && String(sItem.log_type).toLowerCase() === 'err') || Number(sItem.value) === -99999999);
                  const grossStr = isPrrLink ? '—' : (isTrErr ? 'Tr.Err' : formatDualWeightWithLcResolution(sItem.value, getReportLogUnit(sItem), sItem.lc_id));
                  const netVal = (sItem as any).tare_applied === true && (sItem as any).net_value != null ? (sItem as any).net_value : sItem.value;
                  const netStr = isPrrLink ? '—' : (isTrErr ? 'Tr.Err' : formatDualWeightWithLcResolution(netVal, getReportLogUnit(sItem), sItem.lc_id));
                  const statusMeta = getStatusMeta(getLogStatus(sItem, lc));
                  return (
                    <tr key={sKey} className="w-full">
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1">{titleCell}</td>
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1">{idCell}</td>
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1 whitespace-pre-line leading-tight">{grossStr}</td>
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1 whitespace-pre-line leading-tight">{netStr}</td>
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1">{formatBattery(sItem.battery)}</td>
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1">{format(sItem.log_date, "yyyy-MM-dd pp")}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}
        {totalIntervals > PAGE_SIZE && (
          <div className="flex flex-row items-center justify-between gap-4 py-2 mt-2 border-t border-slate-300">
            <span className="text-dark dark:text-light">
              {PAGE_SIZE} {t("Report.IntervalsPerPage") || "intervals per page"} · {start + 1}-{Math.min(start + PAGE_SIZE, totalIntervals)} {t("Report.Of") || "of"} {totalIntervals}
            </span>
            <div className="flex flex-row items-center gap-2">
              <button
                type="button"
                className="px-3 py-1 rounded border border-slate-400 disabled:opacity-50"
                disabled={currentPage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                ‹
              </button>
              <span className="text-dark dark:text-light">{currentPage} / {totalPages}</span>
              <button
                type="button"
                className="px-3 py-1 rounded border border-slate-400 disabled:opacity-50"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  useEffect(() => {
    setProjectList(projects)
    if (projects.length > 0) {
      const curId = curProject?.id != null ? normalizeProjectId(curProject.id) : ''
      const curInList = curId && projects.some((p: IProject) => normalizeProjectId(p.id) === curId)
      setSelectedId((prev) => {
        const prevInList = prev && projects.some((p: IProject) => normalizeProjectId(p.id) === prev)
        if (!prevInList && curInList) return curId
        if (!prevInList) return normalizeProjectId(projects[0].id)
        return prev
      })
    } else {
      setSelectedId('')
    }
  }, [projects, curProject?.id])

  useEffect(() => {
    const refreshStorage = async () => {
      try {
        let total = 0
        let free = 0

        // Native first (iOS/Android)
        try {
          const info = await Device.getInfo()
          total = Number((info as any).diskTotal || 0)
          free = Number((info as any).diskFree || 0)
        } catch {
          // ignore and try web estimate fallback
        }

        let source: 'device' | 'origin_quota' | 'unknown' = total > 0 ? 'device' : 'unknown';

        // Fallback when native disk fields are unavailable on this runtime.
        if (!(total > 0) && typeof navigator !== 'undefined' && (navigator as any).storage?.estimate) {
          const estimate = await (navigator as any).storage.estimate()
          const quota = Number(estimate?.quota || 0)
          const usage = Number(estimate?.usage || 0)
          if (quota > 0 && usage >= 0) {
            total = quota
            free = Math.max(0, quota - usage)
            source = 'origin_quota'
          }
        }

        // Approximate reports footprint from row sample (fast, bounded).
        // Include legacy stores so historical data does not appear as "other apps".
        let reportsBytesApprox = 0
        try {
          const [countDailyR, countLogsR, countArchiveR] = await Promise.allSettled([
            db.daily_logs.count(),
            db.logs.count(),
            db.logs_archive.count(),
          ])
          const countDaily = countDailyR.status === 'fulfilled' ? Number(countDailyR.value || 0) : 0
          const countLogs = countLogsR.status === 'fulfilled' ? Number(countLogsR.value || 0) : 0
          const countArchive = countArchiveR.status === 'fulfilled' ? Number(countArchiveR.value || 0) : 0
          const totalCount = countDaily + countLogs + countArchive
          if (totalCount > 0) {
            const sampleCap = 50
            const [sampleDailyR, sampleLogsR, sampleArchiveR] = await Promise.allSettled([
              countDaily > 0
                ? db.daily_logs.orderBy('log_date').reverse().limit(Math.min(sampleCap, countDaily)).toArray()
                : Promise.resolve([] as any[]),
              countLogs > 0
                ? db.logs.orderBy('log_date').reverse().limit(Math.min(sampleCap, countLogs)).toArray()
                : Promise.resolve([] as any[]),
              countArchive > 0
                ? db.logs_archive.orderBy('log_date').reverse().limit(Math.min(sampleCap, countArchive)).toArray()
                : Promise.resolve([] as any[]),
            ])
            const sampleDaily = sampleDailyR.status === 'fulfilled' ? sampleDailyR.value : []
            const sampleLogs = sampleLogsR.status === 'fulfilled' ? sampleLogsR.value : []
            const sampleArchive = sampleArchiveR.status === 'fulfilled' ? sampleArchiveR.value : []
            const sampleRows = [...sampleDaily, ...sampleLogs, ...sampleArchive]
            if (sampleRows.length > 0) {
              const sampleBytes = sampleRows.reduce((acc: number, row: any) => {
                try {
                  return acc + new Blob([JSON.stringify(row)]).size
                } catch {
                  return acc + JSON.stringify(row).length
                }
              }, 0)
              const avgBytes = sampleBytes / sampleRows.length
              // 1.25x factor: IndexedDB/object overhead approximation.
              reportsBytesApprox = Math.round(avgBytes * totalCount * 1.25)
            }
          }
        } catch {
          reportsBytesApprox = 0
        }

        setStorageTotal(Number.isFinite(total) && total > 0 ? total : 0)
        setStorageFree(Number.isFinite(free) && free >= 0 ? free : 0)
        setReportsStorageUsed(Number.isFinite(reportsBytesApprox) && reportsBytesApprox > 0 ? reportsBytesApprox : 0)
        setStorageMetricSource(source)
      } catch {
        setStorageTotal(0)
        setStorageFree(0)
        setReportsStorageUsed(0)
        setStorageMetricSource('unknown')
      }
    }
    void refreshStorage()
    const timer = window.setInterval(() => { void refreshStorage() }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!logList) return
    const totalIntervals = (Object.keys(logList) as string[]).length
    const totalPages = Math.max(1, Math.ceil(totalIntervals / PAGE_SIZE))
    if (page > totalPages) setPage(totalPages)
  }, [logList, page])

  useEffect(() => {
    console.log('filter data: ', filter)
  }, [filter])

  const getAllLogsFromList = (): any[] => {
    if (!logList || typeof logList !== 'object') return [];
    return (Object.keys(logList) as string[])
      .flatMap((key) => logList[key] || [])
      .sort((a: any, b: any) => (b.log_date || 0) - (a.log_date || 0));
  };

  const getReportLogUnit = (log: any): string => {
    const lcId = Number(log?.lc_id);
    const unitFromLog = String(log?.unit ?? '').trim();
    if (!Number.isFinite(lcId)) return unitFromLog;
    const unitFromSnapshot = lcId <= 10 ? reportUnitsSnapshot?.windmeter_units : reportUnitsSnapshot?.units;
    return String(unitFromSnapshot ?? unitFromLog ?? '').trim();
  };
  const inlineMultilineCell = (value: string) => String(value || '').replace(/\s*\n\s*/g, ' | ');

  const formatLogGross = (log: any) => {
    const plt = String(log.log_type || '').toLowerCase();
    if (plt === 'prr_connected') return 'PRR connected';
    if (plt === 'prr_disconnected') return 'PRR disconnected';
    const isErr = (log.log_type != null && String(log.log_type).toLowerCase() === 'err') || Number(log.value) === -99999999;
    return isErr ? 'Tr.Err' : formatDualWeightWithLcResolution(log.value, getReportLogUnit(log), log.lc_id);
  };
  const formatLogNet = (log: any) => {
    const plt = String(log.log_type || '').toLowerCase();
    if (plt === 'prr_connected') return '—';
    if (plt === 'prr_disconnected') return '—';
    const isErr = (log.log_type != null && String(log.log_type).toLowerCase() === 'err') || Number(log.value) === -99999999;
    const netVal = (log as any).tare_applied === true && (log as any).net_value != null ? (log as any).net_value : log.value;
    return isErr ? 'Tr.Err' : formatDualWeightWithLcResolution(netVal, getReportLogUnit(log), log.lc_id);
  };

  type ReportStatus = 'OK' | 'UNDERLOAD' | 'OVERLOAD' | 'DANGER' | 'TR.ERR' | 'PRR CONNECTED' | 'PRR DISCONNECTED';
  const getStatusMeta = (status: ReportStatus) => {
    switch (status) {
      case 'DANGER':
        return { label: 'DANGER', textColor: '#b91c1c', className: 'bg-red-100 text-red-700 border border-red-300' };
      case 'OVERLOAD':
        return { label: 'OVERLOAD', textColor: '#c2410c', className: 'bg-orange-100 text-orange-700 border border-orange-300' };
      case 'UNDERLOAD':
        return { label: 'UNDERLOAD', textColor: '#1d4ed8', className: 'bg-blue-100 text-blue-700 border border-blue-300' };
      case 'TR.ERR':
        return { label: 'TR.ERR', textColor: '#991b1b', className: 'bg-red-200 text-red-800 border border-red-400' };
      case 'PRR CONNECTED':
        return { label: 'PRR CONNECTED', textColor: '#166534', className: 'bg-green-100 text-green-700 border border-green-300' };
      case 'PRR DISCONNECTED':
        return { label: 'PRR DISCONNECTED', textColor: '#6b7280', className: 'bg-gray-200 text-gray-700 border border-gray-300' };
      default:
        return { label: 'OK', textColor: '#065f46', className: 'bg-emerald-100 text-emerald-700 border border-emerald-300' };
    }
  };
  const getLogStatus = (log: any, lc?: any): ReportStatus => {
    const explicitStatus = String(log?.status_code ?? '').toLowerCase();
    if (explicitStatus === 'ok') return 'OK';
    if (explicitStatus === 'underload') return 'UNDERLOAD';
    if (explicitStatus === 'overload') return 'OVERLOAD';
    if (explicitStatus === 'danger') return 'DANGER';
    if (explicitStatus === 'err') return 'TR.ERR';
    const lt = String(log?.log_type || '').toLowerCase();
    if (lt === 'prr_connected') return 'PRR CONNECTED';
    if (lt === 'prr_disconnected') return 'PRR DISCONNECTED';
    if (lt === 'ok') return 'OK';
    if (lt === 'underload') return 'UNDERLOAD';
    if (lt === 'overload') return 'OVERLOAD';
    if (lt === 'danger') return 'DANGER';
    if (lt === 'err') return 'TR.ERR';
    const rawValue = String(log?.value ?? '').trim();
    const valueNum = Number(log?.value);
    const isErr = valueNum === -99999999 || rawValue === 'Tr.Err' || rawValue === 'Tr. Err';
    if (isErr) return 'TR.ERR';
    if (!Number.isFinite(valueNum)) return 'TR.ERR';
    // Fallback path for legacy rows that don't carry explicit status.
    const overNum = Number(log?.overload ?? lc?.overload);
    const underNum = Number(log?.underload ?? lc?.underload);
    if (Number.isFinite(overNum) && overNum > 0 && valueNum >= overNum * 1.3) return 'DANGER';
    if (Number.isFinite(overNum) && valueNum > overNum) return 'OVERLOAD';
    if (Number.isFinite(underNum) && valueNum < underNum) return 'UNDERLOAD';
    return 'OK';
  };

  /** One row per log for exports: Name + ID + metrics */
  const formatBattery = (b: any) => {
    if (b == null || String(b).trim() === '') return '';
    return `${String(b).trim()}%`;
  };
  const getReportRows = (data: any[]) =>
    data.map((log: any) => {
      const plt = String(log.log_type || '').toLowerCase();
      if (plt === 'prr_connected' || plt === 'prr_disconnected') {
        const status = getLogStatus(log);
        return {
          Name: plt === 'prr_connected' ? 'PRR connected' : 'PRR disconnected',
          ID: log.unit != null ? String(log.unit) : '',
          Status: status,
          Gross: '—',
          Net: '—',
          Battery: '',
          Time: format(new Date(log.log_date), 'yyyy-MM-dd HH:mm:ss'),
        };
      }
      const lc = lcs.find((c: any) => c.id === log.lc_id?.toString());
      const status = getLogStatus(log, lc);
      return {
        Name: (lc?.title || '').toString(),
        ID: (lc?.id || log.lc_id || '').toString(),
        Status: status,
        Gross: formatLogGross(log),
        Net: formatLogNet(log),
        Battery: formatBattery(log.battery),
        Time: format(new Date(log.log_date), 'yyyy-MM-dd HH:mm:ss'),
      };
    });

  const openMailtoFallback = (subject: string, logData: any[]) => {
    const project = projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(selectedId));
    const reportRows = getReportRows(logData);
    const lines = reportRows
      .slice(0, 50)
      .map((r) => `${r.Name}\t${r.ID}\t${r.Status}\t${inlineMultilineCell(r.Gross)}\t${inlineMultilineCell(r.Net)}\t${r.Battery}\t${r.Time}`);
    const rangeLine = isSingleDayRange
      ? `Range: ${format(filter.start, 'yyyy-MM-dd')} ${filter.hourStart}-${filter.hourEnd}`
      : `Range: ${format(filter.start, 'yyyy-MM-dd')} → ${format(filter.end, 'yyyy-MM-dd')}`;
    const body = `Report: ${project?.title ?? ''}\n${rangeLine}\nTotal rows: ${logData.length}\n\nName\tID\tStatus\tGross\tNet\tBattery\tTime\n${lines.join('\n')}${logData.length > 50 ? '\n...' : ''}`;
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  const releaseUiLocks = () => {
    if (typeof document === 'undefined') return;
    const cls = ['swal2-shown', 'swal2-height-auto', 'swal2-no-backdrop', 'swal2-iosfix', 'ion-no-scroll'];
    cls.forEach((c) => {
      document.body.classList.remove(c);
      document.documentElement.classList.remove(c);
    });
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    document.body.style.removeProperty('padding-right');
    document.documentElement.style.removeProperty('padding-right');
  };

  const recoverAfterNativeDialog = (successMessage?: string) => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          releaseUiLocks();
          void document.body.offsetHeight;
          window.dispatchEvent(new Event('resize'));
          if (successMessage) toast.success(successMessage);
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
          layoutRefreshRef.current?.();
        } catch {
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
        }
      }, 380);
    });
  };

  /** After Share sheet / intent on native: toast instead of Swal (Swal + iOS WKWebView often leaves a black overlay). */
  const nativeDeferredAfterShare = (successMessage: string) => {
    recoverAfterNativeDialog(successMessage);
  };

  /** Cap row count for PDF when using native Share (Android + iOS); keeps main thread responsive. */
  const MAX_NATIVE_PDF_ROWS = 1500;

  const isUserCancelledError = (err: any) => {
    const msg = String(err?.message || err || '').toLowerCase();
    return msg.includes('cancel') || msg.includes('canceled') || msg.includes('cancelled') || msg.includes('aborted');
  };

  /**
   * Keep progress visible while preparing files; hide it before native modal opens
   * so a cancel never leaves the UI blocked behind our own overlay.
   */
  const openNativeDialogSafely = async (openDialog: () => Promise<any>) => {
    setExportBusy(false);
    try {
      // IMPORTANT: no timeout here. Native share/email sheet can stay open for a long time while
      // user picks app/contact, and timing out would throw fake export errors + broken UI state.
      await openDialog();
      return { cancelled: false };
    } catch (err: any) {
      if (isUserCancelledError(err)) return { cancelled: true };
      throw err;
    }
  };

  /** Deferred start keeps overlay painted before heavy PDF/CSV work on the main thread. */
  const runNativeExport = (fn: () => Promise<void>): Promise<void> =>
    new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          fn()
            .then(() => resolve())
            .catch((err) => {
              if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
              console.error('[Report Export] Error:', err);
              Swal.fire({
                title: tr('Report.Export', 'Export'),
                text: tr('Report.ExportError', 'Failed to export.'),
                icon: 'error',
                heightAuto: false,
              });
              resolve();
            });
        }, 50);
      });
    });

  const getExportDataset = async () => {
    return getAllLogsFromList();
  };

  const getReportBrandingLabels = (): ReportBrandingLabels => ({
    reportTitle: tr('Report.Export', 'Report'),
    project: tr('Report.BrandingProject', 'Project'),
    artist: tr('Report.BrandingArtist', 'Artist'),
    city: tr('Report.BrandingCity', 'City'),
    user: tr('Report.BrandingUser', 'User'),
    website: tr('Report.BrandingWebsite', 'Website'),
    range: tr('Report.BrandingRange', 'Range'),
    generated: tr('Report.BrandingGenerated', 'Generated'),
  });

  const buildPdfDocumentForLogs = async (
    sourceLogData: any[],
    truncated?: { totalRows: number },
  ) => {
    const project = projects.find((p) => normalizeProjectId(p.id) === normalizeProjectId(selectedId));
    const branding = await loadReportBranding(selectedId, project?.title ?? '');
    const brandingLabels = getReportBrandingLabels();
    return buildReportLogsPdfDocument({
      rows: getReportRows(sourceLogData),
      branding,
      labels: {
        ...brandingLabels,
        battery: tr('Report.Battery', 'Battery'),
        time: tr('Report.Time', 'Time'),
      },
      isSingleDayRange,
      filterStart: filter.start,
      filterEnd: filter.end,
      hourStart: filter.hourStart,
      hourEnd: filter.hourEnd,
      truncatedNote: truncated
        ? tr(
          'Report.PdfTruncatedNote',
          `First ${MAX_NATIVE_PDF_ROWS} of ${truncated.totalRows} rows. Use CSV for full report.`,
        )
        : undefined,
      getStatusMeta: (status) => getStatusMeta(status as ReportStatus),
    });
  };

  const handleExport = async (type: string) => {
    setExportBusy(true);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    let logData = await getExportDataset();

    if (logData.length === 0) {
      Swal.fire({
        title: t('Report.Export') || 'Export',
        text: t('Report.NoDataToExport') || 'No data to export. Load a report first.',
        icon: 'info',
        heightAuto: false,
      });
      console.log('[Report Export] No data to export');
      setExportBusy(false);
      return;
    }
    try {
    switch (type) {
      case t('Report.CSV'): {
        try {
          const project = projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(selectedId));
          const branding = await loadReportBranding(selectedId, project?.title ?? '');
          const brandingLabels = getReportBrandingLabels();
          const rangeLabel = buildReportRangeLabel(
            isSingleDayRange,
            filter.start,
            filter.end,
            filter.hourStart,
            filter.hourEnd,
          );
          const preamble = buildCsvBrandingLines(branding, brandingLabels, rangeLabel);
          const escapeCsv = (v: any) => {
            const s = v == null ? '' : String(v);
            if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
          };
          const reportRows = getReportRows(logData);
          const rows: string[] = [...preamble, 'Name,ID,Status,Gross,Net,Battery,Time'];
          reportRows.forEach((r) => rows.push([r.Name, r.ID, r.Status, r.Gross, r.Net, r.Battery, r.Time].map(escapeCsv).join(',')));
          const csvStr = rows.join('\r\n');
          const fileName = `report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;

          if (platformType === 'web') {
            const blob = new Blob(['\uFEFF' + csvStr], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
          } else if (platformType === 'android' || platformType === 'ios') {
                const csvHeader = '\uFEFF' + preamble.join('\r\n') + '\r\nName,ID,Status,Gross,Net,Battery,Time\r\n';
                const csvChunks: string[] = [csvHeader];
                reportRows.forEach((r) => {
                  csvChunks.push([r.Name, r.ID, r.Status, r.Gross, r.Net, r.Battery, r.Time].map(escapeCsv).join(',') + '\r\n');
                });
                await writeTextFileInChunks(fileName, csvChunks);
            const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1');
            const shareResult = await openNativeDialogSafely(() => Share.share({ url: uri, title: t('Report.Export') || 'Export', dialogTitle: t('Report.Export') || 'Export' }));
            if (shareResult.cancelled) {
              recoverAfterNativeDialog();
              if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
              return;
            }
            nativeDeferredAfterShare(`${t('Report.ExportSuccess') || 'Export success'} (${logData.length} logs).`);
          } else {
            await Filesystem.writeFile({ path: fileName, data: '\uFEFF' + csvStr, directory: Directory.Documents, encoding: Encoding.UTF8 });
            Swal.fire({ title: t('Report.Export') || 'Export', text: `${t('Report.ExportSuccess')} (${logData.length} logs).`, icon: 'success', heightAuto: false });
          }
        } catch (err) {
          if ((platformType === 'android' || platformType === 'ios') && typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
          console.error('[Report Export] CSV export error:', err);
          Swal.fire({
            title: t('Report.Export') || 'Export',
            text: t('Report.ExportError') || 'Failed to export CSV.',
            icon: 'error',
          });
        }
        break;
      }
      case t('Report.JSON'): {
        if (platformType === 'android' || platformType === 'ios') {
          await runNativeExport(async () => {
            try {
              const reportRows = getReportRows(logData);
              const fileName = `report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.json`;
              const jsonChunks: string[] = ['[\n'];
              reportRows.forEach((r, idx) => {
                jsonChunks.push(`  ${JSON.stringify(r)}${idx < reportRows.length - 1 ? ',' : ''}\n`);
              });
              jsonChunks.push(']\n');
              await writeTextFileInChunks(fileName, jsonChunks);
              const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
              if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1');
              const shareResult = await openNativeDialogSafely(() => Share.share({ url: uri, title: t('Report.Export') || 'Export', dialogTitle: t('Report.Export') || 'Export' }));
              if (shareResult.cancelled) {
                recoverAfterNativeDialog();
                if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
                return;
              }
              nativeDeferredAfterShare(`${t('Report.ExportSuccess') || 'Export success'} (${logData.length} logs).`);
            } catch (err) {
              if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
              console.error('[Report Export] JSON export error:', err);
              Swal.fire({ title: t('Report.Export') || 'Export', text: t('Report.ExportError') || 'Failed to export JSON.', icon: 'error' });
            }
          });
          break;
        }
        try {
          const reportRows = getReportRows(logData);
          const jsonStr = JSON.stringify(reportRows, null, 2);
          const fileName = `report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.json`;
          if (platformType === 'web') {
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
          } else {
            await Filesystem.writeFile({ path: fileName, data: jsonStr, directory: Directory.Documents, encoding: Encoding.UTF8 });
            Swal.fire({ title: t('Report.Export') || 'Export', text: `${t('Report.ExportSuccess')} (${logData.length} logs).`, icon: 'success' });
          }
        } catch (err) {
          console.error('[Report Export] JSON export error:', err);
          Swal.fire({ title: t('Report.Export') || 'Export', text: t('Report.ExportError') || 'Failed to export JSON.', icon: 'error' });
        }
        break;
      }
      case t('Report.SQL'): {
        if (platformType === 'android' || platformType === 'ios') {
          await runNativeExport(async () => {
            try {
              const reportRows = getReportRows(logData);
              const escape = (v: any) => {
                const s = String(v ?? '').replace(/'/g, "''");
                return `'${s}'`;
              };
              const fileName = `report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.sql`;
              const sqlChunks: string[] = [];
              reportRows.forEach((r) => {
                sqlChunks.push(`INSERT INTO logs (\`Name\`,\`ID\`,\`Status\`,\`Gross\`,\`Net\`,\`Battery\`,\`Time\`) VALUES (${escape(r.Name)},${escape(r.ID)},${escape(r.Status)},${escape(r.Gross)},${escape(r.Net)},${escape(r.Battery)},${escape(r.Time)});\n`);
              });
              await writeTextFileInChunks(fileName, sqlChunks);
              const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
              if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1');
              const shareResult = await openNativeDialogSafely(() => Share.share({ url: uri, title: t('Report.Export') || 'Export', dialogTitle: t('Report.Export') || 'Export' }));
              if (shareResult.cancelled) {
                recoverAfterNativeDialog();
                if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
                return;
              }
              nativeDeferredAfterShare(`${t('Report.ExportSuccess') || 'Export success'} (${logData.length} logs).`);
            } catch (err) {
              if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
              console.error('[Report Export] SQL export error:', err);
              Swal.fire({ title: t('Report.Export') || 'Export', text: t('Report.ExportError') || 'Failed to export SQL.', icon: 'error' });
            }
          });
          break;
        }
        try {
          const reportRows = getReportRows(logData);
          const escape = (v: any) => {
            const s = String(v ?? '').replace(/'/g, "''");
            return `'${s}'`;
          };
          const lines: string[] = reportRows.map(
            (r) => `INSERT INTO logs (\`Name\`,\`ID\`,\`Status\`,\`Gross\`,\`Net\`,\`Battery\`,\`Time\`) VALUES (${escape(r.Name)},${escape(r.ID)},${escape(r.Status)},${escape(r.Gross)},${escape(r.Net)},${escape(r.Battery)},${escape(r.Time)});`
          );
          const sqlStr = lines.join('\n');
          const fileName = `report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.sql`;
          if (platformType === 'web') {
            const blob = new Blob([sqlStr], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
          } else {
            await Filesystem.writeFile({ path: fileName, data: sqlStr, directory: Directory.Documents, encoding: Encoding.UTF8 });
            Swal.fire({ title: t('Report.Export') || 'Export', text: `${t('Report.ExportSuccess')} (${logData.length} logs).`, icon: 'success' });
          }
        } catch (err) {
          console.error('[Report Export] SQL export error:', err);
          Swal.fire({ title: t('Report.Export') || 'Export', text: t('Report.ExportError') || 'Failed to export SQL.', icon: 'error' });
        }
        break;
      }
      case t('Report.PDF'): {
        if (platformType === 'android' || platformType === 'ios') {
          await runNativeExport(async () => {
            try {
              const totalRows = logData.length;
              const capped = totalRows > MAX_NATIVE_PDF_ROWS;
              const rowsForPdfSource = capped ? logData.slice(0, MAX_NATIVE_PDF_ROWS) : logData;
              const doc = await buildPdfDocumentForLogs(
                rowsForPdfSource,
                capped ? { totalRows } : undefined,
              );
              const fileName = `report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`;
              const base64 = doc.output('datauristring').split(',')[1];
              await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
              const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
              if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1');
              const shareResult = await openNativeDialogSafely(() => Share.share({ url: uri, title: t('Report.Export') || 'Export', dialogTitle: t('Report.Export') || 'Export' }));
              if (shareResult.cancelled) {
                recoverAfterNativeDialog();
                if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
                return;
              }
              const successMsg = capped
                ? (t('Report.ExportSuccessFirstOf') || 'Report exported (first {{first}} of {{total}} logs). Use CSV for full data.').replace('{{first}}', String(MAX_NATIVE_PDF_ROWS)).replace('{{total}}', String(totalRows))
                : `${t('Report.ExportSuccess') || 'Export success'} (${totalRows} logs).`;
              nativeDeferredAfterShare(successMsg);
            } catch (err) {
              if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
              console.error('[Report Export] PDF export error:', err);
              Swal.fire({ title: t('Report.Export') || 'Export', text: t('Report.ExportError') || 'Failed to export PDF.', icon: 'error' });
            }
          });
          break;
        }
        try {
          const doc = await buildPdfDocumentForLogs(logData);
          const fileName = `report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`;
          if (platformType === 'web') {
            const blob = doc.output('blob');
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
            console.log('[Report Export] PDF Web download triggered', fileName);
          } else {
            const base64 = doc.output('datauristring').split(',')[1];
            await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Documents });
            Swal.fire({ title: t('Report.Export') || 'Export', text: `${t('Report.ExportSuccess')} (${logData.length} logs).`, icon: 'success', heightAuto: false });
          }
        } catch (err) {
          console.error('[Report Export] PDF export error:', err);
          Swal.fire({ title: t('Report.Export') || 'Export', text: t('Report.ExportError') || 'Failed to export PDF.', icon: 'error', heightAuto: false });
        }
        break;
      }
      case t('Report.Email'): {
        try {
          const project = projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(selectedId));
          const subject = 'Ron Stage Master Report' + (project?.title ? ` - ${project.title}` : '');
          const escapeCsv = (v: any) => {
            const s = v == null ? '' : String(v);
            if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
          };
          const reportRows = getReportRows(logData);
          const csvRows: string[] = ['Name,ID,Status,Gross,Net,Battery,Time'];
          reportRows.forEach((r) => csvRows.push([r.Name, r.ID, r.Status, r.Gross, r.Net, r.Battery, r.Time].map(escapeCsv).join(',')));
          const csvStr = '\uFEFF' + csvRows.join('\r\n');
          const fileName = `report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
          const rangeStr = isSingleDayRange
            ? `${format(filter.start, 'yyyy-MM-dd')} ${filter.hourStart}-${filter.hourEnd}`
            : `${format(filter.start, 'yyyy-MM-dd')} → ${format(filter.end, 'yyyy-MM-dd')}`;
          const bodyText = project?.title
            ? `${t('Report.AttachedReport') || 'Please find the report attached.'} ${project.title}, ${rangeStr}, ${logData.length} ${t('Report.Rows') || 'rows'}.`
            : `${t('Report.AttachedReport') || 'Please find the report attached.'} ${logData.length} ${t('Report.Rows') || 'rows'}.`;

          const isNative = Capacitor.isNativePlatform();
          if (isNative) {
            try {
              const available = await EmailComposer.isAvailable();
              if (available) {
                let attachments: string[] = [];
                if (platformType === 'android') {
                  await Filesystem.writeFile({ path: fileName, data: csvStr, directory: Directory.Cache, encoding: Encoding.UTF8 });
                  const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
                  attachments = [uri];
                } else {
                  const base64Csv = btoa(unescape(encodeURIComponent(csvStr)));
                  attachments = [`base64:${fileName}//${base64Csv}`];
                }
                if ((platformType === 'android' || platformType === 'ios') && typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1');
                const emailResult = await openNativeDialogSafely(() => EmailComposer.open({
                  subject,
                  body: bodyText,
                  isHtml: false,
                  attachments,
                }));
                if (emailResult.cancelled) {
                  recoverAfterNativeDialog();
                  if ((platformType === 'android' || platformType === 'ios') && typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
                  return;
                }
                nativeDeferredAfterShare(t('Report.EmailOpened') || 'Email composer opened.');
              } else {
                openMailtoFallback(subject, logData);
              }
            } catch (pluginErr) {
              if (isUserCancelledError(pluginErr)) {
                if ((platformType === 'android' || platformType === 'ios') && typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
                return;
              }
              if ((platformType === 'android' || platformType === 'ios') && typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
              console.warn('[Report Email] Plugin failed, using mailto:', pluginErr);
              openMailtoFallback(subject, logData);
            }
          } else {
            openMailtoFallback(subject, logData);
          }
        } catch (err) {
          if ((platformType === 'android' || platformType === 'ios') && typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
          console.error('[Report Export] Email error:', err);
          Swal.fire({ title: t('Report.Export') || 'Export', text: t('Report.ExportError') || 'Failed to open email.', icon: 'error', heightAuto: false });
        }
        break;
      }
      default:
        break;
    }
    } finally {
      setExportBusy(false);
    }
  }

  const handleChangeFilter = <K extends keyof LogFilter>(field: K, value: LogFilter[K]) => {
    setFilter((v) => ({ ...v, [field]: value }));
    setPendingRefresh(true);
  };

  const handleRemove = async () => {
    if (!selectedId) return;
    const pidNorm = normalizeProjectId(selectedId);
    const result = await Swal.fire({
      title: 'Delete Logs',
      text: 'Delete only logs matching current project + date/status/hour filters? This cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: t("Common.Confirm"),
      cancelButtonText: t("Common.Cancel"),
      heightAuto: false
    });
    if (!result.value) return;

    const q = reportGroupQuery(reportIntervalSeconds);
    const filterEnabled = q.ok || q.overload || q.danger || q.underload || q.trerr;
    const activeStatuses = new Set<string>();
    if (q.ok) activeStatuses.add('ok');
    if (q.overload) activeStatuses.add('overload');
    if (q.danger) activeStatuses.add('danger');
    if (q.underload) activeStatuses.add('underload');
    if (q.trerr) activeStatuses.add('err');
    const inSelectedStatus = (row: any) => {
      if (!filterEnabled) return true;
      const lt = String(row?.log_type || '').toLowerCase();
      if (lt === 'prr_connected' || lt === 'prr_disconnected') return true;
      const status = String(row?.status_code || lt || '').toLowerCase();
      return activeStatuses.has(status);
    };

    const startMs = getTime(startOfDay(filter.start));
    const endMs = getTime(endOfDay(filter.end));
    const startSec = Math.floor(startMs / 1000);
    const endSec = Math.floor(endMs / 1000);
    const isSingleDay = format(filter.start, 'yyyy-MM-dd') === format(filter.end, 'yyyy-MM-dd');
    const timeWindow = (isSingleDay && activeTimeRange) ? activeTimeRange : null;
    const inSelectedHour = (logDateValue: any) => {
      if (!timeWindow) return true;
      const ms = Number(logDateValue || 0);
      if (!Number.isFinite(ms) || ms <= 0) return false;
      const d = new Date(ms);
      const mins = d.getHours() * 60 + d.getMinutes();
      return mins >= timeWindow.startMin && mins <= timeWindow.endMin;
    };

    const pidNum = Number(pidNorm);
    const pidCandidates: any[] = [];
    if (pidNorm) pidCandidates.push(pidNorm);
    if (Number.isFinite(pidNum)) pidCandidates.push(pidNum);

    const CHUNK = 5000;
    let deletedCount = 0;
    setLoading(true);
    setLoadProgressPct(2);
    setLoadProgressText('Deleting filtered logs...');
    try {
      // Primary store (current reports pipeline)
      for (const pidCandidate of pidCandidates) {
        let upper = endMs;
        while (upper >= startMs) {
          const slice = await db.daily_logs
            .where('[project_id+day_key+log_date]')
            .between(
              [pidCandidate, format(new Date(startMs), 'yyyy-MM-dd'), startMs],
              [pidCandidate, format(new Date(endMs), 'yyyy-MM-dd'), upper],
              true,
              true
            )
            .reverse()
            .limit(CHUNK)
            .toArray();
          if (!slice || slice.length === 0) break;
          const toDelete = slice
            .filter((row: any) => {
              const dt = Number(row?.log_date || 0);
              if (!(dt >= startMs && dt <= endMs)) return false;
              if (!inSelectedHour(dt)) return false;
              return inSelectedStatus(row);
            })
            .map((row: any) => row.id)
            .filter((id: any) => id != null);
          if (toDelete.length > 0) {
            await db.daily_logs.bulkDelete(toDelete);
            deletedCount += toDelete.length;
          }
          const oldest = Number(slice[slice.length - 1]?.log_date ?? startMs) - 1;
          if (!Number.isFinite(oldest) || oldest < startMs) break;
          upper = oldest;
          setLoadProgressText(`Deleting daily logs... ${deletedCount.toLocaleString()} removed`);
        }
      }

      // Legacy stores (so deleted rows do not reappear through fallback reads)
      const deleteLegacyFromTable = async (table: any, label: string) => {
        for (const pidCandidate of pidCandidates) {
          const rowsMs = await table
            .where('[project_id+log_date]')
            .between([pidCandidate, startMs], [pidCandidate, endMs], true, true)
            .toArray()
            .catch(() => []);
          const rowsSec = await table
            .where('[project_id+log_date]')
            .between([pidCandidate, startSec], [pidCandidate, endSec], true, true)
            .toArray()
            .catch(() => []);
          const mergedRows = mergeAndDeduplicateLogs([rowsMs, rowsSec]).map(normalizeLegacyLogDate);
          const toDelete = mergedRows
            .filter((row: any) => inSelectedHour(row?.log_date) && inSelectedStatus(row))
            .map((row: any) => row.id)
            .filter((id: any) => id != null);
          if (toDelete.length > 0) {
            await table.bulkDelete(toDelete);
            deletedCount += toDelete.length;
          }
          setLoadProgressText(`Deleting ${label}... ${deletedCount.toLocaleString()} removed`);
        }
      };
      await deleteLegacyFromTable(db.logs, 'legacy logs');
      await deleteLegacyFromTable(db.logs_archive, 'legacy archive');

      setLogList(null);
      setRawLogs(null);
      setPendingRefresh(true);
      await Swal.fire({
        title: tr('Report.Load', 'Report'),
        text: `Deleted ${deletedCount.toLocaleString()} filtered logs.`,
        icon: 'success',
        heightAuto: false,
      });
    } catch (error) {
      console.error('Failed to delete logs:', error);
      await Swal.fire({
        title: tr('Report.Load', 'Report'),
        text: 'Failed to delete filtered logs.',
        icon: 'error',
        heightAuto: false,
      });
    } finally {
      setLoading(false);
      setLoadProgressPct(0);
      setLoadProgressText('');
    }
  }
  const handleRefresh = () => {
    if (!selectedId) {
      Swal.fire({
        title: tr('Report.Load', 'Report'),
        text: 'Select a project first.',
        icon: 'info',
        heightAuto: false,
      });
      return;
    }
    if (!filter.start || !filter.end || getTime(filter.start) > getTime(filter.end)) {
      Swal.fire({
        title: tr('Report.Load', 'Report'),
        text: 'Choose a valid From / To date range.',
        icon: 'info',
        heightAuto: false,
      });
      return;
    }
    if (isSingleDayRange && !activeTimeRange) {
      Swal.fire({
        title: tr('Report.Load', 'Report'),
        text: 'Choose a valid hour range (From must be before To).',
        icon: 'info',
        heightAuto: false,
      });
      return;
    }
    setPendingRefresh(false);
    setReloadNonce((n) => n + 1);
  };

  const buildLegacyRescueRows = async (projectId: string, rangeStart: Date, rangeEnd: Date, cap = 200000) => {
    const startMs = getTime(startOfDay(rangeStart));
    const endMs = getTime(endOfDay(rangeEnd));
    const startSec = Math.floor(startMs / 1000);
    const endSec = Math.floor(endMs / 1000);
    const pidNorm = normalizeProjectId(projectId);
    const pidNum = Number(pidNorm);
    const pidCandidates: any[] = [];
    if (pidNorm) pidCandidates.push(pidNorm);
    if (Number.isFinite(pidNum)) pidCandidates.push(pidNum);

    const queryByPid = async (table: any, pidCandidate: any) => {
      const msRows = await table
        .where('[project_id+log_date]')
        .between([pidCandidate, startMs], [pidCandidate, endMs], true, true)
        .reverse()
        .limit(cap)
        .toArray()
        .catch(() => []);
      const secRows = await table
        .where('[project_id+log_date]')
        .between([pidCandidate, startSec], [pidCandidate, endSec], true, true)
        .reverse()
        .limit(cap)
        .toArray()
        .catch(() => []);
      return mergeAndDeduplicateLogs([msRows, secRows]).map(normalizeLegacyLogDate);
    };

    const tableRows: any[] = [];
    for (const pidCandidate of pidCandidates) {
      const [r1, r2] = await Promise.all([
        queryByPid(db.logs, pidCandidate),
        queryByPid(db.logs_archive, pidCandidate),
      ]);
      const merged = mergeAndDeduplicateLogs([r1, r2]);
      if (merged.length > 0) {
        tableRows.push(...merged);
        break;
      }
    }

    if (tableRows.length === 0) {
      // Emergency fallback: project_id may be corrupted in legacy rows.
      // Use selected project's LC ids + date range.
      const lcIds = new Set(
        lcs
          .filter((c: any) => normalizeProjectId(c.project_id) === pidNorm)
          .map((c: any) => String(c.id))
      );
      if (lcIds.size > 0) {
        const byLcAndDate = (row: any) => {
          const r = normalizeLegacyLogDate(row);
          const dt = Number(r.log_date || 0);
          return dt >= startMs && dt <= endMs && lcIds.has(String(r.lc_id ?? ''));
        };
        const [slowLogs, slowArchive] = await Promise.all([
          db.logs.filter(byLcAndDate).reverse().limit(cap).toArray().catch(() => []),
          db.logs_archive.filter(byLcAndDate).reverse().limit(cap).toArray().catch(() => []),
        ]);
        tableRows.push(...mergeAndDeduplicateLogs([slowLogs, slowArchive]));
      }
    }

    return mergeAndDeduplicateLogs([tableRows])
      .map(normalizeLegacyLogDate)
      .sort((a: any, b: any) => Number(b.log_date) - Number(a.log_date))
      .slice(0, cap);
  };

  const handleExportLegacyRescueCsv = async () => {
    if (!selectedId) return;
    setExportBusy(true);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    try {
      const rows = await buildLegacyRescueRows(selectedId, filter.start, filter.end, 200000);
      if (!rows.length) {
        Swal.fire({
          title: tr('Report.Export', 'Export'),
          text: 'No legacy rows found for the selected project/date range.',
          icon: 'info',
          heightAuto: false,
        });
        return;
      }
      const escapeCsv = (v: any) => {
        const s = v == null ? '' : String(v);
        if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      };
      const headers = ['project_id', 'lc_id', 'log_type', 'status_code', 'value', 'realval', 'unit', 'battery', 'log_date'];
      const lines: string[] = [headers.join(',')];
      rows.forEach((r: any) => {
        lines.push(
          headers.map((k) => {
            if (k === 'log_date') return escapeCsv(format(new Date(Number(r.log_date || 0)), 'yyyy-MM-dd HH:mm:ss'));
            return escapeCsv((r as any)[k]);
          }).join(',')
        );
      });
      const csvStr = '\uFEFF' + lines.join('\r\n');
      const fileName = `legacy_rescue_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
      if (platformType === 'web') {
        const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else if (platformType === 'android' || platformType === 'ios') {
        await Filesystem.writeFile({ path: fileName, data: csvStr, directory: Directory.Cache, encoding: Encoding.UTF8 });
        const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1');
        const shareResult = await openNativeDialogSafely(() => Share.share({ url: uri, title: 'Legacy Rescue Export', dialogTitle: 'Legacy Rescue Export' }));
        if (shareResult.cancelled) {
          recoverAfterNativeDialog();
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
          return;
        }
        nativeDeferredAfterShare(`Legacy rescue CSV exported (${rows.length} rows).`);
      } else {
        await Filesystem.writeFile({ path: fileName, data: csvStr, directory: Directory.Documents, encoding: Encoding.UTF8 });
      }
    } catch (err: any) {
      console.error('[Reports Legacy Rescue] export error', err);
      Swal.fire({ title: tr('Report.Export', 'Export'), text: 'Failed to export legacy rescue CSV.', icon: 'error', heightAuto: false });
    } finally {
      setExportBusy(false);
    }
  };

  const handleLogsDiagnostics = async () => {
    try {
      const selectedPid = normalizeProjectId(selectedId || '');
      const rowsByProject = lcs.filter((c: any) => normalizeProjectId(c.project_id) === selectedPid);
      const lcSet = new Set(rowsByProject.map((c: any) => String(c.id)));
      const describeTable = async (name: string, table: any) => {
        const total = await table.count().catch(() => 0);
        const newest = await table.orderBy('log_date').last().catch(() => null);
        const oldest = await table.orderBy('log_date').first().catch(() => null);
        const byProject = selectedPid
          ? await table.filter((r: any) => normalizeProjectId(r?.project_id) === selectedPid).count().catch(() => 0)
          : 0;
        const byLcFallback = (selectedPid && lcSet.size > 0)
          ? await table.filter((r: any) => lcSet.has(String(r?.lc_id ?? ''))).count().catch(() => 0)
          : 0;
        const fmt = (v: any) => {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) {
            const ms = n < 1_000_000_000_000 ? n * 1000 : n;
            return format(new Date(ms), 'yyyy-MM-dd HH:mm:ss');
          }
          const p = Date.parse(String(v ?? ''));
          if (Number.isFinite(p)) return format(new Date(p), 'yyyy-MM-dd HH:mm:ss');
          return 'n/a';
        };
        return `• ${name}: total=${Number(total).toLocaleString()}, byProject=${Number(byProject).toLocaleString()}, byLcFallback=${Number(byLcFallback).toLocaleString()}, oldest=${fmt(oldest?.log_date)}, newest=${fmt(newest?.log_date)}`;
      };
      const lines = await Promise.all([
        describeTable('daily_logs', db.daily_logs),
        describeTable('logs', db.logs),
        describeTable('logs_archive', db.logs_archive),
      ]);
      await Swal.fire({
        title: 'Logs diagnostics',
        text: [`selected project=${selectedPid || 'n/a'}`, ...lines].join('\n'),
        icon: 'info',
        heightAuto: false,
      });
    } catch (err: any) {
      console.error('[Reports Diagnostics] failed', err);
      Swal.fire({ title: 'Logs diagnostics', text: 'Failed to run diagnostics.', icon: 'error', heightAuto: false });
    }
  };

  const estimateProjectImageBytes = async () => {
    try {
      const list = await db.projects.toArray().catch(() => []);
      let total = 0;
      for (const p of list) {
        const img = String(p?.p_image ?? '');
        if (!img) continue;
        const commaIdx = img.indexOf(',');
        const payload = commaIdx >= 0 ? img.slice(commaIdx + 1) : img;
        // Base64 payload: 4 chars ~= 3 bytes (rough estimate).
        total += Math.floor((payload.length * 3) / 4);
      }
      return total;
    } catch {
      return 0;
    }
  };

  const dirSizeBytes = async (directory: Directory, path = ''): Promise<number> => {
    let total = 0;
    try {
      const res: any = await Filesystem.readdir({ directory, path });
      const files: any[] = Array.isArray(res?.files) ? res.files : [];
      for (const f of files) {
        const name = typeof f === 'string' ? f : String(f?.name ?? '');
        if (!name) continue;
        const child = path ? `${path}/${name}` : name;
        let st: any = null;
        try {
          st = await Filesystem.stat({ directory, path: child });
        } catch {
          continue;
        }
        const typ = String(st?.type ?? '').toLowerCase();
        if (typ === 'directory') {
          total += await dirSizeBytes(directory, child);
        } else {
          total += Number(st?.size || 0);
        }
      }
    } catch {
      // ignore
    }
    return total;
  };

  const handleStorageDiagnostics = async () => {
    try {
      const [dailyCount, logsCount, archiveCount, pimgBytes, cacheBytes, docsBytes] = await Promise.all([
        db.daily_logs.count().catch(() => 0),
        db.logs.count().catch(() => 0),
        db.logs_archive.count().catch(() => 0),
        estimateProjectImageBytes(),
        dirSizeBytes(Directory.Cache),
        dirSizeBytes(Directory.Documents),
      ]);
      const fmt = (b: number) => `${(b / (1024 ** 3)).toFixed(2)} GB`;
      await Swal.fire({
        title: 'Storage diagnostics',
        text: [
          `daily_logs rows: ${Number(dailyCount).toLocaleString()}`,
          `logs rows: ${Number(logsCount).toLocaleString()}`,
          `logs_archive rows: ${Number(archiveCount).toLocaleString()}`,
          `project images (p_image): ~${fmt(pimgBytes)}`,
          `Cache directory: ~${fmt(cacheBytes)}`,
          `Documents directory: ~${fmt(docsBytes)}`,
        ].join('\n'),
        icon: 'info',
        heightAuto: false,
      });
    } catch (err: any) {
      console.error('[Reports Storage Diagnostics] failed', err);
      Swal.fire({ title: 'Storage diagnostics', text: 'Failed to run storage diagnostics.', icon: 'error', heightAuto: false });
    }
  };

  const handleCleanupAppFiles = async () => {
    const confirm = await Swal.fire({
      title: 'Clean app files',
      text: 'Delete exported/temp files from Cache and Documents? (Does not delete projects or LCs)',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Clean',
      cancelButtonText: 'Cancel',
      heightAuto: false,
    });
    if (!confirm.isConfirmed) return;
    try {
      const clearDir = async (directory: Directory, path = ''): Promise<void> => {
        const res: any = await Filesystem.readdir({ directory, path }).catch(() => ({ files: [] }));
        const files: any[] = Array.isArray(res?.files) ? res.files : [];
        for (const f of files) {
          const name = typeof f === 'string' ? f : String(f?.name ?? '');
          if (!name) continue;
          const child = path ? `${path}/${name}` : name;
          const st: any = await Filesystem.stat({ directory, path: child }).catch(() => null);
          const typ = String(st?.type ?? '').toLowerCase();
          if (typ === 'directory') {
            await clearDir(directory, child);
            await Filesystem.rmdir({ directory, path: child, recursive: false }).catch(() => undefined);
          } else {
            await Filesystem.deleteFile({ directory, path: child }).catch(() => undefined);
          }
        }
      };
      // Most exports are written in Cache; some flows use Documents.
      await Promise.all([clearDir(Directory.Cache), clearDir(Directory.Documents)]);
      Swal.fire({
        title: 'Clean app files',
        text: 'Cache/Documents cleanup completed.',
        icon: 'success',
        heightAuto: false,
      });
    } catch (err: any) {
      console.error('[Reports Cleanup] failed', err);
      Swal.fire({ title: 'Clean app files', text: 'Cleanup failed.', icon: 'error', heightAuto: false });
    }
  };
  const handleCancelLoad = () => {
    loadReqIdRef.current += 1
    setLoading(false)
    setLoadProgressPct(0)
    setLoadProgressText('')
  }

  // Rebuild groups only when new raw dataset is loaded (Refresh).
  useEffect(() => {
    if (!rawLogs) return;
    const gen = ++filterBuildGenRef.current;
    const q = reportGroupQuery(reportIntervalSeconds);
    void (async () => {
      const result = await buildReportGroupsAsync(rawLogs, q, () => gen !== filterBuildGenRef.current);
      if (gen !== filterBuildGenRef.current || result.cancelled) return;
      setLogList(result.groups);
      setPage(1);
    })();
  }, [rawLogs, reportIntervalSeconds]);

  const selectedProject = projectList.find((p: IProject) => normalizeProjectId(p.id) === normalizeProjectId(selectedId));

  const busyMessage = exportBusy
    ? (t('Report.PreparingExport') || 'Preparing export...')
    : (loadProgressText || t('Report.LoadingReport') || 'Loading report...');

  const touchActionAtRef = useRef<Record<string, number>>({});
  const TOUCH_CLICK_SUPPRESS_MS = 700;
  const toggleTouchActionAtRef = useRef<Record<string, number>>({});
  const runFromTouchPointerUp = (buttonKey: string, ev: React.PointerEvent, action: () => void) => {
    if (ev.pointerType !== 'touch') return;
    touchActionAtRef.current[buttonKey] = Date.now();
    action();
  };
  const runFromClick = (buttonKey: string, action: () => void) => {
    const lastTouchAt = touchActionAtRef.current[buttonKey] || 0;
    if (Date.now() - lastTouchAt < TOUCH_CLICK_SUPPRESS_MS) return;
    action();
  };
  const handleToggleRowPointerUp = (field: 'ok' | 'overload' | 'danger' | 'underload' | 'err', ev: React.PointerEvent<HTMLDivElement>) => {
    if (ev.pointerType !== 'touch') return;
    const targetEl = ev.target as HTMLElement | null;
    if (targetEl?.closest('ion-toggle')) return;
    const key = `toggle:${String(field)}`;
    toggleTouchActionAtRef.current[key] = Date.now();
    handleChangeFilter(field, !filter[field]);
  };
  const handleToggleIonChange = (field: 'ok' | 'overload' | 'danger' | 'underload' | 'err', checked: boolean) => {
    const key = `toggle:${String(field)}`;
    const lastTouchAt = toggleTouchActionAtRef.current[key] || 0;
    if (Date.now() - lastTouchAt < TOUCH_CLICK_SUPPRESS_MS && checked === filter[field]) return;
    handleChangeFilter(field, checked);
  };

  return (
    <>
      {(loading || exportBusy) && (
        <div className="report-progress-overlay" role="status" aria-live="polite" aria-busy="true">
          <div className="report-progress-card">
            <p className="report-progress-title">{exportBusy ? 'Preparing export' : 'Loading report'}</p>
            <p className="report-progress-text-center">{busyMessage}</p>
            <div className="report-progress-track">
              <div
                className="report-progress-fill"
                style={{ width: `${Math.max(2, Math.min(100, exportBusy ? 35 : loadProgressPct || 5))}%` }}
              />
            </div>
            {!exportBusy && loadProgressPct > 0 && (
              <p className="report-progress-percent">{loadProgressPct}%</p>
            )}
            {!exportBusy && loading && (
              <button
                type="button"
                className="report-progress-cancel"
                onClick={handleCancelLoad}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    <CommonLayout>
      <div className="grid grid-cols-4 gap-2">
        <div className="flex flex-col gap-2 ml-0.5 min-w-0">
          <Text classes="w-full bg-primary px-4 py-1" label={t('Report.MyProjects')} />
          <div className="flex flex-col gap-1">
            {projectList.length > 0 && projectList.map((item: IProject, index: number) => {
              const isSelected = normalizeProjectId(item.id) === normalizeProjectId(selectedId);
              return (
                <button
                  key={index}
                  type="button"
                  className={`w-full text-left border border-slate-200 rounded px-3 py-1 cursor-pointer ${isSelected ? 'ring-2 ring-primary font-bold shadow-md' : 'bg-transparent'}`}
                  onClick={() => {
                    setSelectedId(String(item.id));
                  }}
                >
                  <span className="text-primary">{item.title}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 border border-slate-300 rounded p-2">
            <div className="text-xs font-semibold text-slate-600 mb-1">Storage</div>
            <div className="text-xs text-slate-500 mb-2">
              {storageTotal > 0 ? `${formatGiB(totalUsedBytes)} used / ${formatGiB(storageTotal)} total` : 'Unavailable'}
              {storageMetricSource !== 'device' && (
                <span className="block text-[10px] text-amber-600 dark:text-amber-300">
                  Estimated app storage quota (not full iPad capacity)
                </span>
              )}
            </div>
            <div className="w-full h-2 bg-slate-200 rounded overflow-hidden flex">
              <div
                className="h-2 bg-slate-400"
                title="Used by system/other apps"
                style={{ width: `${storageTotal > 0 ? Math.min(100, Math.max(0, (otherUsedBytes / storageTotal) * 100)) : 0}%` }}
              />
              <div
                className="h-2 bg-primary"
                title="Used by reports data"
                style={{ width: `${storageTotal > 0 ? Math.min(100, Math.max(0, (reportsUsedBytesClamped / storageTotal) * 100)) : 0}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
              <span>Other: {formatGiB(otherUsedBytes)}</span>
              <span>Reports: {formatGiB(reportsUsedBytesClamped)}</span>
              <span>Free: {formatGiB(storageFree)}</span>
            </div>
            {isLowStorage && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                Warning: less than 10% free space. Old report logs will be removed automatically while saving new data.
              </p>
            )}
          </div>
        </div>
        <div className="col-span-3 flex flex-col px-6 gap-2">
          <>
              {selectedProject && (
                <div className="flex flex-row items-center gap-2 py-1 flex-wrap">
                  <Text label={t('Report.ShowingReports')} />
                  <span className="font-medium text-primary">{selectedProject.title}</span>
                  <span className="font-medium text-slate-600">
                    — {format(filter.start, 'yyyy-MM-dd')} → {format(filter.end, 'yyyy-MM-dd')}
                    {isSingleDayRange ? ` (${filter.hourStart} - ${filter.hourEnd})` : ''}
                  </span>
                </div>
              )}
              <div className="flex flex-row items-center gap-2 py-2 flex-wrap">
                <Text label={`${t('Report.Export')}: `} />
                {ExportList.filter((item) => !(item as { hidden?: boolean }).hidden).map((item, key) => (
                  <button
                    key={key}
                    type="button"
                    disabled={exportBusy}
                    className={`flex flex-row items-center gap-1 border-0 bg-transparent p-0 touch-manipulation ${exportBusy ? 'opacity-40 cursor-wait' : 'cursor-pointer'}`}
                    onPointerUp={(e) => runFromTouchPointerUp(`export:${item.title}`, e, () => { void handleExport(item.title); })}
                    onClick={() => runFromClick(`export:${item.title}`, () => { void handleExport(item.title); })}
                  >
                    <IonIcon src={item.icon} color="primary" />
                    <Text label={item.title} />
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!selectedId || exportBusy}
                  className={`flex flex-row items-center gap-1 border-0 bg-transparent p-0 touch-manipulation ml-2 ${!selectedId || exportBusy ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  onPointerUp={(e) => runFromTouchPointerUp('report-branding', e, () => setBrandingModalOpen(true))}
                  onClick={() => runFromClick('report-branding', () => setBrandingModalOpen(true))}
                >
                  <IonIcon icon={createOutline} color="primary" />
                  <Text label={t('Report.BrandingButton')} />
                </button>
              </div>
              <hr className="w-full border border-gray-300" />
              <div className="flex flex-col gap-2">
                <Text label={`${t('Common.Filter')}:`} />
                <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-2">
                  {/* Use only onIonChange — wrapping div onClick + IonToggle caused double-toggles on iOS and ghost touch issues */}
                  <div className="flex flex-row justify-center items-center gap-2" onPointerUp={(e) => handleToggleRowPointerUp('ok', e)}>
                    <IonToggle
                      checked={filter.ok}
                      onIonChange={(e) => handleToggleIonChange('ok', e.detail.checked)}
                    />
                    <Text label={t('Common.Okay')} />
                  </div>
                  <div className="flex flex-row justify-center items-center gap-2" onPointerUp={(e) => handleToggleRowPointerUp('overload', e)}>
                    <IonToggle
                      checked={filter.overload}
                      onIonChange={(e) => handleToggleIonChange('overload', e.detail.checked)}
                    />
                    <Text label={t('Common.Overload')} />
                  </div>
                  <div className="flex flex-row justify-center items-center gap-2" onPointerUp={(e) => handleToggleRowPointerUp('danger', e)}>
                    <IonToggle
                      checked={filter.danger}
                      onIonChange={(e) => handleToggleIonChange('danger', e.detail.checked)}
                    />
                    <Text label={t('Common.Danger')} />
                  </div>
                  <div className="flex flex-row justify-center items-center gap-2" onPointerUp={(e) => handleToggleRowPointerUp('underload', e)}>
                    <IonToggle
                      checked={filter.underload}
                      onIonChange={(e) => handleToggleIonChange('underload', e.detail.checked)}
                    />
                    <Text label={t('Common.Underload')} />
                  </div>
                  <div className="flex flex-row justify-center items-center gap-2" onPointerUp={(e) => handleToggleRowPointerUp('err', e)}>
                    <IonToggle
                      checked={filter.err}
                      onIonChange={(e) => handleToggleIonChange('err', e.detail.checked)}
                    />
                    <Text label={t('Common.TrErr')} />
                  </div>
                </div>
                <div className="flex flex-row flex-wrap items-center gap-x-6 gap-y-2 mt-1">
                  <div className="flex flex-row items-center gap-2">
                    <Text label={t('Common.From')} />
                    <input
                      type="date"
                      value={format(new Date(filter.start).toISOString(), 'yyyy-MM-dd')}
                      className="outline-none border border-dark rounded p-1 bg-transparent text-dark dark:text-white"
                      onChange={(e) => {
                        handleChangeFilter('start', startOfDay(new Date(getTime(e.target.value) + new Date().getTimezoneOffset() * 60 * 1000)));
                        e.currentTarget.blur();
                      }}
                    />
                  </div>
                  <div className="flex flex-row items-center gap-2">
                    <Text label={t('Common.To')} />
                    <input
                      type="date"
                      value={format(new Date(filter.end).toISOString(), 'yyyy-MM-dd')}
                      className="outline-none border border-dark rounded p-1 bg-transparent text-dark dark:text-white"
                      onChange={(e) => {
                        handleChangeFilter('end', endOfDay(new Date(getTime(e.target.value) + new Date().getTimezoneOffset() * 60 * 1000)));
                        e.currentTarget.blur();
                      }}
                    />
                  </div>
                  <div className="flex flex-row items-center gap-2">
                    <Text label="Hour from" />
                    <input
                      type="time"
                      value={filter.hourStart}
                      disabled={!isSingleDayRange}
                      className="outline-none border border-dark rounded p-1 bg-transparent text-dark dark:text-white disabled:opacity-50"
                      onChange={(e) => {
                        handleChangeFilter('hourStart', e.target.value);
                      }}
                    />
                  </div>
                  <div className="flex flex-row items-center gap-2">
                    <Text label="Hour to" />
                    <input
                      type="time"
                      value={filter.hourEnd}
                      disabled={!isSingleDayRange}
                      className="outline-none border border-dark rounded p-1 bg-transparent text-dark dark:text-white disabled:opacity-50"
                      onChange={(e) => {
                        handleChangeFilter('hourEnd', e.target.value);
                      }}
                    />
                  </div>
                  <span className="text-xs text-slate-500">
                    Up to {MAX_REPORT_LOGS.toLocaleString()} logs loaded for UI and exports.
                    {!isSingleDayRange ? ' Hour range disabled for multi-day date ranges.' : ''}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`p-2 w-max rounded flex justify-center items-center border-0 ${logList ? 'bg-danger' : 'bg-red-300'}`}
                  onPointerUp={(e) => runFromTouchPointerUp('delete', e, () => { void handleRemove(); })}
                  onClick={() => runFromClick('delete', () => { void handleRemove(); })}
                  aria-label={t('Common.Delete')}
                >
                  <IonIcon icon={trashSharp} color="light" />
                </button>
                <button
                  type="button"
                  className="p-2 w-max rounded flex justify-center items-center bg-primary border-0"
                  onPointerUp={(e) => runFromTouchPointerUp('refresh', e, handleRefresh)}
                  onClick={() => runFromClick('refresh', handleRefresh)}
                  aria-label={t('Common.Refresh')}
                >
                  <IonIcon icon={refreshSharp} color="light" />
                </button>
              </div>
              {pendingRefresh && (
                <p className="text-xs text-amber-600 dark:text-amber-300">
                  Filters changed. Press Refresh to apply.
                </p>
              )}
              <ReportTable />
          </>
        </div>
      </div>
    </CommonLayout>
    <ReportBrandingModal
      visible={brandingModalOpen}
      projectId={selectedId}
      projectTitle={selectedProject?.title ?? ''}
      onClose={() => setBrandingModalOpen(false)}
    />
    </>
  )
}

export default Report;
