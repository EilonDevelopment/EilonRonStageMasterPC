
import { useTranslation } from "react-i18next";
import useAppData from "./useAppData";
import { db } from "../db";
import { IGroup, ILC, ILog, IProject, IProjectDetail } from "../helper/types";
import { LC_Serials, LC_SerialsType } from "../helper/constants";
import { normalizeProjectId } from "../helper/functions";
import { normalizeLcLinkType } from "../helper/lcLinkType";
import { normalizeCrrExportStored } from "../helper/crrExport";
import { formatGroupOverloadStringForUnit, formatThresholdStringForLc } from "../helper/weightResolution";
import { format, getTime, subDays } from "date-fns";
import { useEffect, useRef } from "react";
import { logEvent } from "../services/LogService";
import { playAlarmBeep } from "../services/alarmFeedback";
import { Device } from "@capacitor/device";
import { Capacitor } from "@capacitor/core";
import { requestCrrLcListSync } from "../helper/crrUsbService";


export default function useFunctions() {
  const {
    curProject,
    lcs,
    monitorStatus,
    bleConnected,
    logs,
    LCMax: lc_max,
    groups,
    batteryStatus,
    projects,
    updateMode,
    updateErrStr,
    updateSuccessStr,
    init,
    updateMonitorStatus,
    updateProjects,
    updateCurProject,
    updateLCs,
    updateLCsFromDb,
    updateGroups,
    updateVisibleModal,
    updateBleConnected,
    updateBatteryStatus,
    updateConfirmed,
    updateLogs,
    updateTotalWeightHtml,
    updateLCMax,
    updateWarnList,
    updateLiveLC,
    updateWeighData,
    updateLCWindAlerts,
    updateLCOverloadAlerts,
    lcsRef,
  } = useAppData()
  const { t } = useTranslation()
  const curProjectRef = useRef<any>(curProject)
  const logInsertCounterRef = useRef<number>(0)
  const lastLogUiUpdateAtRef = useRef<number>(0)
  const lastDayKeyByProjectRef = useRef<Record<string, string>>({})
  const lastLogIngestTraceAtRef = useRef<number>(0)
  const traceStepRef = useRef<number>(0)
  /** Batched IndexedDB writes: many LCs @ 1s interval was blocking the main thread with 75 separate adds/sec. */
  const pendingLogBatchRef = useRef<Array<{ row: any; meta: {
    lc_id: any; project_id: any; parsedValue: number; parsedRealval: number; storedOverload: any; storedUnderload: any;
    unit_value: any; battery: number; log_type: string;
  } }>>([])
  const logFlushTimerRef = useRef<number | null>(null)
  /** Coalesce writes: fewer IndexedDB commits/sec under 75 LC @ 1 Hz. */
  const LOG_FLUSH_MS = 125
  /** When the queue reaches this size, flush immediately (one transaction per ~1s wave of LCs). */
  const LOG_BATCH_MAX_BEFORE_FLUSH = 80
  /** Safety valve for long-running sessions: keep queue bounded to avoid UI starvation. */
  const LOG_QUEUE_SOFT_LIMIT = 2500
  const LOG_QUEUE_HARD_LIMIT = 5000
  /** Auto-prune oldest report logs when free space is critically low. */
  const LOW_STORAGE_FREE_PCT = 10
  const STORAGE_SNAPSHOT_CACHE_MS = 30_000
  const AUTO_PRUNE_COOLDOWN_MS = 15_000
  const AUTO_PRUNE_BATCH_SIZE = 3000
  /** Never auto-delete the most recent N day_keys, even under low storage. */
  const AUTO_PRUNE_KEEP_RECENT_DAYS = 7
  const storageSnapshotRef = useRef<{ at: number; total: number; free: number }>({ at: 0, total: 0, free: 0 })
  const pruneInProgressRef = useRef(false)
  const lastPruneAtRef = useRef(0)
  const statusPriority = (status: string): number => {
    switch (status) {
      case 'err': return 5
      case 'danger': return 4
      case 'overload': return 3
      case 'underload': return 2
      default: return 1
    }
  }

  const tracePhase = (phase: string, extra?: Record<string, any>) => {
    const step = ++traceStepRef.current;
    const details = extra ? ` | ${JSON.stringify(extra)}` : '';
    console.info(`[RSM_TRACE] [${step}] ${phase}${details}`);
  };

  const toDayKey = (ts: number) => format(new Date(ts), 'yyyy-MM-dd')
  const toHourKey = (ts: number) => format(new Date(ts), 'HH')
  const getStorageSnapshot = async (force = false): Promise<{ total: number; free: number }> => {
    const now = Date.now()
    if (!force && now - storageSnapshotRef.current.at < STORAGE_SNAPSHOT_CACHE_MS) {
      return { total: storageSnapshotRef.current.total, free: storageSnapshotRef.current.free }
    }
    let total = 0
    let free = 0
    try {
      const info = await Device.getInfo()
      total = Number((info as any).diskTotal || 0)
      free = Number((info as any).diskFree || 0)
    } catch {
      // ignore: fallback below
    }
    if (!(total > 0) && typeof navigator !== 'undefined' && (navigator as any).storage?.estimate) {
      try {
        const estimate = await (navigator as any).storage.estimate()
        const quota = Number(estimate?.quota || 0)
        const usage = Number(estimate?.usage || 0)
        if (quota > 0 && usage >= 0) {
          total = quota
          free = Math.max(0, quota - usage)
        }
      } catch {
        // ignore
      }
    }
    storageSnapshotRef.current = { at: now, total, free }
    return { total, free }
  }
  const maybeAutoPruneDailyLogs = (trigger: 'batch' | 'prr') => {
    const now = Date.now()
    if (pruneInProgressRef.current) return
    if (now - lastPruneAtRef.current < AUTO_PRUNE_COOLDOWN_MS) return
    pruneInProgressRef.current = true
    void (async () => {
      try {
        const { total, free } = await getStorageSnapshot(false)
        if (!(total > 0)) return
        const freePct = (free / total) * 100
        if (freePct > LOW_STORAGE_FREE_PCT) return
        const cutoffDayKey = format(subDays(new Date(), AUTO_PRUNE_KEEP_RECENT_DAYS - 1), 'yyyy-MM-dd')
        const keys = await db.daily_logs
          .where('day_key')
          .below(cutoffDayKey)
          .limit(AUTO_PRUNE_BATCH_SIZE)
          .primaryKeys()
          .catch(() => [])
        if (keys.length === 0) {
          tracePhase('AUTO_PRUNE: skipped_keep_recent_days', {
            trigger,
            freePct: Number(freePct.toFixed(2)),
            keepRecentDays: AUTO_PRUNE_KEEP_RECENT_DAYS,
          })
          return
        }
        await db.daily_logs.bulkDelete(keys)
        lastPruneAtRef.current = Date.now()
        tracePhase('AUTO_PRUNE: daily_logs_low_storage', {
          trigger,
          deleted: keys.length,
          freePct: Number(freePct.toFixed(2)),
          cutoffDayKey,
          keepRecentDays: AUTO_PRUNE_KEEP_RECENT_DAYS,
        })
      } catch (error: any) {
        logEvent('WARN', 'Auto-prune on low storage failed', { trigger, error: String(error?.message || error) }, 'REPORTS_DB')
      } finally {
        pruneInProgressRef.current = false
      }
    })()
  }
  const markDayRolloverIfNeeded = (projectId: any, dayKey: string) => {
    const pid = normalizeProjectId(projectId)
    const prev = lastDayKeyByProjectRef.current[pid]
    if (prev && prev !== dayKey) {
      tracePhase('ROLLOVER: daily_day_key_changed', { project_id: pid, from: prev, to: dayKey })
    }
    lastDayKeyByProjectRef.current[pid] = dayKey
  }

  useEffect(() => {
    return () => {
      if (logFlushTimerRef.current != null) {
        window.clearTimeout(logFlushTimerRef.current)
        logFlushTimerRef.current = null
      }
      const pending = pendingLogBatchRef.current.splice(0)
      if (pending.length > 0) {
        const rows = pending.map((p) => p.row)
        void db.daily_logs.bulkAdd(rows).catch(() => undefined)
      }
    }
  }, [])
  useEffect(() => {
    curProjectRef.current = curProject
  }, [curProject])
  const f_load_projects = async () => {
    const projectData = await db.projects.toArray();
    if (projectData.length > 0) {
      updateProjects(projectData)
      updateCurProject(projectData[0])
    }
  }

  const f_use_insert_project = async (newData: any) => {
    let newProjectId = '';
    try {
      const projectsStore = db.projects;
      const newid = await projectsStore.add(newData);
      // projectsStore.add(newData).then(async function (newid) {
      newProjectId = newid;
      console.log('Data added successfully', newid);
      // load_projects();


      const newGroupList: Partial<IGroup>[] = Array(16).fill(0).map((item, index) => ({
        project_id: normalizeProjectId(newProjectId),
        id: (index + 1).toString(),
        overload: '',
        title: `Grp ${index + 1}`
      }))
      const newList: any[] = [];
      await Promise.all(newGroupList.map(async (item) => {
        const newItem = await db.groups.add(item)
        newList.push({ ...item, group_id: newItem })
      }))

      newData = { ...newData, id: newid }
      updateProjects(newData);
      updateCurProject(newData, true);
      updateLCs([]);
      updateGroups(newList)

      return newProjectId;

    } catch (error) {
      console.error('Error adding data to the table: ' + error);
      return newProjectId;
    }
  }

  const f_use_update_project_setting = async (id: any, data: Partial<IProject>, multiply: number, weight: any) => {
    try {
      const projectsStore = db.projects;
      const patch: Partial<IProject> = { ...data };
      const nextUnits = String(patch.units ?? curProjectRef.current?.units ?? '');
      const converted = multiply !== 1 || weight !== 1;

      // Always convert Total Overload from the pre-change project when units change
      // (groups/LCs are converted in f_update_units; this keeps the project row in sync).
      if (multiply !== 1) {
        const prevTotal = curProjectRef.current?.total_overload;
        if (prevTotal != null && String(prevTotal).trim() !== '') {
          const n = Number(prevTotal) * multiply;
          if (Number.isFinite(n)) {
            patch.total_overload = formatGroupOverloadStringForUnit(n, nextUnits);
          }
        }
      }

      await projectsStore.update(id, patch);
      console.log('project settings updated successfully');
      updateCurProject(patch);
      updateProjects({ id, ...patch });
      await f_update_units(multiply, weight, {
        nextProjectUnits: nextUnits,
        applyLcThresholdQuantize: converted,
      });
      await Promise.all([f_load_groups(), f_load_cells()]);
      return true;
    } catch (error) {
      console.error('Error updating row: ' + error);
      return false
    }
  }

  const f_load_lcs = async () => {
    if (!curProject.id) return
    const pid = normalizeProjectId(curProject.id);
    const _lcs: any = [];
    db.lcs.filter((lc: any) => normalizeProjectId(lc.project_id) === pid).toArray().then(function (data) {
      data.forEach(function (item) {
        _lcs.push({
          ...item,
          view_x: item.view_x || '0',
          view_y: item.view_y || '0',
          value: '0',
          max: item.max ?? '0',
        })
      });
      // Always send real positions from DB; "home" is applied only at display time in MonitorView
      const displayLcs = _lcs;
      const merged = bleConnected && lcs.length > 0
        ? displayLcs.map((lcFromDb: any) => {
            const current = lcs.find((c: any) => c.id === lcFromDb.id && normalizeProjectId(c.project_id) === normalizeProjectId(lcFromDb.project_id));
            if (current) {
              return {
                ...lcFromDb,
                view_x: current.view_x ?? lcFromDb.view_x,
                view_y: current.view_y ?? lcFromDb.view_y,
                value: current.value ?? lcFromDb.value,
                weightnotare: current.weightnotare ?? lcFromDb.weightnotare,
                realval: current.realval ?? lcFromDb.realval,
                battery: current.battery ?? lcFromDb.battery,
                status_tare: current.status_tare ?? lcFromDb.status_tare,
                tare: current.tare ?? lcFromDb.tare,
              };
            }
            return lcFromDb;
          })
        : displayLcs;
      updateLCsFromDb(merged);
    }).catch(function (error) {
      console.error('Error querying data from the table: ' + error);
    });
  }

  const f_load_groups = async () => {
    const pid = normalizeProjectId((curProjectRef.current?.id ?? curProject?.id) as any);
    if (!pid) return;
    try {
      const data = await db.groups.filter((g: any) => normalizeProjectId(g.project_id) === pid).toArray();
      updateGroups(data);
    } catch (error) {
      console.error('Error querying data from the table: ' + error);
    }
  }
  const init_groups = () => {
    console.log('init_groups')
    updateGroups([])
  }

  const f_update_project_last_change = () => {
    const time = new Date().getTime();
    const updatedProject = { ...curProjectRef.current, last_settings_change: time.toString() }
    updateCurProject(updatedProject)
    updateProjects(updatedProject);
  }

  const f_insert_lc = async (lc: Partial<ILC>) => {
    const { id: lcTableId = '', title = '', psw = '', underload = '', overload = '', total_sum = '', groups = '', project_id = '', capacity = {} } = lc
    const projectIdNorm = normalizeProjectId(project_id);
    const newLC = {
      id: lcTableId,
      title,
      psw,
      underload,
      overload,
      total_sum,
      groups,
      project_id: projectIdNorm,
      link_type: normalizeLcLinkType(lc.link_type),
      crr_export: normalizeCrrExportStored(lc.crr_export),
      tare: '',
      zero: '',
      capacity
    }
    try {
      // Check if LC with same id and project_id already exists and delete it first
      const existingLCs = await db.lcs.where('id').equals(lcTableId)
        .filter(lc => normalizeProjectId(lc.project_id) === projectIdNorm)
        .toArray()
      
      if (existingLCs.length > 0) {
        const primaryKeys = existingLCs.map(lc => lc.lc_id)
        await db.lcs.bulkDelete(primaryKeys)
        console.log('Deleted existing LC with same id before inserting new one')
      }
      
      await db.lcs.add(newLC)
      f_load_cells();
      f_update_project_last_change();
    } catch (error) {
      console.error('Error adding data to the lc table: ' + error)
    }
  }

  /**
   * Insert many LCs in one IndexedDB transaction, then refresh context once.
   * Avoids per-row f_insert_lc → f_load_cells (N full table reads + N React updates).
   */
  const f_insert_lcs_bulk = async (lcRecords: Partial<ILC>[]) => {
    if (!lcRecords.length || !curProject.id) return
    const pid = normalizeProjectId(curProject.id)
    const idSet = new Set(lcRecords.map((r) => String(r.id)))
    const existing = await db.lcs
      .filter((row) => idSet.has(String(row.id)) && normalizeProjectId(row.project_id) === pid)
      .toArray()
    const rows = lcRecords.map((lc) => ({
      id: lc.id ?? '',
      title: lc.title ?? '',
      psw: lc.psw ?? '',
      underload: lc.underload ?? '',
      overload: lc.overload ?? '',
      total_sum: lc.total_sum,
      groups: lc.groups ?? '',
      project_id: normalizeProjectId(lc.project_id ?? ''),
      link_type: normalizeLcLinkType(lc.link_type),
      crr_export: normalizeCrrExportStored(lc.crr_export),
      tare: '',
      zero: '',
      capacity: lc.capacity ?? {},
    }))
    try {
      await db.transaction('rw', db.lcs, async () => {
        if (existing.length > 0) {
          await db.lcs.bulkDelete(existing.map((x) => x.lc_id))
        }
        await db.lcs.bulkAdd(rows)
      })
      await f_load_cells()
      f_update_project_last_change()
      await requestCrrLcListSync()
    } catch (error) {
      console.error('Error bulk-adding LCs: ' + error)
    }
  }

  const f_load_cells = async () => {
    const pid = normalizeProjectId((curProjectRef.current?.id ?? curProject?.id) as any);
    if (!pid) return;
    try {
      const data: ILC[] = await db.lcs.filter(lc => normalizeProjectId(lc.project_id) === pid).toArray()
      updateLCsFromDb(data)
      if (curProject.show_graphs) {
        // draw_chart('lightChart', curProject.lcs)
      }
    } catch (error: any) {
      console.error('Error querying data from the table: ' + error)
    }
  }

  const f_edit_lc = async (lc: Partial<ILC>) => {
    const { id: lcTableId, title = '', psw = '', underload = '', overload = '', total_sum = '', groups = '', project_id = '', value = '', link_type, crr_export } = lc
    const lcIdNorm = lcTableId != null ? String(lcTableId) : ''
    const selectedLc = lcs.find(x => String(x.id) === lcIdNorm)

    if (!selectedLc) return

    const updatedData: any = {
      psw,
      title,
      underload,
      overload,
      total_sum,
      groups,
      project_id: normalizeProjectId(project_id),
      value,
    }
    if (link_type !== undefined) {
      updatedData.link_type = normalizeLcLinkType(link_type)
    }
    if (crr_export !== undefined) {
      updatedData.crr_export = normalizeCrrExportStored(crr_export)
    }
    try {
      await db.lcs.update(selectedLc.lc_id, updatedData)
      updateLCs({ ...updatedData, lc_id: selectedLc.lc_id, id: lcTableId })
      console.log('Row updated successfully')
      await f_load_cells()
      f_update_project_last_change()
      await requestCrrLcListSync()
    } catch (error) {
      console.error('Error updating row: ' + error)
    }
  }

  const f_update_lcs = async (lcList: ILC[]) => {
    try {
      await db.lcs.bulkPut(lcList)
      updateLCs(lcList)
    } catch (error) {
      console.error('Error updating row: ' + error)
    }
    f_update_project_last_change()
  }

  const f_reset_empty_groups_after_delete = async (deletedLcs: ILC[], remainingLcs: ILC[]) => {
    const allDeletedGroupIds = new Set<string>()
    deletedLcs.forEach(lc => {
      (lc.groups?.split(',').map((s: string) => s.trim()).filter(Boolean) || []).forEach((gid: string) => allDeletedGroupIds.add(gid))
    })
    const deletedGroupIds = Array.from(allDeletedGroupIds)
    if (deletedGroupIds.length === 0) return

    const hasGroup = (groupId: string, lcList: ILC[]) =>
      lcList.some(lc => (lc.groups?.split(',').map((s: string) => s.trim()) || []).includes(groupId))
    const emptyGroupIds = deletedGroupIds.filter((gid: string) => !hasGroup(gid, remainingLcs))
    const emptyGroupIdsStr = emptyGroupIds.map((g: string) => String(g))
    if (emptyGroupIdsStr.length > 0) {
      const pid = normalizeProjectId(curProject.id);
      for (const gid of emptyGroupIdsStr) {
        await db.groups
          .filter((g: IGroup) => normalizeProjectId(g.project_id) === pid && String(g.id) === gid)
          .modify({ overload: '', tare: '', sum: '', title: `Grp ${gid}` })
      }
      const resetGroups = groups.map(g => {
        const gidStr = String(g.id)
        return emptyGroupIdsStr.includes(gidStr) ? { ...g, overload: '', tare: '', sum: '', title: `Grp ${gidStr}` } : g
      })
      updateGroups(resetGroups)
    }
  }

  const f_delete_lc = async (id: string) => {
    const idToDelete = id != null ? String(id) : '';
    const pid = normalizeProjectId(curProject.id);

    try {
      const lcsToDelete = await db.lcs.filter(lc => String(lc.id) === idToDelete && normalizeProjectId(lc.project_id) === pid).toArray();
      
      if (lcsToDelete.length === 0) {
        updateLCs(lcs.filter(item => !(String(item.id) === idToDelete && normalizeProjectId(item.project_id) === pid)))
        return
      }
      const primaryKeys = lcsToDelete.map(lc => lc.lc_id)
      await db.lcs.bulkDelete(primaryKeys)
      const remainingLcs = lcs.filter(item => !(String(item.id) === idToDelete && normalizeProjectId(item.project_id) === pid))
      await f_reset_empty_groups_after_delete(lcsToDelete, remainingLcs)
      updateLCs(remainingLcs)
      await f_load_cells()
      await requestCrrLcListSync()
    } catch (error) {
      console.error('[f_delete_lc] Failed to delete records:', error)
      updateLCs(lcs.filter(item => !(String(item.id) === idToDelete && normalizeProjectId(item.project_id) === pid)))
    }
  }

  const f_random_rgba = () => {
    const o = Math.round, r = Math.random, s = 255
    return 'rgba(' + o(r() * s) + ',' + o(r() * s) + ',' + o(r() * s) + ',' + 1 + ')'
  }

  const f_update_units = async (
    multiply: number,
    weight: any,
    opts?: {
      nextProjectUnits?: string;
      applyLcThresholdQuantize?: boolean;
    }
  ) => {
    console.log("I'm curProject", curProject)
    try {
      const applyQ = opts?.applyLcThresholdQuantize === true
      const projU = opts?.nextProjectUnits

      const pid = normalizeProjectId((curProjectRef.current?.id ?? curProject?.id) as any);
      await Promise.all([
        db.groups.filter((g: any) => normalizeProjectId(g.project_id) === pid)
          .modify(group => {
            if (!group.overload) return
            const n = Number(group.overload) * multiply
            if (!Number.isFinite(n)) return
            group.overload = applyQ && projU
              ? formatGroupOverloadStringForUnit(n, projU)
              : n.toFixed(3)
            // group.tare = (group.tare * multiply).toFixed(3)
          }),
        db.lcs.filter((lc: any) => normalizeProjectId(lc.project_id) === pid).modify(lc => {
          const idNum = Number(lc.id)
          if (idNum > 10) {
            const ov = Number(lc.overload) * multiply
            const un = Number(lc.underload) * multiply
            const pw = Number(lc.psw) * multiply
            if (applyQ && projU) {
              lc.overload = formatThresholdStringForLc(ov, idNum, projU)
              lc.underload = formatThresholdStringForLc(un, idNum, projU)
              lc.psw = formatThresholdStringForLc(pw, idNum, projU)
            } else {
              lc.overload = ov.toFixed(3)
              lc.underload = un.toFixed(3)
              lc.psw = pw.toFixed(3)
            }
          } else {
            const ov = Number(lc.overload) * weight
            const un = Number(lc.underload) * weight
            const pw = Number(lc.psw) * weight
            lc.overload = Number.isFinite(ov) ? ov.toFixed(3) : String(lc.overload)
            lc.underload = Number.isFinite(un) ? un.toFixed(3) : String(lc.underload)
            lc.psw = Number.isFinite(pw) ? pw.toFixed(3) : String(lc.psw)
          }
        })
      ])
      console.log('Values updated successfully')
    } catch (error) {
      console.error('Error updating values: ' + error)
    }
  }
  const f_get_units_multiply = (units: string) => {
    const originUnits = curProject.units
    const updatedUnits = units
    let multiply = 0;
    switch (originUnits) {
      case "KG":
        // fixed = 0;
        multiply = (updatedUnits == "LBS") ? 2.20462 /*lbs*/ : 0.001 /*mton*/;
        break;
      case "LBS":
        // fixed = 0;
        multiply = (updatedUnits == "KG") ? 0.453592 /*kg*/ : 0.000453592 /*mton*/;
        break;
      case "M.TON":
        // fixed = 3;
        multiply = (updatedUnits == "KG") ? 1000 /*kg*/ : 2204.62 /*lbs*/;
        break;
    }
    return multiply;
  }

  const f_project_groups = async () => {
    try {
      const pid = normalizeProjectId(curProject.id);
      const data: IGroup[] = await db.groups.filter((g: any) => normalizeProjectId(g.project_id) === pid).toArray()
      // 'data' is an array containing items that match the key-value pair

      console.log('f_project_groups', { data })

      const sortedData = [...data].sort((a, b) => {
        const idA = parseInt(a.id || '0');
        const idB = parseInt(b.id || '0');
        return idA - idB;
      });
      updateGroups(sortedData.map(g => ({ ...g, last_alert: 0 })))

      // clear_groups();  // UI: clear all groups in all page for refrech
      data.forEach((grp) => {
        console.log(grp)

        // UI: show groups to 'Select Group' options in 'Proof Test' page.
        // const proofGroups = document.getElementById("proof_groups");
        // proofGroups.insertAdjacentHTML('beforeend', `<option value="${grp.group_id}">${grp.title}</option>`);
      });

      // set_group_divs();
    } catch (error) {
      console.error('Error querying data from the table: ' + error)
    }
  }
  const f_save_group = async (project_id: string, groupTableId: string, title: string, overload: string) => {
    console.log('f_save_group', { project_id, group_id: groupTableId, title, overload })
    try {
      const pid = normalizeProjectId(project_id);
      const selGrps = await db.groups
        .filter((group: any) => normalizeProjectId(group.project_id) === pid && group.id === groupTableId)
        .toArray();
      const selGrp = selGrps[0]
      console.log({ groupTableId, selGrps, selGrp })
      const selGrpOverload = selGrp.overload
      const newGroup: Partial<IGroup> = {
        ...(title ? { title } : {}),
        ...(overload ? { overload } : {}),
        tare: '',
        sum: '',
      }
      if (Number.isFinite(parseFloat(selGrpOverload))) {
        delete newGroup.overload
      }

      console.log({ newGroup, overload, title })
      await db.groups
        .filter((group: any) => normalizeProjectId(group.project_id) === pid && group.id === groupTableId)
        .modify({ ...newGroup })
      // Update app.active_project.groups array
      updateGroups({
        ...selGrp,
        ...newGroup,
      })
      console.log('Group updated successfully')
      f_update_project_last_change();
    } catch (error) {
      console.error('Error updating group: ' + error);
    }
  }

  const f_update_groups = async (groupList: IGroup[]) => {
    try {
      await db.groups.bulkPut(groupList);
      updateGroups(groupList)
    } catch (error) {
      console.error('Error updating row: ' + error)
    }
    f_update_project_last_change()
  }

  const play_beep = playAlarmBeep

  // const f_update_project_settings = async (project_id: any, updateData: Partial<IProject>) => {

  //   const res = await f_use_update_project_setting(project_id, updateData);
  //   if (res) {
  //     f_update_project_last_change();
  //     f_project_groups();
  //     f_load_cells();
  //   } else {
  //     console.error('Error updating row');
  //   }
  // }

  const f_update_project_details = async (data: IProjectDetail) => {
    try {
      const { id, project_id, ...rest } = data;
      await db.projects
        .where('project_id')
        .equals(project_id)
        .and(function (item) {
          return item.id === id;
        })
        .modify(rest)

      console.log('update sccuess');
      f_load_cells();
    } catch (error) {
      console.log(error);
    }
  }

  const f_update_project_details_image = async (project_id: any, image: any) => {
    console.log('===update_project_details_image===')
    try {
      await db.project_details
        .where('project_id')
        .equals(project_id)
        .modify({ logoheaderpdf: image })
      console.log('Successfully updated project details iamge');

    } catch (error) {
      console.log('update_project_details_image: ', error);
    }
  }

  const f_update_project_image_size = async (project_id: string, width: number, height: number) => {
    try {
      await db.projects
        .where('id')
        .equals(project_id)
        .modify({
          p_image_w: width, p_image_h: height
        });
      f_update_project_last_change()
    } catch (error) {
      console.error('Error updating row: ' + error);
    }
  }

  const f_update_project_image_position = async (project_id: string, top: number, left: number) => {
    try {
      await db.projects
        .where('id')
        .equals(project_id)
        .modify({ p_image_t: top, p_image_l: left })
      // Successfully updated
      console.log('Project image position updated successfully');
    } catch (err) {
      console.error('Error updating project image position: ', err);
    }
  }

  const f_log_prooftest_value = async (lc: any, id: any, weight: any, realval: any, overload: any, underload: any, selected_group: any) => {
    console.log('log_prooftest_value ', lc, id, weight, realval, overload, underload, selected_group)
    try {
      await db.logs_proofftest
        .add({
          lc_id: parseInt(lc),
          project_id: id,
          log_date: new Date().getTime(),
          value: parseFloat(weight),
          realval: parseFloat(realval),
          overload: overload,
          underload: underload,
          unit: curProject.units,
          group_id: selected_group
        })
      console.log('Log inserted successfully');
    } catch (error) {
      console.error('Error inserting log: ' + error);
    }
  }

  const f_calibreate = async (lc: any, v: any) => {
    console.log('===calibreate===')
    try {
      await db.lcs
        .where('id')
        .equals(lc)
        .modify({ calibration_offset: v })
        .then(function () {
          console.log('Calibration offset updated successfully for lc', lc);
        })
    } catch (error) {
      console.error('Error updating calibration offset: ' + error);
    }
  }

  const f_convert_wind_speed = (a: any, b: any) => {
    return a * b
  }

  const f_verify_lc_id = (id: string) => {
    let lc: LC_SerialsType | undefined
    LC_Serials.forEach(function (a) {
      a.range.forEach(function (b: { from: number; to: number; }) {
        if (parseInt(id) >= b.from && parseInt(id) <= b.to) {
          lc = a;
        }
      })
    });
    console.log('===verify_lc_id===', { id, verifiedLCId: lc })
    return lc;
  }

  const f_check_lc_in_project = (lc: string[] | string) => {
    if (curProject === null) {
      return;
    }
    if (typeof lc == "string") {
      // lc is number - single one
      lc = [lc]
    }
    const in_project: string[] = [];
    if (lcs) {
      lcs.forEach(function (a) {
        if (lc.includes(a.id)) {
          in_project?.push(a.id);
        }
      });
    }
    return in_project;
  }

  const f_lc_capacity_id = (id: number) => {
    let c: any = false;
    const f = false;
    LC_Serials.forEach(function (lc) {
      lc.range.forEach(function (r) {
        if (id >= r.from && id <= r.to) {
          c = lc.capacity;
        }
      });
      if (f) {
        return;
      }
    });
    return c;
  }

  const f_lc_by_id = (lc_id: number, currentLcs: Array<object | any>) => {
    return currentLcs.find(({ id }) => id === lc_id.toString())
  }

  /** Reserved lc_id for PRR BLE link events in reports (not a real load cell). */
  const PRR_LOG_LC_ID = -888888

  // legacy retention/aggregation removed: reports now store and read raw daily rows only

  const flushPendingLogBatch = () => {
    logFlushTimerRef.current = null
    const batch = pendingLogBatchRef.current.splice(0)
    if (batch.length === 0) return
    const lastEntry = batch[batch.length - 1]
    const project_id = lastEntry.meta.project_id

    let lastId: number | undefined
    void db
      .transaction('rw', db.daily_logs, async () => {
        for (const { row } of batch) {
          lastId = (await db.daily_logs.add(row)) as number
        }
      })
      .then(() => {
        logInsertCounterRef.current += batch.length
        const nowTs = Date.now()
        const m = lastEntry.meta
        if (nowTs - lastLogUiUpdateAtRef.current >= 1000) {
          lastLogUiUpdateAtRef.current = nowTs
          updateLogs({
            id: lastId != null ? String(lastId) : '',
            lc_id: parseInt(String(m.lc_id), 10) + '',
            project_id: m.project_id,
            log_date: getTime(new Date()) + '',
            value: m.parsedValue,
            realval: m.parsedRealval + '',
            overload: m.storedOverload,
            underload: m.storedUnderload,
            unit: m.unit_value,
            battery: m.battery.toString(),
            log_type: m.log_type,
          } as ILog)
        }
        maybeAutoPruneDailyLogs('batch')
      })
      .catch(function (error: any) {
      console.error('Error inserting log batch: ' + error)
      logEvent(
        'ERROR',
        'Failed to insert report log batch',
        {
          error: String(error?.message || error),
          project_id,
          batchSize: batch.length,
        },
        'REPORTS_DB'
      )
    })
  }

  const scheduleLogFlush = () => {
    if (logFlushTimerRef.current != null) return
    logFlushTimerRef.current = window.setTimeout(() => flushPendingLogBatch(), LOG_FLUSH_MS)
  }

  /** Flush immediately when a full LC wave (e.g. 75) is queued — one transaction instead of several. */
  const maybeFlushLogBatchBySize = () => {
    if (pendingLogBatchRef.current.length >= LOG_BATCH_MAX_BEFORE_FLUSH) {
      if (logFlushTimerRef.current != null) {
        window.clearTimeout(logFlushTimerRef.current)
        logFlushTimerRef.current = null
      }
      flushPendingLogBatch()
    }
  }

  /**
   * One row when PRR connects or disconnects (BLE). `reportIdLabel` is shown in the report ID column (device name preferred).
   */
  const f_log_prr_link_event = (project_id: any, kind: 'connected' | 'disconnected', reportIdLabel: string) => {
    const proj = curProjectRef.current
    if (!proj?.cycle || !reportIdLabel) return
    const log_type = kind === 'connected' ? 'prr_connected' : 'prr_disconnected'
    const now = getTime(new Date())
    const day_key = toDayKey(now)
    const hour_key = toHourKey(now)
    markDayRolloverIfNeeded(project_id, day_key)
    void db.daily_logs
      .add({
        lc_id: PRR_LOG_LC_ID,
        project_id,
        day_key,
        hour_key,
        log_date: now,
        value: 0,
        net_value: 0,
        realval: 0,
        overload: 0,
        underload: 0,
        unit: String(reportIdLabel).slice(0, 200),
        battery: 0,
        log_type,
        status_code: log_type,
        tare_applied: false,
      })
      .then((id) => {
        logInsertCounterRef.current += 1
        const nowTs = Date.now()
        if (nowTs - lastLogUiUpdateAtRef.current >= 1000) {
          lastLogUiUpdateAtRef.current = nowTs
          updateLogs({
            id,
            lc_id: String(PRR_LOG_LC_ID),
            project_id,
            log_date: getTime(new Date()) + '',
            value: 0,
            realval: '0',
            overload: 0,
            underload: 0,
            unit: String(reportIdLabel).slice(0, 200),
            battery: '0',
            log_type,
          } as ILog)
        }
        maybeAutoPruneDailyLogs('prr')
      })
      .catch((error: any) => {
        console.error('Error inserting PRR link log: ' + error)
        logEvent('ERROR', 'Failed to insert PRR link log', { error: String(error?.message || error), project_id }, 'REPORTS_DB')
      })
  }

  const f_log_lc_value = (lc_id: any, project_id: any, value: any, realval: any, overload: any, underload: any, batteryParam?: number | string) => {
    const traceNow = Date.now();
    if (traceNow - lastLogIngestTraceAtRef.current >= 1000) {
      lastLogIngestTraceAtRef.current = traceNow;
      tracePhase('INICIO: f_log_lc_value', { lc_id, project_id });
    }
    const isTrErr = value === 'Tr.Err' || value === 'Tr. Err' || value === -99999999;
    const parsedValue = isTrErr ? -99999999 : Number(value);
    const parsedRealval = isTrErr ? -99999999 : Number(realval);
    if (Number.isNaN(parsedValue) || Number.isNaN(parsedRealval)) {
      return;
    }
    const pidNorm = normalizeProjectId(project_id);
    const lcsLatest = (lcsRef?.current && Array.isArray(lcsRef.current)) ? lcsRef.current : lcs;
    const lcFromList = lcsLatest.find(
      (item: any) =>
        item.id === String(lc_id) &&
        normalizeProjectId(item.project_id) === pidNorm
    );
    const numOver = Number(overload) || Number(lcFromList?.overload) || 0;
    const numUnder = (Number(underload) || Number(lcFromList?.underload)) ?? 0;
    const threshold130 = numOver * 1.3;
    const log_type =
      parsedValue === -99999999 ? 'err'
        : numOver > 0 && parsedValue >= threshold130 ? 'danger'
          : numOver > 0 && parsedValue > numOver ? 'overload'
            : !Number.isNaN(numUnder) && parsedValue < numUnder ? 'underload'
              : 'ok';

    const unit_value = (parseInt(lc_id) < 10) ? curProject.windmeter_units : curProject.units;

    const batteryNum = batteryParam !== undefined && batteryParam !== null && String(batteryParam).trim() !== ''
      ? (typeof batteryParam === 'number' ? batteryParam : parseInt(String(batteryParam), 10))
      : (lcFromList?.battery != null && String(lcFromList.battery).trim() !== '' ? parseInt(String(lcFromList.battery), 10) : batteryStatus);
    const battery = Number.isNaN(batteryNum) ? batteryStatus : Math.min(100, Math.max(0, batteryNum));

    const storedOverload = overload != null && String(overload).trim() !== '' ? overload : numOver;
    const storedUnderload = underload != null && String(underload).trim() !== '' ? underload : numUnder;

    const tareApplied = lcFromList?.status_tare === true;
    const netValueFromLc = (() => {
      const wnRaw = lcFromList?.weightnotare;
      const wn = Number(wnRaw);
      if (tareApplied && Number.isFinite(wn) && wnRaw !== '' && wnRaw != null) return wn;
      return parsedValue;
    })();

    const now = getTime(new Date())
    const day_key = toDayKey(now)
    const hour_key = toHourKey(now)
    markDayRolloverIfNeeded(project_id, day_key)
    const row = {
      lc_id: parseInt(String(lc_id), 10),
      project_id: project_id,
      day_key,
      hour_key,
      log_date: now,
      value: parsedValue,
      net_value: netValueFromLc,
      realval: parsedRealval,
      overload: storedOverload,
      underload: storedUnderload,
      unit: unit_value,
      battery: battery,
      log_type,
      status_code: log_type,
      tare_applied: tareApplied,
    };
    const queueLen = pendingLogBatchRef.current.length
    if (queueLen >= LOG_QUEUE_HARD_LIMIT && statusPriority(log_type) <= 2) {
      // Drop non-critical rows under extreme pressure; keep err/danger/overload flowing.
      return
    }
    if (queueLen >= LOG_QUEUE_SOFT_LIMIT && statusPriority(log_type) === 1) {
      // Under sustained pressure, trim "ok" rows first.
      return
    }
    pendingLogBatchRef.current.push({
      row,
      meta: {
        lc_id,
        project_id,
        parsedValue,
        parsedRealval,
        storedOverload,
        storedUnderload,
        unit_value,
        battery,
        log_type,
      },
    });
    scheduleLogFlush();
    maybeFlushLogBatchBySize();
  }

  const f_log_delete = async () => {
    const pid = normalizeProjectId(curProject.id);
    const primaryKeys = await db.daily_logs.filter((log: any) => normalizeProjectId(log.project_id) === pid)
      .primaryKeys() // Retrieves the primary keys of the records

    await db.daily_logs.bulkDelete(primaryKeys)
    const archiveKeys = await db.logs_archive.filter((log: any) => normalizeProjectId(log.project_id) === pid).primaryKeys()
    await db.logs_archive.bulkDelete(archiveKeys)
    const aggKeys = await db.logs_agg
      .where('[project_id+bucket]')
      .between([pid, 0], [pid, Number.MAX_SAFE_INTEGER], true, true)
      .primaryKeys()
      .catch(() => [])
    if (aggKeys.length > 0) await db.logs_agg.bulkDelete(aggKeys)

    updateLogs([])
  }
  const f_reposition_stage = async (project_id: string, width: number, height: number) => {
    try {
      const updatedData = { stage_x: width, stage_y: height }
      await db.projects.update(project_id, updatedData)
      console.log('Row updated successfully')
    } catch (error) {
      console.error('Error updating row: ' + error)
    }
  }

  const escapeCsv = (v: any) => {
    const s = v == null ? '' : String(v);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const f_export_project_csv = async (projectId: string): Promise<{ csvStr: string; fileName: string } | null> => {
    try {
      const project = await db.projects.get(projectId);
      if (!project) return null;
      const pid = normalizeProjectId(projectId);
      const projectLcs = await db.lcs.filter((lc: any) => normalizeProjectId(lc.project_id) === pid).toArray();
      const projectGroups = await db.groups.filter((g: any) => normalizeProjectId(g.project_id) === pid).toArray();
      const projectPlans = await db.monitor_plans.filter((p: any) => normalizeProjectId(p.project_id) === pid).toArray();
      const projectPlanIds = new Set(projectPlans.map((p: any) => String(p.id)));
      const projectPlanLayoutsRaw = await db.monitor_plan_lc_layouts
        .filter((r: any) => normalizeProjectId(r.project_id) === pid && projectPlanIds.has(String(r.plan_id)))
        .toArray();
      const projectPlanLayoutsByKey = new Map<string, any>();
      projectPlanLayoutsRaw.forEach((r: any) => {
        const key = `${String(r.plan_id)}::${String(r.lc_id)}`;
        const prev = projectPlanLayoutsByKey.get(key);
        const prevTs = Number(prev?.updated_at ?? 0);
        const currTs = Number(r?.updated_at ?? 0);
        if (!prev || currTs >= prevTs) projectPlanLayoutsByKey.set(key, r);
      });
      const projectPlanLayouts = Array.from(projectPlanLayoutsByKey.values());
      const projectPlanState = await db.monitor_plan_state.get(pid);
      const rows: string[] = [];
      rows.push('[Project]');
      const projectHeaders = ['id', 'title', 'units', 'pre_overload', 'total_overload', 'cycle', 'report_interval_seconds', 'windmeter_units', 'stage_x', 'stage_y', 'show_graphs', 'p_image', 'p_image_w', 'p_image_h', 'p_image_l', 'p_image_t'];
      rows.push(projectHeaders.map(escapeCsv).join(','));
      const projectRow = projectHeaders.map((h) => {
        const v = (project as any)[h];
        if (h === 'p_image' && typeof v === 'string') return escapeCsv(v.replace(/\r?\n/g, ''));
        return escapeCsv(v);
      });
      rows.push(projectRow.join(','));
      rows.push('');
      rows.push('[Groups]');
      const groupHeaders = ['id', 'project_id', 'title', 'overload', 'tare'];
      rows.push(groupHeaders.map(escapeCsv).join(','));
      projectGroups.forEach((g: any) => {
        rows.push(groupHeaders.map((h) => escapeCsv(g[h])).join(','));
      });
      rows.push('');
      rows.push('[LoadCells]');
      const lcHeaders = ['lc_id', 'id', 'project_id', 'title', 'psw', 'underload', 'overload', 'groups', 'link_type', 'crr_export', 'view_x', 'view_y', 'calibration_offset', 'zero', 'tare', 'total_sum', 'capacity'];
      rows.push(lcHeaders.map(escapeCsv).join(','));
      projectLcs.forEach((lc: any) => {
        const lcRow = lcHeaders.map((h) => {
          if (h === 'capacity') return escapeCsv(typeof lc.capacity === 'object' && lc.capacity != null ? JSON.stringify(lc.capacity) : '');
          return escapeCsv(lc[h]);
        });
        rows.push(lcRow.join(','));
      });
      rows.push('');
      rows.push('[MonitorPlans]');
      const planHeaders = [
        'id', 'project_id', 'name', 'included_groups_csv', 'is_default',
        'p_image', 'p_image_w', 'p_image_h', 'p_image_l', 'p_image_t',
        'created_at', 'updated_at'
      ];
      rows.push(planHeaders.map(escapeCsv).join(','));
      projectPlans.forEach((p: any) => {
        const planRow = planHeaders.map((h) => {
          const v = p[h];
          if (h === 'p_image' && typeof v === 'string') return escapeCsv(v.replace(/\r?\n/g, ''));
          return escapeCsv(v);
        });
        rows.push(planRow.join(','));
      });
      rows.push('');
      rows.push('[MonitorPlanLayouts]');
      const planNameById = new Map(projectPlans.map((p: any) => [String(p.id), String(p.name || '')]));
      const planLayoutHeaders = ['id', 'project_id', 'plan_id', 'plan_name', 'lc_id', 'view_x', 'view_y', 'updated_at'];
      rows.push(planLayoutHeaders.map(escapeCsv).join(','));
      projectPlanLayouts.forEach((r: any) => {
        const out = planLayoutHeaders.map((h) => {
          if (h === 'plan_name') return escapeCsv(planNameById.get(String(r.plan_id)) || '');
          return escapeCsv(r[h]);
        });
        rows.push(out.join(','));
      });
      rows.push('');
      rows.push('[MonitorPlanState]');
      const planStateHeaders = ['project_id', 'selected_plan_id', 'updated_at'];
      rows.push(planStateHeaders.map(escapeCsv).join(','));
      if (projectPlanState) {
        rows.push(planStateHeaders.map((h) => escapeCsv((projectPlanState as any)[h])).join(','));
      }
      const csvStr = rows.join('\r\n');
      const safeTitle = (project.title || 'project').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 40);
      const fileName = `project_backup_${safeTitle}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.csv`;
      return { csvStr: '\uFEFF' + csvStr, fileName };
    } catch (e) {
      console.error('Export project CSV error:', e);
      return null;
    }
  };

  const parseCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += c;
      }
    }
    out.push(cur.trim());
    return out;
  };

  /** Parse CSV and return the project title from [Project] section, or null if not found. */
  const f_parse_import_project_title = (csvStr: string): string | null => {
    try {
      const raw = csvStr.replace(/^\uFEFF/, '').trim();
      const lines = raw.split(/\r?\n/).map((l) => l.trim());
      let i = 0;
      const findSection = (name: string) => {
        while (i < lines.length) {
          if (lines[i] === name) return ++i;
          i++;
        }
        return -1;
      };
      if (findSection('[Project]') < 0) return null;
      const projectHeaderRow = lines[i++];
      const projectDataRow = lines[i++] || '';
      const projectCols = parseCsvLine(projectHeaderRow);
      const projectVals = parseCsvLine(projectDataRow);
      const titleIdx = projectCols.indexOf('title');
      if (titleIdx < 0) return null;
      const title = (projectVals[titleIdx] ?? '').trim();
      return title || null;
    } catch {
      return null;
    }
  };

  /** Replace the project title in the [Project] section of the CSV with newTitle; returns modified CSV. */
  const f_replace_import_project_title = (csvStr: string, newTitle: string): string => {
    const bom = csvStr.startsWith('\uFEFF') ? '\uFEFF' : '';
    const raw = csvStr.replace(/^\uFEFF/, '');
    const lines = raw.split(/\r?\n/);
    let i = 0;
    const findSection = (name: string) => {
      while (i < lines.length) {
        if (lines[i].trim() === name) return ++i;
        i++;
      }
      return -1;
    };
    if (findSection('[Project]') < 0) return csvStr;
    const headerIdx = i;
    const dataIdx = i + 1;
    if (dataIdx >= lines.length) return csvStr;
    const projectCols = parseCsvLine(lines[headerIdx]);
    const projectVals = parseCsvLine(lines[dataIdx]);
    const titleIdx = projectCols.indexOf('title');
    if (titleIdx < 0) return csvStr;
    projectVals[titleIdx] = newTitle;
    const newDataRow = projectCols.map((_, idx) => escapeCsv(projectVals[idx])).join(',');
    const outLines = [...lines];
    outLines[dataIdx] = newDataRow;
    return bom + outLines.join('\n');
  };

  const f_import_project_csv = async (csvStr: string): Promise<string | null> => {
    try {
      const raw = csvStr.replace(/^\uFEFF/, '').trim();
      const lines = raw.split(/\r?\n/).map((l) => l.trim());
      let i = 0;
      const findSection = (name: string) => {
        while (i < lines.length) {
          if (lines[i] === name) return ++i;
          i++;
        }
        return -1;
      };
      const projectHeaders = ['id', 'title', 'units', 'pre_overload', 'total_overload', 'cycle', 'report_interval_seconds', 'windmeter_units', 'stage_x', 'stage_y', 'show_graphs'];
      const groupHeaders = ['id', 'project_id', 'title', 'overload', 'tare'];
      const lcHeaders = ['lc_id', 'id', 'project_id', 'title', 'psw', 'underload', 'overload', 'groups', 'link_type', 'crr_export', 'view_x', 'view_y', 'calibration_offset', 'zero', 'tare', 'total_sum'];
      const planIdMap = new Map<string, string>();
      const planNameMap = new Map<string, string>();
      const lcIdMap = new Map<string, string>();
      let defaultPlanId = '';
      /** Old Dexie PK of the General Plan row (is_default or name), for layout rows that only reference that id. */
      let oldGeneralPlanId = '';

      if (findSection('[Project]') < 0) return null;
      const projectHeaderRow = lines[i++];
      const projectDataRow = lines[i++] || '';
      const projectCols = parseCsvLine(projectHeaderRow);
      const projectVals = parseCsvLine(projectDataRow);
      const projectData: Record<string, unknown> = {};
      const bgImageNumCols = ['p_image_w', 'p_image_h', 'p_image_l', 'p_image_t'];
      projectCols.forEach((col, idx) => {
        let val: string | boolean | number | undefined = projectVals[idx] ?? '';
        if (col === 'cycle') val = val === 'true' || val === '1';
        else if (col === 'show_graphs') val = val === 'true' || val === '1';
        else if (col === 'report_interval_seconds') {
          const n = Number(val);
          val = (val !== '' && !Number.isNaN(n)) ? n : undefined;
        } else if (bgImageNumCols.includes(col)) val = val !== '' ? Number(val) : undefined;
        projectData[col] = val;
      });
      delete projectData.id;
      const newProjectId = await db.projects.add(projectData);
      const newIdStr = String(newProjectId);

      if (findSection('[Groups]') >= 0) {
        const groupHeaderRow = lines[i++];
        const groupCols = parseCsvLine(groupHeaderRow);
        while (i < lines.length && lines[i] && !lines[i].startsWith('[')) {
          const line = lines[i++].trim();
          if (!line) continue;
          const vals = parseCsvLine(line);
          const row: any = {};
          groupCols.forEach((col, idx) => { row[col] = vals[idx] ?? ''; });
          row.project_id = newIdStr;
          delete row.group_id;
          await db.groups.add(row);
        }
      }

      if (findSection('[LoadCells]') >= 0) {
        const lcHeaderRow = lines[i++];
        const lcCols = parseCsvLine(lcHeaderRow);
        while (i < lines.length && lines[i] && !lines[i].startsWith('[')) {
          const line = lines[i++].trim();
          if (!line) continue;
          const vals = parseCsvLine(line);
          const row: any = {};
          lcCols.forEach((col, idx) => { row[col] = vals[idx] ?? ''; });
          row.project_id = newIdStr;
          if (row.id !== undefined) row.id = String(row.id);
          if (row.zero !== undefined && row.zero !== '') row.zero = Number(row.zero);
          if (row.capacity !== undefined && row.capacity !== '') {
            try {
              row.capacity = typeof row.capacity === 'string' ? JSON.parse(row.capacity) : row.capacity;
            } catch {
              row.capacity = {};
            }
          }
          if (row.link_type !== undefined && row.link_type !== '') {
            row.link_type = normalizeLcLinkType(row.link_type);
          }
          if (row.crr_export !== undefined && row.crr_export !== '') {
            row.crr_export = normalizeCrrExportStored(row.crr_export);
          }
          const oldLcId = row.lc_id != null ? String(row.lc_id) : '';
          delete row.lc_id;
          const newLcPk = await db.lcs.add(row);
          if (oldLcId) lcIdMap.set(oldLcId, String(newLcPk));
        }
      }

      if (findSection('[MonitorPlans]') >= 0) {
        const planHeaderRow = lines[i++];
        const planCols = parseCsvLine(planHeaderRow);
        while (i < lines.length && lines[i] && !lines[i].startsWith('[')) {
          const line = lines[i++].trim();
          if (!line) continue;
          const vals = parseCsvLine(line);
          const row: any = {};
          planCols.forEach((col, idx) => { row[col] = vals[idx] ?? ''; });
          const oldPlanId = row.id != null ? String(row.id) : '';
          if (row.is_default !== undefined) row.is_default = row.is_default === 'true' || row.is_default === '1';
          const planNameKeyPre = String(row.name ?? '').trim().toLowerCase();
          if (oldPlanId && (row.is_default === true || planNameKeyPre === 'general plan')) {
            oldGeneralPlanId = oldPlanId;
          }
          row.project_id = newIdStr;
          ['p_image_w', 'p_image_h', 'p_image_l', 'p_image_t', 'created_at', 'updated_at'].forEach((k) => {
            if (row[k] !== undefined && row[k] !== '') row[k] = Number(row[k]);
            else if (row[k] === '') row[k] = undefined;
          });
          delete row.id;
          const newPlanPk = await db.monitor_plans.add(row);
          const newPlanIdStr = String(newPlanPk);
          if (oldPlanId) planIdMap.set(oldPlanId, newPlanIdStr);
          const planNameKey = String(row.name ?? '').trim().toLowerCase();
          if (planNameKey) planNameMap.set(planNameKey, newPlanIdStr);
          if (row.is_default === true) defaultPlanId = newPlanIdStr;
          else if (!defaultPlanId && planNameKey === 'general plan') defaultPlanId = newPlanIdStr;
        }
      }

      if (findSection('[MonitorPlanLayouts]') >= 0) {
        const layoutHeaderRow = lines[i++];
        const layoutCols = parseCsvLine(layoutHeaderRow);
        const dedup = new Map<string, any>();
        while (i < lines.length && lines[i] && !lines[i].startsWith('[')) {
          const line = lines[i++].trim();
          if (!line) continue;
          const vals = parseCsvLine(line);
          const row: any = {};
          layoutCols.forEach((col, idx) => { row[col] = vals[idx] ?? ''; });
          const rawPlanId = String(row.plan_id ?? '').trim();
          const rawPlanName = String(row.plan_name ?? '').trim().toLowerCase();
          const mappedById = planIdMap.get(rawPlanId) || '';
          const mappedByName = rawPlanName ? (planNameMap.get(rawPlanName) || '') : '';
          const mappedLegacyGeneral =
            !mappedById && !mappedByName && (rawPlanId === 'general' || rawPlanId === 'default' || rawPlanId === 'main')
              ? defaultPlanId
              : '';
          const mappedFromOldGeneralPk =
            !mappedById && !mappedByName && !mappedLegacyGeneral && defaultPlanId && oldGeneralPlanId && rawPlanId === oldGeneralPlanId
              ? defaultPlanId
              : '';
          const mappedPlanId = mappedById || mappedByName || mappedLegacyGeneral || mappedFromOldGeneralPk || '';
          const mappedLcId = lcIdMap.get(String(row.lc_id)) || '';
          if (!mappedPlanId || !mappedLcId) continue;
          row.project_id = newIdStr;
          row.plan_id = mappedPlanId;
          row.lc_id = mappedLcId;
          if (row.updated_at !== undefined && row.updated_at !== '') row.updated_at = Number(row.updated_at);
          delete row.id;
          const key = `${String(row.plan_id)}::${String(row.lc_id)}`;
          const prev = dedup.get(key);
          const prevTs = Number(prev?.updated_at ?? 0);
          const currTs = Number(row?.updated_at ?? 0);
          if (!prev || currTs >= prevTs) dedup.set(key, row);
        }
        const rows = Array.from(dedup.values());
        if (rows.length > 0) await db.monitor_plan_lc_layouts.bulkAdd(rows);
      }

      if (findSection('[MonitorPlanState]') >= 0) {
        const stateHeaderRow = lines[i++];
        const stateCols = parseCsvLine(stateHeaderRow);
        if (i < lines.length && lines[i] && !lines[i].startsWith('[')) {
          const vals = parseCsvLine(lines[i++].trim());
          const row: any = {};
          stateCols.forEach((col, idx) => { row[col] = vals[idx] ?? ''; });
          const rawSelectedPlanId = String(row.selected_plan_id ?? '').trim();
          const mappedPlanId =
            planIdMap.get(rawSelectedPlanId) ||
            ((rawSelectedPlanId === 'general' || rawSelectedPlanId === 'default' || rawSelectedPlanId === 'main')
              ? defaultPlanId
              : '') ||
            '';
          if (mappedPlanId) {
            await db.monitor_plan_state.put({
              project_id: newIdStr,
              selected_plan_id: mappedPlanId,
              updated_at: row.updated_at !== '' ? Number(row.updated_at) : Date.now(),
            });
          }
        }
      }

      return newIdStr;
    } catch (e) {
      console.error('Import project CSV error:', e);
      return null;
    }
  };

  const toReturn = {
    f_load_lcs,
    f_load_groups,
    f_load_projects,
    f_use_insert_project,
    f_use_update_project_setting,
    f_update_project_last_change,
    f_load_cells,
    f_insert_lc,
    f_insert_lcs_bulk,
    f_edit_lc,
    f_update_lcs,
    f_delete_lc,
    f_reset_empty_groups_after_delete,
    f_random_rgba,
    f_update_units,
    f_get_units_multiply,
    f_project_groups,
    f_save_group,
    f_update_groups,
    play_beep,
    // f_update_project_settings,
    f_update_project_details,
    f_update_project_details_image,
    f_update_project_image_size,
    f_update_project_image_position,
    f_log_prooftest_value,
    f_convert_wind_speed,
    f_calibreate,
    f_verify_lc_id,
    f_check_lc_in_project,
    f_lc_capacity_id,
    f_lc_by_id,
    f_log_lc_value,
    f_log_prr_link_event,
    f_log_delete,
    f_reposition_stage,
    f_export_project_csv,
    f_import_project_csv,
    f_parse_import_project_title,
    f_replace_import_project_title,
  }
  return toReturn

}