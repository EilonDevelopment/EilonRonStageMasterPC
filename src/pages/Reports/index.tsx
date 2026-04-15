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
  /** Blocks UI during CSV/PDF/email prep (native Share + large files can take several seconds). */
  const [exportBusy, setExportBusy] = useState(false)
  const [loadStatus, setLoadStatus] = useState<boolean>(false)
  const [rawLogs, setRawLogs] = useState<any[] | null>(null);
  const PAGE_SIZE = 10
  /** First load only: fewer rows = faster UI (same date range; use Load more for full cap). */
  const REPORT_PREVIEW_ROW_LIMIT = 800
  const MAX_EXPORT_ROWS = 100000
  const MAX_EXPORT_FETCH_ROWS = MAX_EXPORT_ROWS + 1
  const MAX_REPORT_LOGS = MAX_EXPORT_ROWS
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
    const effectiveLimit = Math.max(1, Math.min(limitOverride ?? MAX_REPORT_LOGS, MAX_EXPORT_FETCH_ROWS));
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
                  <th className="border border-slate-300 text-dark dark:text-white px-3 py-1 font-medium w-24">Data</th>
                  <th className="border border-slate-300 text-dark dark:text-white px-3 py-1 font-medium w-36">Status</th>
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
                  const dataSource = String(sItem.log_type || '').toLowerCase() === 'agg' ? '5-min chunk' : 'raw';
                  const statusMeta = getStatusMeta(getLogStatus(sItem, lc));
                  return (
                    <tr key={sKey} className="w-full">
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1">{titleCell}</td>
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1">{idCell}</td>
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1">{dataSource}</td>
                      <td className="border border-slate-300 text-dark dark:text-white px-3 py-1">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </td>
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
  const formatBulkDetails = (log: any): string => {
    const lt = String(log?.log_type || '').toLowerCase();
    if (lt !== 'agg') return '-';
    const parts: string[] = [];
    const pushNum = (label: string, value: any) => {
      const n = Number(value);
      if (Number.isFinite(n)) parts.push(`${label}=${n}`);
    };
    pushNum('count', log?.count);
    pushNum('vmin', log?.value_min);
    pushNum('vmax', log?.value_max);
    pushNum('ok', log?.count_ok);
    pushNum('under', log?.count_underload);
    pushNum('over', log?.count_overload);
    pushNum('danger', log?.count_danger);
    pushNum('err', log?.count_err);
    return parts.length > 0 ? parts.join(' | ') : '5-min chunk';
  };
  const getReportRows = (data: any[]) =>
    data.map((log: any) => {
      const plt = String(log.log_type || '').toLowerCase();
      const source = plt === 'agg' ? '5-min chunk' : 'raw';
      const bulk = formatBulkDetails(log);
      if (plt === 'prr_connected' || plt === 'prr_disconnected') {
        const status = getLogStatus(log);
        return {
          Name: plt === 'prr_connected' ? 'PRR connected' : 'PRR disconnected',
          ID: log.unit != null ? String(log.unit) : '',
          Source: source,
          Status: status,
          Load: log.unit != null ? String(log.unit) : '',
          Battery: '',
          Bulk: bulk,
          Time: format(new Date(log.log_date), 'yyyy-MM-dd HH:mm:ss'),
        };
      }
      const lc = lcs.find((c: any) => c.id === log.lc_id?.toString());
      const status = getLogStatus(log, lc);
      return {
        Name: (lc?.title || '').toString(),
        ID: (lc?.id || log.lc_id || '').toString(),
        Source: source,
        Status: status,
        Load: formatLogLoad(log),
        Battery: formatBattery(log.battery),
        Bulk: bulk,
        Time: format(new Date(log.log_date), 'yyyy-MM-dd HH:mm:ss'),
      };
    });

  const openMailtoFallback = (subject: string, logData: any[]) => {
    const project = projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(selectedId));
    const reportRows = getReportRows(logData);
    const lines = reportRows.slice(0, 50).map((r) => `${r.Name}\t${r.ID}\t${r.Source}\t${r.Status}\t${r.Load}\t${r.Battery}\t${r.Time}`);
    const body = `Report: ${project?.title ?? ''}\nDate range: ${format(new Date(filter.start), 'yyyy-MM-dd')} – ${format(new Date(filter.end), 'yyyy-MM-dd')}\nTotal rows: ${logData.length}\n\nName\tID\tData\tStatus\tLoad\tBattery\tTime\n${lines.join('\n')}${logData.length > 50 ? '\n...' : ''}`;
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
    const baseRows = getAllLogsFromList();
    // If we're in preview mode, force full-range fetch for exports so users never export partial data unintentionally.
    if (!isPreview || !lastQueryRef.current) return baseRows;
    const { project_id, fromVal, toVal } = lastQueryRef.current;
    const from = getTime(new Date(fromVal).setHours(0, 0, 0, 0));
    const to = getTime(new Date(toVal).setHours(23, 59, 59, 999));
    const fullRows = await fetchProjectLogsInRange(project_id, from, to, MAX_EXPORT_FETCH_ROWS);
    return fullRows.sort((a: any, b: any) => (b.log_date || 0) - (a.log_date || 0));
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
    if (logData.length > MAX_EXPORT_ROWS) {
      setExportBusy(false);
      const decision = await Swal.fire({
        title: t('Report.Export') || 'Export',
        text: `Too many rows for export (${logData.length.toLocaleString()}). Continue with a truncated export of the first ${MAX_EXPORT_ROWS.toLocaleString()} rows? To export fewer than ${MAX_EXPORT_ROWS.toLocaleString()} rows, reduce the date range or change filters.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Continue',
        cancelButtonText: t('Common.Cancel') || 'Cancel',
        heightAuto: false,
      });
      if (!decision.isConfirmed) {
        return;
      }
      logData = logData.slice(0, MAX_EXPORT_ROWS);
      setExportBusy(true);
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
    }

    try {
    switch (type) {
      case t('Report.CSV'): {
        try {
          const project = projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(selectedId));
          const escapeCsv = (v: any) => {
            const s = v == null ? '' : String(v);
            if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
            return s;
          };
          const reportRows = getReportRows(logData);
          const rows: string[] = ['Name,ID,Data,Status,Load,Battery,Bulk,Time'];
          reportRows.forEach((r) => rows.push([r.Name, r.ID, r.Source, r.Status, r.Load, r.Battery, r.Bulk, r.Time].map(escapeCsv).join(',')));
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
                const reportRows = getReportRows(logData);
                const csvChunks: string[] = ['\uFEFFName,ID,Data,Status,Load,Battery,Bulk,Time\r\n'];
                reportRows.forEach((r) => {
                  csvChunks.push([r.Name, r.ID, r.Source, r.Status, r.Load, r.Battery, r.Bulk, r.Time].map(escapeCsv).join(',') + '\r\n');
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
          const jsonRows = reportRows.map(({ Bulk, ...rest }) => rest);
          const jsonStr = JSON.stringify(jsonRows, null, 2);
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
                sqlChunks.push(`INSERT INTO logs (\`Name\`,\`ID\`,\`Data\`,\`Status\`,\`Load\`,\`Battery\`,\`Time\`) VALUES (${escape(r.Name)},${escape(r.ID)},${escape(r.Source)},${escape(r.Status)},${escape(r.Load)},${escape(r.Battery)},${escape(r.Time)});\n`);
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
            (r) => `INSERT INTO logs (\`Name\`,\`ID\`,\`Data\`,\`Status\`,\`Load\`,\`Battery\`,\`Time\`) VALUES (${escape(r.Name)},${escape(r.ID)},${escape(r.Source)},${escape(r.Status)},${escape(r.Load)},${escape(r.Battery)},${escape(r.Time)});`
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
              const rowsForPdf = capped ? getReportRows(logData).slice(0, MAX_NATIVE_PDF_ROWS) : getReportRows(logData);
              const project = projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(selectedId));
              const doc = new jsPDF('p', 'mm', 'a4');
              const pageW = doc.internal.pageSize.getWidth();
              const margin = 10;
              const colWidths = [28, 16, 18, 22, 22, 14, 40];
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
              const headers = ['Name', 'ID', 'Data', 'Status', t('Report.Load'), t('Report.Battery'), t('Report.Time')];
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
                const row = [r.Name.slice(0, 14), r.ID.slice(0, 9), r.Source.slice(0, 12), r.Status.slice(0, 12), r.Load.slice(0, 12), r.Battery.slice(0, 7), r.Time.slice(0, 19)];
                row.forEach((cell, ii) => {
                  const x = margin + colWidths.slice(0, ii).reduce((a, b) => a + b, 0) + 2;
                  if (ii === 3) {
                    const meta = getStatusMeta(r.Status as ReportStatus);
                    doc.setTextColor(meta.textColor);
                    doc.text(cell, x, y + 5);
                    doc.setTextColor(0, 0, 0);
                  } else {
                    doc.text(cell, x, y + 5);
                  }
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
                doc.text(t('Report.PdfTruncatedNote') || `First ${MAX_NATIVE_PDF_ROWS} of ${totalRows} rows. Use CSV for full report.`, margin, y);
                doc.setTextColor(0, 0, 0);
              }
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
          const project = projects.find(p => normalizeProjectId(p.id) === normalizeProjectId(selectedId));
          const doc = new jsPDF('p', 'mm', 'a4');
          const pageW = doc.internal.pageSize.getWidth();
          const margin = 10;
              const colWidths = [28, 16, 18, 22, 22, 14, 40];
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
          const headers = ['Name', 'ID', 'Data', 'Status', t('Report.Load'), t('Report.Battery'), t('Report.Time')];
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
          const reportRowsPdf = getReportRows(logData);
          for (let i = 0; i < reportRowsPdf.length; i++) {
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
            const r = reportRowsPdf[i];
            const row = [r.Name.slice(0, 14), r.ID.slice(0, 9), r.Source.slice(0, 12), r.Status.slice(0, 12), r.Load.slice(0, 12), r.Battery.slice(0, 7), r.Time.slice(0, 19)];
            row.forEach((cell, ii) => {
              const x = margin + colWidths.slice(0, ii).reduce((a, b) => a + b, 0) + 2;
              if (ii === 3) {
                const meta = getStatusMeta(r.Status as ReportStatus);
                doc.setTextColor(meta.textColor);
                doc.text(cell, x, y + 5);
                doc.setTextColor(0, 0, 0);
              } else {
                doc.text(cell, x, y + 5);
              }
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
          const csvRows: string[] = ['Name,ID,Data,Status,Load,Battery,Bulk,Time'];
          reportRows.forEach((r) => csvRows.push([r.Name, r.ID, r.Source, r.Status, r.Load, r.Battery, r.Bulk, r.Time].map(escapeCsv).join(',')));
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

  const busyMessage = exportBusy
    ? (t('Report.PreparingExport') || 'Preparing export...')
    : (t('Report.LoadingReport') || 'Loading report...');

  return (
    <>
      {(loading || exportBusy) && (
        <div className="report-progress-wrap" role="status" aria-live="polite" aria-busy="true">
          <div className="report-progress-bar" />
          <p className="report-progress-text">{busyMessage}</p>
        </div>
      )}
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
                    disabled={exportBusy}
                    className={`flex flex-row items-center gap-1 border-0 bg-transparent p-0 touch-manipulation ${exportBusy ? 'opacity-40 cursor-wait' : 'cursor-pointer'}`}
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
              <ReportTable />
          </>
        </div>
      </div>
    </CommonLayout>
    </>
  )
}

export default Report;
