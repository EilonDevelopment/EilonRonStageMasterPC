import {
  IonAlert,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonImg,
  IonLabel,
  IonPage,
  IonTitle,
  IonToolbar,
  useIonViewDidEnter,
  useIonViewDidLeave,
} from '@ionic/react';
import React, { FC, ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
// import { useLocation,  } from 'react-router';
import { useHistory, useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { bluetoothOutline, checkmarkSharp, closeSharp, documentOutline, duplicateOutline, menuOutline, settingsOutline, trashOutline } from 'ionicons/icons';

import { batteryBlackIcon, loadIcon, battIcon, maxIcon, maxActiveIcon, roundPictureIcon, tareIcon, tareActiveIcon, toolbarlistIcon, toolbarprogIcon, toolbarstopIcon, warningErrorIcon, bleConnectIcon, bleDisConnectIcon, batteryWhiteIcon } from '../assets/icons';
import NewProjectModal from '../components/Modals/NewProjectModal';
import { IGroup, ILC, ILog, IProject, IProjectDetail, IProofTest } from '../helper/types';
import ProjectSettingModal from '../components/Modals/ProjectSettingModal';
import { MENUS, ModalNames, ROUTES, Unit_List, Windmeter_Unit_List, LC_Serials } from '../helper/constants';
import Text from '../components/Text';
import Button from '../components/Buttons/Button';
import useAppData from '../hooks/useAppData';
import ErrorModal from '../components/Modals/ErrorModal';
import SuccessModal from '../components/Modals/SuccessModal';
import ProjectListModal from '../components/Modals/ProjectListModal';
import ProofTestModal from '../components/Modals/ProofTestModal';
import BleDeviceListModal from '../components/Modals/BleDeviceListModal';
import TotalizerModal from '../components/Modals/TotalizerModal';
import DocumentModal from '../components/Modals/DocumentModal';
import ProjectInformationModal from '../components/Modals/ProjectInformationModal';
import ProjectDeleteModal from '../components/Modals/ProjectDeleteModal';
import DeleteConfirmModal from '../components/Modals/DeleteConfirmModal';
// import * as database from '../database'
import WarningListModal from '../components/Modals/WarningListModal';
import BeforeAlertModal from '../components/Modals/BeforeAlertModal';
import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';
import { fire_error, fire_success, getImageDimensions, hexToInt, normalizeProjectId, strToFloat, strToInt, toHexString } from '../helper/functions';
import { lcRankKey, stableRowIndexMap } from '../helper/lcStableRowIndex';
import { db } from '../db';
import Swal from 'sweetalert2';
import { useTheme } from '@emotion/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBatteryEmpty, faBatteryQuarter, faBatteryHalf, faBatteryThreeQuarters, faBatteryFull, IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { format, getTime, getUnixTime } from 'date-fns';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { loadReportBranding, resolveReportBrandingLabels } from '../helper/reportBranding';
import { buildMonitorSnapshotCsv, buildMonitorSnapshotPdfDocument } from '../helper/reportSnapshotExport';
// COORDINATION (iOS Mac branch / Android Windows branch): BLE + native CSV import logic
// lives in `src/helper/nativeBleScan.ts` and `nativeProjectCsvImport.ts`. Prefer editing
// those files for platform rules so merges between branches stay small. / Coordinación:
// reglas nativas en los helpers, no duplicar aquí.
import { checkNativeBleScanPrerequisites } from '../helper/nativeBleScan';
import { pickProjectCsvText, shouldUseNativeCsvPickerForImport } from '../helper/nativeProjectCsvImport';
import { BLE_CONNECT_TIMEOUT_MS } from '../helper/bleConstants';
import { collectBleDevicesForService, type BleDiscoveredDevice } from '../helper/bleLeScanCollection';
import { formatDualWeightWithLcResolution, formatWeightByLcResolution, getResolutionForLcId, quantizeByResolution } from '../helper/weightResolution';
import { getPreOverloadThreshold } from '../helper/lcLoadStatus';
import { toast } from 'react-toastify';
import useFunctions from '../hooks/useFunctions';

// Añade esto arriba con los demás imports
// @ts-ignore
import { NativeSettings, AndroidSettings } from 'capacitor-native-settings';
// 1. Asegúrate de importar Capacitor arriba
import { Capacitor } from '@capacitor/core';
import { logEvent } from '../services/LogService';
import { flushAlarmBeepsOnForeground, setAlarmAppInForeground, type SafetyAlarmDetail } from '../services/alarmFeedback';


// import { log, time } from 'console'; // Removed - not available in browser/WebView
// import { current } from '@reduxjs/toolkit'; // Removed - unused import

interface CommonLayoutProps {
  title?: string;
  classes?: string;
  /** When true, IonContent does not scroll (e.g. Monitor view with fixed stage). */
  contentScrollDisabled?: boolean;
  children: ReactNode;
  maxStatus?: boolean;
  loadStatus?: boolean;
  tareStatus?: boolean;
  warning?: boolean;

  maxStatusToggle?: (value: boolean) => void;
  loadStatusToggle?: (value: boolean) => void;
  tareStatusToggle?: () => void;
  /** When set (e.g. Monitor), toolbar Tare uses this instead of tareStatusToggle */
  toolbarTareClick?: () => void;
  onWarning?: (value: boolean) => void;
  onDBHandler?: (handler: any) => void;
  onTareAction?: (type: string, group_id: string) => void;
  monitorPlanName?: string;
  monitorPlans?: Array<{ id: string; name: string }>;
  onMonitorPlanCreate?: () => void;
  onMonitorPlanSelect?: (planId: string) => void;
  onMonitorPlanEdit?: (planId: string) => void;
  onMonitorPlanRename?: (planId: string) => void;
  onMonitorPlanDelete?: (planId: string) => void;
}

type ConnectedPrrDevice = {
  deviceId: string;
  displayName: string | null;
};

// Display batching: flush interval (ms). Safety checks (overload/underload) run immediately per packet.
// Keep UI work bounded on Android WebView to avoid renderer overload (onRenderProcessGone).
const LC_DISPLAY_BATCH_MS_DEFAULT = 100;
const getBatteryIconForPercent = (percentRaw: number): IconDefinition => {
  const percent = Math.max(0, Math.min(100, Number(percentRaw) || 0));
  if (percent < 11) return faBatteryEmpty;
  if (percent < 25) return faBatteryQuarter;
  if (percent < 50) return faBatteryHalf;
  if (percent < 90) return faBatteryThreeQuarters;
  return faBatteryFull;
};

const getLcDisplayBatchMs = (platformType: string | undefined, lcCount: number): number => {
  const p = String(platformType).toLowerCase();
  const isAndroid = p === 'android';
  const isIos = p === 'ios';
  // More LCs => fewer flushes to keep WebView renderer stable (Android + iPad).
  if (isAndroid || isIos) {
    if (lcCount >= 75) return 333;
    if (lcCount >= 50) return 250;
    if (lcCount >= 25) return 150;
  }
  if (isAndroid) return LC_DISPLAY_BATCH_MS_DEFAULT;
  return LC_DISPLAY_BATCH_MS_DEFAULT;
};

/**
 * PRR + many LCs: per-LC "no fresh sample" before Tr.Err in ifConnection (must exceed slowest expected inter-sample gap).
 * Global silence below must be greater than a full slow reporting round (e.g. 75× @ ~1 Hz + jitter).
 */
const PRR_STALE_LC_MS = 2000;
/** If no BLE-driven updates hit dataTimeById for this long, declare full link loss and set all LCs to Tr.Err. */
const PRR_SILENCE_ALL_TRERR_MS = 4000;
const PRR_RECONNECT_BASE_MS = 1500;
const PRR_RECONNECT_MAX_MS = 30000;

const isDocumentVisible = (): boolean =>
  typeof document === 'undefined' || document.visibilityState === 'visible';

type LcBackgroundSnapshot = {
  id: string;
  value: unknown;
  weightnotare?: unknown;
};

type PendingLCDisplay = {
  value?: string;
  weightnotare?: string;
  realval?: string | number;
  battery?: string;
  weight?: string | number;
  max?: any;
  time?: string;
  overload?: any;
  underload?: any;
};

/** Merge `preferredIdOrder` (Monitor list grid order) with remaining LCs sorted by id for snapshot export. */
function mergeLcOrderForSnapshot<T extends { id?: string | number }>(all: T[], preferredIdOrder: string[]): T[] {
  const byId = new Map(all.map((lc) => [String(lc.id), lc]));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of preferredIdOrder) {
    const lc = byId.get(String(id));
    if (lc) {
      out.push(lc);
      seen.add(String(lc.id));
    }
  }
  const rest = all.filter((lc) => !seen.has(String(lc.id)));
  rest.sort((a, b) => {
    const na = Number(a.id);
    const nb = Number(b.id);
    if (
      Number.isFinite(na) &&
      Number.isFinite(nb) &&
      String(a.id) === String(Math.trunc(na)) &&
      String(b.id) === String(Math.trunc(nb))
    ) {
      return na - nb;
    }
    return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
  });
  out.push(...rest);
  return out;
}

const CommonLayout: FC<CommonLayoutProps> = props => {
  const {
    title = '',
    classes = '',
    contentScrollDisabled = false,
    children,
    maxStatus: max = false,
    loadStatus: load = true,
    // tareStatus from AppContext; tareStatusToggle from Monitor so toolbar uses same flow (tare_off/tare_on)
    tareStatusToggle,
    toolbarTareClick,
    // eslint-disable-next-line
    maxStatusToggle = () => { },
    // eslint-disable-next-line
    loadStatusToggle = () => { },
    // eslint-disable-next-line
    onWarning = () => { },
    // eslint-disable-next-line
    onDBHandler = () => { },
    // eslint-disable-next-line
    onTareAction = () => { },
    monitorPlanName = '',
    monitorPlans = [],
    onMonitorPlanCreate,
    onMonitorPlanSelect,
    onMonitorPlanEdit,
    onMonitorPlanRename,
    onMonitorPlanDelete,
  } = props;

  const { t } = useTranslation();
  const location = useLocation();
  const history = useHistory();

  const {
    mode,
    errStr,
    successStr,
    monitorStatus,
    projects,
    curProject,
    lcs,
    logs,
    groups,
    visibleModal,
    bleConnected,
    batteryStatus,
    totalWeightHtml,
    warnList,
    platformType,
    liveLC,
    LCMax,
    updateLCMax,
    updateErrStr,
    updateSuccessStr,
    updateMonitorStatus,
    updateProjects,
    updateCurProject,
    updateLCs,
    updateLCsFromDb,
    updateGroups,
    updateLogs,
    updateVisibleModal,
    updateBleConnected,
    updateWarnList,
    updateTotalWeightHtml, // <--- AGREGA ESTA LÍNEA AQUÍ
    updateLiveLC,
    updateBatteryStatus,
    updateLCWindAlerts,
    tareStatus,
    updateTareStatus,
    updateIsImportingProject,
    lastUpdatedRef,
    dataTimeByIdRef,
    timeoutHandledRef,
    layoutRefreshRef,
    lcsRef,
    monitorListSortedLcIdsRef,
  } = useAppData()

  const navigate = useLocation()
  const {
    f_use_insert_project,
    f_use_update_project_setting,
    f_update_project_last_change,
    // f_update_project_settings,
    f_convert_wind_speed,
    f_check_lc_in_project,
    f_lc_capacity_id,
    f_lc_by_id,
    f_log_lc_value,
    f_log_prr_link_event,
    f_log_delete,
    f_load_cells,
    f_insert_lc,
    f_export_project_csv,
    f_import_project_csv,
    f_parse_import_project_title,
    f_replace_import_project_title,
    f_update_project_image_size,
    f_update_project_image_position,
    play_beep // <--- AGREGA ESTA LÍNEA AQUÍ
  } = useFunctions()

  const [dbHanlder, setDBHandler] = useState(null)
  const theme = useTheme();

  const [projectList, setProjectList] = useState<IProject[]>([])
  const [active_project, setSelectProject] = useState<IProject>({} as IProject);
  const activeProjectRef = useRef<IProject>({} as IProject);
  const [groupList, setGroupList] = useState<IGroup[]>([])

  const [visibleBeforeAlert, setVisibleBeforeAlert] = useState<boolean>(false);
  const [visibleNew, setVisibleNew] = useState<boolean>(false);
  const [visibleSetting, setVisibleSetting] = useState<boolean>(false);
  const [settingModalMode, setSettingModalMode] = useState<'full' | 'units-only'>('full');
  const [duplicated, setDuplicated] = useState<boolean>(false);
  const [confirmTitle, setConfirmTitle] = useState<string>('');

  const [visibleProof, setVisibleProof] = useState<boolean>(false);
  const [selectedGroup, setSelectedGroup] = useState<IProofTest | null>(null)
  const [connected, setConnected] = useState<boolean>(false);
  const [layoutKey, setLayoutKey] = useState(0);
  const [newProjectSettingsFlow, setNewProjectSettingsFlow] = useState(false);
  const startupMonitorGateRunRef = useRef(false);

  const [visibleDelete, setVisibleDelete] = useState<boolean>(false);
  const [deleteProject, setDeleteProject] = useState<string>('');
  const [warnLogs, setWarnLogs] = useState<any[]>(warnList);
  const LCMaxBYID = useRef<any[]>(LCMax)
  const importFileInputRef = useRef<HTMLInputElement>(null)
  const [importChooseName, setImportChooseName] = useState<{ csvText: string; initialName: string } | null>(null);
  const [chooseNameInputValue, setChooseNameInputValue] = useState('');
  const chooseNameInputRef = useRef<HTMLInputElement>(null);
  // const [lc_tare, setTare] = useState(false)
  // const [lc_battery, setBattery] = useState(false)
  const [lc_wind_alerts, setWindAlerts] = useState<any[]>([])
  const [lc_overload_alerts, setAlerts] = useState<any[]>([])
  // const [danger_state, setDangerState] = useState(false)

  const [btry, setBtry] = useState(0)
  const [cycleStatus, setCycleStatus] = useState<boolean>(false)
  const [dataTimeById, setDataTimeById] = useState<any[]>([])
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [noChange, setNoChange] = useState(false);
  const [TrrLcs, setTrrLcs] = useState<any[]>(lcs)
  const currentUnitsRef = useRef(curProject.units)
  const curProjectRef=useRef(curProject)
  const tareStatusRef = useRef<boolean>(!!tareStatus)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const { f_log_prooftest_value } = useFunctions()
  const locationRef = useRef(location.pathname + location.search + (location.hash || ''))
  const unitsDisplayLogLastRef = useRef<Record<string, number>>({})
  const activeAlertsRef = useRef<Set<string>>(new Set());

  const [showLocationAlert, setShowLocationAlert] = useState(false);
  const [blePickerOpen, setBlePickerOpen] = useState(false);
  const [blePickerScanning, setBlePickerScanning] = useState(false);
  const [blePickerDevices, setBlePickerDevices] = useState<BleDiscoveredDevice[]>([]);
  const [blePickerType, setBlePickerType] = useState<'prr' | 'lc' | null>(null);
  const bleScanAbortRef = useRef(false);
  const bleScanInProgressRef = useRef(false);
  const bleInitializedRef = useRef(false);
  const connectDeviceAutoRunRef = useRef(false);
  const isViewActiveRef = useRef(true);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);

  useIonViewDidEnter(() => {
    isViewActiveRef.current = true;
  });

  useIonViewDidLeave(() => {
    isViewActiveRef.current = false;
    // Ensure hidden cached pages cannot keep a picker opened behind the active view.
    if (blePickerOpen) {
      bleScanAbortRef.current = true;
      void BleClient.stopLEScan().catch(() => undefined);
      setBlePickerOpen(false);
      setBlePickerScanning(false);
      setBlePickerDevices([]);
      setBlePickerType(null);
    }
  });

  useEffect(() => {
    locationRef.current = location.pathname + location.search + (location.hash || '')
  }, [location.pathname, location.search, location.hash])

  // 1. Creamos la referencia para las alertas
  const warnListRef = useRef(warnList);

  // 2. La mantenemos sincronizada con el estado global
  useEffect(() => {
    warnListRef.current = warnList;
  }, [warnList]);

  // NOTE:
  // Do not register per-page resume route restores here.
  // Ionic keeps previous pages mounted in the outlet cache, so each cached page
  // would fire its own `history.replace(...)` on app resume (after native share),
  // causing route jumps/crossed navigation (e.g. Reports <-> Settings).

  useEffect(() => {
    if (importChooseName) {
      setChooseNameInputValue(importChooseName.initialName);
      const t = setTimeout(() => chooseNameInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [importChooseName])

  useEffect(() => {
   /* warnList.forEach(item => {
    //console.log(`¿Coinciden los IDs? Proyecto Activo: ${curProject.id} | Alerta: ${item.project_id}`);

    if (curProject.id !== item.project_id) {
      console.warn("⚠️ ESTA ALERTA SERÁ FILTRADA Y NO SE VERÁ EN LA LISTA");
    }
  });*/
    const filteredWarnList = warnList.filter(item => normalizeProjectId(item.project_id) === normalizeProjectId(curProject.id));
    setWarnLogs(filteredWarnList)    
  }, [warnList,curProject,curProject.id])
  useEffect(() => {
    tareStatusRef.current = !!tareStatus
  }, [tareStatus])
  const handleChangeGroup = (group: IProofTest) => {
    // Handle group change
  }

  // Previously, when Reports Cycle was enabled, we deleted logs every hour.
  // This makes the Reports screen appear empty and conflicts with the new retention + aggregation strategy.
  // Retention is now handled inside the logging pipeline (Dexie cleanup + logs_agg), so we keep this disabled.
  useEffect(() => {
    setCycleStatus(!!curProject?.cycle);
  }, [curProject?.cycle])

  const fire_overwind: any = (lc: string, weight: string, overload: string) => {
    //console.log('===fire_overwind===')

    const fx = 2;
    const windAlerts = lc_wind_alerts;
    windAlerts.forEach((alert: any, index: number) => {
      if (alert.id === lc) {
        const c = new Date().getTime();
        const d = getTime(alert.last_alert);
        if ((c - d) > 40000) {
          onWarning(true);
          Swal.fire({
            title: '',
            html: "<h2 class='bg-danger text-white'>DANGER - WIND SPEED!</h2><h2 class='bg-danger text-white'>Windmeter: " + lc + "</h2><h2 class='bg-danger text-white'>Speed: " + parseFloat(weight).toFixed(fx) + " | Capacity: " + parseFloat(overload).toFixed(fx) + "</h2>"
          });
          // navigator.notification.beep(4);
          windAlerts[index].last_alert = new Date().getTime();
        }
      }
    })

    updateLCWindAlerts(windAlerts)
  }

  const handleReadingByProject = async (db: any, project_id: string) => {
    // const lcData = await database.lcs.findByProjectId(db, project_id)
    // updateLCs(lcData.map((item: any) => item._data))

    // const groupData = await database.groups.findByProjectId(db, project_id)
    // updateGroups(groupData.map((item: any) => item._data))
  }

  const load_projects = async () => {
    const projectData = await db.projects.toArray();
    if (projectData.length > 0) {
      updateProjects(projectData);
      const saved = await db.app_state.get(1);
      const savedId = saved?.cur_project_id;
      const found = savedId ? projectData.find((p: IProject) => normalizeProjectId(p.id) === normalizeProjectId(savedId)) : null;
      const selected = found ?? projectData[0];
      updateCurProject(selected, true);
      load_lcs(selected.id);
      load_groups(selected.id);
    } else {
      setVisibleNew(true)
    }
  }
  const handleDuplicatLc = async (prevId: string, newId: string) => {
    const prevNorm = normalizeProjectId(prevId);
    lcs.map((lc) => {
      if (normalizeProjectId(lc.project_id) === prevNorm) {
        const newLC = { ...lc, project_id: normalizeProjectId(newId) };
        f_insert_lc(newLC)
      }
    })
  }
  const project_groups = () => {
    //console.log('===project_groups===')
  }

  const clear_groups = () => {
    //console.log('===clear_groups===')
  }

  const zero_group = () => {
    //console.log('===zero_group===')
  }

  const save_group = () => {
    //console.log('===save_group===')
  }

  const load_lcs = async (projectIdOverride?: string) => {
    const projectId = projectIdOverride ?? curProject?.id;
    if (!projectId) {
      return;
    }
    try {
      const pid = normalizeProjectId(projectId);
      const _lcs = await db.lcs.filter((lc: any) => normalizeProjectId(lc.project_id) === pid).toArray();
      // Always send real positions from DB; "home" is applied only at display time in MonitorView
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
      const sanitizedForDisconnected = (!bleConnected)
        ? displayLcs.map((item: any) => ({ ...item, value: 'Tr.Err' }))
        : displayLcs;
      updateLCsFromDb(sanitizedForDisconnected);
      if (active_project.show_graphs) {
        // draw_chart('lightChart', active_project.lcs);
      }
    } catch (error) {
      console.error('Error querying data from the table:', error);
    }
  }

  const load_groups = async (projectIdOverride?: string) => {
    const projectId = projectIdOverride ?? curProject?.id;
    if (!projectId) {
      return;
    }
    const pid = normalizeProjectId(projectId);
    try {
      const data = await db.groups.filter((g: any) => normalizeProjectId(g.project_id) === pid).toArray();
      const sortedData = [...data].sort((a, b) => {
        const idA = parseInt(a.id || '0');
        const idB = parseInt(b.id || '0');
        return idA - idB;
      });
      updateGroups(sortedData);
    } catch (error) {
      console.error('Error querying data from the table:', error);
    }
  }

  const draw_lc_group = () => {
    //console.log("===draw_lc_group===")
  }

  const lc_refresh = () => {
    //console.log("===lc_refresh===")
  }



  useEffect(() => {
    // database.init()
    //   .then(async (res: any) => {
    //     setDBHandler(res)
    //     onDBHandler(res)

    //     const projectData = await database.projects.find(res)
    //     if (projectData.length > 0) {
    //       const list = projectData.map((item: any) => item._data)
    //       updateProjects(list)
    //       updateCurProject(list[0])

    //       await handleReadingByProject(res, list[0].id)
    //     } else {
    //       history.replace(ROUTES.Settings)
    //       setVisibleNew(true)
    //     }
    //   })

    load_projects()
  }, [])

  useEffect(() => {
    const projectId = curProject?.id;
    const projectChanged = prevCurProjectIdRef.current !== projectId;
    prevCurProjectIdRef.current = projectId;
    load_lcs();
    if (projectChanged) {
      load_groups();
    }
  }, [curProject])

  useEffect(() => {
    setProjectList(projects)
  }, [projects])

  useEffect(() => {
    setGroupList(groups)
  }, [groups])

  useEffect(() => {
    if (startupMonitorGateRunRef.current) return;
    if (location.pathname !== ROUTES.Monitor) return;
    if (!curProject?.id) return;
    let cancelled = false;
    void (async () => {
      const pid = normalizeProjectId(curProject.id);
      const [projectLcs, projectGroups] = await Promise.all([
        db.lcs.filter((lc: any) => normalizeProjectId(lc.project_id) === pid).toArray(),
        db.groups.filter((g: any) => normalizeProjectId(g.project_id) === pid).toArray(),
      ]);
      if (cancelled) return;
      const hasLcs = projectLcs.length > 0;
      const activeGroups = projectGroups.filter((g: any) => String(g.overload ?? '').trim() !== '');
      const hasActiveGroups = activeGroups.length > 0;
      const hasInvalidOverload = activeGroups.some((g: any) => {
        const ov = Number(g.overload);
        return !Number.isFinite(ov) || ov <= 0;
      });
      startupMonitorGateRunRef.current = true;
      if (!hasLcs || !hasActiveGroups || hasInvalidOverload) {
        history.replace(ROUTES.Settings);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [curProject?.id, history, location.pathname]);

  // useEffect(() => {
  //   if (logs.length > 0) {
  //     const filtered = logs.filter(item => item.value && item.overload && item.underload && (item.value > item.overload || item.value < item.overload * (1 + item.underload / 1000)))
  //     setWarnLogs(filtered)
  //   } else
  //     setWarnLogs([])
  // }, [logs])

  useEffect(() => {
    setSelectProject(curProject)
  }, [curProject])
  useEffect(() => {
    activeProjectRef.current = active_project;
  }, [active_project])

  useEffect(() => {
    if (visibleModal === ModalNames.NewProject) {
      setVisibleNew(true)
    }
  }, [visibleModal])

  useEffect(() => {
    setConnected(bleConnected)
    bleConnectedRef.current = bleConnected;
    if (!bleConnected) {
      // Disconnected monitor should never show stale numeric payload from previous sessions.
      lcDisplayBufferRef.current = {};
      dataTimeByIdRef.current = [];
      setDataTimeById([]);
      timeoutHandledRef.current = false;
      lastUpdatedRef.current = Date.now();
      const current = currentLcs.current || [];
      if (current.length > 0) {
        const trErrOnly = current.map((item: any) => ({ ...item, value: 'Tr.Err' }));
        updateLCs(trErrOnly);
      }
    }
  }, [bleConnected])

  useEffect(() => {
    return () => {
      const timers = prrReconnectTimersRef.current;
      Object.keys(timers).forEach((key) => {
        const timer = timers[key];
        if (timer) clearTimeout(timer);
      });
      prrReconnectTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    layoutRefreshRef.current = () => setLayoutKey((k) => k + 1);
    return () => { layoutRefreshRef.current = null; };
  }, [layoutRefreshRef])

  const handleShowNewProject = () => {
    setVisibleNew(true)
    updateVisibleModal('')
  }

  const insert_project = async (project_name: string, unit_type = 'KG') => {
    let proj_name_exists = false;
    projectList.forEach(function (proj: any) {
      if (proj.title == project_name) {
        fire_error(project_name + " already exists. please select unique project name");
        proj_name_exists = true;
      }
    });
    if (proj_name_exists) {
      return;
    }
    let newData: any;
    if (duplicated) {
      const { id, last_settings_change,title, ...data } = active_project;
      newData = { ...data,title: project_name, last_settings_change: getTime(new Date()) }
    } else
      newData = { title: project_name, units: unit_type, last_settings_change: getTime(new Date()), pre_overload: 100, windmeter_units: 'MS', total_overload: 500, show_graphs: false };
    const res: string = await f_use_insert_project(newData);

    if (res != '') {
      if (duplicated) {
        await handleDuplicatLc(active_project.id, res);
        fire_success('Project Created');
        setVisibleNew(false)
        setDuplicated(false)
        //console.log('!!!!!!!!!!!!curProject');

      }
      else {
        setTimeout(function () {
          setNewProjectSettingsFlow(true)
          setVisibleNew(false)
          setSettingModalMode('full')
          setVisibleSetting(true)
        }, 500)
      }
    } else {
      console.error('Error adding data to the table');
    }
  }

  const update_units = () => {
    //console.log('===update_units===')
  }

  const handleCloseNewProject = () => {
    if (projectList.length > 0)
      setVisibleNew(false)
  }

  const conversionFactors: any = {
    'KMH': 3.6,          // 1 m/s = 3.6 km/h
    'MLH': 2.23694,      // 1 m/s = 2.23694 mph
    'FS': 3.28084,       // 1 m/s = 3.28084 ft/s
    'MS': 1              // 1 m/s = 1 m/s
  };
  const convertUnitsFactors: any = {
    'KG': 1,          // 1 kg = 1kg
    'LBS': 2.20462,      // 1 kg = 2.20462lbs 
    'M.TON': 0.001,       // 1 kg = 0.001ton
  }

  const get_units_multiply = (prevUnit: any, currentUnit: any) => {
    return convertUnitsFactors[currentUnit] / convertUnitsFactors[prevUnit]
  }
  const convert_wind_speed = (prevUnit: any, currentUnit: any) => {
    return conversionFactors[currentUnit] / conversionFactors[prevUnit];
  }

  const handleSettingProject = async (project: IProject) => {
    if (!project.total_overload) {
      updateErrStr(t("Msg.ErrTotalOverload"))
      return;
    }
    if (!project.pre_overload) {
      updateErrStr(t("Msg.ErrPreoverload"))
      return;
    }

    // VALIDACIÓN DE SEGURIDAD PARA EL INTERVALO
    const interval = Number(project.report_interval_seconds);
    if (!project.report_interval_seconds || isNaN(interval) || interval < 1) {
      // Si está vacío o es menor a 1, forzamos un valor por defecto seguro
      project.report_interval_seconds = 60;
    }


    // curProject.units
    const multiply = (curProject.units !== project.units) ? get_units_multiply(curProject.units, project.units) : 1;
    // project = { ...project, total_overload: (parseFloat(project.total_overload) * (multiply)).toString() }
    const weight = (curProject.windmeter_units !== project.windmeter_units) ? convert_wind_speed(curProject.windmeter_units, project.windmeter_units) : 1;
    const { id, ...rest } = project;
    await f_use_update_project_setting(id, rest, multiply, weight);
    setSelectProject(project);
    activeProjectRef.current = project;
    setVisibleSetting(false);
    if (newProjectSettingsFlow) {
      setNewProjectSettingsFlow(false);
      history.push(ROUTES.Settings);
    }
    updateSuccessStr(t("Msg.ConfirmSetting"));
  }

  const duplicate_project = () => {
    setDuplicated(true)
    setVisibleNew(true)
  }

  const get_project = async (id: string, replace?: boolean) => {
    const project = projectList.find(
      (item) => normalizeProjectId(item.id) === normalizeProjectId(id)
    )
    if (project) {
      if (replace)
        updateCurProject(project, true)
      else
        updateCurProject(project)
      await handleReadingByProject(dbHanlder, project.id)
      updateVisibleModal('')
    }
  }

  const handleExportProject = async (project: IProject) => {
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
            updateVisibleModal('');
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
          } catch {
            if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
          }
        }, 380);
      });
    };
    const isUserCancelledError = (err: any) => {
      const msg = String(err?.message || err || '').toLowerCase();
      return msg.includes('cancel') || msg.includes('canceled') || msg.includes('cancelled') || msg.includes('aborted');
    };

    const result = await f_export_project_csv(project.id);
    if (!result) {
      Swal.fire({ title: t('Project.Export') || 'Export', text: t('Project.ExportError') || 'Failed to export project.', icon: 'error', heightAuto: false });
      return;
    }
    const { csvStr, fileName } = result;
    if (platformType === 'web') {
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      updateVisibleModal('');
    } else if (platformType === 'android' || platformType === 'ios') {
      try {
        await Filesystem.writeFile({ path: fileName, data: csvStr, directory: Directory.Cache, encoding: Encoding.UTF8 });
        const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1');
        await Share.share({ url: uri, title: t('Project.Export') || 'Export', dialogTitle: t('Project.Export') || 'Export' });
        recoverAfterNativeDialog(t('Project.ExportSuccess') || 'Project exported successfully.');
      } catch (err) {
        if (isUserCancelledError(err)) {
          recoverAfterNativeDialog();
          return;
        }
        console.error('Project export (native):', err);
        if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('skipResumeAlert');
        Swal.fire({ title: t('Project.Export') || 'Export', text: t('Project.ExportError') || 'Failed to export project.', icon: 'error', heightAuto: false });
        updateVisibleModal('');
      }
    } else {
      await Filesystem.writeFile({ path: fileName, data: csvStr, directory: Directory.Documents, encoding: Encoding.UTF8 });
      Swal.fire({ title: t('Project.Export') || 'Export', text: t('Project.ExportSuccess') || 'Project exported successfully.', icon: 'success', heightAuto: false });
      updateVisibleModal('');
    }
  };


  const handleSendLogs = async () => {
    try {
      // 1. Obtenemos la ruta (URI) del archivo que estamos guardando
      // Usamos Directory.Documents que es donde configuramos el guardado previo
      const fileUri = await Filesystem.getUri({
        path: 'app_logs.txt',
        directory: Directory.Documents
      });

      // 2. Usamos el plugin de Share para abrir el menú de Android
      await Share.share({
        title: 'RSM App Logs',
        text: 'Adjunto envío los logs de ejecución de la aplicación RSM.',
        url: fileUri.uri, // Compartimos el archivo físico
        dialogTitle: 'Enviar logs al desarrollador'
      });

    } catch (err) {
      console.error('Error al compartir logs:', err);
      updateErrStr('No se encontró el archivo de logs o el dispositivo no permite compartir.');
    }
  };

  const exportMonitorSnapshot = async () => {
    const pid = normalizeProjectId(active_project?.id);
    const projectLcs = (lcsRef.current ?? lcs).filter((item: any) => normalizeProjectId(item.project_id) === pid);
    if (!projectLcs.length) {
      Swal.fire({ title: 'Export', text: 'No load cells available for snapshot.', icon: 'info', heightAuto: false });
      return;
    }
    const now = new Date();
    const getLcStatus = (item: any) => {
      const rawVal = String(item?.value ?? '').trim();
      const isErr = rawVal === 'Tr.Err' || rawVal === 'Tr. Err' || Number(rawVal) === -99999999;
      const grossNum = Number(item?.value);
      const overNum = Number(item?.overload);
      const underNum = Number(item?.underload);
      let status = 'OK';
      if (isErr || !Number.isFinite(grossNum)) status = 'TR.ERR';
      else if (Number.isFinite(overNum) && overNum > 0 && grossNum >= overNum * 1.3) status = 'DANGER';
      else if (Number.isFinite(overNum) && grossNum > overNum) status = 'OVERLOAD';
      else if (Number.isFinite(underNum) && grossNum < underNum) status = 'UNDERLOAD';
      return status;
    };

    const stableRank = stableRowIndexMap(projectLcs);
    const preferredOrder = monitorListSortedLcIdsRef?.current ?? [];
    const orderedLcs = mergeLcOrderForSnapshot(projectLcs, preferredOrder);

    const projectWeightUnit = active_project?.units || '';
    const formatSnapshotDualTotal = (valueRaw: number, unitRaw: string) =>
      formatDualWeightWithLcResolution(valueRaw, unitRaw);

    const isLcInTotalSum = (item: any) => !!item.total_sum || String(item.total_sum) === '1';

    const rows = orderedLcs.map((item: any) => {
      const rawVal = String(item?.value ?? '').trim();
      const isErr = rawVal === 'Tr.Err' || rawVal === 'Tr. Err' || Number(rawVal) === -99999999;
      const grossNum = Number(item?.value);
      const netCandidate = item?.status_tare && item?.weightnotare != null && String(item.weightnotare).trim() !== '' ? Number(item.weightnotare) : grossNum;
      const useNetDisplay = !!tareStatusRef.current && !!item?.status_tare;
      const displayNum = useNetDisplay ? netCandidate : grossNum;
      const unit = Number(item?.id) <= 10 ? (active_project?.windmeter_units || '') : (active_project?.units || '');
      const baseRowNum = stableRank.get(lcRankKey(item)) ?? '';
      const inTotalSum = isLcInTotalSum(item);
      return {
        rowNum: inTotalSum && baseRowNum !== '' ? `*${baseRowNum}` : baseRowNum,
        inTotalSum,
        Name: String(item?.title || ''),
        ID: String(item?.id || ''),
        Status: getLcStatus(item),
        Gross: isErr ? 'Tr.Err' : formatDualWeightWithLcResolution(grossNum, unit, item?.id),
        Net: isErr || !Number.isFinite(netCandidate) ? 'Tr.Err' : formatDualWeightWithLcResolution(netCandidate, unit, item?.id),
        Battery: item?.battery ? `${item.battery}%` : '',
        Time: format(now, 'yyyy-MM-dd HH:mm:ss'),
        groups: String(item?.groups || ''),
        displayNum: Number.isFinite(displayNum) ? displayNum : NaN,
        displayUnit: unit,
      };
    });
    const groupRows = (groupsRef.current || [])
      .filter((g: any) => normalizeProjectId(g.project_id) === pid && String(g.overload ?? '').trim() !== '')
      .sort((a: any, b: any) => Number(a.id || 0) - Number(b.id || 0))
      .map((g: any) => {
        const idStr = String(g.id);
        const rowsInGroup = rows.filter((r: any) => r.groups.split(',').map((x: string) => x.trim()).includes(idStr));
        const sum = rowsInGroup.reduce((acc: number, r: any) => acc + (Number.isFinite(r.displayNum) ? r.displayNum : 0), 0);
        const hasGroupErr = rowsInGroup.some((r: any) => r.Status === 'TR.ERR');
        const alerts = rowsInGroup.reduce((acc: Record<string, number>, r: any) => {
          acc[r.Status] = (acc[r.Status] || 0) + 1;
          return acc;
        }, {});
        const unit = projectWeightUnit || rowsInGroup[0]?.displayUnit || '';
        return {
          id: idStr,
          title: g.title || `Grp ${idStr}`,
          unit,
          total: hasGroupErr ? 'Tr.Err' : formatSnapshotDualTotal(sum, unit),
          alerts,
          rows: rowsInGroup,
        };
      });
    const totalSumLcIds = new Set(
      projectLcs
        .filter((item: any) => !!item.total_sum || String(item.total_sum) === '1')
        .map((item: any) => String(item.id))
    );
    const totalSumRows = rows.filter((r: any) => totalSumLcIds.has(String(r.ID)));
    const hasTotalSumErr = totalSumRows.some((r: any) => r.Status === 'TR.ERR');
    const totalSumValue = totalSumRows.reduce(
      (acc: number, r: any) => acc + (Number.isFinite(r.displayNum) ? r.displayNum : 0),
      0
    );
    const totalSumDual = hasTotalSumErr
      ? 'Tr.Err'
      : (totalSumRows.length > 0
        ? formatSnapshotDualTotal(totalSumValue, projectWeightUnit)
        : '—');
    const totalSumLegend = totalSumRows.length > 0 ? '* = included in Total Sum' : '';
    const prrId = prrConnectedListName || 'N/A';
    const prrStatus = connected ? 'Connected' : 'Disconnected';
    const batteryStr = `${Math.max(0, Math.min(100, Number(btry) || 0))}%`;

    const pick = await Swal.fire({
      title: 'Export snapshot',
      text: 'Choose export format',
      showCancelButton: true,
      showDenyButton: true,
      confirmButtonText: 'CSV',
      denyButtonText: 'PDF',
      cancelButtonText: 'Cancel',
      heightAuto: false,
    });
    if (pick.isDismissed) return;

    const isCsv = pick.isConfirmed;
    const fileBase = `monitor_snapshot_${format(now, 'yyyy-MM-dd_HH-mm')}`;
    const isWeb = platformType === 'web';
    const isNative = platformType === 'android' || platformType === 'ios';
    const isUserCancelledError = (err: any) => {
      const msg = String(err?.message || err || '').toLowerCase();
      return msg.includes('cancel') || msg.includes('canceled') || msg.includes('cancelled') || msg.includes('aborted');
    };

    try {
      const branding = await loadReportBranding(pid, active_project?.title ?? '');
      const snapshotTitle = t('Report.SnapshotTitle') || 'Snapshot Report';
      const brandingLabels = resolveReportBrandingLabels(t, snapshotTitle);
      const snapshotMeta = {
        generatedAt: now,
        prrId,
        prrStatus,
        batteryStr,
        totalSumDual,
        totalSumLegend,
      };

      if (isCsv) {
        const csv = buildMonitorSnapshotCsv({
          branding,
          labels: brandingLabels,
          meta: snapshotMeta,
          rows,
          groupRows,
        });
        const fileName = `${fileBase}.csv`;
        if (isWeb) {
          const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(url);
          return;
        }
        const dir = isNative ? Directory.Cache : Directory.Documents;
        await Filesystem.writeFile({ path: fileName, data: `\uFEFF${csv}`, directory: dir, encoding: Encoding.UTF8 });
        if (isNative) {
          const { uri } = await Filesystem.getUri({ path: fileName, directory: dir });
          await Share.share({ url: uri, title: 'Export snapshot', dialogTitle: 'Export snapshot' });
        } else {
          Swal.fire({ title: 'Export', text: 'Snapshot exported successfully.', icon: 'success', heightAuto: false });
        }
        return;
      }

      const doc = await buildMonitorSnapshotPdfDocument({
        branding,
        labels: brandingLabels,
        meta: snapshotMeta,
        rows,
        groupRows,
      });
      const fileName = `${fileBase}.pdf`;
      if (isWeb) {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
      const data = doc.output('datauristring').split(',')[1];
      const dir = isNative ? Directory.Cache : Directory.Documents;
      await Filesystem.writeFile({ path: fileName, data, directory: dir });
      if (isNative) {
        const { uri } = await Filesystem.getUri({ path: fileName, directory: dir });
        await Share.share({ url: uri, title: 'Export snapshot', dialogTitle: 'Export snapshot' });
      } else {
        Swal.fire({ title: 'Export', text: 'Snapshot exported successfully.', icon: 'success', heightAuto: false });
      }
    } catch (err) {
      if (isUserCancelledError(err)) return;
      console.error('Snapshot export error:', err);
      Swal.fire({ title: 'Export', text: 'Failed to export snapshot.', icon: 'error', heightAuto: false });
    }
  };

  const doActualImport = async (csvToImport: string) => {
    updateIsImportingProject(true);

    Swal.fire({
      title: t("Project.Import") || "Import",
      text: t("Common.PleaseWait") || "Importing project, please wait...",
      allowOutsideClick: false,
      allowEscapeKey: false,
      heightAuto: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    try {
    const newProjectId = await f_import_project_csv(csvToImport);
    if (!newProjectId) {
      Swal.fire({ title: t('Project.Import') || 'Import', text: t('Project.ImportError') || 'Failed to import project. Check CSV format.', icon: 'error', heightAuto: false });
      return;
    }
    await load_projects();
    const newProject = await db.projects.get(Number(newProjectId)) || await db.projects.get(newProjectId);
    if (newProject) {
      const idStr = String(newProject.id);
      updateCurProject(newProject as IProject, true);
      await load_lcs(idStr);
      await load_groups(idStr);
    }
    Swal.fire({ title: t('Project.Import') || 'Import', text: t('Project.ImportSuccess') || 'Project imported successfully.', icon: 'success', heightAuto: false });
    updateVisibleModal('');
    } catch (error) {
      await Swal.fire({
        title: t("Project.Import") || "Import",
        text:
          t("Project.ImportError") ||
          "Failed to import project. Check CSV format.",
        icon: "error",
        heightAuto: false,
      });
      console.error("Import error:", error);
    } finally {
      updateIsImportingProject(false);
    }
  };

  const runImportWithCsvText = async (text: string) => {
    const csvToImport = text;
    const importTitle = f_parse_import_project_title(text);
    const existingProject = importTitle ? projects.find((p) => (p.title || '').trim() === importTitle) : null;
    if (existingProject) {
      const result = await Swal.fire({
        title: t('Project.Import') || 'Import',
        text: `${t('Project.ImportDuplicateTitle') || 'A project with this name already exists.'} ${t('Project.ImportDuplicateAction') || 'Overwrite or choose a new name?'}`,
        icon: 'warning',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: t('Project.ImportOverwrite') || 'Overwrite',
        denyButtonText: t('Project.ImportChooseNewName') || 'Choose new name',
        cancelButtonText: t('Common.Cancel') || 'Cancel',
        heightAuto: false,
      });
      if (result.isConfirmed) {
        const pid = normalizeProjectId(existingProject.id);
        await db.transaction('rw', db.projects, db.lcs, db.groups, async () => {
          await db.projects.where('id').equals(existingProject.id).delete();
          await db.lcs.filter((lc: any) => normalizeProjectId(lc.project_id) === pid).delete();
          await db.groups.filter((g: any) => normalizeProjectId(g.project_id) === pid).delete();
        });
        updateProjects(projects.filter((p) => p.id !== existingProject.id));
        updateLCs(lcs.filter((lc) => normalizeProjectId(lc.project_id) !== pid));
        if (curProject && normalizeProjectId(curProject.id) === pid) {
          const other = projects.find((p) => p.id !== existingProject.id);
          updateCurProject(other ? (other as IProject) : ({} as IProject), true);
        }
      } else if (result.isDenied) {
        const base = (importTitle || '').trim() || 'Imported project';
        let suggested = `${base} (copy)`;
        let n = 1;
        while (projects.some((p) => (p.title || '').trim() === suggested)) {
          n += 1;
          suggested = `${base} (copy ${n})`;
        }
        updateVisibleModal('');
        setImportChooseName({ csvText: text, initialName: suggested });
        setChooseNameInputValue(suggested);
        return;
      } else {
        return;
      }
    }
    await doActualImport(csvToImport);
  };

  const handleImportProject = async () => {
    if (shouldUseNativeCsvPickerForImport()) {
      try {
        const text = await pickProjectCsvText();
        if (text == null) return;
        await runImportWithCsvText(text);
      } catch (err) {
        if (String(err).includes('cancel') || (err as any)?.message?.toLowerCase?.().includes('cancel')) return;
        console.error('Import project (native):', err);
        Swal.fire({ title: t('Project.Import') || 'Import', text: t('Project.ImportError') || 'Failed to import project.', icon: 'error', heightAuto: false });
      }
      return;
    }
    importFileInputRef.current?.click();
  };

  const handleImportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      await runImportWithCsvText(text);
    } catch (err) {
      console.error('Import project error:', err);
      Swal.fire({ title: t('Project.Import') || 'Import', text: t('Project.ImportError') || 'Failed to import project.', icon: 'error', heightAuto: false });
    }
  };

  const monitorIcon = () => {
    switch (monitorStatus) {
      case 'view':
        return roundPictureIcon;
      case 'list':
        return toolbarlistIcon;
      case 'prog':
        return toolbarprogIcon;
      case 'stop':
        return toolbarstopIcon;
      default:
        break;
    }
  }

  const handleSelectDevice = (type: string) => {
    if (!isViewActiveRef.current) return;
    ////console.log('selected device: ', type)
    switch (type) {
      case 'prr':
      case 'lc':
        handleStartScan(type) //bt_scan(type)
        break;
      case 'usb':
        usb_scan()
        break;
      default:
        break;
    }
    handleCloseModal()
  }

  /** Connect Device menu: run the same path as old "PRR" button, once per modal open. */
  useEffect(() => {
    if (visibleModal !== MENUS.ConnectDevice) {
      connectDeviceAutoRunRef.current = false;
      return;
    }
    if (!isViewActiveRef.current) return;
    if (connectDeviceAutoRunRef.current) return;
    connectDeviceAutoRunRef.current = true;
    handleSelectDevice('prr');
  }, [visibleModal]);

  const handleStartScan = async (type: string) => {
  if (!isViewActiveRef.current) return;
  if (type === 'prr') {
    // Manual flow wins: cancel pending auto-reconnect retries and invalidate stale callbacks.
    const timers = prrReconnectTimersRef.current;
    Object.keys(timers).forEach((deviceId) => {
      prrReconnectEpochRef.current[deviceId] = (prrReconnectEpochRef.current[deviceId] ?? 0) + 1;
      prrReconnectAttemptsRef.current[deviceId] = 0;
      prrReconnectInProgressRef.current[deviceId] = false;
      if (timers[deviceId]) {
        clearTimeout(timers[deviceId] as ReturnType<typeof setTimeout>);
        timers[deviceId] = null;
      }
    });
  }
  if (bleScanInProgressRef.current) {
    await Swal.fire({
      title: "Scan in progress",
      text: "There is already a Bluetooth scan in progress.",
      icon: "info",
      confirmButtonText: "OK",
      allowOutsideClick: false,
      allowEscapeKey: false,
      heightAuto: false,
    });
    void logEvent("WARN", "BLE scan ignored: already in progress", { type }, "BLE");
    return;
  }
  bleScanInProgressRef.current = true;
  try {
    if (!bleInitializedRef.current) {
      await BleClient.initialize();
      bleInitializedRef.current = true;
    }

    if (Capacitor.getPlatform() === 'web') {
      console.warn("Status: Platform is web. Skipping native hardware checks.");
    } else {
      const pre = await checkNativeBleScanPrerequisites();
      if (!pre.ok) {
        if (pre.reason === 'bluetooth_off') {
          updateErrStr("Please, turn on Bluetooth.");
          return;
        }
        setShowLocationAlert(true);
        return;
      }
    }

    await bt_scan(type);
  } catch (error) {
    console.error("Error al verificar requisitos:", error);
  } finally {
    bleScanInProgressRef.current = false;
  }
};

  const bleConnectToDevice = async (deviceId: string, type: string, displayName?: string): Promise<boolean> => {
    const s = (type == "prr") ? numberToUUID(0xfff0) : '0bd51666-e7cb-469b-8e4d-2742f1ba77cc';
    const c = (type == "prr") ? numberToUUID(0xfff4) : 'e7add780-b042-4876-aae1-112855353cc1';
    if (type === 'prr') {
      const connectedNow = connectedPrrDevicesRef.current;
      if (connectedNow.some((d) => String(d.deviceId) === String(deviceId))) {
        return true;
      }
      if (connectedNow.length >= 2) {
        await Swal.fire({
          title: 'PRR limit reached',
          text: 'You can connect up to 2 PRRs at the same time.',
          icon: 'info',
          confirmButtonText: 'OK',
          heightAuto: false,
        });
        return false;
      }
    }
    try {
      await BleClient.connect(deviceId, (did) => bt_disconnect(did), {
        timeout: BLE_CONNECT_TIMEOUT_MS,
      });
      if (type === 'prr') {
        const trimmedName = (displayName && displayName.trim()) || null;
        const reportLabel = trimmedName || deviceId;
        prrDisplayNameByDeviceRef.current[deviceId] = trimmedName;
        if (!prrBleDeviceIdRef.current) {
          prrBleDeviceIdRef.current = deviceId;
          prrBleDisplayNameRef.current = reportLabel;
        }
        setConnectedPrrDevices((prev) => {
          if (prev.some((d) => String(d.deviceId) === String(deviceId))) return prev;
          return [...prev, { deviceId, displayName: trimmedName }];
        });
        setPrrBatteryByDevice((prev) => ({ ...prev, [deviceId]: prev[deviceId] ?? 0 }));
        logPrrLinkEventSafely('connected', reportLabel);
      }
      // New PRR session: reset per-LC freshness memory and start all cells as Tr.Err
      // until each LC reports a fresh sample.
      lcDisplayBufferRef.current = {};
      dataTimeByIdRef.current = [];
      setDataTimeById([]);
      timeoutHandledRef.current = false;
      lastUpdatedRef.current = Date.now();
      const current = currentLcs.current || [];
      if (current.length > 0) {
        updateLCs(current.map((item: any) => ({ ...item, value: 'Tr.Err' })));
      }
      updateBleConnected(true);
      await BleClient.getServices(deviceId);
      void logEvent("INFO", "BLE device connected", { deviceId, type }, "BLE");
      await BleClient.startNotifications(
        deviceId,
        s,
        c,
        (value) => {
          bt_parse(new Uint8Array(value.buffer), deviceId);
        }
      );
      if (type === 'prr') {
        prrReconnectAttemptsRef.current[deviceId] = 0;
        prrReconnectInProgressRef.current[deviceId] = false;
        const timer = prrReconnectTimersRef.current[deviceId];
        if (timer) {
          clearTimeout(timer);
        }
        prrReconnectTimersRef.current[deviceId] = null;
      }
      return true;
    } catch (error) {
      console.error(error);
      void logEvent("ERROR", "BLE notification setup failed", { error }, "BLE");
      updateBleConnected(type === 'prr' ? connectedPrrDevicesRef.current.length > 0 : false);
      if (type === 'prr') {
        if (connectedPrrDevicesRef.current.length === 0) {
          setPrrConnectedListName(null);
        }
      }
      return false;
    }
  };

  const runBleDevicePickerFlow = async (kind: "prr" | "lc") => {
    if (!isViewActiveRef.current) return;
    const s =
      kind === "prr"
        ? numberToUUID(0xfff0)
        : "0bd51666-e7cb-469b-8e4d-2742f1ba77cc";
    bleScanAbortRef.current = false;
    setBlePickerType(kind);
    setBlePickerDevices([]);
    setBlePickerScanning(true);
    setBlePickerOpen(true);
    try {
      const devices = await collectBleDevicesForService(
        s,
        null,
        [],
        bleScanAbortRef,
        (liveDevices) => {
          setBlePickerDevices(liveDevices);
        }
      );
      if (bleScanAbortRef.current) {
        return;
      }
      setBlePickerDevices(devices);
    } catch (error) {
      console.error(error);
      void logEvent("ERROR", "BLE scan collection failed", { error }, "BLE");
      updateErrStr(t("ConnectDevice.ScanFailed") || "Bluetooth scan failed.");
      setBlePickerOpen(false);
    } finally {
      setBlePickerScanning(false);
    }
  };

  const handleBlePickerClose = () => {
    bleScanAbortRef.current = true;
    void BleClient.stopLEScan().catch(() => undefined);
    setBlePickerOpen(false);
    setBlePickerScanning(false);
    setBlePickerDevices([]);
    setBlePickerType(null);
  };

  const handleBlePickerConnect = async (deviceId: string, displayName?: string) => {
    const kind = blePickerType;
    bleScanAbortRef.current = true;
    void BleClient.stopLEScan().catch(() => undefined);
    setBlePickerOpen(false);
    setBlePickerScanning(false);
    setBlePickerDevices([]);
    setBlePickerType(null);
    if (!kind) {
      return;
    }
    await bleConnectToDevice(deviceId, kind, displayName);
  };

  const bt_scan = async (type: string) => {
    void logEvent("INFO", "BLE scan started", {}, "BLE");
    const s = (type == "prr") ? numberToUUID(0xfff0) : '0bd51666-e7cb-469b-8e4d-2742f1ba77cc';

    if (Capacitor.getPlatform() === "web") {
      try {
        const device = await BleClient.requestDevice({
          services: [s],
          optionalServices: [],
        });
        await bleConnectToDevice(device.deviceId, type, device.name?.trim() || undefined);
      } catch (error) {
        console.error(error);
        void logEvent("ERROR", "BLE notification setup failed", { error }, "BLE");
        updateBleConnected(false);
      }
      return;
    }

    if (type !== "prr" && type !== "lc") {
      return;
    }
    await runBleDevicePickerFlow(type);
  };

  const bt_connect = () => {
    //console.log('===bt_connect===')
  }
  const ifConnection = () => {
    evaluateTransmissionFreshnessRef.current();
  };
  const updateLiveLCData = async () => {
    const currentTime = Date.now();
    const filteredData = dataTimeById.filter(item => {
      const timeDifference = Math.abs(item.realTime - currentTime);
      return timeDifference <= PRR_STALE_LC_MS;
    });
    updateLiveLC(filteredData)
  }
  useEffect(() => {
    dataTimeByIdRef.current = dataTimeById;    
    if (dataTimeById.length > 0) {
      const mostRecentTime = Math.max(...dataTimeById.map((item: any) => item.realTime || 0));
      if (mostRecentTime > lastUpdatedRef.current) {
        lastUpdatedRef.current = mostRecentTime;
        if (timeoutHandledRef.current) {
          timeoutHandledRef.current = false;
        }
      }
    }
    setLastUpdated(lastUpdatedRef.current);
    setNoChange(false);
        if (dataTimeById.length > 0) {
      timeoutHandledRef.current = false;
    }
        updateLiveLCData()
    ifConnection()
  }, [dataTimeById])

  const prevTrrLcsRef = useRef<string>('');
  const isUpdatingRef = useRef(false);
  useEffect(() => {
    if (isUpdatingRef.current) {
      return;
    }
    const trrLcsHash = TrrLcs.map(lc => `${lc.id}-${lc.value}`).join('|');
    if (prevTrrLcsRef.current === trrLcsHash) {
      return;
    }
    prevTrrLcsRef.current = trrLcsHash;
    const lcsHash = lcs.map(lc => `${lc.id}-${lc.value}`).join('|');
    if (trrLcsHash === lcsHash) {
      return;
    }
    isUpdatingRef.current = true;
    // Preserve status_tare/tare from context lcs so TrrLcs push never drops tare state
    const merged = TrrLcs.map((trr: any) => {
      const cur = lcs.find((c: any) => String(c.id) === String(trr.id) && normalizeProjectId(c.project_id) === normalizeProjectId(trr.project_id));
      if (!cur) return trr;
      return {
        ...trr,
        ...(cur.status_tare !== undefined && { status_tare: cur.status_tare }),
        ...(cur.tare !== undefined && { tare: cur.tare }),
        ...(cur.weightnotare !== undefined && { weightnotare: cur.weightnotare }),
      };
    });
    updateLCs(merged);
    setTimeout(() => {
      isUpdatingRef.current = false;
    }, 100);
  }, [TrrLcs, lcs])
    useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }    
    intervalRef.current = setInterval(() => {
      evaluateTransmissionFreshnessRef.current();
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const updateItem = async ({ lcIdToUpdate, weight, realval, max, time, overload, underload }: any) => {
    const now = new Date().getTime();
    lastUpdatedRef.current = now;
    timeoutHandledRef.current = false;
    setDataTimeById(prevData => {
      const existingItem = prevData.find(item => item.id === lcIdToUpdate);
      let newData;
      if (existingItem) {
        newData = prevData.map(item =>
          item.id === lcIdToUpdate ? { ...item, realTime: now, value: weight, realval, max, time, overload, underload } : item
        );
      } else {
        newData = [...prevData, { id: lcIdToUpdate, realTime: now, value: weight, realval, max, time, overload, underload }];
      }     
      dataTimeByIdRef.current = newData;
      const mostRecentTime = Math.max(...newData.map(item => item.realTime || 0));
      if (mostRecentTime > lastUpdatedRef.current) {
        lastUpdatedRef.current = mostRecentTime;
      }
      return newData;
    });
  };
  const currentLcs = useRef(lcs);
  const prevLcsRef = useRef<string>('');
  const prevCurProjectIdRef = useRef<string | undefined>(curProject?.id);
  const lcDisplayBufferRef = useRef<Record<string, PendingLCDisplay>>({});
  const lastReportTimeRef = useRef<Record<string, number>>({});
  /** Last BLE payload processed (any LC). Used to distinguish OS suspend vs real silence in background. */
  const lastBleRxAtRef = useRef<number>(Date.now());
  /** When app entered background; null while foreground. */
  const backgroundSinceRef = useRef<number | null>(null);
  /**
   * Capacitor app active flag — reliable on iOS (WKWebView often keeps document.visibilityState === 'visible').
   */
  const appIsActiveRef = useRef(true);
  const lcSnapshotOnBackgroundRef = useRef<LcBackgroundSnapshot[] | null>(null);
  const backgroundBleSuspendedRef = useRef(false);
  const markAppBackgroundedRef = useRef<() => void>(() => {});
  const syncMonitorAfterForegroundRef = useRef<() => void>(() => {});
  /** Last PRR BLE peripheral id (iOS UUID). */
  const prrBleDeviceIdRef = useRef<string | null>(null);
  /** Shown next to "PRR" on Monitor: first line of the scan list (name), not the BLE address. */
  const [prrConnectedListName, setPrrConnectedListName] = useState<string | null>(null);
  const [connectedPrrDevices, setConnectedPrrDevices] = useState<ConnectedPrrDevice[]>([]);
  const connectedPrrDevicesRef = useRef<ConnectedPrrDevice[]>([]);
  const [prrBatteryByDevice, setPrrBatteryByDevice] = useState<Record<string, number>>({});
  const prrBatteryByDeviceRef = useRef<Record<string, number>>({});
  /** Manual disconnects should not auto-reconnect. */
  const prrManualDisconnectRef = useRef<Record<string, boolean>>({});
  /** Friendly name for PRR report rows (ID column); falls back to deviceId if unnamed. */
  const prrBleDisplayNameRef = useRef<string | null>(null);
  const lastPrrLinkEventRef = useRef<Record<string, number>>({});
  const prevBlePrrStateRef = useRef<boolean | null>(null);
  const bleConnectedRef = useRef<boolean>(bleConnected);
  const evaluateTransmissionFreshnessRef = useRef<() => void>(() => {});
  const prrReconnectAttemptsRef = useRef<Record<string, number>>({});
  const prrReconnectInProgressRef = useRef<Record<string, boolean>>({});
  const prrReconnectTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  /** Invalidate stale auto-reconnect callbacks when user starts a manual connect flow. */
  const prrReconnectEpochRef = useRef<Record<string, number>>({});
  const prrDisplayNameByDeviceRef = useRef<Record<string, string | null>>({});
  // Keep ref in sync every render so flushLcDisplayBuffer always merges buffer into latest lcs (preserves status_tare/tare)
  currentLcs.current = lcs;
  useEffect(() => {
    connectedPrrDevicesRef.current = connectedPrrDevices;
    const labels = connectedPrrDevices
      .map((d) => (d.displayName && d.displayName.trim()) || d.deviceId)
      .filter(Boolean);
    setPrrConnectedListName(labels.length > 0 ? labels.join(' | ') : null);
  }, [connectedPrrDevices]);
  useEffect(() => {
    prrBatteryByDeviceRef.current = prrBatteryByDevice;
  }, [prrBatteryByDevice]);

  const maybeLogLcValue = (lcId: any, projectId: any, value: any, realval: any, overload: any, underload: any, batteryParam?: number | string) => {
    const pid = normalizeProjectId(projectId);
    const curProj = curProjectRef.current ?? curProject;
    const activeProj = activeProjectRef.current?.id ? activeProjectRef.current : active_project;
    const curPid = normalizeProjectId(curProj?.id);
    const activePid = normalizeProjectId(activeProj?.id);
    const proj =
      (pid && pid === curPid && curProj?.id != null) ? curProj :
      (pid && pid === activePid && activeProj?.id != null) ? activeProj :
      (curProj?.id != null ? curProj : activeProj);
    const cycleRaw = (proj as any)?.cycle;
    const cycleEnabled =
      cycleRaw === true ||
      cycleRaw === 'true' ||
      cycleRaw === 1 ||
      cycleRaw === '1';
    if (!cycleEnabled) return;
    const isTrErrSample =
      value === 'Tr.Err' ||
      value === 'Tr. Err' ||
      value === -99999999 ||
      realval === -99999999;
    // PRR offline: still show Tr.Err in UI, but do not write 75× Tr.Err/sec to IndexedDB (was killing UI thread).
    if (isTrErrSample && !bleConnected) return;
    if (isTrErrSample && !appIsActiveRef.current) return;
    const intervalSecRaw = Number(proj?.report_interval_seconds ?? 60);
    const intervalSec = Math.max(
      1,
      Math.min(86400, Number.isFinite(intervalSecRaw) ? intervalSecRaw : 60)
    );
    const key = `${projectId}_${lcId}`;
    const now = Date.now();
    if (now - (lastReportTimeRef.current[key] ?? 0) < intervalSec * 1000) return;
    lastReportTimeRef.current[key] = now;
    f_log_lc_value(lcId, projectId, value, realval, overload, underload, batteryParam);
  };

  const touchLcFreshnessInRef = (
    lcId: string | number,
    fields?: Partial<{
      value: unknown;
      realval: unknown;
      max: unknown;
      time: string;
      overload: unknown;
      underload: unknown;
    }>
  ) => {
    const now = Date.now();
    lastBleRxAtRef.current = now;
    const id = String(lcId);
    const prev = dataTimeByIdRef.current;
    const idx = prev.findIndex((i) => String(i.id) === id);
    const entry = {
      ...(idx >= 0 ? prev[idx] : { id }),
      ...fields,
      id,
      realTime: now,
    };
    dataTimeByIdRef.current =
      idx >= 0 ? prev.map((item, i) => (i === idx ? { ...item, ...entry } : item)) : [...prev, entry];
    if (now > lastUpdatedRef.current) lastUpdatedRef.current = now;
    timeoutHandledRef.current = false;
  };

  const markAppBackgrounded = () => {
    appIsActiveRef.current = false;
    setAlarmAppInForeground(false);
    if (backgroundSinceRef.current != null) return;
    backgroundSinceRef.current = Date.now();
    lcSnapshotOnBackgroundRef.current = (currentLcs.current || []).map((lc) => ({
      id: String(lc.id),
      value: lc.value,
      weightnotare: lc.weightnotare,
    }));
  };

  /** Shift freshness timestamps forward after OS suspended BLE/JS while backgrounded. */
  const compensateFreshnessAfterBackground = () => {
    const bgSince = backgroundSinceRef.current;
    if (bgSince == null) return;
    const pausedMs = Date.now() - bgSince;
    backgroundSinceRef.current = null;
    if (pausedMs <= 0) return;

    const bleRxAfterBackground = lastBleRxAtRef.current > bgSince;
    if (bleRxAfterBackground) return;

    backgroundBleSuspendedRef.current = true;
    const prev = dataTimeByIdRef.current;
    if (prev.length === 0) return;
    dataTimeByIdRef.current = prev.map((item) => ({
      ...item,
      realTime: (item.realTime || 0) + pausedMs,
    }));
    lastUpdatedRef.current += pausedMs;
  };

  const restoreLcsAfterSuspendedBackground = () => {
    if (!backgroundBleSuspendedRef.current) {
      lcSnapshotOnBackgroundRef.current = null;
      return;
    }
    backgroundBleSuspendedRef.current = false;
    const snap = lcSnapshotOnBackgroundRef.current;
    lcSnapshotOnBackgroundRef.current = null;
    if (!snap?.length) return;

    const snapById = new Map(snap.map((s) => [s.id, s]));
    const cur = currentLcs.current || [];
    let changed = false;
    const updated = cur.map((lc) => {
      const prev = snapById.get(String(lc.id));
      if (!prev || prev.value === 'Tr.Err' || lc.value !== 'Tr.Err') return lc;
      changed = true;
      return {
        ...lc,
        value: prev.value,
        ...(prev.weightnotare !== undefined && { weightnotare: prev.weightnotare }),
      };
    });
    if (changed) {
      updateLCs(updated);
      setTrrLcs(updated);
    }
  };
  markAppBackgroundedRef.current = markAppBackgrounded;

  const evaluateTransmissionFreshness = () => {
    if (!bleConnectedRef.current || !appIsActiveRef.current) return;

    const now = Date.now();
    const currentDataTimeById = dataTimeByIdRef.current;
    let mostRecentDataTime = 0;

    if (currentDataTimeById.length > 0) {
      mostRecentDataTime = Math.max(...currentDataTimeById.map((item) => item.realTime || 0));
      if (mostRecentDataTime > lastUpdatedRef.current) {
        lastUpdatedRef.current = mostRecentDataTime;
        timeoutHandledRef.current = false;
      }
    }

    const timeSinceMostRecent =
      mostRecentDataTime > 0 ? now - mostRecentDataTime : Number.POSITIVE_INFINITY;
    const hasRecentGlobalData = timeSinceMostRecent <= PRR_SILENCE_ALL_TRERR_MS;

    if (!hasRecentGlobalData) {
      const referenceTime = mostRecentDataTime > 0 ? mostRecentDataTime : lastUpdatedRef.current;
      const timeSinceLastUpdate = now - referenceTime;
      if (timeSinceLastUpdate < PRR_SILENCE_ALL_TRERR_MS) {
        if (timeoutHandledRef.current) timeoutHandledRef.current = false;
      } else if (!timeoutHandledRef.current) {
        timeoutHandledRef.current = true;
        setNoChange(true);
        const lcsArray: any[] = [];
        const projId = curProjectRef.current?.id;
        currentLcs.current.forEach((item) => {
          lcsArray.push({ ...item, value: 'Tr.Err' });
          if (projId) {
            maybeLogLcValue(item.id, projId, 'Tr.Err', -99999999, item.overload, item.underload);
          }
        });
        setTrrLcs(lcsArray);
        setTimeout(() => {
          timeoutHandledRef.current = false;
        }, 2000);
        return;
      }
    } else if (timeoutHandledRef.current) {
      timeoutHandledRef.current = false;
    }

    if (currentDataTimeById.length === 0) return;

    const idsWithStaleData = new Set<string>();
    for (const item of currentDataTimeById) {
      if (now - item.realTime > PRR_STALE_LC_MS) idsWithStaleData.add(String(item.id));
    }
    if (idsWithStaleData.size === 0) return;

    const curLcs = currentLcs.current || [];
    const projId = curProjectRef.current?.id;
    let changed = false;
    const updatedLcs = curLcs.map((lcItem) => {
      if (!idsWithStaleData.has(String(lcItem.id))) return lcItem;
      if (lcItem.value === 'Tr.Err') return lcItem;
      changed = true;
      if (projId) {
        maybeLogLcValue(lcItem.id, projId, 'Tr.Err', -99999999, lcItem.overload, lcItem.underload);
      }
      return { ...lcItem, value: 'Tr.Err' };
    });
    if (changed) updateLCs(updatedLcs);
  };
  evaluateTransmissionFreshnessRef.current = evaluateTransmissionFreshness;

  const logPrrLinkEventSafely = (kind: 'connected' | 'disconnected', reportLabelOverride?: string | null) => {
    const proj = activeProjectRef.current?.id ? activeProjectRef.current : active_project;
    if (!proj?.id || !proj?.cycle) return;
    const reportLabel =
      (reportLabelOverride && reportLabelOverride.trim()) ||
      (prrBleDisplayNameRef.current && prrBleDisplayNameRef.current.trim()) ||
      prrBleDeviceIdRef.current;
    if (!reportLabel) return;

    const nowTs = Date.now();
    const dedupeKey = `${kind}:${reportLabel}`;
    const prevTs = lastPrrLinkEventRef.current[dedupeKey] ?? 0;
    if (nowTs - prevTs < 2000) return;
    lastPrrLinkEventRef.current[dedupeKey] = nowTs;
    f_log_prr_link_event(proj.id, kind, reportLabel);
  };

 /* const flushLcDisplayBuffer = () => {
    const buffer = lcDisplayBufferRef.current;
    const keys = Object.keys(buffer);
    if (keys.length === 0) return;
    const now = Date.now();
    lastUpdatedRef.current = now;
    timeoutHandledRef.current = false;
    // Use lcsRef from context (updated synchronously on updateLCs) so we never overwrite status_tare/tare with stale currentLcs
    const curLcs = (lcsRef?.current ?? currentLcs.current ?? []) as any[];
    const latestRef = (lcsRef?.current ?? []) as any[];
    const refMap = latestRef.length > 0 ? new Map(latestRef.map((lc: any) => [`${lc.id}-${normalizeProjectId(lc.project_id)}`, lc])) : null;
    let nextLcs = curLcs.map((item: any) => {
      const p = buffer[item.id];
      const refLc = refMap?.get(`${item.id}-${normalizeProjectId(item.project_id)}`);
      if (!p) return item;
      let weightnotare = p.weightnotare;
      if (refLc?.status_tare && refLc?.weightnotare != null && refLc.weightnotare !== '' && p.weightnotare != null && p.value != null) {
        const bufWn = Number(p.weightnotare);
        const bufVal = Number(p.value);
        if (Math.abs(bufWn - bufVal) < 0.01) {
          weightnotare = refLc.weightnotare;
        }
      }
      return {
        ...item,
        ...(p.value !== undefined && { value: p.value }),
        ...(weightnotare !== undefined && { weightnotare }),
        ...(p.realval !== undefined && { realval: p.realval }),
        ...(p.battery !== undefined && { battery: p.battery }),
        // --- AÑADE ESTA LÍNEA PARA QUE EL MÁXIMO SE GUARDE EN LA CELDA ---
        ...(p.max !== undefined && { max: p.max }),
      };
    });
    if (refMap && refMap.size > 0) {
      const byKey = (lc: any) => `${lc.id}-${normalizeProjectId(lc.project_id)}`;
      nextLcs = nextLcs.map((lc: any) => {
        const refLc = refMap.get(byKey(lc));
        if (!refLc) return lc;
        const keep = { ...lc };
        if (refLc.status_tare !== undefined) keep.status_tare = refLc.status_tare;
        if (refLc.tare !== undefined) keep.tare = refLc.tare;
        return keep;
      });
    }
    updateLCs(nextLcs);
    setDataTimeById((prevData: any[]) => {
      const newData = [...prevData];
      for (const [id, p] of Object.entries(buffer)) {
        if (p.weight === undefined && p.value === undefined && p.realval === undefined) continue;
        const idx = newData.findIndex((i: any) => i.id === id);
        const entry = {
          id,
          realTime: now,
          value: p.weight ?? p.value,
          realval: p.realval,
          max: p.max,
          time: p.time ?? format(new Date(), 'pp'),
          overload: p.overload,
          underload: p.underload,
        };
        if (idx >= 0) newData[idx] = { ...newData[idx], ...entry };
        else newData.push(entry);
      }
      dataTimeByIdRef.current = newData;
      return newData;
    });
    lcDisplayBufferRef.current = {};
  };*/

  // 1. Creamos la referencia
const groupsRef = useRef(groups);

// 2. La mantenemos al día con el estado que viene de useAppData
useEffect(() => {
  groupsRef.current = groups;
}, [groups]);



  const pendingTotalHtmlRef = useRef<string>('');
  const pendingGroupsRef = useRef<IGroup[]>([]);
  // --- AÑADE ESTAS DOS LÍNEAS AQUÍ ---
const pendingWarnListRef = useRef<any[]>([]);
const lastSoundTimeRef = useRef<number>(0);

  const playSafetyBeepIfDue = (detail?: SafetyAlarmDetail) => {
    const now = Date.now();
    if (now - lastSoundTimeRef.current <= 1000) return;
    lastSoundTimeRef.current = now;
    play_beep(4, 800, 200, detail);
  };

  const registerSafetyAlertKey = (key: string) => {
    if (appIsActiveRef.current) {
      activeAlertsRef.current.add(key);
    }
  };

  const replaySafetyBeepIfConditionsActive = () => {
    const proj = curProjectRef.current;
    if (!proj?.id) return;
    const pid = normalizeProjectId(proj.id);
    const rows = (currentLcs.current || []).filter(
      (lc: any) => normalizeProjectId(lc.project_id) === pid
    );
    let needsBeep = false;
    for (const lc of rows) {
      const raw = lc.value;
      if (raw === 'Tr.Err' || raw === 'Tr. Err' || Number(raw) === -99999999) continue;
      const gross = Number(raw);
      const overload = Number(lc.overload);
      const underload = Number(lc.underload);
      if (!Number.isFinite(gross)) continue;
      if (Number.isFinite(underload) && gross < underload) needsBeep = true;
      if (Number.isFinite(overload) && overload > 0 && gross > overload) needsBeep = true;
      const prePct = getPreOverloadThreshold(overload, proj.pre_overload);
      if (prePct != null && Number.isFinite(overload) && gross > prePct && gross <= overload) needsBeep = true;
    }
    if (needsBeep) playSafetyBeepIfDue();
  };

  /** While backgrounded: refresh BLE freshness timestamps without React/LC UI updates. */
  const refreshLcFreshnessFromBuffer = () => {
    const buffer = lcDisplayBufferRef.current;
    const keys = Object.keys(buffer);
    if (keys.length === 0) return;

    const now = Date.now();
    lastUpdatedRef.current = now;
    timeoutHandledRef.current = false;

    const prev = dataTimeByIdRef.current;
    const newData = [...prev];
    for (const [id, p] of Object.entries(buffer)) {
      if (p.weight === undefined && p.value === undefined && p.realval === undefined) continue;
      const idx = newData.findIndex((i: any) => i.id === id);
      const entry = {
        id,
        realTime: now,
        value: p.weight ?? p.value,
        realval: p.realval,
        max: p.max,
        time: p.time ?? format(new Date(), 'pp'),
        overload: p.overload,
        underload: p.underload,
      };
      if (idx >= 0) newData[idx] = { ...newData[idx], ...entry };
      else newData.push(entry);
    }
    dataTimeByIdRef.current = newData;
  };

  const flushLcDisplayBufferRef = useRef<() => void>(() => {});

  const flushLcDisplayBuffer = () => {
    const buffer = lcDisplayBufferRef.current;
    const keys = Object.keys(buffer);
    
    // --- OPTIMIZACIÓN: Solo procedemos si hay datos nuevos O un cambio en totales/grupos ---
    //if (keys.length === 0 && !pendingTotalHtmlRef.current && pendingGroupsRef.current.length === 0) return;
    // Modificamos esta condición para incluir las alertas pendientes
    if (keys.length === 0 && !pendingTotalHtmlRef.current && 
      pendingGroupsRef.current.length === 0 && pendingWarnListRef.current.length === 0) return;

    const now = Date.now();
    lastUpdatedRef.current = now;
    timeoutHandledRef.current = false;

    // 1. LÓGICA DE CELDAS (Tu código actual, se mantiene igual)
    const curLcs = (lcsRef?.current ?? currentLcs.current ?? []) as any[];
    const latestRef = (lcsRef?.current ?? []) as any[];
    const refMap = latestRef.length > 0 ? new Map(latestRef.map((lc: any) => [`${lc.id}-${normalizeProjectId(lc.project_id)}`, lc])) : null;

    let nextLcs = curLcs.map((item: any) => {
      const p = buffer[item.id];
      const refLc = refMap?.get(`${item.id}-${normalizeProjectId(item.project_id)}`);
      if (!p) return item;

      let weightnotare = p.weightnotare;
      if (refLc?.status_tare && refLc?.weightnotare != null && refLc.weightnotare !== '' && p.weightnotare != null && p.value != null) {
        const bufWn = Number(p.weightnotare);
        const bufVal = Number(p.value);
        if (Math.abs(bufWn - bufVal) < 0.01) {
          weightnotare = refLc.weightnotare;
        }
      }
      return {
        ...item,
        ...(p.value !== undefined && { value: p.value }),
        ...(weightnotare !== undefined && { weightnotare }),
        ...(p.realval !== undefined && { realval: p.realval }),
        ...(p.battery !== undefined && { battery: p.battery }),
        ...(p.max !== undefined && { max: p.max }),
      };
    });

    // 2. DISPARO ÚNICO DE ACTUALIZACIONES (Aquí es donde evitamos el error de GPU)
    
    // Actualizamos Celdas
    updateLCs(nextLcs);

    // Actualizamos Peso Total (Si hay algo pendiente)
    if (pendingTotalHtmlRef.current) {
      updateTotalWeightHtml(pendingTotalHtmlRef.current);
      pendingTotalHtmlRef.current = ''; // Limpiamos la referencia
    }

    // Actualizamos Grupos (Si hay algo pendiente)
    if (pendingGroupsRef.current.length > 0) {
      updateGroups([...pendingGroupsRef.current].sort((a, b) => parseInt(a.id || '0') - parseInt(b.id || '0')));
      pendingGroupsRef.current = []; // Limpiamos la referencia
    }

    // NUEVO: Actualizamos la lista de alertas de una sola vez
    if (pendingWarnListRef.current.length > 0) {
      updateWarnList(pendingWarnListRef.current);
      // No limpiamos el ref aquí porque warnList es un historial acumulado
    }

    // Actualizamos Live Data (DataTimeById)
    setDataTimeById((prevData: any[]) => {
      const newData = [...prevData];
      for (const [id, p] of Object.entries(buffer)) {
        if (p.weight === undefined && p.value === undefined && p.realval === undefined) continue;
        const idx = newData.findIndex((i: any) => i.id === id);
        const entry = {
          id,
          realTime: now,
          value: p.weight ?? p.value,
          realval: p.realval,
          max: p.max,
          time: p.time ?? format(new Date(), 'pp'),
          overload: p.overload,
          underload: p.underload,
        };
        if (idx >= 0) newData[idx] = { ...newData[idx], ...entry };
        else newData.push(entry);
      }
      dataTimeByIdRef.current = newData;
      return newData;
    });

    // Limpiamos el buffer de celdas
    lcDisplayBufferRef.current = {};
  };
  flushLcDisplayBufferRef.current = flushLcDisplayBuffer;

  const syncMonitorAfterForeground = () => {
    appIsActiveRef.current = true;
    setAlarmAppInForeground(true);
    compensateFreshnessAfterBackground();
    restoreLcsAfterSuspendedBackground();
    refreshLcFreshnessFromBuffer();
    flushLcDisplayBufferRef.current();
    flushAlarmBeepsOnForeground();
    replaySafetyBeepIfConditionsActive();
    const delayMs = Capacitor.getPlatform() === 'ios' ? 800 : 100;
    window.setTimeout(() => evaluateTransmissionFreshnessRef.current(), delayMs);
  };
  syncMonitorAfterForegroundRef.current = syncMonitorAfterForeground;

  useEffect(() => {
    const onForeground = () => syncMonitorAfterForegroundRef.current();
    const onBackground = () => markAppBackgroundedRef.current();

    void CapApp.getState().then((state) => {
      appIsActiveRef.current = state.isActive;
      setAlarmAppInForeground(state.isActive);
      if (!state.isActive) onBackground();
    });

    const onVisibilityChange = () => {
      if (isDocumentVisible()) onForeground();
      else onBackground();
    };
    const onPageShow = () => onForeground();
    const onPageHide = () => onBackground();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('pagehide', onPageHide);

    let resumeHandle: { remove: () => void } | undefined;
    let pauseHandle: { remove: () => void } | undefined;
    let appStateHandle: { remove: () => void } | undefined;

    void CapApp.addListener('resume', onForeground).then((handle) => {
      resumeHandle = handle;
    });
    void CapApp.addListener('pause', onBackground).then((handle) => {
      pauseHandle = handle;
    });
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) onForeground();
      else onBackground();
    }).then((handle) => {
      appStateHandle = handle;
    });

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('pagehide', onPageHide);
      resumeHandle?.remove();
      pauseHandle?.remove();
      appStateHandle?.remove();
    };
  }, []);

  useEffect(() => {
    const ms = getLcDisplayBatchMs(platformType, Array.isArray(lcs) ? lcs.length : 0);

    const t = window.setInterval(() => {
      if (!appIsActiveRef.current) {
        refreshLcFreshnessFromBuffer();
        return;
      }
      flushLcDisplayBuffer();
    }, ms);

    return () => window.clearInterval(t);
  }, [platformType, lcs?.length]);

  useEffect(() => {
    const lcsHash = lcs.map(lc => `${lc.id}-${lc.value}-${lc.zero ?? ''}-${lc.psw ?? ''}-${lc.view_x ?? ''}-${lc.view_y ?? ''}`).join('|');
    if (prevLcsRef.current === lcsHash) {
      return;
    }
    prevLcsRef.current = lcsHash;
    currentLcs.current = lcs;
  }, [lcs]);
  useEffect(() => {
    currentUnitsRef.current = curProject.units
  }, [curProject.units])
  useEffect(() => {
    curProjectRef.current = curProject
  }, [curProject])
  useEffect(() => {
    const prevNorm = normalizeProjectId(prevCurProjectIdRef.current);
    const nextNorm = normalizeProjectId(curProject?.id);
    if (!nextNorm || prevNorm === nextNorm) return;
    // Project switched while BLE stream is running: reset transient UI caches so next project starts clean.
    prevCurProjectIdRef.current = curProject?.id;
    lcDisplayBufferRef.current = {};
    dataTimeByIdRef.current = [];
    setDataTimeById([]);
    timeoutHandledRef.current = false;
    lastUpdatedRef.current = Date.now();
  }, [curProject?.id, dataTimeByIdRef, lastUpdatedRef, timeoutHandledRef]);
  let warnId = 0
  // Safety (overload/underload → updateWarnList, maxStatusToggle, loadStatusToggle) runs immediately per packet.
  // Display updates (updateLCs, dataTimeById) are batched every LC_DISPLAY_BATCH_MS to reduce UI load.
  const bt_parse = async (a: Uint8Array, sourceDeviceId?: string) => {
    const typ = toHexString([a[2]]);
    if (typ === 'bb' || typ === 'bc') {
      lastBleRxAtRef.current = Date.now();
      const btry = parseInt('0x' + toHexString([a[10]]), 16);
     /* if (btry < 100) {
        //console.log('Battery level:', btry + '%');
        return;
      }*/

      updateBatteryStatus(btry); // <--- CAMBIO AQUÍ

      setBtry(btry);
      if (sourceDeviceId) {
        setPrrBatteryByDevice((prev) => {
          const clamped = Math.max(0, Math.min(100, Number(btry) || 0));
          if (prev[sourceDeviceId] === clamped) return prev;
          return { ...prev, [sourceDeviceId]: clamped };
        });
      }
    } else if (a[2] <= 10) {
      const lc = parseInt('0x' + toHexString([a[3], a[4], a[5]]), 16);
      const liveProject = curProjectRef.current?.id ? curProjectRef.current : curProject;
      const liveProjectIdNorm = normalizeProjectId(liveProject?.id);
      const liveProjectLcs = (lcsRef?.current ?? currentLcs.current ?? []).filter(
        (item: any) => normalizeProjectId(item.project_id) === liveProjectIdNorm
      );
      const lcExistsInLiveProject = liveProjectLcs.some((item: any) => String(item.id) === String(lc));
      if (!lcExistsInLiveProject) {
        return;
      }

      //logEvent("INFO", "LC data received", { lc, raw: toHexString(a) }, "BLE");
      //console.log('Received data for LC', lc, 'Raw data:', toHexString(a));
      let realval: any = hexToInt(toHexString([a[6], a[7], a[8], a[9]])) / 10000; // mt.TON
      let weight: any = hexToInt(toHexString([a[6], a[7], a[8], a[9]])) / 10000; // mt.TON      

      let lc_btry;
      if (a[2] == 55) {
        if (a[10].toString(2) == "11111111") {
          lc_btry = 100;
        } else {
          lc_btry = parseInt(a[10].toString(2).substring(a[10].toString(2).length - 3));
        }
      } else {
        lc_btry = parseInt('0x' + toHexString([a[10]]), 16);
      }
      if (lc_btry > 100) {
        lc_btry = 100;
      }

      const lcItem = currentLcs.current?.find(item => item.id === lc.toString())
      if (lcItem) {
        const bid = lc.toString();
        lcDisplayBufferRef.current[bid] = { ...lcDisplayBufferRef.current[bid], battery: lc_btry.toString() };
        touchLcFreshnessInRef(bid);
      }
      //updateBatteryStatus(lc_btry)
      const capacity: any = f_lc_capacity_id(lc);
      const nominalCapacityMton = Number(capacity?.mton ?? 0);
      const hasNominalCapacity = Number.isFinite(nominalCapacityMton) && nominalCapacityMton > 0;
      // Noise guard with high tolerance: only reject extreme negative spikes (< -200% nominal capacity).
      const minValidNegativeMton = hasNominalCapacity ? -(nominalCapacityMton * 2) : Number.NEGATIVE_INFINITY;

      if (lc > 10 && hasNominalCapacity && weight > nominalCapacityMton * 2) {
        // something disturbed, number wrong 
        return;
      }

      if (lc > 10 && realval < minValidNegativeMton) {
        void logEvent("INFO", "Extreme negative value filtered", {
          lc,
          realval,
          minAllowed: minValidNegativeMton,
          nominalCapacityMton: hasNominalCapacity ? nominalCapacityMton : undefined,
        }, "BLE");
        return;
      }

      // Use currently selected project units so conversion follows the active project after project switch.
      const unitsRaw = (currentUnitsRef.current ?? liveProject?.units) ?? 'M.TON';
      const u = String(unitsRaw).toLowerCase().replace(/\./g, '').trim().split(/\s+/)[0] ?? 'mton';
      const fx = (u === 'mton') ? 3 : 0;
      const lcResolution = getResolutionForLcId(lc, u);
      const rawWeightMton = lc > 10 ? Number(weight) : null;

      if (lc > 10) {
        if (u === 'lbs') {
          weight = (weight * 2204.62).toFixed(0);
          realval = (realval * 2204.62).toFixed(0);
        } else if (u === 'kg') {
          weight = (Number(weight) * 1000).toFixed(0);
          realval = (Number(realval) * 1000).toFixed(0);
        } else {
          weight = parseFloat(Number(weight).toFixed(3));
          realval = parseFloat(Number(realval).toFixed(3));
        }
      } else {
        weight = parseFloat(weight).toFixed(3);
        realval = parseFloat(realval).toFixed(3);
      }

      // Use lcsRef so BLE callback sees latest zero (updated synchronously when user zeros); fallback to currentLcs
      const projectLcs = liveProjectLcs;
      const l = f_lc_by_id(lc, projectLcs.length > 0 ? projectLcs : (currentLcs.current ?? [])) as ILC
      const calibrationOffset = parseFloat(l?.calibration_offset ? l?.calibration_offset : '1')
      const psw = parseFloat(l?.psw ?? '0')
      const overload = parseFloat(l?.overload ?? '0')
      const underload = parseFloat(l?.underload ?? '0')
      let tare: number = Number(l?.tare) ?? 0
      const statusTare = l?.status_tare
      let zero: number = Number(l?.zero) ?? 0
      if (u == "lbs") {
        zero = Number((zero * 2204.62).toFixed(0))
        tare = Number((tare * 2204.62).toFixed(0))
      } else if (u == "kg") {
        zero = Number((zero * 1000).toFixed(0));
        tare = Number((tare * 1000).toFixed(0));
      } else {
        zero = Number(parseFloat(String(zero)).toFixed(3));
        tare = Number(parseFloat(String(tare)).toFixed(3));
      }
      const lc_battery: any = false;

      if (parseInt(lc + '') >= 1 && parseInt(lc + '') <= 10) {
        // realval = realval/100;
        // weight = weight/100;
        const speedInMetersPerSecond = realval;
        const targetUnit = liveProject?.windmeter_units;
        const weight: number = f_convert_wind_speed(speedInMetersPerSecond, targetUnit);
        if (liveProject?.id) {
          maybeLogLcValue(lc, liveProject.id, weight, realval, overload, underload, lc_btry);
        }
        const windLcItem = currentLcs.current?.find(item => item.id === lc.toString()) 
          || lcs.find(item => item.id === lc.toString());
        if (windLcItem) {
          const bid = lc.toString();
          lcDisplayBufferRef.current[bid] = { ...lcDisplayBufferRef.current[bid], value: parseFloat(realval).toFixed(fx) };
          touchLcFreshnessInRef(bid, { value: parseFloat(realval).toFixed(fx), realval });
        } else {
          console.warn('[BT_PARSE] Windmeter LC not found in project:', lc, 'Available LCs:', lcs.map(l => l.id));
        }

        if (weight > f_convert_wind_speed(overload, targetUnit)) {
          // fire_overwind(lc, weight, f_convert_wind_speed(overload, targetUnit), 1)
        } else {
          ////console.log('else wieght > convert_wind_speed(...)');
        }

        if (lc_battery) {
          //console.log('battery wind meter');
        } else if (!max) {
          //console.log('lc_max is false');
        }
        draw_chart_line(lc, weight);
      } else {

        weight = weight / calibrationOffset;
        realval = realval / calibrationOffset;
        let weightnotare: any;
        const lc_tare = false;
        if (statusTare) {
          weightnotare = weight + tare + Number(zero);
          weight = weight + Number(zero);
        } else {
          weightnotare = weight + Number(zero);
          weight = weight + Number(zero);
        }

        if (isNaN(psw)) {
          l.psw = '0';
        }

        let wpsw: any = parseFloat(weight) + psw;
        let p: any = (wpsw / overload) * 100;
        p = (u == "lbs" || u == "kg") ? p.toFixed(0) : p.toFixed(3);
        wpsw = (u == "lbs" || u == "kg") ? wpsw.toFixed(0) : wpsw.toFixed(3);


        // m = parseInt($("#monitor_table tr[data-id='" + lc + "'] [data-max] m").first().text());
        const m = 0;

        if (l?.psw) {
          weight = (parseFloat(weight) + parseFloat(l?.psw)).toFixed(fx);
          weightnotare = (parseFloat(weightnotare) + parseFloat(l?.psw)).toFixed(fx);
        }
        const bid = lc.toString();
        // Apply per-LC resolution (capacity table) before publishing to UI/logs.
        const grossNumeric = Number(weight);
        const netNumericRaw = Number(weightnotare);
        const quantizedGross = Number.isFinite(grossNumeric)
          ? (lcResolution != null ? quantizeByResolution(grossNumeric, lcResolution) : grossNumeric)
          : NaN;
        const quantizedNet = Number.isFinite(netNumericRaw)
          ? (lcResolution != null ? quantizeByResolution(netNumericRaw, lcResolution) : netNumericRaw)
          : NaN;
        const w = (weight === 'Tr.Err' || !Number.isFinite(quantizedGross))
          ? 'Tr.Err'
          : formatWeightByLcResolution(quantizedGross, lc, u, fx);
        const wn = Number.isFinite(quantizedNet)
          ? formatWeightByLcResolution(quantizedNet, lc, u, fx)
          : weightnotare;
        //const maxVal = l?.max && parseFloat(l?.max) >= 0 ? (realval >= 0 ? (realval > parseFloat(l?.max) ? realval : l?.max) : 0) : (realval >= 0 ? realval : 0);
        
        // Cambia realval por weightnotare para que el máximo use las unidades del proyecto (KG/LB)
        const currentMax = l?.max ? parseFloat(String(l.max)) : 0;
        const weightNum = parseFloat(String(wn)); // wn es el weightnotare calculado arriba
        const maxVal = weightNum > currentMax ? weightNum : currentMax;

        
        
        lcDisplayBufferRef.current[bid] = {
          ...lcDisplayBufferRef.current[bid],
          value: w,
          weightnotare: wn,
          realval,
          weight: w,
          max: maxVal,
          time: format(new Date(), 'pp'),
          overload,
          underload,
        };
        touchLcFreshnessInRef(bid, {
          value: w,
          realval,
          max: maxVal,
          time: format(new Date(), 'pp'),
          overload,
          underload,
        });
        const nowUnitsLog = Date.now();
        if (nowUnitsLog - (unitsDisplayLogLastRef.current[bid] ?? 0) > 4000) {
          unitsDisplayLogLastRef.current[bid] = nowUnitsLog;
        }
        weight = parseFloat(w);
        weightnotare = parseFloat(wn);
        weight = formatWeightByLcResolution(weight, lc, u, fx);
        const weighttolog = formatWeightByLcResolution(weightnotare, lc, u, fx);
        //update_max_value_by_lc_id(lc, weightnotare, u)
        const preoverload_precent = getPreOverloadThreshold(overload, active_project.pre_overload) ?? 0;

        const grossValueNumeric = parseFloat(w);
        const useNetForDisplay = tareStatusRef.current && statusTare;
        const netValueNumeric = useNetForDisplay ? weightnotare : grossValueNumeric;
        const displayValueNumeric = useNetForDisplay ? netValueNumeric : grossValueNumeric;
        // Safety alarms MUST always use gross (physical load), never net/tare-adjusted.
        const safetyValueNumeric = grossValueNumeric;
        const valueToSaveForWarning = formatWeightByLcResolution(safetyValueNumeric, lc, u, fx);

        let lcAlertKey = `lc-${lc}`; // Clave única para esta celda
        
        if (safetyValueNumeric < underload) {

          
            // underload!! alert
            // we must quit max mode and show the danger
            lcAlertKey += "underload";
            // UNDERLOAD alert
            if (!activeAlertsRef.current.has(lcAlertKey)) 
            {
                const timeNow = Date.now();
              // 1. Notificación Visual y Sonora (EL PUENTE)
            const typeMsg = safetyValueNumeric < underload ? "UNDERLOAD" : "OVERLOAD";
            toast.error(`LC ${lc}: ${typeMsg}! Value: ${valueToSaveForWarning}`, { toastId: lcAlertKey });
            //play_beep(4);

            maxStatusToggle(false)
            loadStatusToggle(true)
            // 1. Creamos el objeto de la nueva alerta
            const newWarning = {
              id: `warn-${lc}-${timeNow}-${Math.random().toString(36).substr(2, 5)}`, // ID ÚNICO REAL Date.now() + warnId++, // Usamos Date.now() para que el ID sea único y no se resetee
              log_date: format(new Date(), "HH:mm"),
              title: (l?.title) ? l?.title : l?.id,
              value: valueToSaveForWarning,
              underload: l?.underload,
              overload: l?.overload,
              lc_id: lc,
              project_id: curProjectRef.current.id
            };

            const updatedList = [newWarning, ...warnListRef.current];
            // 2. Pasamos el arreglo completo: la nueva alerta PRIMERO, luego el resto (...warnList)
            // Actualizamos la REF inmediatamente (Sincrónico) para que la siguiente LC la vea
            warnListRef.current = updatedList;


            //updateWarnList(updatedList);
            // --- EN LUGAR DE LLAMAR A updateWarnList(updatedList) DIRECTAMENTE: ---
            pendingWarnListRef.current = updatedList; // Lo guardamos para el Batcher
            playSafetyBeepIfDue({ title: typeMsg, body: `LC ${lc}: ${valueToSaveForWarning}` });
            registerSafetyAlertKey(lcAlertKey);
           // fire_lc_overload(lc, valueToSaveForWarning, l.underload , 'total');
            }
          } else if (safetyValueNumeric > overload) {

            const danger = (((parseFloat(String(weight)) / overload) * 100) > 129) ? true : false;

            const typeMsg = danger ? "DANGER" : "OVERLOAD";
            danger ? lcAlertKey += "danger" : lcAlertKey += "overload";
            // OVERLOAD alert
            if (!activeAlertsRef.current.has(lcAlertKey)) 
            {
            maxStatusToggle(false)
            loadStatusToggle(true)
            
            toast.error(`LC ${lc}: ${typeMsg}! Value: ${valueToSaveForWarning}`, { toastId: lcAlertKey });
            //play_beep(4);
            
            const timeNow = Date.now();
            const newWarning = {
              id: `warn-${lc}-${timeNow}-${Math.random().toString(36).substr(2, 5)}`, // ID ÚNICO REAL warnId++,
              log_date: format(new Date(), "HH:mm"),
              title: (l?.title) ? l?.title : l?.id,
              value: valueToSaveForWarning,
              underload: l?.underload,
              overload: l?.overload,
              lc_id:lc,
              project_id:curProjectRef.current.id
            };

            const updatedList = [newWarning, ...warnListRef.current];
            warnListRef.current = updatedList;

            //updateWarnList(updatedList)
            // --- EN LUGAR DE LLAMAR A updateWarnList(updatedList) DIRECTAMENTE: ---
            pendingWarnListRef.current = updatedList; // Lo guardamos para el Batcher
            playSafetyBeepIfDue({ title: typeMsg, body: `LC ${lc}: ${valueToSaveForWarning}` });
            registerSafetyAlertKey(lcAlertKey);
            }
          } else if (safetyValueNumeric > preoverload_precent) {
            // PRE-OVERLOAD alert
            lcAlertKey += "preoverload"
            if (!activeAlertsRef.current.has(lcAlertKey)) {
            updateWarnList({
              id:warnId++,
              log_date: format(new Date(), "HH:mm"),
              title: (l?.title) ? l?.title : l?.id,
              value: valueToSaveForWarning,
              underload: l?.underload,
              overload: l?.overload,
              lc_id:lc,
              project_id:curProjectRef.current.id
            })
            
            registerSafetyAlertKey(lcAlertKey);
          }

          }
          else 
          {
              // ESTADO NORMAL: Si la celda sale de cualquier alerta, liberamos la guardia
              lcAlertKey = `lc-${lc}` + "underload"; 
              activeAlertsRef.current.delete(lcAlertKey);
              lcAlertKey = `lc-${lc}` + "danger"; 
              activeAlertsRef.current.delete(lcAlertKey);
              lcAlertKey = `lc-${lc}` + "overload"; 
              activeAlertsRef.current.delete(lcAlertKey);
              lcAlertKey = `lc-${lc}` + "preoverload"; 
              activeAlertsRef.current.delete(lcAlertKey);
          }
        if (weightnotare >= underload && weightnotare <= overload && weightnotare <= preoverload_precent) {
          if (a[2] == 55 && parseInt(a[10] + '').toString(2).length == 8) {
            weight = weight - tare;
            weightnotare = weightnotare - tare;
          }
        }


        // --- LÓGICA CENTRALIZADA CON GUARDIA ---
        let nextGroups = [...groupsRef.current]; // Copia para actualización visual
        let groupsChanged = false;


        const tareEnabled = !!tareStatusRef.current;
        const projectGroups = groupsRef.current.filter(g => normalizeProjectId(g.project_id) === normalizeProjectId(curProjectRef.current.id));
        const latestProjectLcs = (lcsRef?.current ?? []).filter(
          (item: any) => normalizeProjectId(item.project_id) === normalizeProjectId(curProjectRef.current.id)
        );
        // Use one coherent source for totals: latest context LC list, but override the currently
        // parsed LC with fresh values from this packet so sums and tiles stay in sync.
        const effectiveProjectLcs = latestProjectLcs.map((item: any) => {
          if (String(item.id) !== lc.toString()) return item;
          return {
            ...item,
            value: w,
            weightnotare: wn,
            status_tare: statusTare,
            tare,
          };
        });
        const getDisplayValueNum = (item: any): number => {
          if (item.value === 'Tr.Err') return 0;
          const useNet = tareEnabled && item.status_tare && item.weightnotare != null && item.weightnotare !== '';
          const raw = useNet ? item.weightnotare : item.value;
          const n = Number(raw);
          return Number.isFinite(n) ? n : 0;
        };
        const getGrossValueNum = (item: any): number => {
          if (item.value === 'Tr.Err') return 0;
          const n = Number(item.value);
          return Number.isFinite(n) ? n : 0;
        };

        projectGroups.forEach(group => {
          const lcsInGroup = effectiveProjectLcs
            .filter(item =>
              item.groups && item.groups.split(',').map((s: string) => s.trim()).includes(String(group.id))
            );

          // 1. Verificamos si hay algún error para el DISPLAY (UI)
          const hasErrorInGroup = lcsInGroup.some(item => {
            const isCurrentLC = (item.id === lc.toString());
            return !isCurrentLC && item.value === 'Tr.Err';
          });

          const groupGrossSum = lcsInGroup.reduce((acc, item) => acc + getGrossValueNum(item), 0);
          const groupDisplaySum = lcsInGroup.reduce((acc, item) => acc + getDisplayValueNum(item), 0);

          // 1. ACTUALIZACIÓN VISUAL (Lo que te faltaba)
          const finalSumStr = hasErrorInGroup ? 'Tr.Err' : groupDisplaySum.toFixed(fx);
          
          
          const gIdx = nextGroups.findIndex(g => g.id === group.id);
          if (gIdx !== -1 && nextGroups[gIdx].sum !== finalSumStr) {
            nextGroups[gIdx] = { ...nextGroups[gIdx], sum: finalSumStr };
            groupsChanged = true;
          }

          let alertKey = `group-${group.id}`; // Identificador único para la guardia

          if (group.overload && groupGrossSum > Number(group.overload)) {
            // GUARDIA: Solo si NO estaba ya en alerta, grabamos en el historial
            alertKey += "overload";
            if (!activeAlertsRef.current.has(alertKey)) {
              const timeNow = Date.now();

              const newWarning = {
                id: `warn-${group.id}-${timeNow}-${Math.random().toString(36).substr(2, 5)}`, // ID ÚNICO REAL warnId++,
                log_date: format(new Date(), "HH:mm"),
                lc_id: `Group ${group.id}`,
                value: (u === 'mton') ? groupGrossSum.toFixed(3) : groupGrossSum.toFixed(0),
                overload: group.overload,
                project_id: curProjectRef.current.id
              };

              toast.error(`Group-${group.id}: OVERLOAD! Value: ${groupGrossSum}`, { toastId: lcAlertKey });
              //play_beep(4);
              const updatedList = [newWarning, ...warnListRef.current];
              warnListRef.current = updatedList;
              //updateWarnList(updatedList);
              // --- EN LUGAR DE LLAMAR A updateWarnList(updatedList) DIRECTAMENTE: ---
              pendingWarnListRef.current = updatedList; // Lo guardamos para el Batcher
              playSafetyBeepIfDue({ title: 'OVERLOAD', body: `Group ${group.id}: ${groupGrossSum}` });
              registerSafetyAlertKey(alertKey);
            }
          } else {
            // Si el peso bajó del límite, quitamos la marca para permitir futuras alertas
            alertKey = `group-${group.id}`+"overload";
            activeAlertsRef.current.delete(alertKey);
          }
        });

        // Solo disparamos la actualización si realmente cambió algún valor
        if (groupsChanged) {
          pendingGroupsRef.current = nextGroups; // updateGroups(nextGroups.sort((a, b) => parseInt(a.id || '0') - parseInt(b.id || '0')));
        }

        // 5. LÓGICA DE SUMA TOTAL (TOTAL SUM)
        // FIX TS: Usamos !!item.total_sum para evaluar el booleano correctamente
        const totalSumLcs = effectiveProjectLcs
          .filter(item => !!item.total_sum || String(item.total_sum) === '1')
          ;
        
        // Verificamos si hay algún error de transmisión en las celdas del total
        const hasTotalError = totalSumLcs.some(item => item.value === 'Tr.Err');


        const totalSumGrossValue = totalSumLcs.reduce((acc, item) => acc + getGrossValueNum(item), 0);
        const totalSumDisplayValue = totalSumLcs.reduce((acc, item) => acc + getDisplayValueNum(item), 0);

        // EL PUENTE: Actualizamos el encabezado visual
        if (hasTotalError) {
          updateTotalWeightHtml('<span class="text-xs font-bold bg-danger text-white px-1.5 py-0.5 rounded">Tr. Err</span>');
        } else {
          const formattedTotal = (u === 'mton') ? totalSumDisplayValue.toFixed(3) : totalSumDisplayValue.toFixed(0);
          pendingTotalHtmlRef.current = formattedTotal; //updateTotalWeightHtml(formattedTotal);
        }

        const totalAlertKey = 'total-sum-alert';

        if (!hasTotalError && curProjectRef.current.total_overload && totalSumGrossValue > Number(curProjectRef.current.total_overload)) {
          // GUARDIA para Suma Total
          if (!activeAlertsRef.current.has(totalAlertKey)) {
            const timeNow = Date.now();
            const newWarning = {
              id: `warn-${totalAlertKey}-${timeNow}-${Math.random().toString(36).substr(2, 5)}`, // ID ÚNICO REAL warnId++,
              log_date: format(new Date(), "HH:mm"),
              lc_id: 'Total Sum',
              value: (u === 'mton') ? totalSumGrossValue.toFixed(3) : totalSumGrossValue.toFixed(0),
              overload: curProjectRef.current.total_overload,
              project_id: curProjectRef.current.id
            };
            toast.error(`Total Sum: OVERLOAD! Value: ${(u === 'mton') ? totalSumGrossValue.toFixed(3) : totalSumGrossValue.toFixed(0)}`);

            const updatedList = [newWarning, ...warnListRef.current];

            warnListRef.current = updatedList;



            //updateWarnList(updatedList);
            // --- EN LUGAR DE LLAMAR A updateWarnList(updatedList) DIRECTAMENTE: ---
            pendingWarnListRef.current = updatedList; // Lo guardamos para el Batcher
            playSafetyBeepIfDue({
              title: 'TOTAL OVERLOAD',
              body: `Total Sum: ${(u === 'mton') ? totalSumGrossValue.toFixed(3) : totalSumGrossValue.toFixed(0)}`,
            });
            registerSafetyAlertKey(totalAlertKey);
          }
        } else {
          activeAlertsRef.current.delete(totalAlertKey);
        }

        if (a[2] == 55 && parseInt(a[10] + '').toString(2).length == 7) {
          onTareAction('untare', '0');
        }

        if (liveProject?.id) {
          maybeLogLcValue(lc, liveProject.id, weight, realval, l?.overload, l?.underload, lc_btry);
        }
        draw_chart_line(lc, weight);

        // for calibration process

        const in_group = (lcsRef?.current ?? lcs).find(
          (x: any) => x.id == lc && normalizeProjectId(x.project_id) === liveProjectIdNorm
        );
        const proof_test = {
          status: 1,
          selected_group: '',
          last_read: 1,
          proof_chart: {
            data: {
              datasets: [
                {
                  data: ['none']
                }
              ],
              labels: [getTime(new Date())]
            },
            update: () => {
              //console.log('chart update')
            }
          }
        }
        if (proof_test.status == 1 && in_group?.groups?.split(',').includes(proof_test.selected_group)) {
          f_log_prooftest_value(lc, active_project.id, weight, realval, l?.overload, l?.underload, proof_test.selected_group);
          proof_test.last_read = getUnixTime(new Date());
          // $("#proof_current_read").val(weight);
          const chart = proof_test.proof_chart;
          if (chart.data.datasets.length > 0) {
            const s = getTime(new Date());
            if (!chart.data.labels.includes(s)) {
              chart.data.labels.push(s);
            }
            chart.data.datasets.forEach((item, i) => {
              chart.data.datasets[i].data.push(weight);
              chart.update();
            });
          }
        }
      }
    }
  }

  const bt_exponentialBackoff = (max: any, delay: any, toTry: any, success: any, fail: any) => {
    //console.log('===bt_exponentialBackoff===')
    toTry().then((result: any) => success(result)).catch((_: any) => {
      // device.addEventListener('gattserverdisconnected', onBtDisconnected);

      if (max === 0) {
        return fail();
      }
      setTimeout(function () {
        bt_exponentialBackoff(--max, delay * 2, toTry, success, fail);
      }, delay * 1000);
    });
  }



  const fire_lc_overload = (lc: number, weight: any, overload: any, type: any) => {
    const u = curProject.units?.toLowerCase().replace('.', '') //for m.ton;
    const fx = (u == "mton") ? 3 : 0;
    lcs.forEach((item: any, index: number) => {
      if (item.id == lc) {
        if (type === 'speed')
          Swal.fire({
            title: '',
            html: "<h2 class='bg-danger text-white'>DANGER - WIND SPEED!</h2><h2 class='bg-danger text-white'>Windmeter: " + lc + "</h2><h2 class='bg-danger text-white'>Speed: " + parseFloat(weight).toFixed(fx) + " | Capacity: " + parseFloat(overload).toFixed(fx) + "</h2>",
            heightAuto: false,
          });
        else
          Swal.fire({
            title: '',
            html: "<h2 class='bg-danger text-white'>OVERLOAD!</h2><h2 class='bg-danger text-white'>LC: " + lc + "</h2><h2 class='bg-danger text-white'>Weight: " + parseFloat(weight).toFixed(fx) + " | Overload: " + parseFloat(overload).toFixed(fx) + "</h2>",
            heightAuto: false,
          });
        // navigator.notification.beep(4);
        // if (lc_wind_alerts.length > 0)
        //   lc_wind_alerts[index].last_alert = new Date().getTime()
        // }
      }
    })
  }

  useEffect(() => {
    const hasChanged = JSON.stringify(LCMaxBYID.current) !== JSON.stringify(LCMax);
    if (!hasChanged) {
      return;
    }
    LCMaxBYID.current = LCMax
  }, [LCMax])
  const update_max_value_by_lc_id = (lc: number, weightnotare: number, u: any) => {
    let updatedArray;
    let ifUpdate = false;
    if (LCMaxBYID.current.length > 0) {
      const existingObject = LCMaxBYID.current.find((obj: any) => obj.id === lc);
      if (existingObject) {
        updatedArray = LCMaxBYID.current.map(obj => {
          if (obj.id === lc && obj.max < weightnotare) {
            ifUpdate = true
            return { ...obj, max: weightnotare >= 0 ? weightnotare : 0 };
          }
          return obj;
        });
      } else {
        ifUpdate = true
        updatedArray = [...LCMaxBYID.current, { id: lc, max: weightnotare >= 0 ? weightnotare : 0 }];
      }
    }
    else {
      ifUpdate = true
      updatedArray = [{ id: lc, max: weightnotare >= 0 ? weightnotare : 0 }]

    }
    if (ifUpdate)
      updateLCMax(updatedArray)
  }
  const fire_lc_underload = (lc: number, weight: any, underload: any) => {
    //console.log('fire_underload ', lc, weight, underload)
    const u = curProject.units?.toLowerCase().replace('.', '') //for m.ton;
    const fx = (u == "mton") ? 3 : 0;
    lcs.forEach((item: any, index: number) => {
      if (item.id == lc) {
        // const c = new Date().getTime();
        // const d = new Date(item.last_alert).getTime();
        const o = "UNDERLOAD!";

        // if ((c - d) > 20000) {
        // $(".warning").addClass('active');
        Swal.fire({
          title: '',
          html: "<h2 class='bg-danger text-white'>" + o + "!</h2><h2 class='bg-danger text-white'>LC: " + lc + "</h2><h2 class='bg-danger text-white'>Weight: " + parseFloat(weight).toFixed(fx) + " | Underload: " + parseFloat(underload).toFixed(fx) + "</h2>",
          heightAuto: false,
        });
        // navigator.notification.beep(4);
        lc_overload_alerts[index].last_alert = new Date().getTime()
        // }
      }
    })
  }

  const draw_chart_line = (_lc: number, _weight: any) => {
    void 0; // placeholder; chart drawing can be implemented here
  }

  const schedulePrrAutoReconnect = (targetDeviceId: string, reason: string) => {
    if (!targetDeviceId) return;
    if (prrManualDisconnectRef.current[targetDeviceId]) return;
    if (prrReconnectInProgressRef.current[targetDeviceId]) return;
    if (prrReconnectTimersRef.current[targetDeviceId]) return;
    const scheduleEpoch = (prrReconnectEpochRef.current[targetDeviceId] ?? 0);

    const attempt = (prrReconnectAttemptsRef.current[targetDeviceId] ?? 0) + 1;
    const delay = Math.min(PRR_RECONNECT_MAX_MS, PRR_RECONNECT_BASE_MS * Math.pow(2, Math.max(0, attempt - 1)));
    prrReconnectTimersRef.current[targetDeviceId] = setTimeout(async () => {
      prrReconnectTimersRef.current[targetDeviceId] = null;
      if (scheduleEpoch !== (prrReconnectEpochRef.current[targetDeviceId] ?? 0)) {
        return;
      }
      const isAlreadyConnected = connectedPrrDevicesRef.current.some((d) => String(d.deviceId) === String(targetDeviceId));
      if (isAlreadyConnected) {
        prrReconnectAttemptsRef.current[targetDeviceId] = 0;
        return;
      }
      const reconnectDeviceId = targetDeviceId;
      if (!reconnectDeviceId) return;
      if (scheduleEpoch !== (prrReconnectEpochRef.current[targetDeviceId] ?? 0)) return;

      prrReconnectInProgressRef.current[targetDeviceId] = true;
      prrReconnectAttemptsRef.current[targetDeviceId] = attempt;
      void logEvent("WARN", "PRR auto-reconnect attempt", { attempt, delay, reason, reconnectDeviceId }, "BLE");
      let shouldRetry = false;
      try {
        // Defensive cleanup; ignore errors if stack already dropped link.
        await BleClient.disconnect(reconnectDeviceId).catch(() => undefined);
        const ok = await bleConnectToDevice(
          reconnectDeviceId,
          "prr",
          (prrDisplayNameByDeviceRef.current[reconnectDeviceId] && prrDisplayNameByDeviceRef.current[reconnectDeviceId]?.trim()) || undefined
        );
        shouldRetry = !ok;
      } catch (error) {
        void logEvent("ERROR", "PRR auto-reconnect failed", { attempt, error: String((error as any)?.message || error) }, "BLE");
        shouldRetry = true;
      } finally {
        prrReconnectInProgressRef.current[targetDeviceId] = false;
        if (scheduleEpoch !== (prrReconnectEpochRef.current[targetDeviceId] ?? 0)) {
          return;
        }
        if (shouldRetry) {
          schedulePrrAutoReconnect(targetDeviceId, "retry_after_failure");
        }
      }
    }, delay);
  };

  function bt_disconnect(deviceId: string): void {
    const disconnected = connectedPrrDevicesRef.current.find((d) => String(d.deviceId) === String(deviceId));
    const reportLabel = disconnected ? ((disconnected.displayName && disconnected.displayName.trim()) || disconnected.deviceId) : null;
    let shouldReconnectThisDevice = false;
    const wasManual = !!prrManualDisconnectRef.current[deviceId];
    setConnectedPrrDevices((prev) => {
      const remaining = prev.filter((d) => String(d.deviceId) !== String(deviceId));
      if (prrBleDeviceIdRef.current && String(prrBleDeviceIdRef.current) === String(deviceId)) {
        const nextPrimary = remaining[0] || null;
        prrBleDeviceIdRef.current = nextPrimary?.deviceId || null;
        prrBleDisplayNameRef.current =
          (nextPrimary?.displayName && nextPrimary.displayName.trim()) || nextPrimary?.deviceId || null;
      }
      shouldReconnectThisDevice = !wasManual;
      updateBleConnected(remaining.length > 0);
      return remaining;
    });
    setPrrBatteryByDevice((prev) => {
      if (!(deviceId in prev)) return prev;
      const next = { ...prev };
      delete next[deviceId];
      return next;
    });
    if (reportLabel) {
      logPrrLinkEventSafely('disconnected', reportLabel);
    }
    if (shouldReconnectThisDevice) {
      schedulePrrAutoReconnect(deviceId, "disconnect_callback");
    }
  }

  const disconnectPrrWithConfirm = async (deviceId: string, label: string) => {
    if (!deviceId) return;
    const res = await Swal.fire({
      title: 'Disconnect PRR',
      text: `Are you sure you want to disconnect from PRR ${label}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Disconnect',
      cancelButtonText: 'Cancel',
      heightAuto: false,
    });
    if (!res.isConfirmed) return;

    prrManualDisconnectRef.current[deviceId] = true;
    // Cancel pending reconnect work for this device.
    prrReconnectEpochRef.current[deviceId] = (prrReconnectEpochRef.current[deviceId] ?? 0) + 1;
    prrReconnectAttemptsRef.current[deviceId] = 0;
    prrReconnectInProgressRef.current[deviceId] = false;
    if (prrReconnectTimersRef.current[deviceId]) {
      clearTimeout(prrReconnectTimersRef.current[deviceId] as ReturnType<typeof setTimeout>);
      prrReconnectTimersRef.current[deviceId] = null;
    }

    try {
      await BleClient.disconnect(deviceId);
    } catch (_) {
      // Some platforms may already be disconnected.
    } finally {
      // Ensure UI state clears even if native callback doesn't fire.
      bt_disconnect(deviceId);
      delete prrManualDisconnectRef.current[deviceId];
    }
  };

  // Fallback path: if a platform misses native disconnect callback ordering,
  // still emit PRR link events based on BLE state transitions (dedupe-protected).
  useEffect(() => {
    const prev = prevBlePrrStateRef.current;
    if (prev === null) {
      prevBlePrrStateRef.current = bleConnected;
      return;
    }
    if (bleConnected !== prev) {
      logPrrLinkEventSafely(bleConnected ? 'connected' : 'disconnected');
    }
    prevBlePrrStateRef.current = bleConnected;
  }, [bleConnected, active_project?.id, active_project?.cycle]);

  const usb_scan = () => {
    //console.log('')
  }

  const bt_auto_reconnect = () => {
    connectedPrrDevicesRef.current.forEach((d) => {
      schedulePrrAutoReconnect(d.deviceId, "manual_call")
    });
  }

  const bt_read = async (device_id: any, service_uuid: any, characteristic_uuid: any) => {
    try {
      const res = await BleClient.read(device_id, service_uuid, characteristic_uuid);
      //console.log(JSON.stringify(new Uint8Array(res.buffer)));
    } catch (err) {
      //console.log('Read BT data failed')
    }
  }

  const bt_browser_notify = (event: any) => {
    const value = event.target.value.buffer;
    const a = new Uint8Array(value);
    bt_notify(a, "", "")
  }

  const bt_notify = async (device_id: any, service_uuid: any, characteristic_uuid: any) => {
    if (platformType === 'web') {
      bt_parse(device_id)
    } else {
      BleClient.startNotifications(device_id, service_uuid, characteristic_uuid, function (buffer: any) {
        const a = new Uint8Array(buffer);
        bt_parse(a);
      });
    }
  }

  const onBtDisconnected = () => {
    //console.log('===onBtDisconnected===')
    //console.log('Device disconnected', event);
    // Optionally, try to reconnect
    // connectToDevice();
  }

  const sum_overload = () => {
    //console.log('===sum_overload===')
    fire_error('Total Overload must be higher than 0');
  }

  const toggle_sidebar = () => {
    //console.log('===toggle_sidebar===')
    // $('#sidebar').toggleClass('active');
  }

  const show_sidebar = () => {
    //console.log('===show_sidebar===')
    // $('#sidebar').addClass('active');
  }

  const hide_sidebar = () => {
    //console.log('===hide_sidebar===')
    // $('#sidebar').removeClass('active');
  }

  const handleCloseModal = () => {
    updateVisibleModal('')
  }

  const handleSuccessClose = () => {
    updateSuccessStr('')
    setConfirmTitle('')
  }
  const imageUrlToBase64 = async (url: string): Promise<string> => {
    const data = await fetch(url);
    const blob = await data.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const base64data = reader.result as string || '';
        resolve(base64data);
      };
      reader.onerror = reject;
    });
  };
  const update_project_image = async (project_id: any, image: any, setInitialSize = true) => {
    try {
      await db.projects.update(project_id, { p_image: image });
      f_update_project_last_change();
      if (setInitialSize) {
        getImageDimensions(image).then(({ width, height }) => {
          f_update_project_image_size(project_id, width, height);
          f_update_project_image_position(project_id, 0, 0);
        }).catch(() => undefined);
      }
    } catch (err) {
      //console.log('error', err);
    }
  }
  const verify_settings = () => {
    if (curProject === null) {
      return;
    }
    let result = { verify: "ok", group: null }
    groupsRef.current.forEach(function (group: any) {
      if (parseInt(group.group_id) > 0) {
        if (group.overload === 0) {
          result = { verify: "fail", group: group.group_id }
        }
      }
    });
    let found_lc_sum = false;
    lcs.forEach(function (lc: any) {
      if (lc.total_sum == 1) {
        found_lc_sum = true;
      }
    });

    if (!found_lc_sum) {
      result = { verify: "nosum", group: null }
    }

    // $("#settings .grp_h .bg-warning").each(function (a: any, b: any) {
    //   if ($("span", b).text() == 0) {
    //     result = { verify: "fail", group: a + 1 }
    //   }
    // });

    if (curProject.total_overload === null || curProject.total_overload === '0') {
      result = { verify: "nototaloverload", group: null }
    }

    return result;
  }

  const projectInformationAction = async (url: string) => {
    const imageBase64 = url.startsWith('data:') ? url : await imageUrlToBase64(url);
    const updatedProject = { ...active_project, p_image: imageBase64 as string }
    updateCurProject(updatedProject)
    updateProjects(updatedProject);
    // database.projects.upsert(dbHanlder, updatedProject)

    const projectsStore = db.projects;

    projectsStore.put(updatedProject).then(res => {
      //console.log('update image success: ', res)
    });

    getImageDimensions(imageBase64).then(({ width, height }) => {
      f_update_project_image_size(active_project.id, width, height);
      f_update_project_image_position(active_project.id, 0, 0);
    }).catch(() => undefined);

    updateSuccessStr(t('Msg.ConfirmHeader'))
    setConfirmTitle(t('Common.Confirm'))
  }

  const delete_project = () => {
    const project = projects.find(item => item.id === deleteProject)
    if (project) {
      updateLCs(lcs.filter(item => normalizeProjectId(item.project_id) !== normalizeProjectId(project.id)))
      updateProjects(projects.filter(item => item.id !== deleteProject))

      // database.deleteProject(dbHanlder, deleteProject)
      setDeleteProject('')

      const projectsTable = db.projects;
      const lcsTable = db.lcs;

      db.transaction('rw', projectsTable, lcsTable, function () {
        projectsTable
          .where('id')
          .equals(parseInt(project.id))
          .delete()
          .then(function () {
            //console.log('Project deleted successfully');
            return lcsTable.filter((lc: any) => normalizeProjectId(lc.project_id) === normalizeProjectId(project.id)).delete();
          })
          .then(function () {
            //console.log('Associated LCS records deleted successfully');
          })
          .catch(function (error) {
            console.error('Error deleting project: ' + error);
          });
      }).then(function () {
        // Successfully completed the transaction
        load_projects();
      }).catch(function (error) {
        console.error('Transaction error: ' + error);
      });
    }
  }
  const handleAlertClear = () => {
    const pid = curProject?.id != null ? normalizeProjectId(curProject.id) : null;
    if (pid == null) return;
    const rest = warnList.filter(item => normalizeProjectId(item.project_id) !== pid);
    updateWarnList(rest);

    // REINICIAMOS LA GUARDIA: Permite que las celdas que sigan en overload 
    // vuelvan a registrarse si el usuario así lo desea tras limpiar.
    activeAlertsRef.current.clear();

    updateVisibleModal('');
  }

  const isDark = useMemo(() => mode === 'dark', [mode])
  const touchMenuOpenAtRef = useRef(0)
  const openMainMenu = () => {
    const menuEl = document.querySelector('ion-menu') as HTMLIonMenuElement | null
    if (!menuEl) return
    void menuEl.open()
  }
  const handleHamburgerPointerUp = (ev: React.PointerEvent<HTMLButtonElement>) => {
    if (ev.pointerType !== 'touch') return
    touchMenuOpenAtRef.current = Date.now()
    openMainMenu()
  }
  const handleHamburgerClick = () => {
    if (Date.now() - touchMenuOpenAtRef.current < 700) return
    openMainMenu()
  }

  return (
    <IonPage key={layoutKey}>
      <IonHeader>
        <IonToolbar style={{ '--min-height': '64px' }}>
          <IonButtons slot="start">
            <button
              type="button"
              className="menu-hamburger-btn bg-transparent border-0 p-2 cursor-pointer flex items-center justify-center"
              onPointerUp={handleHamburgerPointerUp}
              onClick={handleHamburgerClick}
              aria-label="Open menu"
            >
              <IonIcon
                icon={menuOutline}
                className="menu-hamburger-icon text-2xl"
              />
            </button>
          </IonButtons>
          {location.pathname === ROUTES.Monitor &&
            <div className='flex flex-row justify-between'>
              <div className='flex flex-row items-center gap-4'>
                <div className='flex flex-col'>
                  <IonLabel className='!text-black dark:!text-white'>{t("Monitor.Header.TotalWeight")}</IonLabel>
                  {bleConnected ? (curProject.total_overload && (Number(totalWeightHtml)) > (Number(curProject.total_overload)) ?
                    <div className="text-xs font-bold bg-danger text-white px-1.5 py-0.5 rounded w-max" dangerouslySetInnerHTML={{ __html: totalWeightHtml }} />
                    : <div className='text-black dark:text-white' dangerouslySetInnerHTML={{ __html: totalWeightHtml }} />)

                    :
                    <span className="text-xs font-bold bg-danger text-white px-1.5 py-0.5 rounded w-max">{t("Common.TrErr")}</span>
                  }
                </div>
                {active_project.id ? (
                  <button
                    type='button'
                    className='monitor-units-chip shrink-0 px-3 py-1.5 rounded-lg border-2 border-primary bg-primary/15 dark:bg-primary/25 text-primary dark:text-[#7eb8ff] font-bold text-sm tracking-wide cursor-pointer shadow-sm hover:bg-primary/25 dark:hover:bg-primary/35 active:scale-[0.98] transition-all'
                    title={t('Monitor.Header.Units')}
                    onClick={() => {
                      setSettingModalMode('units-only');
                      setVisibleSetting(true);
                    }}
                  >
                    {t('Monitor.Header.Units')}: {active_project.units} | {active_project.windmeter_units}
                  </button>
                ) : null}
                <div className='flex flex-row items-center gap-1.5 shrink-0'>
                  <div className='relative flex items-center justify-center'>
                    <IonImg src={connected ? bleConnectIcon : bleDisConnectIcon} alt='ble' className='w-10' />
                  </div>
                  {connected && connectedPrrDevices.length > 0 ? (
                    <div className='flex flex-row items-start gap-2'>
                      {connectedPrrDevices.map((d) => {
                        const label = (d.displayName && d.displayName.trim()) || d.deviceId;
                        const batteryPct = Math.max(0, Math.min(100, Number(prrBatteryByDevice[d.deviceId] ?? 0)));
                        const batteryIcon = getBatteryIconForPercent(batteryPct);
                        return (
                          <div key={d.deviceId} className='flex flex-col items-center min-w-[4.5rem] max-w-[6.5rem]'>
                            <span
                              className='text-sm font-semibold text-black dark:text-white tabular-nums truncate leading-tight text-center w-full cursor-pointer'
                              title={label}
                              role="button"
                              tabIndex={0}
                              onClick={() => { void disconnectPrrWithConfirm(d.deviceId, label); }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  void disconnectPrrWithConfirm(d.deviceId, label);
                                }
                              }}
                            >
                              {label}
                            </span>
                            <div
                              className='relative mt-0.5 flex items-center justify-center cursor-pointer'
                              role="button"
                              tabIndex={0}
                              title={`Disconnect PRR ${label}`}
                              onClick={() => { void disconnectPrrWithConfirm(d.deviceId, label); }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  void disconnectPrrWithConfirm(d.deviceId, label);
                                }
                              }}
                            >
                              <FontAwesomeIcon icon={batteryIcon} size='lg' color={`${isDark ? 'grey' : 'black'}`} style={{ transform: 'scale(1.73)' }} />
                              <span className='absolute z-10 text-[9px] font-semibold leading-none text-white pointer-events-none'>
                                {`${batteryPct}%`}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
              {active_project.id && (
                <div className='flex items-center gap-1'>
                  <Text label={`${active_project.title} - ${t('Monitor.Header.Title')}`} />
                  {location.pathname === ROUTES.Monitor ? (
                    <>
                      <Text label="|" />
                      <div className="relative">
                        <button
                          type='button'
                          className='bg-transparent p-0 m-0 border-none cursor-pointer text-inherit'
                          onClick={() => setPlanDialogOpen(true)}
                        >
                          <Text label={monitorPlanName || 'General Plan'} />
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>
              )}
              <div className='flex flex-row items-end gap-2 pr-2'>
                <IonImg
                  src={warningErrorIcon}
                  className='h-10 w-10 cursor-pointer'
                  onClick={() => updateVisibleModal(ModalNames.WarningList)}
                />
                <IonImg
                  src={monitorIcon()}
                  className='h-10 w-10 cursor-pointer'
                  onClick={() => updateMonitorStatus()}
                />
                <IonImg src={max ? maxActiveIcon : maxIcon} className='h-10 w-10 cursor-pointer' onClick={() => maxStatusToggle(!max)} />
                <IonImg
                  src={tareStatus ? tareActiveIcon : tareIcon}
                  className='h-10 w-10 cursor-pointer'
                  onClick={() =>
                    toolbarTareClick
                      ? toolbarTareClick()
                      : tareStatusToggle
                        ? tareStatusToggle()
                        : updateTareStatus(!tareStatus)
                  }
                />
                <IonImg src={load ? loadIcon : battIcon} className='h-10 w-10 cursor-pointer' onClick={() => loadStatusToggle(!load)} />
                {location.pathname === ROUTES.Monitor && active_project.id ? (
                  <button
                    type='button'
                    className='h-10 w-10 rounded-full border border-gray-400 dark:border-gray-500 flex items-center justify-center text-gray-700 dark:text-gray-100 bg-transparent'
                    onClick={() => { void exportMonitorSnapshot(); }}
                    title='Export snapshot'
                  >
                    <IonIcon icon={documentOutline} className='text-xl' />
                  </button>
                ) : null}
              </div>
              {/* <IonTitle>{title || "Projects"}</IonTitle> */}
            </div>
          }
          {location.pathname === ROUTES.Settings && active_project.id &&
            <div>
              {/* <div>Project: {active_project?.title} </div> */}
              <div className='flex items-center justify-end gap-1.5 px-2 overflow-auto'>
                <div className='flex flex-row gap-1.5'>
                  <Text label={`${t('Project.Units')}: `} />
                  <Text label={Unit_List.find(item => item.value === active_project.units)?.title || ''} />
                  <Text label='|' />
                  <Text label={Windmeter_Unit_List.find(item => item.value === active_project.windmeter_units)?.short || ''} />
                  <Text label='|' />
                </div>
                <div className='flex flex-row gap-1.5'>
                  <Text label={`${t('Common.Projects')}: ${active_project?.title}`} />
                  <Button
                    title={t('Common.Settings')}
                    icon={settingsOutline}
                    onAction={() => {
                      setSettingModalMode('full');
                      setVisibleSetting(true);
                    }}
                  />
                  <Button
                    title={t('Common.Duplicate')}
                    icon={duplicateOutline}
                    onAction={() => duplicate_project()}
                  />
                  <Button
                    title={t('Common.Delete')}
                    icon={trashOutline}
                    onAction={() => setVisibleDelete(true)}
                  />
                </div>
              </div>
            </div>
          }
        </IonToolbar>
      </IonHeader>
      <IonContent
        className={
          platformType === 'android'
            ? location.pathname === ROUTES.Monitor
              ? 'monitor-safe-area-content'
              : 'safe-area-content'
            : ''
        }
        scrollY={!contentScrollDisabled}
      >
        {title && <IonLabel>{title}</IonLabel>}
        <div className={`flex flex-col min-h-0 ${classes}`}>
          {children}
        </div>
      </IonContent>
      <input
        ref={importFileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleImportFileChange}
      />
      {planDialogOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/50 flex items-center justify-center p-4" onClick={() => setPlanDialogOpen(false)}>
          <div
            className="w-full max-w-[560px] max-h-[70vh] overflow-auto rounded-lg border border-gray-400 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-dark dark:text-light">Plans</h3>
              <button className="text-sm px-2 py-1 rounded border border-gray-400 dark:border-gray-600" onClick={() => setPlanDialogOpen(false)}>Close</button>
            </div>
            <button
              className="w-full text-left px-3 py-2 text-sm rounded bg-primary text-white"
              onClick={() => {
                setPlanDialogOpen(false);
                onMonitorPlanCreate?.();
              }}
            >
              + New plan
            </button>
            <div className="my-2 border-t border-gray-300 dark:border-gray-700" />
            <div className="flex flex-col gap-1">
              {monitorPlans.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
                  <button
                    className="flex-1 text-left text-sm"
                    onClick={() => {
                      setPlanDialogOpen(false);
                      onMonitorPlanSelect?.(p.id);
                    }}
                  >
                    {p.name}
                  </button>
                  {String(p.name).trim().toLowerCase() === 'general plan' ? null : (
                    <>
                      <button className="text-xs px-2 py-1 border rounded" title="Edit groups" onClick={() => { setPlanDialogOpen(false); onMonitorPlanEdit?.(p.id); }}>Edit</button>
                      <button className="text-xs px-2 py-1 border rounded" title="Rename" onClick={() => { setPlanDialogOpen(false); onMonitorPlanRename?.(p.id); }}>Rename</button>
                      <button className="text-xs px-2 py-1 border rounded text-red-500 border-red-400" title="Delete" onClick={() => { setPlanDialogOpen(false); onMonitorPlanDelete?.(p.id); }}>Delete</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
      {importChooseName && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center p-4 bg-black/70"
          style={{ zIndex: 999999 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="choose-name-title"
        >
          <div
            className="bg-white dark:bg-dark rounded-lg shadow-xl max-w-sm w-full p-4 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="choose-name-title" className="text-lg font-semibold text-dark dark:text-light">{t('Project.ImportChooseNewName') || 'Choose new name'}</h2>
            <input
              ref={chooseNameInputRef}
              type="text"
              value={chooseNameInputValue}
              onChange={(e) => setChooseNameInputValue(e.target.value)}
              placeholder={t('Project.ImportChooseNewName') || 'Project name'}
              className="w-full border border-gray-400 dark:border-gray-500 rounded px-3 py-2 bg-white dark:bg-dark text-dark dark:text-light"
              autoComplete="off"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setImportChooseName(null);
                  setChooseNameInputValue('');
                }}
                className="px-3 py-1.5 rounded border border-gray-400 dark:border-gray-500 text-dark dark:text-light"
              >
                {t('Common.Cancel') || 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!chooseNameInputValue.trim() || projects.some((p) => (p.title || '').trim() === chooseNameInputValue.trim())}
                onClick={async () => {
                  const newName = chooseNameInputValue.trim();
                  if (!importChooseName || !newName || projects.some((p) => (p.title || '').trim() === newName)) return;
                  const csvToImport = f_replace_import_project_title(importChooseName.csvText, newName);
                  setImportChooseName(null);
                  setChooseNameInputValue('');
                  await doActualImport(csvToImport);
                }}
                className="px-3 py-1.5 rounded bg-primary text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('Common.Confirm') || 'Confirm'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      <ProjectListModal
        visible={visibleModal === MENUS.Projects}
        data={projectList}
        onSelect={get_project}
        onAction={() => handleShowNewProject()}
        onClose={() => updateVisibleModal('')}
        onExport={handleExportProject}
        onImport={handleImportProject}
      />
      <BeforeAlertModal
        visible={visibleBeforeAlert}
        onAction={() => setVisibleBeforeAlert(false)}
        onClose={() => setVisibleBeforeAlert(false)}
      />
      <NewProjectModal
        visible={visibleNew}
        dismiss={projectList.length > 0}
        onAction={insert_project}
        onClose={() => handleCloseNewProject()}
      />
      <ProjectSettingModal
        visible={visibleSetting}
        data={active_project}
        unitsOnly={settingModalMode === 'units-only'}
        onAction={handleSettingProject}
        onClose={() => {
          setVisibleSetting(false);
          setSettingModalMode('full');
        }}
      />
      <ErrorModal
        visible={errStr ? true : false}
        message={errStr}
        onClose={() => updateErrStr('')}
      />
      <SuccessModal
        visible={successStr ? true : false}
        title={confirmTitle}
        message={successStr}
        onClose={() => handleSuccessClose()}
      />
      <ProofTestModal
        visible={visibleModal === MENUS.ProofTest}
        groupList={groupList.filter(item => item.overload)}
        lcList={lcs.filter(item => item.groups)}
        unit={curProject.units || ''}
        data={selectedGroup}
        onClose={() => handleCloseModal()}
      />
      <TotalizerModal
        visible={visibleModal === MENUS.Totalizer}
        groups={groupsRef.current}
        lcs={lcs}
        onAction={() => handleCloseModal()}
        onClose={() => handleCloseModal()}
      />
      <DocumentModal
        visible={visibleModal === MENUS.Document}
        groups={groupsRef.current}
        lcs={lcs}
        onAction={() => handleCloseModal()}
        onClose={() => handleCloseModal()}
      />
      <ProjectInformationModal
        visible={visibleModal === ModalNames.ProjectInformation}
        onAction={projectInformationAction}
        onClose={() => handleCloseModal()}
      />
      <ProjectDeleteModal
        visible={visibleDelete}
        data={projectList}
        onSelect={setDeleteProject}
        onClose={() => setVisibleDelete(false)}
      />
      <DeleteConfirmModal
        visible={deleteProject ? true : false}
        message={t('Msg.ConfirmDeleteProject')}
        onAction={() => delete_project()}
        onClose={() => setDeleteProject('')}
      />
      <WarningListModal
        visible={visibleModal === ModalNames.WarningList}
        data={warnLogs}
        onClear={() => handleAlertClear()}
        onClose={() => handleCloseModal()}
      />

      <BleDeviceListModal
        isOpen={blePickerOpen}
        scanning={blePickerScanning}
        devices={blePickerDevices}
        onClose={handleBlePickerClose}
        onConnect={(id, name) => void handleBlePickerConnect(id, name)}
      />

      <IonAlert
        isOpen={showLocationAlert}
        onDidDismiss={() => setShowLocationAlert(false)}
        header={'Location Disabled'}
        message={'Android requires GPS to be enabled to scan for Bluetooth devices. Please enable it to continue.'}
        buttons={[
          {
            text: 'Cancel',
            role: 'cancel',
            cssClass: 'secondary',
          },
          {
            text: 'Go to Settings',
            handler: () => {
              // 1. Cerramos el estado del alerta primero
              setShowLocationAlert(false);

              // 2. Aumentamos el tiempo a 800ms para asegurar que la GPU 
              // termine la animación y no lance el error "Null anb"
              setTimeout(async () => {
                try {
                  //console.log("Launching NativeSettings command...");
                  
                  // Usamos la forma más básica y compatible: minúsculas y un solo parámetro
                  await NativeSettings.open({
                    option: 'location' 
                  } as any);

                } catch (err) {
                  // Si el método 'open' falla, intentamos el método alternativo 'openAndroid'
                  console.error("Critical error opening settings:", err);
                  try {
                    await (NativeSettings as any).openAndroid({
                      option: 'location'
                    });
                  } catch (innerErr) {
                    console.error("Error in NativeSettings:", innerErr);
                  }
                }
              }, 800); 

              return false; // Crucial para que Ionic no intente cerrar el alert dos veces
            },
},
        ]}
      />
    </IonPage>
  )
}

export default CommonLayout;


