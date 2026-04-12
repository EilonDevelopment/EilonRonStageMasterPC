import {
  IonAlert,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonImg,
  IonLabel,
  IonMenuButton,
  IonPage,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import React, { FC, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
// import { useLocation,  } from 'react-router';
import { useHistory, useLocation } from 'react-router-dom';
import { App as CapApp } from '@capacitor/app';
import { bluetoothOutline, checkmarkSharp, closeSharp, duplicateOutline, settingsOutline, trashOutline } from 'ionicons/icons';

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
import SelectDeviceModal from '../components/Modals/SelectDeviceModal';
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
import { db } from '../db';
import Swal from 'sweetalert2';
import { useTheme } from '@emotion/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBatteryEmpty, faBatteryQuarter, faBatteryHalf, faBatteryThreeQuarters, faBatteryFull, faBoltLightning, IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { format, getTime, getUnixTime } from 'date-fns';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
// COORDINATION (iOS Mac branch / Android Windows branch): BLE + native CSV import logic
// lives in `src/helper/nativeBleScan.ts` and `nativeProjectCsvImport.ts`. Prefer editing
// those files for platform rules so merges between branches stay small. / Coordinación:
// reglas nativas en los helpers, no duplicar aquí.
import { checkNativeBleScanPrerequisites } from '../helper/nativeBleScan';
import { pickProjectCsvText, shouldUseNativeCsvPickerForImport } from '../helper/nativeProjectCsvImport';
import { BLE_CONNECT_TIMEOUT_MS } from '../helper/bleConstants';
import { collectBleDevicesForService, type BleDiscoveredDevice } from '../helper/bleLeScanCollection';
import { toast } from 'react-toastify';
import useFunctions from '../hooks/useFunctions';

// Añade esto arriba con los demás imports
// @ts-ignore
import { NativeSettings, AndroidSettings } from 'capacitor-native-settings';
// 1. Asegúrate de importar Capacitor arriba
import { Capacitor } from '@capacitor/core';
import { logEvent } from '../services/LogService';


// import { log, time } from 'console'; // Removed - not available in browser/WebView
// import { current } from '@reduxjs/toolkit'; // Removed - unused import

interface CommonLayoutProps {
  title?: string;
  classes?: string;
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
}

// Display batching: flush interval (ms). Safety checks (overload/underload) run immediately per packet.
// Keep UI work bounded on Android WebView to avoid renderer overload (onRenderProcessGone).
const LC_DISPLAY_BATCH_MS_DEFAULT = 100;

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
const PRR_STALE_LC_MS = 8000;
/** If no BLE-driven updates hit dataTimeById for this long, declare full link loss and set all LCs to Tr.Err. */
const PRR_SILENCE_ALL_TRERR_MS = 15000;

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

const CommonLayout: FC<CommonLayoutProps> = props => {
  const {
    title = '',
    classes = '',
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
    lastUpdatedRef,
    dataTimeByIdRef,
    timeoutHandledRef,
    layoutRefreshRef,
    lcsRef,
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
  const [groupList, setGroupList] = useState<IGroup[]>([])

  const [visibleBeforeAlert, setVisibleBeforeAlert] = useState<boolean>(false);
  const [visibleNew, setVisibleNew] = useState<boolean>(false);
  const [visibleSetting, setVisibleSetting] = useState<boolean>(false);
  const [duplicated, setDuplicated] = useState<boolean>(false);
  const [confirmTitle, setConfirmTitle] = useState<string>('');

  const [visibleProof, setVisibleProof] = useState<boolean>(false);
  const [selectedGroup, setSelectedGroup] = useState<IProofTest | null>(null)
  const [connected, setConnected] = useState<boolean>(false);
  const [layoutKey, setLayoutKey] = useState(0);

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
  const [batteryIcon, setBatteryIcon] = useState<IconDefinition>(faBatteryEmpty)
  const [cycleStatus, setCycleStatus] = useState<boolean>(false)
  const [dataTimeById, setDataTimeById] = useState<any[]>([])
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [noChange, setNoChange] = useState(false);
  const [TrrLcs, setTrrLcs] = useState<any[]>(lcs)
  const batteryIconRef = useRef(batteryIcon)
  const currentUnitsRef = useRef(curProject.units)
  const curProjectRef=useRef(curProject)
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

  useEffect(() => {
    locationRef.current = location.pathname + location.search + (location.hash || '')
  }, [location.pathname, location.search, location.hash])

  // 1. Creamos la referencia para las alertas
  const warnListRef = useRef(warnList);

  // 2. La mantenemos sincronizada con el estado global
  useEffect(() => {
    warnListRef.current = warnList;
  }, [warnList]);

  useEffect(() => {
    const unregister = CapApp.addListener('resume', () => {
      const path = locationRef.current
      if (path) history.replace(path)
    })
    return () => { unregister.then((u) => u.remove()) }
  }, [history])

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
    batteryIconRef.current = batteryIcon
  }, [batteryIcon])
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
      updateLCsFromDb(displayLcs);
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
    if (visibleModal === ModalNames.NewProject) {
      setVisibleNew(true)
    }
  }, [visibleModal])

  useEffect(() => {
    setConnected(bleConnected)
  }, [bleConnected])

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
      newData = { title: project_name, units: unit_type, last_settings_change: getTime(new Date()), pre_overload: 100, windmeter_units: 'MS', total_overload: 100, show_graphs: false };
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
          setVisibleNew(false)
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
    setVisibleSetting(false);
    updateSuccessStr(t("Msg.ConfirmSetting"));
  }

  const handlePdfAction = () => {
    updateVisibleModal(ModalNames.ProjectInformation)
  }

  const duplicate_project = () => {
    setDuplicated(true)
    setVisibleNew(true)
  }

  const get_project = async (id: string, replace?: boolean) => {
    const project = projectList.find(item => item.id === id)
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
            setLayoutKey((k) => k + 1);
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

  const doActualImport = async (csvToImport: string) => {

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

  const handleStartScan = async (type: string) => {
  try {
    await BleClient.initialize();

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

    bt_scan(type);
  } catch (error) {
    console.error("Error al verificar requisitos:", error);
  }
};

  const bleConnectToDevice = async (deviceId: string, type: string, displayName?: string) => {
    const s = (type == "prr") ? numberToUUID(0xfff0) : '0bd51666-e7cb-469b-8e4d-2742f1ba77cc';
    const c = (type == "prr") ? numberToUUID(0xfff4) : 'e7add780-b042-4876-aae1-112855353cc1';
    try {
      await BleClient.connect(deviceId, (did) => bt_disconnect(did), {
        timeout: BLE_CONNECT_TIMEOUT_MS,
      });
      if (type === 'prr') {
        prrBleDeviceIdRef.current = deviceId;
        prrBleDisplayNameRef.current =
          (displayName && displayName.trim()) || deviceId;
      }
      updateBleConnected(true);
      await BleClient.getServices(deviceId);
      void logEvent("INFO", "BLE device connected", { deviceId, type }, "BLE");
      await BleClient.startNotifications(
        deviceId,
        s,
        c,
        (value) => {
          bt_parse(new Uint8Array(value.buffer));
        }
      );
    } catch (error) {
      console.error(error);
      void logEvent("ERROR", "BLE notification setup failed", { error }, "BLE");
      updateBleConnected(false);
    }
  };

  const runBleDevicePickerFlow = async (kind: "prr" | "lc") => {
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
  const ifConnection = async () => {
    const realTime = Date.now();
    const idsWithStaleData = new Set<string>();
    for (const item of dataTimeById) {
      const timeDiff = Math.abs(realTime - item.realTime);
      if (timeDiff > PRR_STALE_LC_MS) idsWithStaleData.add(String(item.id));
    }
    const updatedLcs = lcs.map((lcItem) => {
      const existsInDataTimeById = dataTimeById.some(item => item.id === lcItem.id);
      const isStale = dataTimeById.length > 0 && idsWithStaleData.has(String(lcItem.id));
      if (!existsInDataTimeById || isStale) {
        if (active_project?.id) {
          maybeLogLcValue(lcItem.id, active_project.id, 'Tr.Err', -99999999, lcItem.overload, lcItem.underload);
        }
        return { ...lcItem, value: `Tr.Err` };
      }
      return lcItem;
    });
    if (updatedLcs.some((lc, i) => lc.value !== lcs[i]?.value)) {
      updateLCs(updatedLcs);
    }
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
      const now = Date.now();  
      const currentDataTimeById = dataTimeByIdRef.current;
      let mostRecentDataTime = 0;
      let hasRecentData = false;      
      if (currentDataTimeById.length > 0) {
        mostRecentDataTime = Math.max(...currentDataTimeById.map(item => item.realTime || 0));
        const timeSinceMostRecent = Math.abs(now - mostRecentDataTime);
        hasRecentData = timeSinceMostRecent <= PRR_SILENCE_ALL_TRERR_MS;
        if (mostRecentDataTime > lastUpdatedRef.current) {
          lastUpdatedRef.current = mostRecentDataTime;
          timeoutHandledRef.current = false;
        }
      }     
      if (hasRecentData) {
        if (timeoutHandledRef.current) {
          timeoutHandledRef.current = false;
        }
        return;
      }
      const referenceTime = mostRecentDataTime > 0 ? mostRecentDataTime : lastUpdatedRef.current;
      const timeSinceLastUpdate = now - referenceTime; 
      if (timeSinceLastUpdate < PRR_SILENCE_ALL_TRERR_MS) {
        if (timeoutHandledRef.current) {
          timeoutHandledRef.current = false;
        }
        return;
      }
      if (timeSinceLastUpdate >= PRR_SILENCE_ALL_TRERR_MS && !timeoutHandledRef.current) {
        timeoutHandledRef.current = true;
        setNoChange(true);
        const lcsArray: any = []
        const projId = curProjectRef.current?.id;
        currentLcs.current.forEach((item) => {
          lcsArray.push({ ...item, value: `Tr.Err` });
          if (projId) {
            maybeLogLcValue(item.id, projId, 'Tr.Err', -99999999, item.overload, item.underload);
          }
        });
        setTrrLcs(lcsArray)
        // Do NOT clear dataTimeById: empty list makes ifConnection treat every LC as "!exists" until the
        // next full burst — flashes of Tr.Err while data is actually returning (e.g. after PRR resync).
        setTimeout(() => {
          timeoutHandledRef.current = false;
        }, 2000);
      }
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
  /** Last PRR BLE peripheral id (iOS UUID). */
  const prrBleDeviceIdRef = useRef<string | null>(null);
  /** Friendly name for PRR report rows (ID column); falls back to deviceId if unnamed. */
  const prrBleDisplayNameRef = useRef<string | null>(null);
  const prevBlePrrLogRef = useRef<boolean | null>(null);
  // Keep ref in sync every render so flushLcDisplayBuffer always merges buffer into latest lcs (preserves status_tare/tare)
  currentLcs.current = lcs;

  const maybeLogLcValue = (lcId: any, projectId: any, value: any, realval: any, overload: any, underload: any, batteryParam?: number | string) => {
    const proj = active_project;
    if (!proj?.cycle) return;
    const isTrErrSample =
      value === 'Tr.Err' ||
      value === 'Tr. Err' ||
      value === -99999999 ||
      realval === -99999999;
    // PRR offline: still show Tr.Err in UI, but do not write 75× Tr.Err/sec to IndexedDB (was killing UI thread).
    if (isTrErrSample && !bleConnected) return;
    const intervalSec = Math.max(1, Math.min(86400, proj.report_interval_seconds ?? 60));
    const key = `${projectId}_${lcId}`;
    const now = Date.now();
    if (now - (lastReportTimeRef.current[key] ?? 0) < intervalSec * 1000) return;
    lastReportTimeRef.current[key] = now;
    f_log_lc_value(lcId, projectId, value, realval, overload, underload, batteryParam);
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

  useEffect(() => {
    const ms = getLcDisplayBatchMs(platformType, Array.isArray(lcs) ? lcs.length : 0);

    const t = window.setInterval(() => {
      // When app is backgrounded, avoid heavy React updates; keep last values buffered.
      // Safety logic (over/underload) still runs inside bt_parse.
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
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
  let warnId = 0
  // Safety (overload/underload → updateWarnList, maxStatusToggle, loadStatusToggle) runs immediately per packet.
  // Display updates (updateLCs, dataTimeById) are batched every LC_DISPLAY_BATCH_MS to reduce UI load.
  const bt_parse = async (a: Uint8Array) => {
    const typ = toHexString([a[2]]);
    if (typ === 'bb' || typ === 'bc') {
      const btry = parseInt('0x' + toHexString([a[10]]), 16);
     /* if (btry < 100) {
        //console.log('Battery level:', btry + '%');
        return;
      }*/

      updateBatteryStatus(btry); // <--- CAMBIO AQUÍ

      setBtry(btry);

      // prr voltage - not charging
      if (typ === 'bb') {

        if (btry < 11) {
          setBatteryIcon(faBatteryEmpty)
        } else if (btry >= 11 && btry < 25) {
          setBatteryIcon(faBatteryQuarter)
        } else if (btry >= 25 && btry < 50) {
          setBatteryIcon(faBatteryHalf)
        } else if (btry >= 50 && btry < 90) {
          setBatteryIcon(faBatteryThreeQuarters)
        } else if (btry >= 90) {
          setBatteryIcon(faBatteryFull)
        }
      } else {
        setBatteryIcon(faBoltLightning)
      }
    } else if (a[2] <= 10) {
      const lc = parseInt('0x' + toHexString([a[3], a[4], a[5]]), 16);
      if (!f_check_lc_in_project(lc.toString())) {
        return;
      }
      if (f_check_lc_in_project(lc.toString())?.length == 0) {
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
      }
      //updateBatteryStatus(lc_btry)
      const capacity: any = f_lc_capacity_id(lc);

      if (lc > 10 && weight > capacity.mton * 2) {
        // something disturbed, number wrong 
        return;
      }

      if (lc > 10 && realval < -capacity.mton * 2) {
        // something disturbed, number wrong 
        void logEvent("INFO", "Disturbed value detected (" + realval + ")", {}, "BLE");
        return;
      }

      // Use active project units so conversion is always correct; normalize (trim, first token) so "KG"/"KG L:MS" both → kg
      const unitsRaw = (currentUnitsRef.current ?? active_project?.units) ?? 'M.TON';
      const u = String(unitsRaw).toLowerCase().replace(/\./g, '').trim().split(/\s+/)[0] ?? 'mton';
      const fx = (u === 'mton') ? 3 : 0;
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
      const projectLcs = (lcsRef?.current ?? []).filter((item: any) => normalizeProjectId(item.project_id) === normalizeProjectId(active_project?.id));
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
        const targetUnit = active_project.windmeter_units;
        const weight: number = f_convert_wind_speed(speedInMetersPerSecond, targetUnit);
        maybeLogLcValue(lc, active_project.id, weight, realval, overload, underload, lc_btry);
        const windLcItem = currentLcs.current?.find(item => item.id === lc.toString()) 
          || lcs.find(item => item.id === lc.toString());
        if (windLcItem) {
          const bid = lc.toString();
          lcDisplayBufferRef.current[bid] = { ...lcDisplayBufferRef.current[bid], value: parseFloat(realval).toFixed(fx) };
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
        //const w = weight ? parseFloat(weight).toFixed(fx) : weight;
        // PROTECCIÓN: Si por alguna razón el peso no es válido, enviamos 'Tr.Err'
        const w = (weight === 'Tr.Err' || isNaN(parseFloat(weight))) 
                  ? 'Tr.Err' 
                  : parseFloat(weight).toFixed(fx);
        const wn = weightnotare ? parseFloat(weightnotare).toFixed(fx) : weightnotare;
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
        const nowUnitsLog = Date.now();
        if (nowUnitsLog - (unitsDisplayLogLastRef.current[bid] ?? 0) > 4000) {
          unitsDisplayLogLastRef.current[bid] = nowUnitsLog;
        }
        weight = parseFloat(w);
        weightnotare = parseFloat(wn);
        weight = (u === 'mton') ? weight.toFixed(3) : weight.toFixed(0);
        const weighttolog = (u === 'mton') ? weightnotare.toFixed(3) : weightnotare.toFixed(0);
        //update_max_value_by_lc_id(lc, weightnotare, u)
        let preoverload_precent = 0;
        const pre_overload = parseInt(active_project.pre_overload ?? '0')
        if (pre_overload > 0) {
          const po = pre_overload / 100
          preoverload_precent = overload * po;
        }

        // Use the same value that is shown on the LC tile (MonitorView: tareStatus && status_tare ? weightnotare : value)
        const displayValueNumeric = (tareStatus && statusTare) ? weightnotare : parseFloat(w);
        const valueToSaveForWarning = (u === 'mton') ? displayValueNumeric.toFixed(3) : displayValueNumeric.toFixed(0);

        let lcAlertKey = `lc-${lc}`; // Clave única para esta celda
        
        if (displayValueNumeric < underload) {

          
            // underload!! alert
            // we must quit max mode and show the danger
            lcAlertKey += "underload";
            // UNDERLOAD alert
            if (!activeAlertsRef.current.has(lcAlertKey)) 
            {
                const timeNow = Date.now();
              // 1. Notificación Visual y Sonora (EL PUENTE)
            const typeMsg = displayValueNumeric < underload ? "UNDERLOAD" : "OVERLOAD";
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
            // --- LIMITADOR DE SONIDO (Solo suena una vez cada 1000ms) ---
            const currentTime = Date.now();
            if (currentTime - lastSoundTimeRef.current > 1000) {
              play_beep(4); 
              lastSoundTimeRef.current = currentTime;
            }
            
            activeAlertsRef.current.add(lcAlertKey); // Bloqueamos nuevas entradas para esta LC
           // fire_lc_overload(lc, valueToSaveForWarning, l.underload , 'total');
            }
          } else if (displayValueNumeric > overload) {

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
            // --- LIMITADOR DE SONIDO (Solo suena una vez cada 1000ms) ---
            const currentTime = Date.now();
            if (currentTime - lastSoundTimeRef.current > 1000) {
              play_beep(4); 
              lastSoundTimeRef.current = currentTime;
            }
            activeAlertsRef.current.add(lcAlertKey);
            }
          } else if (displayValueNumeric > preoverload_precent) {
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
            
            activeAlertsRef.current.add(lcAlertKey);
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


        const projectGroups = groupsRef.current.filter(g => normalizeProjectId(g.project_id) === normalizeProjectId(curProjectRef.current.id));

        projectGroups.forEach(group => {
          const lcsInGroup = currentLcs.current.filter(item => 
            item.groups && item.groups.split(',').map((s: string) => s.trim()).includes(String(group.id))
          );

          // 1. Verificamos si hay algún error para el DISPLAY (UI)
          const hasErrorInGroup = lcsInGroup.some(item => {
            const isCurrentLC = (item.id === lc.toString());
            return !isCurrentLC && item.value === 'Tr.Err';
          });

          const groupSum = lcsInGroup.reduce((acc, item) => {
            const val = (item.id === lc.toString()) ? displayValueNumeric : (item.value === 'Tr.Err' ? 0 : Number(item.value));
            return acc + val;
          }, 0);

          // 1. ACTUALIZACIÓN VISUAL (Lo que te faltaba)
          const finalSumStr = hasErrorInGroup ? 'Tr.Err' : groupSum.toFixed(fx); //const finalSumStr = groupSum.toFixed(fx);
          
          
          const gIdx = nextGroups.findIndex(g => g.id === group.id);
          if (gIdx !== -1 && nextGroups[gIdx].sum !== finalSumStr) {
            nextGroups[gIdx] = { ...nextGroups[gIdx], sum: finalSumStr };
            groupsChanged = true;
          }

          let alertKey = `group-${group.id}`; // Identificador único para la guardia

          if (group.overload && groupSum > Number(group.overload)) {
            // GUARDIA: Solo si NO estaba ya en alerta, grabamos en el historial
            alertKey += "overload";
            if (!activeAlertsRef.current.has(alertKey)) {
              const timeNow = Date.now();

              const newWarning = {
                id: `warn-${group.id}-${timeNow}-${Math.random().toString(36).substr(2, 5)}`, // ID ÚNICO REAL warnId++,
                log_date: format(new Date(), "HH:mm"),
                lc_id: `Group ${group.id}`,
                value: (u === 'mton') ? groupSum.toFixed(3) : groupSum.toFixed(0),
                overload: group.overload,
                project_id: curProjectRef.current.id
              };

              toast.error(`Group-${group.id}: OVERLOAD! Value: ${groupSum}`, { toastId: lcAlertKey });
              //play_beep(4);
              const updatedList = [newWarning, ...warnListRef.current];
              warnListRef.current = updatedList;
              //updateWarnList(updatedList);
              // --- EN LUGAR DE LLAMAR A updateWarnList(updatedList) DIRECTAMENTE: ---
              pendingWarnListRef.current = updatedList; // Lo guardamos para el Batcher
              // --- LIMITADOR DE SONIDO (Solo suena una vez cada 1000ms) ---
            const currentTime = Date.now();
            if (currentTime - lastSoundTimeRef.current > 1000) {
              play_beep(4); 
              lastSoundTimeRef.current = currentTime;
            }

              activeAlertsRef.current.add(alertKey);
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
        const totalSumLcs = currentLcs.current.filter(item => !!item.total_sum || String(item.total_sum) === '1');
        
        // Verificamos si hay algún error de transmisión en las celdas del total
        const hasTotalError = totalSumLcs.some(item => item.value === 'Tr.Err');


        const totalSumValue = totalSumLcs.reduce((acc, item) => {
          const val = (item.id === lc.toString()) ? displayValueNumeric : (item.value === 'Tr.Err' ? 0 : Number(item.value));
          return acc + val;
        }, 0);

        // EL PUENTE: Actualizamos el encabezado visual
        if (hasTotalError) {
          updateTotalWeightHtml('<span class="text-xs font-bold bg-danger text-white px-1.5 py-0.5 rounded">Tr. Err</span>');
        } else {
          const formattedTotal = (u === 'mton') ? totalSumValue.toFixed(3) : totalSumValue.toFixed(0);
          pendingTotalHtmlRef.current = formattedTotal; //updateTotalWeightHtml(formattedTotal);
        }

        const totalAlertKey = 'total-sum-alert';

        if (!hasTotalError && curProjectRef.current.total_overload && totalSumValue > Number(curProjectRef.current.total_overload)) {
          // GUARDIA para Suma Total
          if (!activeAlertsRef.current.has(totalAlertKey)) {
            const timeNow = Date.now();
            const newWarning = {
              id: `warn-${totalAlertKey}-${timeNow}-${Math.random().toString(36).substr(2, 5)}`, // ID ÚNICO REAL warnId++,
              log_date: format(new Date(), "HH:mm"),
              lc_id: 'Total Sum',
              value: (u === 'mton') ? totalSumValue.toFixed(3) : totalSumValue.toFixed(0),
              overload: curProjectRef.current.total_overload,
              project_id: curProjectRef.current.id
            };
            toast.error(`Total Sum: OVERLOAD! Value: ${(u === 'mton') ? totalSumValue.toFixed(3) : totalSumValue.toFixed(0)}`);
            play_beep(4);

            const updatedList = [newWarning, ...warnListRef.current];

            warnListRef.current = updatedList;



            //updateWarnList(updatedList);
            // --- EN LUGAR DE LLAMAR A updateWarnList(updatedList) DIRECTAMENTE: ---
            pendingWarnListRef.current = updatedList; // Lo guardamos para el Batcher
            
            // --- LIMITADOR DE SONIDO (Solo suena una vez cada 1000ms) ---
            const currentTime = Date.now();
            if (currentTime - lastSoundTimeRef.current > 1000) {
              play_beep(4); 
              lastSoundTimeRef.current = currentTime;
            }
            activeAlertsRef.current.add(totalAlertKey);
            //fire_lc_overload(warnId, totalSumValue, curProjectRef.current.total_overload, 'total');
          }
        } else {
          activeAlertsRef.current.delete(totalAlertKey);
        }








        if (a[2] == 55 && parseInt(a[10] + '').toString(2).length == 7) {
          onTareAction('untare', '0');
        }

        maybeLogLcValue(lc, active_project.id, weight, realval, l?.overload, l?.underload, lc_btry);
        draw_chart_line(lc, weight);

        // for calibration process

        const in_group = lcs.find((x: any) => x.id == lc);
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

  function bt_disconnect(deviceId: string): void {
    //console.log(`device ${deviceId} disconnected`);
    updateBleConnected(false);
  }

  useEffect(() => {
    const proj = active_project;
    if (!proj?.id || !proj?.cycle) {
      prevBlePrrLogRef.current = bleConnected;
      return;
    }
    const devId = prrBleDeviceIdRef.current;
    const reportLabel = (prrBleDisplayNameRef.current && prrBleDisplayNameRef.current.trim()) || devId;
    const prev = prevBlePrrLogRef.current;
    if (prev === null) {
      prevBlePrrLogRef.current = bleConnected;
      return;
    }
    if (bleConnected && !prev && reportLabel) {
      f_log_prr_link_event(proj.id, 'connected', reportLabel);
    }
    if (!bleConnected && prev && reportLabel) {
      f_log_prr_link_event(proj.id, 'disconnected', reportLabel);
    }
    prevBlePrrLogRef.current = bleConnected;
  }, [bleConnected, active_project?.id, active_project?.cycle]);

  const usb_scan = () => {
    //console.log('')
  }

  const bt_auto_reconnect = () => {
    //console.log('===bt_auto_reconnect===')
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

  return (
    <IonPage key={layoutKey}>
      <IonHeader>
        <IonToolbar style={{ '--min-height': '64px' }}>
          <IonButtons slot="start">
            <IonMenuButton color='dark' />
          </IonButtons>
          {location.pathname === ROUTES.Monitor &&
            <div className='flex flex-row justify-between'>
              <div className='flex flex-row items-center gap-4'>
                <div className='flex flex-col'>
                  <IonLabel color='dark'>{t("Monitor.Header.TotalWeight")}</IonLabel>
                  {bleConnected ? (curProject.total_overload && (Number(totalWeightHtml)) > (Number(curProject.total_overload)) ?
                    <div className="text-xs font-bold bg-danger text-white px-1.5 py-0.5 rounded w-max" dangerouslySetInnerHTML={{ __html: totalWeightHtml }} />
                    : <div className='text-black dark:text-white' dangerouslySetInnerHTML={{ __html: totalWeightHtml }} />)

                    :
                    <span className="text-xs font-bold bg-danger text-white px-1.5 py-0.5 rounded w-max">{t("Common.TrErr")}</span>
                  }
                </div>
                <div className='flex flex-col'>
                  <IonLabel color='dark' className='text-right -mb-1'>{`PRR ${connected ? batteryStatus : ''}`}</IonLabel>
                  {/* <IonImg src={isDark ? batteryBlackIcon : batteryWhiteIcon} alt='battery' className='h-8 -mb-2' /> */}
                  <FontAwesomeIcon icon={batteryIconRef.current} size='2x' color={`${isDark ? 'grey' : 'black'}`} />
                </div>
                <div className='relative flex items-center justify-center'>
                  <IonImg src={connected ? bleConnectIcon : bleDisConnectIcon} alt='ble' className='w-10' />
                </div>
              </div>
              {active_project.id && <Text
                label={`${active_project.title} - ${t('Monitor.Header.Title')} | ${t('Monitor.Header.Units')}: ${active_project.units} | ${active_project.windmeter_units}`}
              />}
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
                    onAction={() => setVisibleSetting(true)}
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
      <IonContent className={platformType === 'android' ? 'safe-area-content' : ''}>
        {title && <IonLabel>{title}</IonLabel>}
        <div className={`flex flex-col ${classes}`}>
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
        onAction={handleSettingProject}
        onClose={() => setVisibleSetting(false)}
        onPdfAction={() => handlePdfAction()}
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
      <SelectDeviceModal
        visible={visibleModal === MENUS.ConnectDevice}
        onAction={handleSelectDevice}
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


