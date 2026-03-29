import React, { FC, useEffect, useMemo, useRef, useState } from "react";
import { IonIcon, IonToggle } from "@ionic/react";
import { useTranslation } from "react-i18next";
import { codeSlashSharp, cubeSharp, documentSharp, downloadSharp, mailSharp, refreshSharp, trashSharp } from "ionicons/icons";
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

import CommonLayout from "../../Layout/CommonLayout";
import useAppData from "../../hooks/useAppData";
import Text from "../../components/Text";
import { IProject } from "../../helper/types";
import { normalizeProjectId } from "../../helper/functions";
import { buildReportGroupsAsync, type ReportGroupQuery } from "../../helper/reportGrouping";
import { db } from '../../db'
import Swal from "sweetalert2";
import Spinner from "../../components/Spinner";
import { format, getTime, getUnixTime } from "date-fns"
import { jsPDF } from 'jspdf';
import { EmailComposer } from "@awesome-cordova-plugins/email-composer";
import { toast } from 'react-toastify';
import { renderToString } from 'react-dom/server'
import './index.css';

interface LogFilter {
  ok: boolean;
  overload: boolean;
  danger: boolean;
  underload: boolean;
  err: boolean;
  start: Date;
  end: Date;
}

const Report: FC = () => {
  const { platformType, projects, curProject, lcs, logs, layoutRefreshRef } = useAppData();
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
    ok: false,
    overload: true,
    danger: true,
    underload: true,
    err: false,
    start: new Date(),
    end: new Date(),
  } as LogFilter);
  const [logList, setLogList] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [loadStatus, setLoadStatus] = useState<boolean>(false)
  const [rawLogs, setRawLogs] = useState<any[] | null>(null);
  const PAGE_SIZE = 10
  /** First load only: fewer rows = faster UI (same date range; use Load more for full cap). */
  const REPORT_PREVIEW_ROW_LIMIT = 800
  const MAX_REPORT_LOGS = 15000
  const MAX_ANDROID_EXPORT_ROWS = 20000
  const [page, setPage] = useState<number>(1)

  const reportIntervalSeconds = (projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(selectedId))?.report_interval_seconds ?? 60) || 60;

  // Load data only when project/date changes or user explicitly refreshes.
  useEffect(() => {
    if (selectedId) {
      load_reports(selectedId, filter.start, filter.end, reportIntervalSeconds);
      setLoadStatus(false)
    } else {
      setLogList(null)
      setRawLogs(null)
    }
  }, [selectedId, filter.start, filter.end, loadStatus === true, reportIntervalSeconds])

  // Helper function to merge and deduplicate logs.
  // Important: aggregated rows (logs_agg) might not have `id`, so we must dedupe by a stable composite key.
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

  const fetchProjectLogsInRange = async (projectId: string, from: number, to: number, limitOverride?: number) => {
    reportTrace('INICIO: fetchProjectLogsInRange', { projectId, from, to, limitOverride });
    const pidNorm = normalizeProjectId(projectId);
    const pidNum = Number(pidNorm);
    // IMPORTANT: Dexie compound-index lookups are type-sensitive.
    // If older DB rows stored project_id as a number, querying with "1" (string) returns 0 rows.
    // So we try both string and number candidates.
    const pidCandidates: any[] = [];
    if (pidNorm) pidCandidates.push(pidNorm);
    if (Number.isFinite(pidNum)) pidCandidates.push(pidNum);
    const effectiveLimit = Math.max(1, Math.min(limitOverride ?? MAX_REPORT_LOGS, MAX_REPORT_LOGS));
    // Do not split the limit by store. In real projects most rows are usually in `logs`,
    // so dividing by 3 can return too few rows and make reports look empty/incomplete.
    const maxPerStore = effectiveLimit;
    const activeAll: any[] = [];
    const aggAll: any[] = [];
    const archiveAll: any[] = [];

    const dateCandidates: Array<{ label: string; from: any; to: any }> = [
      { label: 'number', from, to },
      { label: 'string', from: String(from), to: String(to) },
    ];

    // Note: queries are type-sensitive in Dexie compound indexes, so we try both string & number project_id,
    // and number & string ranges for log_date/bucket. This is intentional for backward compatibility.
    const isPreviewLoad = typeof limitOverride === 'number' && limitOverride < MAX_REPORT_LOGS;

    // Preview-first optimization:
    // query active logs first (usually the largest source), then hit agg/archive only if needed.
    for (const pidCandidate of pidCandidates) {
      for (const dt of dateCandidates) {
        if (activeAll.length >= maxPerStore) break;
        const rows = await db.logs
          .where('[project_id+log_date]')
          .between([pidCandidate, dt.from], [pidCandidate, dt.to], true, true)
          .reverse()
          .limit(maxPerStore - activeAll.length)
          .toArray();
        activeAll.push(...rows);
      }
    }

    if (isPreviewLoad && activeAll.length >= Math.min(effectiveLimit, 500)) {
      const previewResult = mergeAndDeduplicateLogs([activeAll])
        .sort((a: any, b: any) => Number(b.log_date) - Number(a.log_date))
        .slice(0, effectiveLimit);
      reportTrace('FIN: fetchProjectLogsInRange (preview-fast-path)', {
        projectId,
        rows: previewResult.length,
        activeRows: activeAll.length,
      });
      return previewResult;
    }

    // Optimization: stop early once we have enough rows per store.
    // This keeps larger range loads faster.
    for (const pidCandidate of pidCandidates) {
      for (const dt of dateCandidates) {
        const needActive = false;
        const needAgg = aggAll.length < maxPerStore;
        const needArchive = archiveAll.length < maxPerStore;
        if (!needActive && !needAgg && !needArchive) break;

        const tasks: Array<Promise<any[]>> = [];
        const pushers: Array<(rows: any[]) => void> = [];

        if (needAgg) {
          tasks.push(
            db.logs_agg
              .where('[project_id+bucket]')
              .between([pidCandidate, dt.from], [pidCandidate, dt.to], true, true)
              .reverse()
              .limit(maxPerStore - aggAll.length)
              .toArray()
          );
          pushers.push((rows) => aggAll.push(...rows));
        }
        if (needArchive) {
          tasks.push(
            db.logs_archive
              .where('[project_id+log_date]')
              .between([pidCandidate, dt.from], [pidCandidate, dt.to], true, true)
              .reverse()
              .limit(maxPerStore - archiveAll.length)
              .toArray()
          );
          pushers.push((rows) => archiveAll.push(...rows));
        }

        const results = await Promise.all(tasks);
        results.forEach((rows, i) => pushers[i]?.(rows));
      }
    }

    const merged = mergeAndDeduplicateLogs([activeAll, aggAll, archiveAll])
      .sort((a: any, b: any) => Number(b.log_date) - Number(a.log_date))
      .slice(0, effectiveLimit);

    reportTrace('FIN: fetchProjectLogsInRange', {
      projectId,
      rows: merged.length,
      activeRows: activeAll.length,
      aggRows: aggAll.length,
      archiveRows: archiveAll.length,
    });
    return merged;
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
  const [isPreview, setIsPreview] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const lastQueryRef = useRef<any>(null);

  const reportGroupQuery = (report_interval_seconds: number): ReportGroupQuery => ({
    ok: filter.ok,
    overload: filter.overload,
    danger: filter.danger,
    underload: filter.underload,
    trerr: filter.err,
    report_interval_seconds,
  });

  const load_reports = async (project_id: any, fromVal: any, toVal: any, report_interval_seconds = 60) => {
    reportTrace('INICIO: load_reports', { project_id, fromVal, toVal, report_interval_seconds });
    const reqId = ++loadReqIdRef.current;
    setLoading(true);
    setIsPreview(false);
    setCanLoadMore(false);
    lastQueryRef.current = {
      project_id,
      fromVal,
      toVal,
      report_interval_seconds,
    };

    const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> => {
      let timeoutId: any;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Report load timeout')), ms);
      });
      try {
        return await Promise.race([p, timeoutPromise]);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    try {
      const from = getTime(new Date(fromVal).setHours(0, 0, 0, 0));
      const to = getTime(new Date(toVal).setHours(23, 59, 59, 999));
      console.log('start', from, to, format(getTime(fromVal), 'yyyy-MM-dd'), format(getTime(toVal), 'yyyy-MM-dd'));

      const selectedProject = projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(project_id));
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

      const previewLimit = REPORT_PREVIEW_ROW_LIMIT;

      const allLogs = await withTimeout(fetchProjectLogsInRange(project_id, from, to, previewLimit), 30000);
      if (loadReqIdRef.current !== reqId) return;

        if (!allLogs || allLogs.length === 0) {
          setLogList(null);
          setRawLogs(null);
          Swal.fire({
            title: tr('Report.Export', 'Report'),
            text: 'No reports found for the selected date range and filters.',
            icon: 'info',
            heightAuto: false,
          });
          reportTrace('FIN: load_reports (no-rows)', { project_id, reqId });
          return;
        }
        setRawLogs(allLogs);
        const previewTruncated = allLogs.length >= previewLimit;
        setIsPreview(previewTruncated);
        setCanLoadMore(previewTruncated);
        const groupResult = await buildReportGroupsAsync(
          allLogs,
          reportGroupQuery(report_interval_seconds),
          () => loadReqIdRef.current !== reqId
        );
        if (loadReqIdRef.current !== reqId) return;
        if (groupResult.cancelled) return;
        const { groups } = groupResult;

        if (!groups) {
          setLogList(null);
          if (previewTruncated) {
            Swal.fire({
              title: tr('Report.Export', 'Report'),
              text: 'No reports found in the quick preview for this filter. Tap "Load more" to search the full range.',
              icon: 'info',
              heightAuto: false,
            });
          } else {
            Swal.fire({
              title: tr('Report.Export', 'Report'),
              text: 'No reports found for the selected date range and filters.',
              icon: 'info',
              heightAuto: false,
            });
          }
          return;
        }

        setLogList(groups);
        setPage(1);
        reportTrace('FIN: load_reports', {
          project_id,
          reqId,
          rows: allLogs.length,
          groups: Object.keys(groups || {}).length,
          previewTruncated,
        });

        if (previewTruncated) {
          Swal.fire({
            title: tr('Report.Export', 'Report'),
            text: `Showing a quick preview (${previewLimit.toLocaleString()} rows max). Tap "Load more" to fetch more.`,
            icon: 'info',
            heightAuto: false,
          });
        }
    } catch (error: any) {
      console.error('Error generating report: ' + error);
      if (loadReqIdRef.current !== reqId) return;
      const isTimeout = error?.message === 'Report load timeout';
      Swal.fire({
        title: tr('Report.Export', 'Report'),
        text: isTimeout
          ? tr('Report.LoadTimeout', 'Report loading took too long. Try again, narrow the date range, or use Load more.')
          : tr('Report.ExportError', 'Failed to generate report.'),
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
      if (loadReqIdRef.current === reqId) setLoading(false);
    }
  }

  const handleLoadMore = async () => {
    if (!lastQueryRef.current) return;
    const {
      project_id, fromVal, toVal, report_interval_seconds
    } = lastQueryRef.current;

    const reqId = ++loadReqIdRef.current;
    reportTrace('INICIO: handleLoadMore', { project_id, reqId });
    setLoading(true);
    setCanLoadMore(false);

    const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> => {
      let timeoutId: any;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Report load timeout')), ms);
      });
      try {
        return await Promise.race([p, timeoutPromise]);
      } finally {
        clearTimeout(timeoutId);
      }
    };

    try {
      const from = getTime(new Date(fromVal).setHours(0, 0, 0, 0));
      const to = getTime(new Date(toVal).setHours(23, 59, 59, 999));

      const allLogs = await withTimeout(fetchProjectLogsInRange(project_id, from, to, MAX_REPORT_LOGS), 30000);
      if (loadReqIdRef.current !== reqId) return;

      setRawLogs(allLogs);
      const groupResult = await buildReportGroupsAsync(
        allLogs,
        reportGroupQuery(report_interval_seconds),
        () => loadReqIdRef.current !== reqId
      );
      if (loadReqIdRef.current !== reqId) return;
      if (groupResult.cancelled) return;
      const { groups } = groupResult;
      if (!groups) {
        setLogList(null);
        Swal.fire({
          title: tr('Report.Export', 'Report'),
          text: 'No reports found for the selected date range and filters.',
          icon: 'info',
          heightAuto: false,
        });
        reportTrace('FIN: handleLoadMore (no-groups)', { project_id, reqId, rows: allLogs.length });
        return;
      }
      setLogList(groups);
      setPage(1);
      setIsPreview(false);
      reportTrace('FIN: handleLoadMore', {
        project_id,
        reqId,
        rows: allLogs.length,
        groups: Object.keys(groups || {}).length,
      });
    } catch (error: any) {
      console.error('Error generating report (load more): ' + error);
      const isTimeout = error?.message === 'Report load timeout';
      Swal.fire({
        title: tr('Report.Export', 'Report'),
        text: isTimeout
          ? tr('Report.LoadTimeout', 'Report loading took too long. Try a smaller date range.')
          : tr('Report.ExportError', 'Failed to generate report.'),
        icon: 'error',
        heightAuto: false,
      });
      reportTrace('ERROR: handleLoadMore', {
        project_id,
        reqId,
        error: String(error?.message || error),
      });
    } finally {
      if (loadReqIdRef.current === reqId) setLoading(false);
    }
  };

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
                  <th className="border border-slate-300 text-dark dark:text-white px-3 py-1 font-medium w-28">{t("Report.Load")}</th>
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
                  const displayLoad = isPrrLink ? '—' : (isTrErr ? 'Tr.Err' : `${sItem.value ?? ''} ${sItem.unit ?? ''}`.trim());
                  return (
                    <tr key={sKey} className="w-full">
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1">{titleCell}</td>
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1">{idCell}</td>
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1">{displayLoad}</td>
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

  const formatLogLoad = (log: any) => {
    const plt = String(log.log_type || '').toLowerCase();
    if (plt === 'prr_connected') return 'PRR connected';
    if (plt === 'prr_disconnected') return 'PRR disconnected';
    const isErr = (log.log_type != null && String(log.log_type).toLowerCase() === 'err') || Number(log.value) === -99999999;
    return isErr ? 'Tr.Err' : `${log.value ?? ''} ${log.unit ?? ''}`.trim();
  };

  /** One row per log, same as example.js: Unit (title or id), Load, Battery, Time */
  const formatBattery = (b: any) => {
    if (b == null || String(b).trim() === '') return '';
    return `${String(b).trim()}%`;
  };
  const getReportRows = (data: any[]) =>
    data.map((log: any) => {
      const plt = String(log.log_type || '').toLowerCase();
      if (plt === 'prr_connected' || plt === 'prr_disconnected') {
        return {
          Unit: plt === 'prr_connected' ? 'PRR connected' : 'PRR disconnected',
          Load: log.unit != null ? String(log.unit) : '',
          Battery: '',
          Time: format(new Date(log.log_date), 'yyyy-MM-dd HH:mm:ss'),
        };
      }
      const lc = lcs.find((c: any) => c.id === log.lc_id?.toString());
      return {
        Unit: (lc?.title || log.lc_id || '').toString(),
        Load: formatLogLoad(log),
        Battery: formatBattery(log.battery),
        Time: format(new Date(log.log_date), 'yyyy-MM-dd HH:mm:ss'),
      };
    });

  const openMailtoFallback = (subject: string, logData: any[]) => {
    const project = projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(selectedId));
    const reportRows = getReportRows(logData);
    const lines = reportRows.slice(0, 50).map((r) => `${r.Unit}\t${r.Load}\t${r.Battery}\t${r.Time}`);
    const body = `Report: ${project?.title ?? ''}\nDate range: ${format(new Date(filter.start), 'yyyy-MM-dd')} – ${format(new Date(filter.end), 'yyyy-MM-dd')}\nTotal rows: ${logData.length}\n\nUnit\tLoad\tBattery\tTime\n${lines.join('\n')}${logData.length > 50 ? '\n...' : ''}`;
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  const androidDeferredAfterIntent = (successMessage: string) => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          void document.body.offsetHeight;
          window.dispatchEvent(new Event('resize'));
          toast.success(successMessage);
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
          layoutRefreshRef.current?.();
        } catch (e) {
          if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
        }
      }, 400);
    });
  };

  const ANDROID_EXPORT_PREPARING_TOAST_ID = 'report-android-export-preparing';
  const ANDROID_EXPORT_TIMEOUT_MS = 60000; // 60s
  const MAX_ANDROID_PDF_ROWS = 1500; // Limit PDF size on Android so export finishes in seconds

  const runAndroidExport = (fn: () => Promise<void>) => {
    toast.info(t('Report.PreparingExport') || 'Preparing export...', { toastId: ANDROID_EXPORT_PREPARING_TOAST_ID });
    requestAnimationFrame(() => {
      setTimeout(() => {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Export timeout')), ANDROID_EXPORT_TIMEOUT_MS)
        );
        Promise.race([fn(), timeoutPromise])
          .then(() => {
            toast.dismiss(ANDROID_EXPORT_PREPARING_TOAST_ID);
          })
          .catch((err) => {
            toast.dismiss(ANDROID_EXPORT_PREPARING_TOAST_ID);
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
            console.error('[Report Export] Error:', err);
            const isTimeout = err?.message === 'Export timeout';
            Swal.fire({
              title: tr('Report.Export', 'Export'),
              text: isTimeout
                ? tr('Report.ExportTimeout', 'Export took too long. Try a smaller date range or try again.')
                : tr('Report.ExportError', 'Failed to export.'),
              icon: 'error',
            });
          });
      }, 50);
    });
  };

  const handleExport = async (type: string) => {
    const logData = getAllLogsFromList();

    if (logData.length === 0) {
      Swal.fire({
        title: t('Report.Export') || 'Export',
        text: t('Report.NoDataToExport') || 'No data to export. Load a report first.',
        icon: 'info',
        heightAuto: false,
      });
      console.log('[Report Export] No data to export');
      return;
    }

    switch (type) {
      case t('Report.CSV'): {
        try {
          if (platformType === 'android' && logData.length > MAX_ANDROID_EXPORT_ROWS) {
            Swal.fire({
              title: t('Report.Export') || 'Export',
              text: `Too many rows (${logData.length.toLocaleString()}). Please reduce date range below ${MAX_ANDROID_EXPORT_ROWS.toLocaleString()} rows on Android.`,
              icon: 'warning',
              heightAuto: false,
            });
            return;
          }
          const project = projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(selectedId));
          const escapeCsv = (v: any) => {
            const s = v == null ? '' : String(v);
            if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
          };
          const reportRows = getReportRows(logData);
          const rows: string[] = ['Unit,Load,Battery,Time'];
          reportRows.forEach((r) => rows.push([r.Unit, r.Load, r.Battery, r.Time].map(escapeCsv).join(',')));
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
          } else if (platformType === 'android') {
                const reportRows = getReportRows(logData);
                const csvChunks: string[] = ['\uFEFFUnit,Load,Battery,Time\r\n'];
                reportRows.forEach((r) => {
                  csvChunks.push([r.Unit, r.Load, r.Battery, r.Time].map(escapeCsv).join(',') + '\r\n');
                });
                await writeTextFileInChunks(fileName, csvChunks);
            const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
            if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1');
            await Share.share({ url: uri, title: t('Report.Export') || 'Export', dialogTitle: t('Report.Export') || 'Export' });
            androidDeferredAfterIntent(`${t('Report.ExportSuccess') || 'Export success'} (${logData.length} logs).`);
          } else {
            await Filesystem.writeFile({ path: fileName, data: '\uFEFF' + csvStr, directory: Directory.Documents, encoding: Encoding.UTF8 });
            Swal.fire({ title: t('Report.Export') || 'Export', text: `${t('Report.ExportSuccess')} (${logData.length} logs).`, icon: 'success' });
          }
        } catch (err) {
          if (platformType === 'android' && typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
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
        if (platformType === 'android') {
          if (logData.length > MAX_ANDROID_EXPORT_ROWS) {
            Swal.fire({
              title: t('Report.Export') || 'Export',
              text: `Too many rows (${logData.length.toLocaleString()}). Please reduce date range below ${MAX_ANDROID_EXPORT_ROWS.toLocaleString()} rows on Android.`,
              icon: 'warning',
              heightAuto: false,
            });
            return;
          }
          runAndroidExport(async () => {
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
              await Share.share({ url: uri, title: t('Report.Export') || 'Export', dialogTitle: t('Report.Export') || 'Export' });
              androidDeferredAfterIntent(`${t('Report.ExportSuccess') || 'Export success'} (${logData.length} logs).`);
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
        if (platformType === 'android') {
          if (logData.length > MAX_ANDROID_EXPORT_ROWS) {
            Swal.fire({
              title: t('Report.Export') || 'Export',
              text: `Too many rows (${logData.length.toLocaleString()}). Please reduce date range below ${MAX_ANDROID_EXPORT_ROWS.toLocaleString()} rows on Android.`,
              icon: 'warning',
              heightAuto: false,
            });
            return;
          }
          runAndroidExport(async () => {
            try {
              const reportRows = getReportRows(logData);
              const escape = (v: any) => {
                const s = String(v ?? '').replace(/'/g, "''");
                return `'${s}'`;
              };
              const fileName = `report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.sql`;
              const sqlChunks: string[] = [];
              reportRows.forEach((r) => {
                sqlChunks.push(`INSERT INTO logs (\`Unit\`,\`Load\`,\`Battery\`,\`Time\`) VALUES (${escape(r.Unit)},${escape(r.Load)},${escape(r.Battery)},${escape(r.Time)});\n`);
              });
              await writeTextFileInChunks(fileName, sqlChunks);
              const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
              if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1');
              await Share.share({ url: uri, title: t('Report.Export') || 'Export', dialogTitle: t('Report.Export') || 'Export' });
              androidDeferredAfterIntent(`${t('Report.ExportSuccess') || 'Export success'} (${logData.length} logs).`);
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
            (r) => `INSERT INTO logs (\`Unit\`,\`Load\`,\`Battery\`,\`Time\`) VALUES (${escape(r.Unit)},${escape(r.Load)},${escape(r.Battery)},${escape(r.Time)});`
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
        if (platformType === 'android') {
          if (logData.length > MAX_ANDROID_EXPORT_ROWS) {
            Swal.fire({
              title: t('Report.Export') || 'Export',
              text: `Too many rows (${logData.length.toLocaleString()}). Please reduce date range below ${MAX_ANDROID_EXPORT_ROWS.toLocaleString()} rows on Android.`,
              icon: 'warning',
              heightAuto: false,
            });
            return;
          }
          runAndroidExport(async () => {
            try {
              const totalRows = logData.length;
              const capped = totalRows > MAX_ANDROID_PDF_ROWS;
              const rowsForPdf = capped ? getReportRows(logData).slice(0, MAX_ANDROID_PDF_ROWS) : getReportRows(logData);
              const project = projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(selectedId));
              const doc = new jsPDF('p', 'mm', 'a4');
              const pageW = doc.internal.pageSize.getWidth();
              const margin = 10;
              const colWidths = [50, 40, 35, 52];
              const rowHeight = 7;
              let y = margin;
              doc.setFontSize(14);
              doc.text(t('Report.Export') || 'Report', margin, y);
              y += 10;
              doc.setFontSize(10);
              if (project) doc.text(`${t('Report.MyProjects') || 'Project'}: ${project.title}`, margin, y);
              y += 6;
              doc.text(`${format(new Date(filter.start), 'yyyy-MM-dd')} – ${format(new Date(filter.end), 'yyyy-MM-dd')}`, margin, y);
              y += 10;
              const headers = ['Unit', t('Report.Load'), t('Report.Battery'), t('Report.Time')];
              doc.setFontSize(8);
              doc.setFillColor(240, 240, 240);
              doc.rect(margin, y, pageW - 2 * margin, rowHeight, 'F');
              headers.forEach((h, i) => {
                doc.text(h, margin + (i === 0 ? 2 : colWidths.slice(0, i).reduce((a, b) => a + b, 0) + 2), y + 5);
              });
              doc.setDrawColor(200, 200, 200);
              let colX = margin;
              colWidths.forEach((w) => { doc.line(colX, y, colX, y + rowHeight); colX += w; });
              doc.line(margin, y + rowHeight, pageW - margin, y + rowHeight);
              y += rowHeight;
              const maxY = doc.internal.pageSize.getHeight() - margin;
              for (let i = 0; i < rowsForPdf.length; i++) {
                if (y + rowHeight > maxY) {
                  doc.addPage();
                  y = margin;
                  doc.setFillColor(240, 240, 240);
                  doc.rect(margin, y, pageW - 2 * margin, rowHeight, 'F');
                  headers.forEach((h, ii) => {
                    doc.text(h, margin + (ii === 0 ? 2 : colWidths.slice(0, ii).reduce((a, b) => a + b, 0) + 2), y + 5);
                  });
                  colX = margin;
                  colWidths.forEach((w) => { doc.line(colX, y, colX, y + rowHeight); colX += w; });
                  doc.line(margin, y + rowHeight, pageW - margin, y + rowHeight);
                  y += rowHeight;
                }
                const r = rowsForPdf[i];
                const row = [r.Unit.slice(0, 24), r.Load.slice(0, 14), r.Battery.slice(0, 8), r.Time.slice(0, 19)];
                row.forEach((cell, ii) => {
                  doc.text(cell, margin + (ii === 0 ? 2 : colWidths.slice(0, ii).reduce((a, b) => a + b, 0) + 2), y + 5);
                });
                colX = margin;
                colWidths.forEach((w) => { doc.line(colX, y, colX, y + rowHeight); colX += w; });
                doc.line(margin, y + rowHeight, pageW - margin, y + rowHeight);
                y += rowHeight;
              }
              if (capped) {
                y += 6;
                doc.setFontSize(7);
                doc.setTextColor(120, 120, 120);
                doc.text(t('Report.PdfTruncatedNote') || `First ${MAX_ANDROID_PDF_ROWS} of ${totalRows} rows. Use CSV for full report.`, margin, y);
                doc.setTextColor(0, 0, 0);
              }
              const fileName = `report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.pdf`;
              const base64 = doc.output('datauristring').split(',')[1];
              await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
              const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
              if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1');
              await Share.share({ url: uri, title: t('Report.Export') || 'Export', dialogTitle: t('Report.Export') || 'Export' });
              const successMsg = capped
                ? (t('Report.ExportSuccessFirstOf') || 'Report exported (first {{first}} of {{total}} logs). Use CSV for full data.').replace('{{first}}', String(MAX_ANDROID_PDF_ROWS)).replace('{{total}}', String(totalRows))
                : `${t('Report.ExportSuccess') || 'Export success'} (${totalRows} logs).`;
              androidDeferredAfterIntent(successMsg);
            } catch (err) {
              if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
              console.error('[Report Export] PDF export error:', err);
              Swal.fire({ title: t('Report.Export') || 'Export', text: t('Report.ExportError') || 'Failed to export PDF.', icon: 'error' });
            }
          });
          break;
        }
        try {
          const project = projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(selectedId));
          const doc = new jsPDF('p', 'mm', 'a4');
          const pageW = doc.internal.pageSize.getWidth();
          const margin = 10;
          const colWidths = [50, 40, 35, 52];
          const rowHeight = 7;
          let y = margin;
          doc.setFontSize(14);
          doc.text(t('Report.Export') || 'Report', margin, y);
          y += 10;
          doc.setFontSize(10);
          if (project) doc.text(`${t('Report.MyProjects') || 'Project'}: ${project.title}`, margin, y);
          y += 6;
          doc.text(`${format(new Date(filter.start), 'yyyy-MM-dd')} – ${format(new Date(filter.end), 'yyyy-MM-dd')}`, margin, y);
          y += 10;
          const headers = ['Unit', t('Report.Load'), t('Report.Battery'), t('Report.Time')];
          doc.setFontSize(8);
          doc.setFillColor(240, 240, 240);
          doc.rect(margin, y, pageW - 2 * margin, rowHeight, 'F');
          headers.forEach((h, i) => {
            doc.text(h, margin + (i === 0 ? 2 : colWidths.slice(0, i).reduce((a, b) => a + b, 0) + 2), y + 5);
          });
          doc.setDrawColor(200, 200, 200);
          let colX = margin;
          colWidths.forEach((w) => { doc.line(colX, y, colX, y + rowHeight); colX += w; });
          doc.line(margin, y + rowHeight, pageW - margin, y + rowHeight);
          y += rowHeight;
          const maxY = doc.internal.pageSize.getHeight() - margin;
          for (let i = 0; i < logData.length; i++) {
            if (y + rowHeight > maxY) {
              doc.addPage();
              y = margin;
              doc.setFillColor(240, 240, 240);
              doc.rect(margin, y, pageW - 2 * margin, rowHeight, 'F');
              headers.forEach((h, ii) => {
                doc.text(h, margin + (ii === 0 ? 2 : colWidths.slice(0, ii).reduce((a, b) => a + b, 0) + 2), y + 5);
              });
              colX = margin;
              colWidths.forEach((w) => { doc.line(colX, y, colX, y + rowHeight); colX += w; });
              doc.line(margin, y + rowHeight, pageW - margin, y + rowHeight);
              y += rowHeight;
            }
            const r = getReportRows(logData)[i];
            const row = [r.Unit.slice(0, 24), r.Load.slice(0, 14), r.Battery.slice(0, 8), r.Time.slice(0, 19)];
            row.forEach((cell, ii) => {
              doc.text(cell, margin + (ii === 0 ? 2 : colWidths.slice(0, ii).reduce((a, b) => a + b, 0) + 2), y + 5);
            });
            colX = margin;
            colWidths.forEach((w) => { doc.line(colX, y, colX, y + rowHeight); colX += w; });
            doc.line(margin, y + rowHeight, pageW - margin, y + rowHeight);
            y += rowHeight;
          }
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
            Swal.fire({ title: t('Report.Export') || 'Export', text: `${t('Report.ExportSuccess')} (${logData.length} logs).`, icon: 'success' });
          }
        } catch (err) {
          console.error('[Report Export] PDF export error:', err);
          Swal.fire({ title: t('Report.Export') || 'Export', text: t('Report.ExportError') || 'Failed to export PDF.', icon: 'error' });
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
          const csvRows: string[] = ['Unit,Load,Battery,Time'];
          reportRows.forEach((r) => csvRows.push([r.Unit, r.Load, r.Battery, r.Time].map(escapeCsv).join(',')));
          const csvStr = '\uFEFF' + csvRows.join('\r\n');
          const fileName = `report_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
          const bodyText = project?.title
            ? `${t('Report.AttachedReport') || 'Please find the report attached.'} ${project.title}, ${format(new Date(filter.start), 'yyyy-MM-dd')} – ${format(new Date(filter.end), 'yyyy-MM-dd')}, ${logData.length} ${t('Report.Rows') || 'rows'}.`
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
                if (platformType === 'android' && typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1');
                await EmailComposer.open({
                  subject,
                  body: bodyText,
                  isHtml: false,
                  attachments,
                });
                if (platformType === 'android') {
                  androidDeferredAfterIntent(t('Report.EmailOpened') || 'Email composer opened.');
                } else {
                  Swal.fire({ title: t('Report.Export') || 'Export', text: t('Report.EmailOpened') || 'Email composer opened.', icon: 'success' });
                }
              } else {
                openMailtoFallback(subject, logData);
              }
            } catch (pluginErr) {
              if (platformType === 'android' && typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
              console.warn('[Report Email] Plugin failed, using mailto:', pluginErr);
              openMailtoFallback(subject, logData);
            }
          } else {
            openMailtoFallback(subject, logData);
          }
        } catch (err) {
          if (platformType === 'android' && typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
          console.error('[Report Export] Email error:', err);
          Swal.fire({ title: t('Report.Export') || 'Export', text: t('Report.ExportError') || 'Failed to open email.', icon: 'error' });
        }
        break;
      }
      default:
        break;
    }
  }

  const handleChangeFilter = (field: string, value: boolean | Date) => {
    setFilter(v => ({ ...v, [field]: value }))
    console.log('date changed: ', field, value)
  }

  const handleRemove = () => {
    if (!selectedId) return;
    const pidNorm = normalizeProjectId(selectedId);
    Swal.fire({
      title: 'Delete Logs',
      text: 'Delete all logs for this project? This cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: t("Common.Confirm"),
      cancelButtonText: t("Common.Cancel"),
      heightAuto: false
    }).then((result) => {
      if (!result.value) return;
      setLoading(true);
      db.logs
        .filter((log: any) => normalizeProjectId(log.project_id) === pidNorm)
        .primaryKeys()
        .then((keys) => db.logs.bulkDelete(keys))
        .then(() => db.logs_archive.filter((log: any) => normalizeProjectId(log.project_id) === pidNorm).primaryKeys())
        .then((keys) => db.logs_archive.bulkDelete(keys))
        .then(() => db.logs_agg.where('[project_id+bucket]').between([pidNorm, 0], [pidNorm, Number.MAX_SAFE_INTEGER], true, true).primaryKeys())
        .then((keys) => db.logs_agg.bulkDelete(keys))
        .then(() => {
          setLogList(null);
          setLoading(false);
        })
        .catch((error) => {
          console.error('Failed to delete logs:', error);
          setLoading(false);
        });
    });
  }
  const handleRefresh = () => {
    setLoadStatus(true)
  }

  // Re-apply checkbox filters without re-querying IndexedDB. Chunked async work so huge Ok/Tr.Err sets do not freeze the UI.
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
  }, [filter.ok, filter.overload, filter.danger, filter.underload, filter.err, rawLogs, reportIntervalSeconds]);

  const selectedProject = projectList.find((p: IProject) => normalizeProjectId(p.id) === normalizeProjectId(selectedId));

  return (
    <CommonLayout>
      <div className="grid grid-cols-4 gap-2">
        <div className="flex flex-col gap-2 ml-0.5 min-w-0">
          <Text classes="w-full bg-primary px-4 py-1" label={t('Report.MyProjects')} />
          <div className="flex flex-col">
            {projectList.length > 0 && projectList.map((item: IProject, index: number) => {
              const isSelected = normalizeProjectId(item.id) === normalizeProjectId(selectedId);
              return (
                <button
                  key={index}
                  type="button"
                  className={`w-full text-left border-0 bg-transparent px-4 py-1 cursor-pointer flex items-baseline gap-2 ${isSelected ? 'ring-2 ring-primary rounded font-bold shadow-md' : ''}`}
                  onClick={() => setSelectedId(String(item.id))}
                >
                  <span className="text-primary shrink-0 select-none" aria-hidden>•</span>
                  <Text classes={isSelected ? 'text-primary font-bold' : 'text-primary'} label={item.title} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="col-span-3 flex flex-col px-6 gap-2">
          <>
              {selectedProject && (
                <div className="flex flex-row items-center gap-2 py-1 flex-wrap">
                  <Text label={t('Report.ShowingReports')} />
                  <span className="font-medium text-primary">{selectedProject.title}</span>
                </div>
              )}
              <div className="flex flex-row items-center gap-2 py-2">
                <Text label={`${t('Report.Export')}: `} />
                {ExportList.filter((item) => !(item as { hidden?: boolean }).hidden).map((item, key) => (
                  <button
                    key={key}
                    type="button"
                    className="flex flex-row items-center gap-1 border-0 bg-transparent p-0 cursor-pointer touch-manipulation"
                    onClick={() => void handleExport(item.title)}
                  >
                    <IonIcon src={item.icon} color="primary" />
                    <Text label={item.title} />
                  </button>
                ))}
              </div>
              <hr className="w-full border border-gray-300" />
              <div className="flex flex-col gap-2">
                <Text label={`${t('Common.Filter')}:`} />
                <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-2">
                  {/* Use only onIonChange — wrapping div onClick + IonToggle caused double-toggles on iOS and ghost touch issues */}
                  <div className="flex flex-row justify-center items-center gap-2">
                    <IonToggle
                      checked={filter.ok}
                      onIonChange={(e) => handleChangeFilter('ok', e.detail.checked)}
                    />
                    <Text label={t('Common.Okay')} />
                  </div>
                  <div className="flex flex-row justify-center items-center gap-2">
                    <IonToggle
                      checked={filter.overload}
                      onIonChange={(e) => handleChangeFilter('overload', e.detail.checked)}
                    />
                    <Text label={t('Common.Overload')} />
                  </div>
                  <div className="flex flex-row justify-center items-center gap-2">
                    <IonToggle
                      checked={filter.danger}
                      onIonChange={(e) => handleChangeFilter('danger', e.detail.checked)}
                    />
                    <Text label={t('Common.Danger')} />
                  </div>
                  <div className="flex flex-row justify-center items-center gap-2">
                    <IonToggle
                      checked={filter.underload}
                      onIonChange={(e) => handleChangeFilter('underload', e.detail.checked)}
                    />
                    <Text label={t('Common.Underload')} />
                  </div>
                  <div className="flex flex-row justify-center items-center gap-2">
                    <IonToggle
                      checked={filter.err}
                      onIonChange={(e) => handleChangeFilter('err', e.detail.checked)}
                    />
                    <Text label={t('Common.TrErr')} />
                  </div>
                </div>
                <div className="flex flex-row items-center gap-8">
                  <div className="flex flex-row items-center gap-2">
                    <Text label={t('Common.From')} />
                    <input
                      type="date"
                      value={format(new Date(filter.start).toISOString(), 'yyyy-MM-dd')}
                      className="outline-none border border-dark rounded p-1"
                      onChange={(e) => {
                        handleChangeFilter('start', new Date(getTime(e.target.value) + new Date().getTimezoneOffset() * 60 * 1000));
                        e.currentTarget.blur();
                      }}
                    />
                  </div>
                  <div className="flex flex-row items-center gap-2">
                    <Text label={t('Common.To')} />
                    <input
                      type="date"
                      value={format(new Date(filter.end), 'yyyy-MM-dd')}
                      className="outline-none border border-dark rounded p-1"
                      onChange={(e) => {
                        handleChangeFilter('end', new Date(getTime(e.target.value) + new Date().getTimezoneOffset() * 60 * 1000));
                        e.currentTarget.blur();
                      }}
                    />
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={`p-2 w-max rounded flex justify-center items-center border-0 ${logList ? 'bg-danger' : 'bg-red-300'}`}
                  onClick={() => void handleRemove()}
                  aria-label={t('Common.Delete')}
                >
                  <IonIcon icon={trashSharp} color="light" />
                </button>
                <button
                  type="button"
                  className="p-2 w-max rounded flex justify-center items-center bg-primary border-0"
                  onClick={() => handleRefresh()}
                  aria-label={t('Common.Refresh')}
                >
                  <IonIcon icon={refreshSharp} color="light" />
                </button>
                {isPreview && canLoadMore && (
                  <button
                    type="button"
                    className="px-3 py-2 rounded bg-primary text-white font-medium disabled:opacity-50"
                    disabled={loading}
                    onClick={() => void handleLoadMore()}
                  >
                    Load more
                  </button>
                )}
              </div>
              <Spinner visible={loading} />
              <ReportTable />
          </>
        </div>
      </div>
    </CommonLayout>
  )
}

export default Report;
