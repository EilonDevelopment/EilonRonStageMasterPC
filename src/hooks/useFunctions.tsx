
import { useTranslation } from "react-i18next";
import useAppData from "./useAppData";
import { db } from "../db";
import { IGroup, ILC, ILog, IProject, IProjectDetail } from "../helper/types";
import { LC_Serials, LC_SerialsType } from "../helper/constants";
import { normalizeProjectId } from "../helper/functions";
import { format, getTime } from "date-fns";
import { useEffect, useRef } from "react";
import { logEvent } from "../services/LogService";


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
  } = useAppData()
  const { t } = useTranslation()
  const curProjectRef = useRef<any>(curProject)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioSuspendTimerRef = useRef<number | null>(null)
  const logInsertCounterRef = useRef<number>(0)
  const lastLogUiUpdateAtRef = useRef<number>(0)
  const lastRetentionCleanupAtRef = useRef<number>(0)
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

  const tracePhase = (phase: string, extra?: Record<string, any>) => {
    const step = ++traceStepRef.current;
    const details = extra ? ` | ${JSON.stringify(extra)}` : '';
    console.info(`[RSM_TRACE] [${step}] ${phase}${details}`);
  };

  const getDynamicMaxLogsPerProject = (): number => {
    const intervalSecRaw = (curProjectRef.current?.report_interval_seconds ?? 60) as any;
    const intervalSec = Math.max(1, Number(intervalSecRaw) || 60);

    // Conservative scaling: faster logging => smaller raw window to reduce DB churn and memory pressure.
    // Slower logging => allow more raw retention without risking stability.
    if (intervalSec <= 2) return 100_000;     // ~22 min @ 75 logs/sec
    if (intervalSec <= 5) return 150_000;     // ~33 min @ 75 logs/sec
    if (intervalSec <= 15) return 200_000;    // ~44 min @ 75 logs/sec
    if (intervalSec <= 60) return 300_000;    // ~66 min @ 75 logs/sec
    if (intervalSec <= 300) return 500_000;   // ~111 min @ 75 logs/sec
    return 750_000;
  };

  useEffect(() => {
    return () => {
      if (audioSuspendTimerRef.current != null) {
        window.clearTimeout(audioSuspendTimerRef.current)
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close()
        audioContextRef.current = null
      }
      if (logFlushTimerRef.current != null) {
        window.clearTimeout(logFlushTimerRef.current)
        logFlushTimerRef.current = null
      }
      const pending = pendingLogBatchRef.current.splice(0)
      if (pending.length > 0) {
        const rows = pending.map((p) => p.row)
        void db.logs.bulkAdd(rows).catch(() => undefined)
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
      await projectsStore.update(id, data);
      console.log('project settings updated successfully');
      updateCurProject(data)
      updateProjects({ id, ...data })
      f_update_units(multiply, weight)
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
    if (!curProject.id) return
    const pid = normalizeProjectId(curProject.id);
    db.groups.filter((g: any) => normalizeProjectId(g.project_id) === pid).toArray().then(function (data) {
      console.log('load_groups', { data })
      updateGroups(data)
    }).catch(function (error) {
      console.error('Error querying data from the table: ' + error);
    });
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

  const f_load_cells = async () => {
    if (!curProject.id) return
    const pid = normalizeProjectId(curProject.id);
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
    const { id: lcTableId, title = '', psw = '', underload = '', overload = '', total_sum = '', groups = '', project_id = '', value = '' } = lc
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
    try {
      await db.lcs.update(selectedLc.lc_id, updatedData)
      updateLCs({ ...updatedData, lc_id: selectedLc.lc_id, id: lcTableId })
      console.log('Row updated successfully')
      f_load_cells()
      // $("#newproject").modal('hide');
      // $("#navbarDropdown").click();
    } catch (error) {
      console.error('Error updating row: ' + error)
    }
    f_update_project_last_change()
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
      f_load_cells()
    } catch (error) {
      console.error('[f_delete_lc] Failed to delete records:', error)
      updateLCs(lcs.filter(item => !(String(item.id) === idToDelete && normalizeProjectId(item.project_id) === pid)))
    }
  }

  const f_random_rgba = () => {
    const o = Math.round, r = Math.random, s = 255
    return 'rgba(' + o(r() * s) + ',' + o(r() * s) + ',' + o(r() * s) + ',' + 1 + ')'
  }

  const f_update_units = async (multiply: number, weight: any) => {
    console.log("I'm curProject", curProject)
    try {

      const pid = normalizeProjectId(curProject.id);
      await Promise.all([
        db.groups.filter((g: any) => normalizeProjectId(g.project_id) === pid)
          .modify(group => {
            if (!group.overload) return
            group.overload = (group.overload * multiply).toFixed(3)
            // group.tare = (group.tare * multiply).toFixed(3)
          }),
        db.lcs.filter((lc: any) => normalizeProjectId(lc.project_id) === pid).modify(lc => {
          if (lc.id > 10) {
            lc.overload = (lc.overload * multiply).toFixed(3)
            lc.underload = (lc.underload * multiply).toFixed(3)
            lc.psw = (lc.psw * multiply).toFixed(3)

          } else {
            lc.overload = (lc.overload * weight)
            lc.underload = (lc.underload * weight)
            lc.psw = (lc.psw * weight)

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

  const getAudioContext = async (): Promise<AudioContext | null> => {
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext
        if (!Ctx) return null
        audioContextRef.current = new Ctx()
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume()
      }
      return audioContextRef.current
    } catch (error) {
      console.warn('Audio context unavailable:', error)
      return null
    }
  }

  const scheduleAudioSuspend = () => {
    if (audioSuspendTimerRef.current != null) {
      window.clearTimeout(audioSuspendTimerRef.current)
    }
    audioSuspendTimerRef.current = window.setTimeout(() => {
      const ctx = audioContextRef.current
      if (ctx && ctx.state === 'running') {
        void ctx.suspend()
      }
    }, 3000)
  }

  const play_beep = (count = 1, frequency = 800, duration = 200) => {
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        void (async () => {
          const audioContext = await getAudioContext()
          if (!audioContext) return

          const oscillator = audioContext.createOscillator()
          const gainNode = audioContext.createGain()

          oscillator.connect(gainNode)
          gainNode.connect(audioContext.destination)

          oscillator.frequency.value = frequency
          oscillator.type = 'sine'

          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000)

          oscillator.onended = () => {
            try {
              oscillator.disconnect()
              gainNode.disconnect()
            } catch {
              // no-op: nodes may already be disconnected
            }
          }

          oscillator.start(audioContext.currentTime)
          oscillator.stop(audioContext.currentTime + duration / 1000)
          scheduleAudioSuspend()
        })()
      }, i * (duration + 100))
    }
  }

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

  const runLogRetentionCleanup = async (project_id: any) => {
    try {
      const RAW_RETENTION_DAYS = 7
      const AGG_RETENTION_DAYS = 90
      const AGG_BUCKET_MS = 5 * 60 * 1000
      const MAX_LOGS_PER_PROJECT = getDynamicMaxLogsPerProject()
      const now = Date.now()
      const rawCutoff = now - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000
      const aggCutoff = now - AGG_RETENTION_DAYS * 24 * 60 * 60 * 1000
      const pidNorm = normalizeProjectId(project_id)
      const pidNum = Number(pidNorm)
      const pidCandidates: any[] = []
      if (pidNorm) pidCandidates.push(pidNorm)
      if (Number.isFinite(pidNum)) pidCandidates.push(pidNum)
      const OLD_ROWS_CHUNK = 2000

      const aggregateRowsToAggTable = async (rows: any[]) => {
        if (!rows || rows.length === 0) return
        const aggMap = new Map<string, any>()
        for (const row of rows) {
          const lc = Number(row.lc_id)
          const t = Number(row.log_date)
          if (!Number.isFinite(lc) || !Number.isFinite(t)) continue
          const bucket = Math.floor(t / AGG_BUCKET_MS) * AGG_BUCKET_MS
          const key = `${pidNorm}|${lc}|${bucket}`
          const val = Number(row.value)
          const rval = Number(row.realval)
          const b = row.battery != null ? Number(row.battery) : undefined

          let a = aggMap.get(key)
          if (!a) {
            a = {
              project_id: pidNorm,
              lc_id: lc,
              bucket,
              log_date: bucket,
              unit: row.unit,
              overload: row.overload,
              underload: row.underload,
              count: 0,
              value_sum: 0,
              value_min: Number.POSITIVE_INFINITY,
              value_max: Number.NEGATIVE_INFINITY,
              realval_sum: 0,
              realval_min: Number.POSITIVE_INFINITY,
              realval_max: Number.NEGATIVE_INFINITY,
              last_value: undefined as any,
              last_realval: undefined as any,
              last_battery: undefined as any,
              last_ts: 0,
              log_type: 'agg',
            }
            aggMap.set(key, a)
          }

          a.count += 1
          if (Number.isFinite(val)) {
            a.value_sum += val
            a.value_min = Math.min(a.value_min, val)
            a.value_max = Math.max(a.value_max, val)
          }
          if (Number.isFinite(rval)) {
            a.realval_sum += rval
            a.realval_min = Math.min(a.realval_min, rval)
            a.realval_max = Math.max(a.realval_max, rval)
          }
          if (t >= a.last_ts) {
            a.last_ts = t
            a.last_value = row.value
            a.last_realval = row.realval
            if (b !== undefined && Number.isFinite(b)) a.last_battery = b
          }
        }

        const aggRows = Array.from(aggMap.values()).map((a: any) => {
          const value_avg = a.count > 0 ? a.value_sum / a.count : undefined
          const realval_avg = a.count > 0 ? a.realval_sum / a.count : undefined
          return {
            project_id: a.project_id,
            lc_id: a.lc_id,
            bucket: a.bucket,
            log_date: a.log_date,
            unit: a.unit,
            overload: a.overload,
            underload: a.underload,
            value: Number.isFinite(value_avg) ? value_avg : a.last_value,
            realval: Number.isFinite(realval_avg) ? realval_avg : a.last_realval,
            battery: a.last_battery,
            log_type: 'agg',
            count: a.count,
            value_min: Number.isFinite(a.value_min) ? a.value_min : undefined,
            value_max: Number.isFinite(a.value_max) ? a.value_max : undefined,
            realval_min: Number.isFinite(a.realval_min) ? a.realval_min : undefined,
            realval_max: Number.isFinite(a.realval_max) ? a.realval_max : undefined,
          }
        })

        if (aggRows.length > 0) {
          await db.logs_agg.bulkPut(aggRows)
        }
      }

      let deletedOldRaw = 0
      for (const pidCandidate of pidCandidates) {
        let hasMore = true
        while (hasMore) {
          const oldRows = await db.logs
            .where('[project_id+log_date]')
            .between([pidCandidate, 0], [pidCandidate, rawCutoff], true, false)
            .limit(OLD_ROWS_CHUNK)
            .toArray()
          if (oldRows.length === 0) {
            hasMore = false
            continue
          }
          await aggregateRowsToAggTable(oldRows)
          await db.logs.bulkDelete(oldRows.map((r: any) => r.id))
          deletedOldRaw += oldRows.length
          hasMore = oldRows.length === OLD_ROWS_CHUNK
        }
      }

      let projectRawCount = 0
      for (const pidCandidate of pidCandidates) {
        projectRawCount += await db.logs
          .where('[project_id+log_date]')
          .between([pidCandidate, 0], [pidCandidate, Number.MAX_SAFE_INTEGER], true, true)
          .count()
      }
      let extraToTrim = Math.max(0, projectRawCount - MAX_LOGS_PER_PROJECT)
      let deletedByCap = 0
      if (extraToTrim > 0) {
        for (const pidCandidate of pidCandidates) {
          if (extraToTrim <= 0) break
          const rowsToDelete = await db.logs
            .where('[project_id+log_date]')
            .between([pidCandidate, 0], [pidCandidate, Number.MAX_SAFE_INTEGER], true, true)
            .limit(extraToTrim)
            .toArray()
          if (rowsToDelete.length === 0) continue
          await aggregateRowsToAggTable(rowsToDelete)
          await db.logs.bulkDelete(rowsToDelete.map((x: any) => x.id))
          extraToTrim -= rowsToDelete.length
          deletedByCap += rowsToDelete.length
        }
      }

      let deletedAggOld = 0
      for (const pidCandidate of pidCandidates) {
        const aggOldKeys = await db.logs_agg
          .where('[project_id+bucket]')
          .between([pidCandidate, 0], [pidCandidate, aggCutoff], true, false)
          .primaryKeys()
        if (aggOldKeys.length > 0) {
          await db.logs_agg.bulkDelete(aggOldKeys)
          deletedAggOld += aggOldKeys.length
        }
      }
      tracePhase('FIN: cleanup_retention', {
        project_id,
        deletedOldRaw,
        deletedByCap,
        deletedAggOld,
        maxRawPerProject: MAX_LOGS_PER_PROJECT,
      })
    } catch (cleanupErr) {
      console.warn('[f_log_lc_value] retention cleanup failed:', cleanupErr)
      tracePhase('ERROR: cleanup_retention', {
        project_id,
        error: String((cleanupErr as any)?.message || cleanupErr),
      })
    }
  }

  /** Defer heavy DB work off the ingest hot path (long-run Android/iPad stability). */
  const scheduleIdleRetentionCleanup = (project_id: any) => {
    const w = typeof window !== 'undefined' ? (window as any) : undefined
    const run = () => {
      void runLogRetentionCleanup(project_id)
    }
    if (w && typeof w.requestIdleCallback === 'function') {
      w.requestIdleCallback(run, { timeout: 10_000 })
    } else {
      setTimeout(run, 0)
    }
  }

  const flushPendingLogBatch = () => {
    logFlushTimerRef.current = null
    const batch = pendingLogBatchRef.current.splice(0)
    if (batch.length === 0) return
    const lastEntry = batch[batch.length - 1]
    const project_id = lastEntry.meta.project_id

    let lastId: number | undefined
    void db
      .transaction('rw', db.logs, async () => {
        for (const { row } of batch) {
          lastId = (await db.logs.add(row)) as number
        }
      })
      .then(() => {
        logInsertCounterRef.current += batch.length
        const nowTs = Date.now()
        const shouldRunRetentionCleanup =
          logInsertCounterRef.current % 2000 === 0 &&
          nowTs - lastRetentionCleanupAtRef.current >= 60_000
        if (shouldRunRetentionCleanup) {
          lastRetentionCleanupAtRef.current = nowTs
          tracePhase('INICIO: cleanup_retention', { project_id, insertCounter: logInsertCounterRef.current })
          scheduleIdleRetentionCleanup(project_id)
        }
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
    void db.logs
      .add({
        lc_id: PRR_LOG_LC_ID,
        project_id,
        log_date: getTime(new Date()),
        value: 0,
        realval: 0,
        overload: 0,
        underload: 0,
        unit: String(reportIdLabel).slice(0, 200),
        battery: 0,
        log_type,
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
    const lcFromList = lcs.find((item: any) => item.id === String(lc_id));
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

    const row = {
      lc_id: parseInt(String(lc_id), 10),
      project_id: project_id,
      log_date: getTime(new Date()),
      value: parsedValue,
      realval: parsedRealval,
      overload: storedOverload,
      underload: storedUnderload,
      unit: unit_value,
      battery: battery,
      log_type,
    };
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
    const primaryKeys = await db.logs.filter((log: any) => normalizeProjectId(log.project_id) === pid)
      .primaryKeys() // Retrieves the primary keys of the records

    await db.logs.bulkDelete(primaryKeys)
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
      const lcHeaders = ['id', 'project_id', 'title', 'psw', 'underload', 'overload', 'groups', 'view_x', 'view_y', 'calibration_offset', 'zero', 'tare', 'total_sum', 'capacity'];
      rows.push(lcHeaders.map(escapeCsv).join(','));
      projectLcs.forEach((lc: any) => {
        const lcRow = lcHeaders.map((h) => {
          if (h === 'capacity') return escapeCsv(typeof lc.capacity === 'object' && lc.capacity != null ? JSON.stringify(lc.capacity) : '');
          return escapeCsv(lc[h]);
        });
        rows.push(lcRow.join(','));
      });
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
      const lcHeaders = ['id', 'project_id', 'title', 'psw', 'underload', 'overload', 'groups', 'view_x', 'view_y', 'calibration_offset', 'zero', 'tare', 'total_sum'];

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
          delete row.lc_id;
          await db.lcs.add(row);
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