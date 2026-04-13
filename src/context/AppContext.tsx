import React, { createContext, useState, useRef, useEffect } from 'react'
import { IGroup, ILC, ILog, IProject, ILCOverloadAlert } from '../helper/types';
import { MonitorStatus } from '../helper/constants';
import { normalizeProjectId } from '../helper/functions';
import { Capacitor } from '@capacitor/core';
import { db } from '../db';
import { toast } from 'react-toastify';
import { logEvent } from '../services/LogService';

/** Bound UI memory during long PRR sessions (live tail + recent history). */
const MAX_IN_MEMORY_LOGS = 400;

/** Throttle diagnostic log (was firing every burst → read/write app_runtime_logs.json constantly). */
let lastMassiveLcsBurstLogAt = 0;
const MASSIVE_LCS_BURST_LOG_COOLDOWN_MS = 60_000;

interface IAppContext {
  mode: 'dark' | 'light';
  errStr: string;
  successStr: string;
  isMobile: boolean;
  platformType: string;

  monitorStatus: 'view' | 'list' | 'prog' | 'stop';
  projects: IProject[];
  curProject: IProject;
  lcs: ILC[];
  groups: IGroup[];
  logs: ILog[];
  visibleModal: string;
  bleConnected: boolean;
  batteryStatus: number;
  confirmed: boolean;
  totalWeightHtml: string;
  LCMax: any[];
  warnList: any[];
  liveLC: any[];
  weighData: any;
  lc_wind_alerts: ILCOverloadAlert[];
  lc_overload_alerts: ILCOverloadAlert[];
  activeToastCount: number;
  isCreatingLCs: boolean;
  tareStatus: boolean;

  updateMode: (status: 'dark' | 'light') => void;
  updateTareStatus: (status: boolean) => void;
  updateErrStr: (str: string) => void;
  updateSuccessStr: (str: string) => void;

  init: () => void,
  updateMonitorStatus: () => void;
  updateProjects: (data: Partial<IProject> | IProject[]) => void,
  updateCurProject: (data: Partial<IProject>, replace?: boolean) => void,
  updateLCs: (data: ILC | ILC[] | any) => void,
  /** Replace LCs with DB data but preserve status_tare/tare/weightnotare and live value/realval/battery from current context */
  updateLCsFromDb: (data: ILC[]) => void,
  updateGroups: (data: IGroup | IGroup[]) => void,
  updateLogs: (data: ILog | ILog[]) => void,

  updateVisibleModal: (name: string) => void,
  updateBleConnected: (status: boolean) => void,
  updateBatteryStatus: (status: number) => void,
  updateConfirmed: (status: boolean) => void,
  updateTotalWeightHtml: (html: string) => void,
  updateLCMax: (data: any[]) => void,
  updateWarnList: (data: any | any[]) => void,
  updateLiveLC: (data: any[]) => void,
  updateWeighData: (data: any) => void,
  load_projects: () => Promise<void>,
  load_lcs: () => Promise<void>,
  load_groups: () => Promise<void>,
  updateLCWindAlerts: (data: ILCOverloadAlert | ILCOverloadAlert[]) => Promise<void>,
  updateLCOverloadAlerts: (data: ILCOverloadAlert | ILCOverloadAlert[]) => Promise<void>,
  updateCreatingLCs: (creating: boolean) => void,
  lastUpdatedRef: React.MutableRefObject<number>;
  dataTimeByIdRef: React.MutableRefObject<any[]>;
  timeoutHandledRef: React.MutableRefObject<boolean>;
  layoutRefreshRef: React.MutableRefObject<(() => void) | null>;
  lcsRef: React.MutableRefObject<ILC[]>;
}


const initialState = {
  mode: 'dark',
  errStr: '',
  successStr: '',
  isMobile: false,
  platformType: false,
  monitorStatus: 'view',
  projects: [],
  curProject: {} as IProject,
  lcs: [],
  groups: [],
  logs: [],
  visibleModal: '',
  bleConnected: false,
  batteryStatus: 0,
  confirmed: false,
  totalWeightHtml: 'Tr.Err',
  LCMax: [],
  warnList: [],
  // TODO: Remove below liveLC value on Deploy.(Used for Test Purpose)
  // liveLC: {id: '301', realval: 35, zero: -35},
  liveLC: [],
  weighData: null,
  lc_wind_alerts: [],
  lc_overload_alerts: [],
  activeToastCount: 0,
  isCreatingLCs: false,
  tareStatus: false,

  // eslint-disable-next-line
  updateErrStr: () => { },
  // eslint-disable-next-line
  updateTareStatus: () => { },
  // eslint-disable-next-line
  updateMode: () => { },
  // eslint-disable-next-line
  updateSuccessStr: () => { },
  // eslint-disable-next-line
  init: () => { },
  // eslint-disable-next-line
  updateMonitorStatus: () => { },
  // eslint-disable-next-line
  updateProjects: () => { },
  // eslint-disable-next-line
  updateCurProject: () => { },
  // eslint-disable-next-line
  updateLCs: () => { },
  // eslint-disable-next-line
  updateLCsFromDb: () => { },
  // eslint-disable-next-line
  updateGroups: () => { },
  // eslint-disable-next-line
  updateLogs: () => { },
  // eslint-disable-next-line
  updateVisibleModal: () => { },
  // eslint-disable-next-line
  updateBleConnected: () => { },
  // eslint-disable-next-line
  updateBatteryStatus: () => { },
  // eslint-disable-next-line
  updateConfirmed: () => { },
  // eslint-disable-next-line
  updateTotalWeightHtml: () => { },
  // eslint-disable-next-line
  updateLCMax: () => { },
  // eslint-disable-next-line
  updateWarnList: () => { },
  // eslint-disable-next-line
  updateLiveLC: () => { },
  // eslint-disable-next-line
  updateWeighData: () => { },
  // eslint-disable-next-line
  load_projects: () => undefined,
  load_lcs: () => undefined,
  load_groups: () => undefined,
  updateLCWindAlerts: () => undefined,
  updateLCOverloadAlerts: () => undefined,
  // eslint-disable-next-line
  updateCreatingLCs: () => { },
  lastUpdatedRef: { current: 0 } as React.MutableRefObject<number>,
  dataTimeByIdRef: { current: [] } as React.MutableRefObject<any[]>,
  timeoutHandledRef: { current: false } as React.MutableRefObject<boolean>,
  layoutRefreshRef: { current: null } as React.MutableRefObject<(() => void) | null>,
}

const AppContext = createContext({} as IAppContext)

// eslint-disable-next-line
export const AppDataProvider = (props: any) => {
  const { children } = props;
  const lastUpdatedRef = useRef<number>(Date.now());
  const dataTimeByIdRef = useRef<any[]>([]);
  const timeoutHandledRef = useRef<boolean>(false);
  const layoutRefreshRef = useRef<(() => void) | null>(null);
  const lcsRef = useRef<ILC[]>([]);

  const [mode, setMode] = useState<'dark' | 'light'>(props.mode || initialState.mode);
  const [errStr, setErrStr] = useState<string>(props.errStr || initialState.errStr);
  const [successStr, setSuccessStr] = useState<string>(props.successStr || initialState.successStr);
  const [monitorStatus, setMonitorStatus] = useState<'view' | 'list' | 'prog' | 'stop'>(props.monitorStatus || initialState.monitorStatus);
  const [projects, setProjects] = useState<IProject[]>(props.projects || initialState.projects);
  const [curProject, setCurProject] = useState<IProject>(props.curProject || initialState.curProject);
  const [lcs, setLCs] = useState<ILC[]>(props.lcs || initialState.lcs);
  const [groups, setGroups] = useState<IGroup[]>(props.groups || initialState.groups);
  const [logs, setLogs] = useState<ILog[]>(props.logs || initialState.logs);
  const [visibleModal, setVisibleModal] = useState<string>(props.visibleModal || initialState.visibleModal);
  const [bleConnected, setBleConnected] = useState<boolean>(props.bleConnected || initialState.bleConnected);
  const [batteryStatus, setBatteryStatus] = useState<number>(props.batteryStatus || initialState.batteryStatus);
  const [confirmed, setConfirmed] = useState<boolean>(props.confirmed || initialState.confirmed);
  const [totalWeightHtml, setTotalWeightHtml] = useState(props.totalWeightHtml || initialState.totalWeightHtml);
  const [LCMax, setLCMax] = useState(props.LCMax || initialState.LCMax);
  const [warnList, setWarnList] = useState(props.warnList || initialState.warnList);
  const [liveLC, setLiveLC] = useState(props.liveLC || initialState.liveLC);
  const [weighData, setWeighData] = useState(props.weighData || initialState.weighData);
  const [lc_wind_alerts, setLCWindAlerts] = useState<ILCOverloadAlert[]>(props.lc_wind_alerts || initialState.lc_wind_alerts);
  const [lc_overload_alerts, setLCOverloadAlerts] = useState<ILCOverloadAlert[]>(props.lc_overload_alerts || initialState.lc_overload_alerts);
  const [activeToastCount, setActiveToastCount] = useState(0);
  const [isCreatingLCs, setIsCreatingLCs] = useState(false);
  const [tareStatus, setTareStatus] = useState<boolean>(initialState.tareStatus);

  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('rsm_tare_status', 'false');
      }
    } catch (_) { /* ignore */ }
  }, []);

  useEffect(() => {
    const unsubscribe = toast.onChange((payload) => {
      setActiveToastCount((prev) => {
        const next = payload.status === 'added' ? prev + 1 : payload.status === 'removed' ? Math.max(0, prev - 1) : prev;
        return next;
      });
    });
    return () => { unsubscribe(); };
  }, []);

  useEffect(() => {
    lcsRef.current = lcs;
  }, [lcs]);

  const handleMode = (mode: 'dark' | 'light') => {
    setMode(mode)
  }

  const handleErrStr = (str: string) => {
    setErrStr(str)
  }

  const handleSuccessStr = (str: string) => {
    setSuccessStr(str)
  }

  const handleInit = () => {
    setLCs([])
  }

  const handleMonitorStatus = () => {
    const index = MonitorStatus.indexOf(monitorStatus)
    const nextMode = index === 3 ? MonitorStatus[0] : MonitorStatus[index + 1]
    setMonitorStatus(nextMode)
  }

  const handleProjects = (project: Partial<IProject> | IProject[]) => {
    if (Array.isArray(project)) {
      setProjects(project)
    } else {
      const pidNorm =
        project.id != null && String(project.id).trim() !== ''
          ? normalizeProjectId(project.id)
          : '';

      if (pidNorm) {
        setProjects((prevProjects: IProject[]) => {
          const idx = prevProjects.findIndex(
            (p) => normalizeProjectId(p.id) === pidNorm
          );
          if (idx >= 0) {
            const next = [...prevProjects];
            next[idx] = { ...next[idx], ...project };
            return next;
          }
          const projectExists = prevProjects.some(
            (p) => p.title === project.title
          );
          if (projectExists) {
            return prevProjects;
          }
          return [...prevProjects, project as IProject];
        });
      } else {
        setProjects((prevProjects: IProject[]) => {
          const projectExists = prevProjects.some(
            (p) => p.title === project.title
          );
          if (projectExists) {
            return prevProjects;
          }
          return [...prevProjects, project as IProject];
        });
      }
    }
  }

  const handleCurProject = (project: Partial<IProject>, replace = false) => {
    if (replace) {
      setCurProject(project as IProject);
    } else {
      setCurProject(v => ({ ...v, ...project }));
    }
    if (project?.id != null) {
      db.app_state.put({ id: 1, cur_project_id: normalizeProjectId(project.id) }).catch(err => console.error('Failed to persist cur_project_id', err));
    }
  };

  /** Merge DB-loaded LCs with current context so status_tare/tare/weightnotare and live value/realval/battery are never dropped */
  const updateLCsFromDb = (data: ILC[]) => {
    const cur = (lcsRef?.current ?? []) as ILC[];
    const byKey = (lc: ILC) => `${lc.id}-${normalizeProjectId(lc.project_id)}`;
    const curMap = new Map(cur.map((lc: ILC) => [byKey(lc), lc]));
    const merged = data.map((lcFromDb: ILC) => {
      const c = curMap.get(byKey(lcFromDb));
      if (!c) return lcFromDb;
      return {
        ...lcFromDb,
        ...(c.status_tare !== undefined && { status_tare: c.status_tare }),
        ...(c.tare !== undefined && { tare: c.tare }),
        ...(c.weightnotare !== undefined && { weightnotare: c.weightnotare }),
        ...(c.value !== undefined && { value: c.value }),
        ...(c.realval !== undefined && { realval: c.realval }),
        ...(c.battery !== undefined && { battery: c.battery }),
        // --- AÑADE ESTA LÍNEA PARA PRESERVAR EL MÁXIMO ---
        ...(c.max !== undefined && { max: c.max }),
      };
    });
    lcsRef.current = merged;
    setLCs(merged);
  };

  const handleLCs = (lc: ILC | ILC[]) => {
    if (Array.isArray(lc) && lc.length > 50) {
      const t = Date.now();
      if (t - lastMassiveLcsBurstLogAt >= MASSIVE_LCS_BURST_LOG_COOLDOWN_MS) {
        lastMassiveLcsBurstLogAt = t;
        void logEvent("INFO", `LC burst: ${lc.length} cells`, undefined, "PRR");
      }
    }
    if (Array.isArray(lc)) {
      lcsRef.current = lc;
      setLCs(lc)
    } else {
      // FIX: Use functional update to avoid stale closure issue; keep lcsRef in sync so BLE callback sees latest zero
      setLCs(v => {
        const lcExists = v.find(item => item.id === lc.id && normalizeProjectId(item.project_id) === normalizeProjectId(lc.project_id));
        let next: ILC[];
        if (lcExists) {
          next = v.map(item => {
            if (item.id === lc.id && normalizeProjectId(item.project_id) === normalizeProjectId(lc.project_id)) {
              return { ...item, ...lc };
            }
            return item;
          });
        } else {
          if (!lc.title && !lc.project_id) {
            console.warn('[HANDLE_LCS] ⚠️ Attempted to create LC without title and project_id. ID:', lc.id);
            return v; // Don't add incomplete LC
          }
          const filtered = v.filter(item => !(item.id === lc.id && normalizeProjectId(item.project_id) !== normalizeProjectId(lc.project_id)));
          next = [...filtered, lc];
        }
        lcsRef.current = next;
        return next;
      });
    }
  }

  const handleGroups = (group: IGroup | IGroup[]) => {
    let ids: string[] = []
    if (groups.length > 0) ids = groups.map(item => item.id)
    if (Array.isArray(group)) {
      setGroups(group)
    } else {
      if (ids.includes(group.id)) {
        setGroups(v => v.map(item => {
          if (item.id === group.id) return ({ ...item, ...group })
          else return item;
        }))
      } else {
        setGroups(v => [...v, group])
      }
    }
  }

  const handleLogs = (log: ILog | ILog[]) => {
    let ids: string[] = []
    if (lcs.length > 0) ids = lcs.map(item => item.id)

    if (Array.isArray(log)) {
      setLogs(log.slice(-MAX_IN_MEMORY_LOGS))
    } else {
      if (ids.includes(log.id)) {
        setLogs(v => v.map(item => {
          if (item.id === log.id) return ({ ...item, ...log })
          else return item;
        }))
      } else {
        setLogs(v => [...v, log].slice(-MAX_IN_MEMORY_LOGS))
      }
    }
  }

  const handleVisibleModal = (name: string) => {
    setVisibleModal(name)
  }

  const handleBleConnected = (status: boolean) => {
    setBleConnected(status)
    if (!status) setTareStatus(false)
  }

  const handleBatteryStatus = (status: number) => {
    setBatteryStatus(status)
  }

  const handleConfirmed = (status: boolean) => {
    setConfirmed(status)
  }

  const handleTotalWeightHtml = (html: string) => {
    setTotalWeightHtml(html)
  }

  const handleLCMax = (data: any[]) => {
    setLCMax(data)
  }

  const handleWarnList = (data: any | any[]) => {
    if (Array.isArray(data)) {
      setWarnList(data)
    } else {
      setWarnList((v: any) => [...v, data])
    }
  }

  const handleLiveLC = (data: any) => {
    setLiveLC(data);
  }

  const handleWeighData = (data: any) => {
    setWeighData(data);
  }

  const isMobile = Capacitor.isNativePlatform();
  const platformType = Capacitor.getPlatform();


  const load_projects = async () => {
    const projectData = await db.projects.toArray();
    if (projectData.length > 0) {
      handleProjects(projectData)
      handleCurProject(projectData[0])
    }
  }

  const   load_lcs = async () => {
    if (!curProject.id) return
    try {
      const pid = normalizeProjectId(curProject.id);
      const _lcs = await db.lcs.filter((lc: any) => normalizeProjectId(lc.project_id) === pid).toArray();
      let displayLcs = _lcs;
      if (bleConnected && lcs.length > 0) {
        displayLcs = displayLcs.map((lcFromDb: any) => {
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
        });
      }
      updateLCsFromDb(displayLcs);
    } catch (error) {
      console.error('Error querying data from the table: ', error);
    }
  }

  const load_groups = async () => {
    if (!curProject.id) return
    const pid = normalizeProjectId(curProject.id);
    try {
      const data = await db.groups.filter((g: any) => normalizeProjectId(g.project_id) === pid).toArray();
      handleGroups(data);
    } catch (error) {
      console.error('Error querying data from the table: ' + error);
    }
  }

  const handleLCWindAlerts = async (data: ILCOverloadAlert | ILCOverloadAlert[]) => {
    if (Array.isArray(data)) {
      setLCWindAlerts(data)
    } else {
      setLCWindAlerts(v => [...v, data])
    }
  }

  const handleLCOverloadAlerts = async (data: ILCOverloadAlert | ILCOverloadAlert[]) => {
    if (Array.isArray(data)) {
      setLCOverloadAlerts(data)
    } else {
      setLCOverloadAlerts(v => [...v, data])
    }
  }

  const handleCreatingLCs = (creating: boolean) => {
    setIsCreatingLCs(creating)
  }

  const handleTareStatus = (status: boolean) => {
    setTareStatus(status);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('rsm_tare_status', status ? 'true' : 'false');
      }
    } catch (_) { /* ignore */ }
  }

  return (
    <AppContext.Provider
      value={{
        mode,
        errStr,
        successStr,
        isMobile,
        platformType,
        monitorStatus,
        projects,
        curProject,
        lcs,
        groups,
        logs,
        visibleModal,
        bleConnected,
        batteryStatus,
        confirmed,
        totalWeightHtml,
        LCMax,
        warnList,
        liveLC,
        weighData,
        lc_wind_alerts,
        lc_overload_alerts,

        updateMode: handleMode,
        updateErrStr: handleErrStr,
        updateSuccessStr: handleSuccessStr,
        init: handleInit,
        updateMonitorStatus: handleMonitorStatus,
        updateProjects: handleProjects,
        updateCurProject: handleCurProject,
        updateLCs: handleLCs,
        updateLCsFromDb,
        updateGroups: handleGroups,
        updateVisibleModal: handleVisibleModal,
        updateBleConnected: handleBleConnected,
        updateBatteryStatus: handleBatteryStatus,
        updateConfirmed: handleConfirmed,
        updateLogs: handleLogs,
        updateTotalWeightHtml: handleTotalWeightHtml,
        updateLCMax: handleLCMax,
        updateWarnList: handleWarnList,
        updateLiveLC: handleLiveLC,
        updateWeighData: handleWeighData,
        load_projects,
        load_lcs,
        load_groups,
        updateLCWindAlerts: handleLCWindAlerts,
        updateLCOverloadAlerts: handleLCOverloadAlerts,
        lastUpdatedRef,
        dataTimeByIdRef,
        timeoutHandledRef,
        layoutRefreshRef,
        lcsRef,
        activeToastCount,
        isCreatingLCs,
        updateCreatingLCs: handleCreatingLCs,
        tareStatus,
        updateTareStatus: handleTareStatus,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export default AppContext
