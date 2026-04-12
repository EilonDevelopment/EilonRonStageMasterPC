import React, { FC, useEffect, useRef, useState } from "react";
import CommonLayout from "../../Layout/CommonLayout";
import './index.css';
import { IGroup, ILC } from "../../helper/types";

import useAppData from "../../hooks/useAppData";
import MonitorView from "../../components/Monitor/MonitorView";
import MonitorList from "../../components/Monitor/MonitorList";
import MonitorProg from "../../components/Monitor/MonitorProg";
import MonitorStop from "../../components/Monitor/MonitorStop";
import Text from "../../components/Text";
import { useTranslation } from "react-i18next";
import GroupActionModal from "../../components/Modals/GroupActionModal";
import SuccessModal from "../../components/Modals/SuccessModal";
// import * as database from '../../database'
import { db } from "../../db";
import Swal from "sweetalert2";
import { format, getTime } from "date-fns";
import useGroupOperations from "../../helper/db/groups";
import useFunctions from "../../hooks/useFunctions";
import { fire_error, getLCsByGroup, normalizeProjectId, strToFloat } from "../../helper/functions";
import { toast } from "react-toastify";
import { logEvent } from "../../services/LogService";



const MonitorModals = {
  GroupAction: 'action',
  GroupVisual: 'groupVisual',
  GroupZero: 'groupZero',
  Zero: 'zero',
}

const SINGLE_TAP_DELAY_MS = 350
const GROUP_LONG_PRESS_MS = 600
const Monitor: FC = () => {
  const heartbeatRef = useRef<number | null>(null);
  const monitorStartRef = useRef<number>(Date.now());
  const { setGroupTare, setGroupZero } = useGroupOperations();
  const {
    curProject,
    lcs,
    monitorStatus,
    bleConnected,
    logs,
    LCMax: lc_max,
    groups,
    lc_wind_alerts,
    liveLC,
    projects,
    isCreatingLCs,
    tareStatus,
    updateTareStatus,
    updateErrStr,
    updateLCs,
    updateGroups,
    updateTotalWeightHtml,
    updateWarnList,
    updateLCWindAlerts,
    updateLiveLC,
    load_lcs,
    updateCurProject,
    updateProjects,
  } = useAppData()
  const { t } = useTranslation()

  const {
    f_load_groups,
    f_load_lcs,
    f_load_projects,
    f_update_project_last_change,
    f_update_project_image_size,
    f_update_project_image_position,
    f_load_cells,
    play_beep,
    f_get_units_multiply

  } = useFunctions()

  const weighing = {
    status: 0,
    net: 0,
    gross: 0,
    tare: 0,
  }

  const [groupList, setGroupList] = useState<IGroup[]>([])

  const [dbHanlder, setDBHandler] = useState(null)

  const [list, setListData] = useState<ILC[]>([]);
  const [prevState, setPrevState] = useState<Partial<ILC>[]>([]);
  const [battState, setBattState] = useState<boolean>(false)
  const [maxStatus, setMaxStatus] = useState<boolean>(false)
  const [loadStatus, setLoadStatus] = useState<boolean>(true)
  const [warning, setWarning] = useState<boolean>(false)

  // const [selected, setSelected] = useState<IGroup | null>(null)
  const selectedRef = useRef<IGroup | null>()
  const lastGroupTapRef = useRef<{ id: string; at: number }>({ id: '', at: 0 })
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressGroupClickRef = useRef(false)

  const clearSingleTapTimer = () => {
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current)
      singleTapTimerRef.current = null
    }
  }

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }
  const [visibleModal, setVisibleModal] = useState<string>('');
  const [success, setSuccess] = useState<{ title: string; subtitle: string; } | null>(null)
  const [count, setCount] = useState(0);
  const [lcMonitorErrors, setLCMonitorErrors] = useState([]);
  const [lastAlert, setLastAlert] = useState<number>(getTime(new Date()));
  const [alertsArray, setAlertsArray] = useState<any>([])
  const [lcsOverloadArray, setLcsOverloadArray] = useState<any>([])
  const [totalSumOverload, setTotalSumOverload] = useState<any>([])
  const [preOverload, setPreOverload] = useState<any>([])
  const alertsArrayRef = useRef<any>(alertsArray)
  const lcsOverloadArrayRef = useRef<any>(lcsOverloadArray)
  const totalSumOverloadRef = useRef<any>(totalSumOverload)
  const preOverloadRef = useRef<any>(preOverload)
    const isProcessingRef = useRef<boolean>(false);
  const lastLcsHashRef = useRef<string>('');

  const [isZeroing, setIsZeroing] = useState(false);
  const [zeroProgress, setZeroProgress] = useState(0);
  const [totalToZero, setTotalToZero] = useState(0);

  type GroupVisualState = { groupId: string; highlight: boolean; only: boolean };
  const [groupVisual, setGroupVisual] = useState<GroupVisualState | null>(null);

  const curProjectRef=useRef(curProject)


  let warnId = 0
  useEffect(() => {
    // Impementing the setInterval method
    const interval = setInterval(() => {
      setCount(prev => prev + 1)
    }, 1000)

    // Clearing the interval
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    setGroupVisual(null);
  }, [curProject?.id]);

  useEffect(() => () => {
    if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current)
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
  }, []);

  useEffect(() => {
    monitorStartRef.current = Date.now();

    void logEvent(
      "INFO",
      "Entered Monitor page",
      {
        route: window.location.pathname,
        startedAt: new Date().toISOString(),
      },
      "MONITOR"
    );

    heartbeatRef.current = window.setInterval(() => {
      void logEvent(
        "INFO",
        "Monitor heartbeat",
        {
          route: window.location.pathname,
          uptimeMinutes: Math.round((Date.now() - monitorStartRef.current) / 60000),
          visibilityState: document.visibilityState,
        },
        "MONITOR"
      );
    }, 5 * 60 * 1000); // cada 5 min

    return () => {
      if (heartbeatRef.current != null) {
        window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      void logEvent(
        "INFO",
        "Left Monitor page",
        {
          route: window.location.pathname,
          uptimeMinutes: Math.round((Date.now() - monitorStartRef.current) / 60000),
        },
        "MONITOR"
      );
    };
  }, []);

  useEffect(() => {
  const handleVisibilityChange = () => {
    void logEvent(
      "INFO",
      "Document visibility changed",
      {
        route: window.location.pathname,
        visibilityState: document.visibilityState,
      },
      "APP"
    );
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
}, []);


/*
  useEffect(() => {
    if (isProcessingRef.current) return;
      const lcsHash = JSON.stringify(lcs.map(lc => ({ id: lc.id, value: lc.value })));
    if (lcsHash === lastLcsHashRef.current && count === 0) return;
    lastLcsHashRef.current = lcsHash;
    isProcessingRef.current = true;

  }, [count, lcs, liveLC])
*/
  useEffect(() => {
    if (curProject) {
      f_load_lcs()
    }
  }, [curProject])


  useEffect(() => {
    void logEvent("INFO", "Entered Monitor page", {}, "NAVIGATION");

    return () => {
      void logEvent("INFO", "Left Monitor page", {}, "NAVIGATION");
    };
  }, []);
/*
  const f_monitor_total_sum = async (lcList: ILC[]) => {
    let value = ''
    if (!curProject.id || lcList.length < lcs.length) {
      updateTotalWeightHtml('<span class="text-xs font-bold bg-danger text-white px-1.5 py-0.5 rounded">Tr. Err</span>');
      value = 'Tr.Err'
    }
    let t = 0;
    for (const lc of lcList) {
      const useTare = lc.status_tare && tareStatus && lc.weightnotare != null && lc.weightnotare !== '';
      const displayVal = useTare ? lc.weightnotare : lc.value;
      await fire_overload(lc.id, displayVal, lc.overload, 'lcs', lc.underload);
      let v: any = await (useTare ? lc.weightnotare : lc.value);
      if (v && v.toString() === `Tr.Err`) {
        updateTotalWeightHtml('<span class="text-xs font-bold bg-danger text-white px-1.5 py-0.5 rounded">Tr. Err</span>');
        value = 'Tr.Err'
      }
      else {
        v = parseFloat(v);

        const p = parseFloat(lc.psw ?? '0');
        t += v;
      }
    }
    if (value === 'Tr.Err') {
      await updateTotalWeightHtml('<span class="text-xs font-bold bg-danger text-white px-1.5 py-0.5 rounded">Tr. Err</span>');
      value = 'Tr.Err'
    } else {
      if (t < 0) {
        t = 0;
      }
      await updateTotalWeightHtml(curProject.units?.toLowerCase() !== "m.ton" ? t.toFixed(0) : t.toFixed(3));
    }
    if (value !== 'Tr.Err')
      value = (curProject.units?.toLowerCase() !== "m.ton" ? t.toFixed(0) : t.toFixed(3))
    await fire_overload('totalSum', value, curProject.total_overload, 'totalSum')
    if (Number(curProject.pre_overload) !== 100) {
      await fire_overload('preOverload', value, ((Number(curProject.total_overload) / 100) * (Number(curProject.pre_overload))), 'preOverload')
    }
  }

  */
  useEffect(() => {
    show_overload_alert(alertsArray, 'group')
  }, [alertsArray])
  useEffect(() => {
    alertsArrayRef.current = alertsArray;
  }, [alertsArray]);

  useEffect(() => {
    show_overload_alert(lcsOverloadArray, 'lcs')
  }, [lcsOverloadArray])

  useEffect(() => {
    lcsOverloadArrayRef.current = lcsOverloadArray
  }, [lcsOverloadArray])

  useEffect(() => {
    show_overload_alert(totalSumOverload, 'totalSum')
  }, [totalSumOverload])
  useEffect(() => {
    totalSumOverloadRef.current = totalSumOverload
  }, [totalSumOverload])
  useEffect(() => {
    show_overload_alert(preOverload, 'preOverload')
  }, [preOverload])
  useEffect(() => {
    preOverloadRef.current = preOverload
  }, [preOverload])


  /*
  const fire_overload = async (item_id: any, weight: any, overload: any, type: string, underload?: any, pre_overload?: any) => {
    const currentTime = Date.now();
    const setAlerts = (type === 'lcs' ? setLcsOverloadArray : (type === 'group' ? setAlertsArray : (type === 'preOverload' ? setPreOverload : setTotalSumOverload)));
    const currentRef = (type === 'lcs' ? lcsOverloadArrayRef : (type === 'group' ? alertsArrayRef : (type === 'preOverload' ? preOverloadRef : totalSumOverloadRef)));
    setAlerts((prevAlerts: any) => {
      const currentAlerts = currentRef.current;
      if (JSON.stringify(prevAlerts) === JSON.stringify(currentAlerts) && currentAlerts.length > 0) {
        const existingAlert = currentAlerts.find((alert: any) => alert.id === item_id);
        if (existingAlert) {
          const weightNum = Number(weight);
          const overloadNum = Number(overload);
          const existingWeightNum = Number(existingAlert.weight);
          const existingOverloadNum = Number(existingAlert.overload);
              if (existingWeightNum === weightNum && 
              existingOverloadNum === overloadNum &&
              existingAlert.ifNeedShow === ((!isNaN(weightNum) && weightNum > overloadNum) || (underload && weightNum < Number(underload)))) {
            return prevAlerts; // No change, return previous to prevent update
          }
        }
      }
      
      let ifChange = false;
      let updatedAlerts = [...prevAlerts];
      if (updatedAlerts.length > 0) {
        const existingAlertIndex = updatedAlerts.findIndex((alert: any) => alert.id === item_id);
        if (existingAlertIndex === -1) {
          if ((!isNaN(weight) && (Number(weight)) > overload) || (underload && (Number(weight)) < underload)) {
            updatedAlerts.push({
              id: item_id,
              isShow: false,
              weight: weight,
              overload: weight > overload ? overload : underload,
              isOverload: (!isNaN(weight) && (Number(weight)) > overload),
              ifNeedShow: true
            });
            ifChange = true;
          } else {
            updatedAlerts.push({
              id: item_id,
              isShow: false,
              weight: weight,
              overload: weight > overload ? overload : underload,
              isOverload: (!isNaN(weight) && (Number(weight)) > overload),
              ifNeedShow: false
            });
            ifChange = true;
          }
        } else {
          const existingAlert = updatedAlerts[existingAlertIndex];
          if ((!isNaN(weight) && (Number(weight)) > overload) || (underload && (Number(weight)) < underload)) {
            if (existingAlert.ifNeedShow && existingAlert.isShow) {
              if ((Number(existingAlert.weight)) !== (Number(weight)) || ((!isNaN(weight) && (Number(weight)) > (Number(overload)) && (Number(existingAlert.overload)) !== (Number(overload))) || ((Number(weight)) < (Number(underload)) && (Number(existingAlert.overload)) !== (Number(overload))))) {
                updatedAlerts[existingAlertIndex] = {
                  ...existingAlert,
                  weight: weight,
                  overload: (Number(weight)) > (Number(overload)) ? overload : underload,
                  isOverload: (!isNaN(weight) && (Number(weight)) > overload),
                };
                ifChange = true;
              }
            } else if (existingAlert.ifNeedShow && !existingAlert.isShow) {
              if (!existingAlert.lastAlert || ((currentTime - existingAlert.lastAlert) / 1000) >= 10) {
                updatedAlerts[existingAlertIndex] = {
                  ...existingAlert,
                  isShow: true,
                  weight: weight,
                  overload: weight > overload ? overload : underload,
                  isOverload: (!isNaN(weight) && (Number(weight)) > overload),
                  lastAlert: currentTime,
                  ifNeedShow: true
                };
                ifChange = true;
              }
            } else if (!existingAlert.ifNeedShow && !existingAlert.isShow) {
              updatedAlerts[existingAlertIndex] = {
                ...existingAlert,
                isShow: true,
                weight: weight,
                overload: (Number(weight)) > (Number(overload)) ? overload : underload,
                isOverload: (!isNaN(weight) && (Number(weight)) > overload),
                ifNeedShow: true
              };
              ifChange = true;
            }
          } else {
          if (existingAlert.ifNeedShow !== false) {
            updatedAlerts[existingAlertIndex] = {
              ...existingAlert,
              ifNeedShow: false,
              isShow: false
            };
            ifChange = true;
          }
          }
        }
      } else {
        if ((!isNaN(weight) && (Number(weight)) > (Number(overload))) || ((Number(underload)) && (Number(weight)) < (Number(underload)))) {
          updatedAlerts = [{
            id: item_id,
            isShow: true,
            weight: weight,
            overload: (Number(weight)) > (Number(overload)) ? overload : underload,
            isOverload: (!isNaN(weight) && (Number(weight)) > overload),
            ifNeedShow: true
          }];
          ifChange = true;
        } else {
          updatedAlerts = [{
            id: item_id,
            isShow: false,
            weight: weight,
            overload: (Number(weight)) > (Number(overload)) ? overload : underload,
            isOverload: (!isNaN(weight) && (Number(weight)) > overload),
            ifNeedShow: false
          }];
          ifChange = true;
        }
      }
      return ifChange ? updatedAlerts : prevAlerts;
    });
  }


  */

  const fire_overload = async (item_id: any, weight: any, overload: any, type: string, underload?: any, pre_overload?: any) => {
    const currentTime = Date.now();
    const setAlerts = (type === 'lcs' ? setLcsOverloadArray : (type === 'group' ? setAlertsArray : (type === 'preOverload' ? setPreOverload : setTotalSumOverload)));
    const currentRef = (type === 'lcs' ? lcsOverloadArrayRef : (type === 'group' ? alertsArrayRef : (type === 'preOverload' ? preOverloadRef : totalSumOverloadRef)));

    setAlerts((prevAlerts: any) => {
      let updatedAlerts = [...prevAlerts];
      const existingAlertIndex = updatedAlerts.findIndex((alert: any) => alert.id === item_id);
      const weightNum = Number(weight);
      const isWeightError = weight === 'Tr.Err' || isNaN(weightNum);
      const overNum = Number(overload);
      const underNum = underload ? Number(underload) : null;

      // LÓGICA DE PERSISTENCIA PARA TR.ERR
      if (isWeightError) {
        if (existingAlertIndex !== -1) {
          const existingAlert = updatedAlerts[existingAlertIndex];
          if (existingAlert.ifNeedShow) {
            // Si ya había alerta (Overload o Underload), la mantenemos aunque haya error
            updatedAlerts[existingAlertIndex] = {
              ...existingAlert,
              weight: 'Tr.Err',
              ifNeedShow: true, // Persistencia de la alerta
              isShow: existingAlert.isShow // Mantener estado visual
            };
            return updatedAlerts;
          }
        }
        // Si no había alerta previa y hay Tr.Err, simplemente nos aseguramos que no se dispare nada
        if (existingAlertIndex !== -1) {
            updatedAlerts[existingAlertIndex] = { ...updatedAlerts[existingAlertIndex], ifNeedShow: false, isShow: false, weight: 'Tr.Err' };
            return updatedAlerts;
        }
        return prevAlerts;
      }

      // LÓGICA NORMAL (PESO NUMÉRICO)
      const needsAlert = weightNum > overNum || (underNum !== null && weightNum < underNum);

      if (existingAlertIndex === -1) {
        updatedAlerts.push({
          id: item_id,
          isShow: needsAlert,
          weight: weight,
          overload: weightNum > overNum ? overload : underload,
          isOverload: weightNum > overNum,
          ifNeedShow: needsAlert,
          lastAlert: needsAlert ? currentTime : null
        });
      } else {
        const existingAlert = updatedAlerts[existingAlertIndex];
        if (needsAlert) {
          updatedAlerts[existingAlertIndex] = {
            ...existingAlert,
            ifNeedShow: true,
            isShow: true,
            weight: weight,
            overload: weightNum > overNum ? overload : underload,
            isOverload: weightNum > overNum,
            lastAlert: existingAlert.isShow ? existingAlert.lastAlert : currentTime
          };
        } else {
          updatedAlerts[existingAlertIndex] = {
            ...existingAlert,
            ifNeedShow: false,
            isShow: false,
            weight: weight
          };
        }
      }
      return updatedAlerts;
    });
  }


  const updateAlertsArray = async (alertId: any, type: string) => {
    const current_array = (type === 'lcs' ? lcsOverloadArrayRef.current : (type === 'group' ? alertsArrayRef.current : (type === 'preOverload' ? preOverloadRef.current : totalSumOverloadRef.current)))
    const updatedAlertsArray = current_array.map((alert: any) => {
      if (alert.id === alertId) {
        return {
          ...alert,
          lastAlert: Date.now(),
          isShow: false,
          ifNeedShow: true
        };
      }
      return alert;
    });
    (type === 'lcs' ? await setLcsOverloadArray(updatedAlertsArray) : (type === 'group' ? await setAlertsArray(updatedAlertsArray) : (type === 'preOverload' ? await setPreOverload(updatedAlertsArray) : await setTotalSumOverload(updatedAlertsArray))))
  };

  /*
  const show_overload_alert = async (alerts: any, type: string) => {
    if (isCreatingLCs) return;
    const arrayToIterate = (type === 'lcs' ? liveLC : (type === 'group' ? groups : projects));
    let ifChange = false;
    let toUpdate = false
    let click = false

    const u = curProject?.units?.toLowerCase().replace('.', ''); // for m.ton;
    const fx = (u == "mton") ? 3 : 0;

    if (alerts && alerts.length > 0) {
      const updatedAlerts = alerts.map((alert: any) => {
        if (isNaN(alert.weight)) {
          if (toast.isActive(alert.id)) {
            toast.dismiss(alert.id);
          }
        }
        let updatedAlert = alert;
        if (type === 'lcs') {
          if (liveLC.length === 0) {
            lcs.forEach((lc) => {
              if (toast.isActive(lc.id)) {
                toast.dismiss(lc.id);
              }
            })
          }
        }
        if (lcs.length > liveLC.length) {
          lcs.filter(alert => !liveLC.some(liveAlert => liveAlert.id === alert.id))
            .forEach(alert => {
              if (toast.isActive(alert.id)) {
                toast.dismiss(alert.id);
              }
            });
        }
        arrayToIterate.forEach(async (b) => {
          if (b.id == alert.id || ((type === 'totalSum' || type === 'preOverload') && b.id === curProject.id)) {
            if (alert.isShow && alert.ifNeedShow) {
              const w = parseFloat(alert.weight);
              const ov = parseFloat(alert.overload);
              const isDangerOverload = !isNaN(w) && !isNaN(ov) && ov > 0 && w >= ov * 1.3;
              let o: string;
              if (type === 'lcs' && b.id >= 1 && b.id <= 10 && alert.weight > alert.overload) {
                o = "OVERSPEED";
              } else if (type === 'totalSum') {
                o = isDangerOverload ? "DANGER" : "TOTAL OVERLOAD";
              } else if (type === 'preOverload') {
                o = "PRE OVERLOAD";
              } else {
                const isOver = alert.isOverload !== undefined ? alert.isOverload : (alert.weight > alert.overload);
                o = isOver ? (isDangerOverload ? "DANGER" : "OVERLOAD") : "UNDERLOAD";
              }
              const isOverLabel = o === "DANGER" || o === "OVERLOAD" || o === "TOTAL OVERLOAD";
              const toastExists = toast.isActive(alert.id);
              if (toastExists) {
                toast.update(alert.id, {
                  render: (
                    <div>
                      <h4>{o}!</h4>
                      <p>{`${(type === 'lcs' ? "Lc-: " : (type === 'group' ? "Group: " : ((type === 'totalSum' || type === 'preOverload') ? '' : "Windmeter")))} ${(type !== 'totalSum' && type !== 'preOverload') ? alert.id : ''}`}{`${o === 'OVERSPEED' ? ' | Speed: ' : ((type === 'totalSum' || type === 'preOverload') ? 'Weight: ' : ' | Weight: ')}`} {parseFloat(alert.weight).toFixed(fx)} {`${o === 'OVERSPEED' ? " | Capacity: " : (isOverLabel ? ' | Overload: ' : ' | Underload: ')}`} {parseFloat(alert.overload).toFixed(fx)}</p>
                    </div>
                  ),
                  autoClose: false,
                  closeOnClick: true
                });
              }
              else {

                await toast.error(
                  <div>
                    <h4>{o}!</h4>
                    <p>{`${(type === 'lcs' ? "Lc: " : (type === 'group' ? "Group: " : ((type === 'totalSum' || type === 'preOverload') ? '' : "Windmeter")))} ${(type !== 'totalSum' && type !== 'preOverload') ? alert.id : ''}`}{`${o === 'OVERSPEED' ? ' | Speed: ' : ((type === 'totalSum' || type === 'preOverload') ? 'Weight: ' : ' | Weight: ')}`} {parseFloat(alert.weight).toFixed(fx)} {`${o === 'OVERSPEED' ? " | Capacity: " : (isOverLabel ? ' | Overload: ' : ' | Underload: ')}`} {parseFloat(alert.overload).toFixed(fx)}</p>
                  </div>,
                  {
                    toastId: alert.id,
                    onClose: async (reason) => {
                      if (reason) {
                        click = true
                        await updateAlertsArray(alert.id, type)
                      }
                      toUpdate = true;
                    },
                    autoClose: false,
                    closeOnClick: true,
                  }
                );
                play_beep(4)
                if (toUpdate === true) {
                  ifChange = true;
                  if (click) {
                    updatedAlert = {
                      ...alert,
                      lastAlert: Date.now(),
                      isShow: false,
                      ifNeedShow: true
                    }
                  }
                  else {
                    updatedAlert = {
                      ...alert,
                      lastAlert: Date.now(),
                      isShow: false,
                      ifNeedShow: false
                    }
                  }
                }
              }
            }
            else {
              if (toast.isActive(alert.id)) {
                toast.dismiss(alert.id);
              }
            }
          }
        });
        return updatedAlert;
      });
            if (ifChange) {
        const currentRef = (type === 'lcs' ? lcsOverloadArrayRef : (type === 'group' ? alertsArrayRef : (type === 'preOverload' ? preOverloadRef : totalSumOverloadRef)));
        const currentArray = currentRef.current;
        const arraysEqual = JSON.stringify(currentArray) === JSON.stringify(updatedAlerts);
        if (!arraysEqual) {
          type === 'lcs' ? await setLcsOverloadArray(updatedAlerts) : (type === 'group' ? await setAlertsArray(updatedAlerts) : (type === 'preOverload' ? await setPreOverload(updatedAlerts) : await setTotalSumOverload(updatedAlerts)))
        }
      }
    }
  }
*/

  const show_overload_alert = async (alerts: any, type: string) => {
    if (isCreatingLCs || isProcessingRef.current) return;
    const arrayToIterate = (type === 'lcs' ? liveLC : (type === 'group' ? groups : projects));
    let ifChange = false;
    let toUpdate = false
    let click = false
    let shouldPlaySound = false; // Nueva bandera para controlar el sonido
    

    const u = curProject?.units?.toLowerCase().replace('.', ''); // for m.ton;
    const fx = (u == "mton") ? 3 : 0;

    if (alerts && alerts.length > 0) {
      const updatedAlerts = alerts.map((alert: any) => {
        // MODIFICACIÓN: Solo cerrar el Toast si es Error Y ya no necesitamos mostrar la alerta
        if (isNaN(Number(alert.weight)) && !alert.ifNeedShow) {
          if (toast.isActive(alert.id)) {
            toast.dismiss(alert.id);
          }
        }

        let updatedAlert = alert;
        // ... (resto de la lógica de filtrado de liveLC y lcs) ...
        if (type === 'lcs') {
          if (liveLC.length === 0) {
            lcs.forEach((lc) => {
              if (toast.isActive(lc.id)) {
                toast.dismiss(lc.id);
              }
            })
          }
        }
        if (lcs.length > liveLC.length) {
          lcs.filter(alert => !liveLC.some(liveAlert => liveAlert.id === alert.id))
            .forEach(alert => {
              if (toast.isActive(alert.id)) {
                toast.dismiss(alert.id);
              }
            });
        }

        arrayToIterate.forEach(async (b) => {
          if (b.id == alert.id || ((type === 'totalSum' || type === 'preOverload') && b.id === curProject.id)) {
            if (alert.isShow && alert.ifNeedShow) {
              
              // Si el peso es 'Tr.Err', mostramos el texto pero mantenemos la advertencia
              const displayWeight = isNaN(Number(alert.weight)) ? "Tr.Err" : parseFloat(alert.weight).toFixed(3);
              
              // ... (lógica de determinación de etiquetas: DANGER, OVERLOAD, etc.) ...
              const w = parseFloat(alert.weight);
              const ov = parseFloat(alert.overload);
              const isDangerOverload = !isNaN(w) && !isNaN(ov) && ov > 0 && w >= ov * 1.3;
              let o: string;
              if (type === 'lcs' && b.id >= 1 && b.id <= 10 && alert.weight > alert.overload) {
                o = "OVERSPEED";
              } else if (type === 'totalSum') {
                o = isDangerOverload ? "DANGER" : "TOTAL OVERLOAD";
              } else if (type === 'preOverload') {
                o = "PRE OVERLOAD";
              } else {
                const isOver = alert.isOverload !== undefined ? alert.isOverload : (alert.weight > alert.overload);
                o = isOver ? (isDangerOverload ? "DANGER" : "OVERLOAD") : "UNDERLOAD";
              }
              const isOverLabel = o === "DANGER" || o === "OVERLOAD" || o === "TOTAL OVERLOAD";
              const toastExists = toast.isActive(alert.id);
              if (toastExists) {
                //<p>{`${(type === 'lcs' ? "Lc-: " : (type === 'group' ? "Group: " : ((type === 'totalSum' || type === 'preOverload') ? '' : "Windmeter")))} ${(type !== 'totalSum' && type !== 'preOverload') ? alert.id : ''}`}{`${o === 'OVERSPEED' ? ' | Speed: ' : ((type === 'totalSum' || type === 'preOverload') ? 'Weight: ' : ' | Weight: ')}`} {parseFloat(alert.weight).toFixed(fx)} {`${o === 'OVERSPEED' ? " | Capacity: " : (isOverLabel ? ' | Overload: ' : ' | Underload: ')}`} {parseFloat(alert.overload).toFixed(fx)}</p>
                toast.update(alert.id, {
                  render: (
                    <div>
                      <h4>{o}!</h4>
                      
                      <p>
                        {`${(type === 'lcs' ? "Lc: " : (type === 'group' ? "Group: " : "Item"))} ${alert.id}`}
                        {` | Weight: `} 
                        <strong>{displayWeight}</strong> {}
                        {` | Limit: `} {parseFloat(alert.overload).toFixed(fx)}
                      </p>
                    </div>
                  ),
                  autoClose: false,
                  closeOnClick: true
                });
              }
              else {
                shouldPlaySound = true;

                // --- LOGICA PARA EL HISTORIAL (Warnings) ---
                const u = curProject?.units?.toLowerCase().replace('.', '');
                const fx = (u == "mton") ? 3 : 0;
                
                // Identificamos el nombre para la columna "LC" del historial
                let warningLabel = '';
                if (type === 'group') warningLabel = `Group ${alert.id}`;
                else if (type === 'totalSum') warningLabel = 'Total Sum';
                else if (type === 'preOverload') warningLabel = 'Pre Overload';
                else warningLabel = alert.id; // Para LCs individuales

                const newWarning = {
                  time: format(new Date(), 'HH:mm'),
                  lc: warningLabel,
                  value: isNaN(Number(alert.weight)) ? "Tr.Err" : parseFloat(alert.weight).toFixed(fx),
                  overload: parseFloat(alert.overload).toFixed(fx),
                  underload: alert.underload ? parseFloat(alert.underload).toFixed(fx) : '-'
                };

                // Añadimos al historial global (que usa el botón circular)
                updateWarnList((prev: any) => [newWarning, ...prev]);
                // --------------------------------------------

                
                await toast.error(
                  <div>
                    <h4>{o}!</h4>
                    <p>{`${(type === 'lcs' ? "Lc: " : (type === 'group' ? "Group: " : ((type === 'totalSum' || type === 'preOverload') ? '' : "Windmeter")))} ${(type !== 'totalSum' && type !== 'preOverload') ? alert.id : ''}`}{`${o === 'OVERSPEED' ? ' | Speed: ' : ((type === 'totalSum' || type === 'preOverload') ? 'Weight: ' : ' | Weight: ')}`} {parseFloat(alert.weight).toFixed(fx)} {`${o === 'OVERSPEED' ? " | Capacity: " : (isOverLabel ? ' | Overload: ' : ' | Underload: ')}`} {parseFloat(alert.overload).toFixed(fx)}</p>
                  </div>,
                  {
                    toastId: alert.id,
                    onClose: async (reason) => {
                      if (reason) {
                        click = true
                        await updateAlertsArray(alert.id, type)
                      }
                      toUpdate = true;
                    },
                    autoClose: false,
                    closeOnClick: true,
                  }
                );
                //play_beep(4)
                if (toUpdate === true) {
                  ifChange = true;
                  if (click) {
                    updatedAlert = {
                      ...alert,
                      lastAlert: Date.now(),
                      isShow: false,
                      ifNeedShow: true
                    }
                  }
                  else {
                    updatedAlert = {
                      ...alert,
                      lastAlert: Date.now(),
                      isShow: false,
                      ifNeedShow: false
                    }
                  }
                }
              }
              
              // Al llamar a toast.error o toast.update, usa displayWeight en el renderizado
            } else {
              if (toast.isActive(alert.id)) {
                toast.dismiss(alert.id);
              }
            }
          }
        });
        return updatedAlert;
      });
      // ... (lógica de actualización de estado al final) ...
      if (ifChange) {
        const currentRef = (type === 'lcs' ? lcsOverloadArrayRef : (type === 'group' ? alertsArrayRef : (type === 'preOverload' ? preOverloadRef : totalSumOverloadRef)));
        const currentArray = currentRef.current;
        const arraysEqual = JSON.stringify(currentArray) === JSON.stringify(updatedAlerts);
        if (!arraysEqual) {
          type === 'lcs' ? await setLcsOverloadArray(updatedAlerts) : (type === 'group' ? await setAlertsArray(updatedAlerts) : (type === 'preOverload' ? await setPreOverload(updatedAlerts) : await setTotalSumOverload(updatedAlerts)))
        }
      }

      // SONIDO UNIFICADO: Un solo beep para todas las alertas del ciclo
      if (shouldPlaySound) {
        play_beep(4);
      }
    }
  }
/*
  const show_overload_alert = async (alerts: any, type: string) => {
    if (isCreatingLCs || isProcessingRef.current) return;
    
    const arrayToIterate = (type === 'lcs' ? liveLC : (type === 'group' ? groups : projects));
    let shouldPlaySound = false;

    const u = curProject?.units?.toLowerCase().replace('.', ''); 
    const fx = (u == "mton") ? 3 : 0;

    if (alerts && alerts.length > 0) {
      alerts.map((alertItem: any) => { // Renombrado a alertItem
        const uniqueId = `${type}-${alertItem.id}`;

        // 1. Cerrar Toast si es error y no debe mostrarse
        if (isNaN(Number(alertItem.weight)) && !alertItem.ifNeedShow) {
          if (toast.isActive(uniqueId)) {
            toast.dismiss(uniqueId);
          }
        }

        // 2. Limpieza de Toasts obsoletos
        if (type === 'lcs' && liveLC.length === 0) {
          lcs.forEach((lc) => {
            const lcId = `lcs-${lc.id}`;
            if (toast.isActive(lcId)) toast.dismiss(lcId);
          });
        }
        
        if (type === 'lcs' && lcs.length > liveLC.length) {
          lcs.filter(lc => !liveLC.some(live => live.id === lc.id))
             .forEach(lc => {
               const lcId = `lcs-${lc.id}`;
               if (toast.isActive(lcId)) toast.dismiss(lcId);
             });
        }

        // 3. Procesamiento de alertas
        arrayToIterate.forEach(async (target: any) => {
          if (target.id == alertItem.id || ((type === 'totalSum' || type === 'preOverload') && target.id === curProject.id)) {
            if (alertItem.isShow && alertItem.ifNeedShow) {
              
              const displayWeight = isNaN(Number(alertItem.weight)) ? "Tr.Err" : parseFloat(alertItem.weight).toFixed(fx);
              
              const w = parseFloat(alertItem.weight);
              const ov = parseFloat(alertItem.overload);
              const isDangerOverload = !isNaN(w) && !isNaN(ov) && ov > 0 && w >= ov * 1.3;
              
              let o: string;
              if (type === 'lcs' && target.id >= 1 && target.id <= 10 && alertItem.weight > alertItem.overload) {
                o = "OVERSPEED";
              } else if (type === 'totalSum') {
                o = isDangerOverload ? "DANGER" : "TOTAL OVERLOAD";
              } else if (type === 'preOverload') {
                o = "PRE OVERLOAD";
              } else {
                const isOver = alertItem.isOverload !== undefined ? alertItem.isOverload : (alertItem.weight > alertItem.overload);
                o = isOver ? (isDangerOverload ? "DANGER" : "OVERLOAD") : "UNDERLOAD";
              }

              let warningLabel = '';
              if (type === 'group') warningLabel = `Group ${alertItem.id}`;
              else if (type === 'totalSum') warningLabel = 'Total Sum';
              else if (type === 'preOverload') warningLabel = 'Pre Overload';
              else warningLabel = `Lc ${alertItem.id}`;

              const toastExists = toast.isActive(uniqueId);

              if (toastExists) {
                
                toast.update(uniqueId, {
                  render: (
                    <div>
                      <h4>{o}!</h4>
                      <p>{warningLabel} | Weight: <strong>{displayWeight}</strong> | Limit: {parseFloat(alertItem.overload).toFixed(fx)}</p>
                    </div>
                  ),
                  autoClose: false
                });
              } else {
                shouldPlaySound = true;



                await toast.error(
                  <div>
                    <h4>{o}!</h4>
                    <p>{warningLabel} | Weight: <strong>{displayWeight}</strong> | Limit: {parseFloat(alertItem.overload).toFixed(fx)}</p>
                  </div>,
                  {
                    toastId: uniqueId,
                    autoClose: false,
                    closeOnClick: true,
                    onClose: async (reason) => {
                      if (reason) {
                        await updateAlertsArray(alertItem.id, type); // Usa alertItem.id aquí
                      }
                    }
                  }
                );
              }
            } else {
              if (toast.isActive(uniqueId)) {
                toast.dismiss(uniqueId);
              }
            }
          }
        });
      });

      if (shouldPlaySound) {
        play_beep(4);
      }
    }
  };
   */ 
  
  const handleMoveLC = async (lcItem: ILC) => {
    updateLCs(lcItem);
    await db.lcs.put(lcItem);
  }

  const handleReset = async (reset: boolean) => {
    if (lcs.length > 0) {
      const lcIds = lcs.map(item => item.lc_id)
      if (reset) {
        setPrevState(lcs);
        // Do not update state to 0,0; home is applied only at display time in MonitorView
        const nextProject = { ...curProject, lc_display_mode: 'home' as const };
        updateCurProject(nextProject);
        updateProjects(projects.map(p => p.id === curProject.id ? { ...p, lc_display_mode: 'home' } : p));
        await db.projects.update(curProject.id, { lc_display_mode: 'home' });
      } else {
        if (prevState.length > 0) {
          const updated = lcs.map(item => {
            if (lcIds.includes(item.lc_id)) {
              const findItem = prevState.find(pItem => pItem.lc_id === item.lc_id)
              return { ...item, ...findItem };
            } else
              return item
          })
          updateLCs(updated)
          await db.lcs.bulkPut(updated)
        } else {
          await load_lcs();
        }
        const nextProject = { ...curProject, lc_display_mode: 'user' as const };
        updateCurProject(nextProject);
        updateProjects(projects.map(p => p.id === curProject.id ? { ...p, lc_display_mode: 'user' } : p));
        await db.projects.update(curProject.id, { lc_display_mode: 'user' });
      }
    }
  }

 /* const contentView = () => {
    switch (monitorStatus) {
      case 'view':
        return (
          <MonitorView
            data={lcs}
            max={maxStatus}
            load={loadStatus}
            tare={tareStatus}
            onMoveLC={handleMoveLC}
            onReset={handleReset}
          />
        )
      case 'list':
        return (<>
          <MonitorList data={lcs} />
        </>)
      case 'prog':
        return (<>
          <MonitorProg
            data={lcs}
            unit={curProject.units || ''}
            tare={tareStatus}
          />
        </>)
      case 'stop':
        return (<>
          <MonitorStop
            data={lcs}
            unit={curProject.units || ''}
            max={maxStatus}
            tare={tareStatus}
          />
        </>)
      default:
        break;
    }
  }

  */

  const contentView = () => {
    switch (monitorStatus) {
      case 'view':
        return (
          <MonitorView
            data={lcs}
            max={maxStatus}
            load={loadStatus}
            tare={tareStatus}
            onMoveLC={handleMoveLC}
            onReset={handleReset}
            groupVisualGroupId={groupVisual?.groupId ?? null}
            groupVisualHighlight={!!groupVisual?.highlight}
            groupVisualOnly={!!groupVisual?.only}
          />
        )
      case 'list':
        return (<>
          {/* AÑADIDO: max={maxStatus} */}
          <MonitorList data={lcs} max={maxStatus} />
        </>)
      case 'prog':
        return (<>
          {/* AÑADIDO: max={maxStatus} */}
          <MonitorProg
            data={lcs}
            unit={curProject.units || ''}
            tare={tareStatus}
            max={maxStatus}
          />
        </>)
      case 'stop':
        return (<>
          <MonitorStop
            data={lcs}
            unit={curProject.units || ''}
            max={maxStatus}
            tare={tareStatus}
          />
        </>)
      default:
        break;
    }
  }

  const handleGroup = (group: IGroup) => {
    if (!unique_group_lcs(group.id)) {
      fire_error('This group contain non unique load cells');
      return false;
    }
    if (turned_off_Devices(group.id)) {
      fire_error('This group contains non-transmitting load cells')
    }

    if (bleConnected) {
      selectedRef.current = group
      setVisibleModal(MonitorModals.GroupAction)
    } else {
      updateErrStr(t('Msg.ErrConnectPRR'))
    }
  }

  const openGroupVisualModal = (group: IGroup) => {
    if (!unique_group_lcs(group.id)) {
      fire_error('This group contain non unique load cells');
      return;
    }
    if (turned_off_Devices(group.id)) {
      fire_error('This group contains non-transmitting load cells')
    }
    selectedRef.current = group
    setVisibleModal(MonitorModals.GroupVisual)
  }

  const openGroupZeroModal = (group: IGroup) => {
    if (!unique_group_lcs(group.id)) {
      fire_error('This group contain non unique load cells');
      return;
    }
    if (turned_off_Devices(group.id)) {
      fire_error('This group contains non-transmitting load cells')
    }
    if (!bleConnected) {
      updateErrStr(t('Msg.ErrConnectPRR'))
      return
    }
    selectedRef.current = group
    setVisibleModal(MonitorModals.GroupZero)
  }

  const onGroupPointerDown = (group: IGroup) => () => {
    clearLongPressTimer()
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      suppressGroupClickRef.current = true
      clearSingleTapTimer()
      lastGroupTapRef.current = { id: '', at: 0 }
      openGroupZeroModal(group)
    }, GROUP_LONG_PRESS_MS)
  }

  const onGroupPointerUp = () => {
    clearLongPressTimer()
  }

  const handleGroupTap = (group: IGroup) => {
    if (suppressGroupClickRef.current) {
      suppressGroupClickRef.current = false
      return
    }
    const now = Date.now();
    const prev = lastGroupTapRef.current;
    const sameGroup = prev.id === String(group.id);
    if (sameGroup && (now - prev.at) <= SINGLE_TAP_DELAY_MS) {
      clearSingleTapTimer()
      lastGroupTapRef.current = { id: '', at: 0 };
      handleGroup(group);
      return;
    }
    lastGroupTapRef.current = { id: String(group.id), at: now };
    clearSingleTapTimer()
    singleTapTimerRef.current = setTimeout(() => {
      singleTapTimerRef.current = null
      lastGroupTapRef.current = { id: '', at: 0 }
      openGroupVisualModal(group)
    }, SINGLE_TAP_DELAY_MS)
  }

  const handleGroupHighlightChange = (checked: boolean) => {
    const gid = String(selectedRef.current?.id ?? '');
    if (!gid) return;
    setGroupVisual((prev) => {
      if (!checked) {
        if (!prev || prev.groupId !== gid) return prev;
        if (prev.only) return { ...prev, highlight: false };
        return null;
      }
      const same = prev?.groupId === gid;
      return {
        groupId: gid,
        highlight: true,
        only: same ? !!prev?.only : false,
      };
    });
  };

  const handleGroupOnlyLcsChange = (checked: boolean) => {
    const gid = String(selectedRef.current?.id ?? '');
    if (!gid) return;
    setGroupVisual((prev) => {
      if (!checked) {
        if (!prev || prev.groupId !== gid) return prev;
        if (prev.highlight) return { ...prev, only: false };
        return null;
      }
      const same = prev?.groupId === gid;
      return {
        groupId: gid,
        only: true,
        highlight: same ? !!prev?.highlight : false,
      };
    });
  };


/*  
  const updateSumByGroup = async () => {
    if (curProject === null) {
      return;
    }
    groups.forEach(group => {
      let count: any = 0
      lcs.forEach(lc => {
        const currentGroups = lc.groups?.split(',')
        if (currentGroups && currentGroups.length > 0) {
          currentGroups.forEach(async (groupId) => {
            if (groupId === group.id) {
              if (lc.value && lc.value !== 'Tr.Err' && count !== 'Tr.Err') {
                const useTare = lc.status_tare && tareStatus;
                count += useTare ? (Number(lc.weightnotare)) : Number(lc.value);
              }
              if (!isNaN(count) && Number(count) < 0) {
                count = 0
              }
              if (lc.value === 'Tr.Err') {
                count = 'Tr.Err'
              }
              await fire_overload(group.id, count, group.overload, 'group');
              const filteredGroups = groups.filter((grp) => grp.id !== group.id);
              const filteredCurrentGroup = groups.filter((grp) => grp.id === group.id);
              filteredCurrentGroup[0].sum = count
              const updatedGrooupp = [...filteredGroups, ...filteredCurrentGroup]
              const sortedGroups = [...updatedGrooupp].sort((a, b) => {
                const idA = parseInt(a.id || '0');
                const idB = parseInt(b.id || '0');
                return idA - idB;
              });
              updateGroups(sortedGroups)
            }
          });
        }
      });
    });
  }

  */

/*const updateSumByGroup = async () => {
  if (curProject === null) return;
  
  groups.forEach(group => {
    let count: any = 0;
    let hasError = false; // Nueva bandera para detectar fallos en el grupo

    lcs.forEach(lc => {
      const currentGroups = lc.groups?.split(',');
      if (currentGroups?.includes(group.id)) {
        const useTare = lc.status_tare && tareStatus;
        const val = useTare ? Number(lc.weightnotare) : Number(lc.value);

        if (lc.value === 'Tr.Err' || isNaN(val)) {
          hasError = true; // Marcamos que hubo un error de transmisión
        } else {
          count += val; // Sumamos solo las celdas que funcionan
        }
      }
    });

    if (count < 0) count = 0;

    // Si la suma parcial ya supera el overload, ignoramos el Tr.Err para disparar la alerta
    // Si no lo supera pero hay error, pasamos 'Tr.Err' solo si no hay un overload previo (esto se maneja en fire_overload)
    const finalValue = (count > Number(group.overload)) ? count : (hasError ? 'Tr.Err' : count);
    
    fire_overload(group.id, finalValue, group.overload, 'group');
    // ... resto del código para actualizar el estado del grupo ...
  });
}*/
/*
const updateSumByGroup = async () => {
    if (curProject === null) {
      return;
    }
    groups.forEach(group => {
      let partialSum: any = 0;
      let groupHasError = false;
      
      lcs.forEach(lc => {
        const currentGroups = lc.groups?.split(',');
        if (currentGroups && currentGroups.length > 0) {
          currentGroups.forEach(async (groupId) => {
            if (groupId === group.id) {
              const useTare = lc.status_tare && tareStatus && lc.weightnotare != null && lc.weightnotare !== '';
              const valString = useTare ? lc.weightnotare : lc.value;
              
              if (valString === 'Tr.Err' || valString === null || valString === undefined) {
                groupHasError = true;
              } else {
                const valNum = parseFloat(valString);
                if (!isNaN(valNum)) {
                  partialSum += valNum;
                }
              }
            }
          });
        }
      });

      if (partialSum < 0) partialSum = 0;
      //console.log("partialSum", partialSum, "groupHasError", groupHasError, "overload", group.overload);

      // LÓGICA DE DECISIÓN:
      // Si la suma de las que sí funcionan ya es mayor al overload, usamos ese valor.
      // Si no supera el overload pero hay una celda con error, mandamos 'Tr.Err'.
      let finalGroupValue: any;
      const limit = parseFloat(group.overload);
      
      if (!isNaN(limit) && partialSum > limit) {
        finalGroupValue = partialSum; // Ya hay sobrecarga física confirmada
      } else if (groupHasError) {
        finalGroupValue = 'Tr.Err'; // Incertidumbre, pero no supera el límite aún
      } else {
        finalGroupValue = partialSum; // Todo normal
      }

      fire_overload(group.id, finalGroupValue, group.overload, 'group');

      // Actualización visual del estado del grupo
      const fx = (curProject?.units?.toLowerCase().replace('.', '') === "mton") ? 3 : 0;
      const displayValue = finalGroupValue === 'Tr.Err' ? 'Tr.Err' : finalGroupValue.toFixed(fx);
      
      const updatedGroups = groups.map(grp => {
        if (grp.id === group.id) return { ...grp, sum: displayValue };
        return grp;
      }).sort((a, b) => parseInt(a.id || '0') - parseInt(b.id || '0'));
      
      updateGroups(updatedGroups);
    });
  }
*/
 /* useEffect(() => {
    const activeUpdateSumByGroup = async () => {
      await updateSumByGroup()
    }
    activeUpdateSumByGroup()
  }, [liveLC])*/

  const handleGroupAction = async (type: string) => {
    let ifBigger = true
    if (!selectedRef.current) return
    const groupShownId = selectedRef.current.id
    switch (type) {
      case 'tare':
        if (!groupShownId) return
        if (selectedRef.current?.tare !== 'true') {
          // when clicked tare
          let tare_ok = true
          lcs.forEach(lc => {
            const g = lc.groups?.split(',').map((x) => String(x).trim()) ?? []
            const lcId = lc.id
            if (g.includes(String(groupShownId))) {
              const live = liveLC.find(item => item.id === lcId)
              const v = strToFloat(live?.value) + strToFloat(live?.zero)
              if (v <= 0) {
                tare_ok = false
                ifBigger = false
              }
            }
          })
          if (tare_ok) {
            await tare_group(groupShownId)
            const onOk = tare_on(true);
            if (onOk) {
              setSuccess({
                title: t('Monitor.Modal.TareMode'),
                subtitle: t('Monitor.Modal.TareSubtitle')
              })
            } else {
              return
            }
          } else {
            if (!ifBigger) { updateErrStr("One or more of your LC's load <= 0") }
            else { updateErrStr('You must select at least one group in tare mode. doubletap the group name and then click "tare" button') }

          }
        } else {
          untare_group(groupShownId)
        }

        setVisibleModal('')
        break;
      /*case 'zero':
        if (selectedRef.current && selectedRef.current.id) {
          const groupId = String(selectedRef.current.id)
          const inGroup = (item: ILC) => (item.groups?.split(',').map(g => g.trim()) ?? []).includes(groupId)
          const groupLcs = lcs.filter(lc => normalizeProjectId(lc.project_id) === normalizeProjectId(curProject.id) && inGroup(lc))
          const multiply = f_get_units_multiply('M.TON')
          const newZero = (item: ILC) => curProject.units !== 'M.TON' ? Number(String((Number(item.realval)) * (Number(multiply))) || '0') * -1 : (Number(String((Number(item.realval))))) * -1
          const updates: { key: any; changes: any }[] = []
          groupLcs.forEach(lc => {
            updates.push({
              key: lc.lc_id,
              changes: {
                zero: newZero(lc),
                realval: parseInt(lc.realval ?? '0'),
                psw: '0'
              }
            })
          })
          try {
            for (const { key, changes } of updates) {
              await db.lcs.update(key, changes);
            }
          } catch (err) {
            setVisibleModal('')
            updateErrStr(t('Monitor.Modal.ZeroSubtitle') || 'Zero failed.')
            return
          }
          const updatedLcsArray = lcs.map(item => {
            if (normalizeProjectId(item.project_id) !== normalizeProjectId(curProject.id) || !inGroup(item)) return item
            return { ...item, psw: 0, zero: newZero(item) }
          })
          updateLCs(updatedLcsArray)
        }
        setSuccess({
          title: `${t('Monitor.Modal.Zero')} ${selectedRef.current?.title}`,
          subtitle: t('Monitor.Modal.ZeroSuccessSubtitle', { group: selectedRef.current?.title })
        })
        setVisibleModal('')
        break;*/
/*
      case 'zero':
        if (selectedRef.current && selectedRef.current.id) {
          const groupId = String(selectedRef.current.id);
          const inGroup = (item: ILC) => (item.groups?.split(',').map(g => g.trim()) ?? []).includes(groupId);
          
          // 1. Filtrar las celdas del grupo
          const groupLcs = lcs.filter(lc => normalizeProjectId(lc.project_id) === normalizeProjectId(curProject.id) && inGroup(lc));
          
          if (groupLcs.length === 0) {
            setVisibleModal('');
            return;
          }

          // 2. Iniciar estado de carga
          setIsZeroing(true);
          setZeroProgress(0);
          setTotalToZero(groupLcs.length);
          const multiply = f_get_units_multiply('M.TON');

          try {
            // 3. Preparar los datos actualizados
            const updatedLcsData = groupLcs.map(lc => {
              const valReal = Number(lc.realval);
              const zeroValue = curProject.units !== 'M.TON' 
                ? (valReal * Number(multiply)) * -1 
                : valReal * -1;

              return {
                ...lc,
                zero: zeroValue,
                realval: parseInt(lc.realval ?? '0'),
                psw: '0'
              };
            });

            // 4. Actualización en Base de Datos (Uso de bulkPut para velocidad extrema)
            // Dexie (tu db) es mucho más rápido con bulkPut que con transacciones individuales
            await db.lcs.bulkPut(updatedLcsData);

            // 5. Simular progreso para feedback visual (opcional si es muy rápido)
            // Si prefieres progreso real de DB, podrías procesar en bloques de 10
            for (let i = 0; i <= 100; i += 20) {
              setZeroProgress(i);
              await new Promise(resolve => setTimeout(resolve, 50)); // Pequeña pausa para que la UI se pinte
            }

            // 6. Actualizar Contexto Global de una sola vez
            const finalLcsArray = lcs.map(item => {
              const updated = updatedLcsData.find(u => u.lc_id === item.lc_id);
              return updated ? updated : item;
            });
            
            updateLCs(finalLcsArray);
            
            setSuccess({
              title: `${t('Monitor.Modal.Zero')} ${selectedRef.current?.title}`,
              subtitle: t('Monitor.Modal.ZeroSuccessSubtitle', { group: selectedRef.current?.title })
            });

          } catch (err) {
            console.error("Zero Group Error:", err);
            updateErrStr('Error aplicando Zero a las celdas.');
          } finally {
            setIsZeroing(false);
            setVisibleModal('');
          }
        }
        break;*/

      /*case 'zero':
        if (selectedRef.current && selectedRef.current.id) {

          // 1. BLOQUEO INMEDIATO: Detiene cualquier nuevo beep o toast
          isProcessingRef.current = true;
          setIsZeroing(true);
          
          // 2. LIMPIEZA TOTAL: Borra todos los avisos de Underload de la pantalla
          toast.dismiss();

          const groupId = String(selectedRef.current.id);
          const inGroup = (item: ILC) => (item.groups?.split(',').map(g => g.trim()) ?? []).includes(groupId);
          const groupLcs = lcs.filter(lc => normalizeProjectId(lc.project_id) === normalizeProjectId(curProject.id) && inGroup(lc));
          
          if (groupLcs.length === 0) return setVisibleModal('');

          // PASO 1: Bloqueamos los procesos en segundo plano
          isProcessingRef.current = true; 
          setIsZeroing(true);
          setZeroProgress(10); // Feedback inmediato

          const multiply = f_get_units_multiply('M.TON');

          // PASO 2: Usamos una transacción de base de datos para máxima velocidad
          await db.transaction('rw', db.lcs, async () => {
            const updatedLcsData = groupLcs.map(lc => {
              const valReal = Number(lc.realval);
              const zeroValue = curProject.units !== 'M.TON' 
                ? (valReal * Number(multiply)) * -1 
                : valReal * -1;

              return {
                ...lc,
                zero: zeroValue,
                realval: parseInt(lc.realval ?? '0'),
                psw: '0'
              };
            });

            // Escritura masiva atómica
            await db.lcs.bulkPut(updatedLcsData);
            setZeroProgress(60);

            // PASO 3: Actualizamos el contexto de UNA SOLA VEZ
            const finalLcsArray = lcs.map(item => {
              const updated = updatedLcsData.find(u => u.lc_id === item.lc_id);
              return updated ? updated : item;
            });
            
            updateLCs(finalLcsArray);
          });

          // PASO 4: Liberamos el hilo principal y notificamos éxito
          setZeroProgress(100);
          setTimeout(() => {
            isProcessingRef.current = false; // Rehabilitamos los cálculos de monitoreo
            setIsZeroing(false);
            setVisibleModal('');
            setSuccess({
              title: `${t('Monitor.Modal.Zero')} ${selectedRef.current?.title}`,
              subtitle: t('Monitor.Modal.ZeroSuccessSubtitle', { group: selectedRef.current?.title })
            });
          }, 100); 
        }
        break;*/

      case 'zero':
        
        if (selectedRef.current && selectedRef.current.id) {
          const groupId = String(selectedRef.current.id);
          
          const inGroup = (item: ILC) => (item.groups?.split(',').map(g => g.trim()) ?? []).includes(groupId);
          const groupLcs = lcs.filter(lc => normalizeProjectId(lc.project_id) === normalizeProjectId(curProject.id) && inGroup(lc));
          setVisibleModal('');
          if (groupLcs.length === 0) return setVisibleModal('');
          // En el case 'zero':
logEvent('INFO', `Starting Zero massive for group: ${groupId}`, { Loadcells: groupLcs.length });
          // PASO 1: Preparación inmediata
          setIsZeroing(true);
          setZeroProgress(5);
          setTotalToZero(groupLcs.length);
          isProcessingRef.current = true; // Bloquea cálculos de monitoreo

          // 2. LIMPIEZA TOTAL: Borra todos los avisos de Underload de la pantalla
          toast.dismiss();
          // PASO 2: Usamos un pequeño delay para permitir que la Barra de Progreso se dibuje
          setTimeout(async () => {
            try {
              const multiply = f_get_units_multiply('M.TON');
              
              // Procesamiento de datos en memoria (rápido)
              const updatedLcsData = groupLcs.map(lc => {
                const valReal = Number(lc.realval);
                const zeroValue = curProject.units !== 'M.TON' 
                  ? (valReal * Number(multiply)) * -1 
                  : valReal * -1;
                return { ...lc, zero: zeroValue, realval: parseInt(lc.realval ?? '0'), psw: '0' };
              });

              setZeroProgress(40);

              // Operación de Base de Datos Atómica
              await db.lcs.bulkPut(updatedLcsData);
              setZeroProgress(80);

              // Actualización masiva del contexto (aquí suele ocurrir el lag)
              const finalLcsArray = lcs.map(item => {
                const updated = updatedLcsData.find(u => u.lc_id === item.lc_id);
                return updated ? updated : item;
              });

              updateLCs(finalLcsArray); //
              setZeroProgress(100);

              // Finalización
              setTimeout(() => {
                setIsZeroing(false);
                //setVisibleModal('');
                isProcessingRef.current = false; // Reactiva monitoreo
                setSuccess({
                  title: `${t('Monitor.Modal.Zero')} ${selectedRef.current?.title}`,
                  subtitle: t('Monitor.Modal.ZeroSuccessSubtitle', { group: selectedRef.current?.title })
                });
               // setSuccess({ title: 'Completado', subtitle: 'Zero aplicado con éxito' });
              }, 300);

            } catch (err) {
              logEvent('ERROR', 'Failure on DB (massive Zero)', err)
              console.error("Error en Zero masivo:", err);
              setIsZeroing(false);
              isProcessingRef.current = false;
              updateErrStr('Error en la base de datos.');
            }
          }, 100); // 100ms son suficientes para que el navegador renderice la barra
        logEvent('INFO', 'Zero completed successfully in DB');
        }
        break;
      default:
        break;
    }
  }

  const handleCloseModal = () => {
    setVisibleModal('')
  }

  const update_project_image = async (project_id: any, image: any) => {
    try {
      await db.projects.update(project_id, { p_image: image });
      f_update_project_last_change()
    } catch (err) {
      console.error('Error updating row: ', err);
    }
  }

  const lc_show_max = () => {
    console.log("===lc_show_max===")
  }

  const handleTareAction = (type: string, groupShownId: string) => {
    if (type === 'tare')
      tare_group(groupShownId)
    else
      untare_group(groupShownId)
  }

  const tare_group = async (groupShownId: string) => {
    const gid = String(groupShownId)
    const groupRow = groups.find((g) => String(g.id) === gid)
    if (!groupRow) {
      console.warn('[TARE] Group not found:', gid)
      return
    }
    const matchingLCs = lcs.filter(lc => liveLC.some(live => live.id === lc.id));
    try {
      const toUpdate: ILC[] = []
      for (const lc_m of matchingLCs) {
        const g = lc_m?.groups?.split(',').map((x) => String(x).trim()) ?? []

        if (g.includes(gid)) {
          const live = liveLC.find(live => live.id === lc_m.id)
          if (!live) {
            continue;
          }
          // liveValue from buffer = (raw + zero) already = "weight with zero" in display. So tare = -that in M.TON (do NOT add zero again).
          const multiply = f_get_units_multiply('M.TON')
          const liveRealval = (live as any).realval ?? lc_m.realval
          const liveValue = (live as any).value ?? lc_m.value
          const weightWithZeroDisplay = Number(liveValue ?? liveRealval ?? 0)
          const weightWithZeroInMton = curProject.units !== 'M.TON'
            ? weightWithZeroDisplay * Number(multiply)
            : weightWithZeroDisplay
          const tareInMton = -weightWithZeroInMton
          const index = lcs.findIndex(x => x.id === lc_m.id);
          if (index >= 0) {
            const weightnotare = curProject.units === 'M.TON' ? '0.000' : '0'
            toUpdate.push({ ...lcs[index], tare: tareInMton, status_tare: true, weightnotare })
          }
        }
      }
      if (toUpdate.length > 0) {
        const updatedLcs = lcs.map(item => {
          const u = toUpdate.find(t => t.id === item.id && normalizeProjectId(t.project_id) === normalizeProjectId(item.project_id));
          return u ?? item;
        });
        updateLCs(updatedLcs);
      } else {
        void 0; // No LCs to update (e.g. no live data or group mismatch)
      }

      const updatedGroup: IGroup = {
        ...groupRow,
        tare: 'true',
      }
      selectedRef.current = updatedGroup
      updateGroups(updatedGroup)
    } catch (error) {
      console.error('[TARE] Error updating tare value:', error);
    }
  }

  const untare_group = async (groupShownId: string) => {
    const gid = String(groupShownId)
    try {
      const ids: number[] = []
      lcs.forEach((lc, index) => {
        const g = lc.groups?.split(',').map((x) => String(x).trim()) ?? []
        if (g.includes(gid)) {
          ids.push(index)
        }
      })
      if (ids.length > 0) {
        const updatedLcs = lcs.map((lc, idx) =>
          ids.includes(idx) ? { ...lc, status_tare: false, tare: 0, weightnotare: undefined } : lc
        );
        updateLCs(updatedLcs);
      }
      const groupRow = groups.find((g) => String(g.id) === gid)
      if (groupRow) {
        const merged: IGroup = { ...groupRow, tare: '' }
        selectedRef.current = merged
        updateGroups(merged)
      }
    } catch (error) {
      console.log('Transaction ERROR: ' + error);
    }
  }

  const unique_group_lcs = (group_id: string) => {
    // check if lcs in group are uinque for this group
    // that in order to prevent tare or zero groups
    // that the lc is showed in more than one group
    let unique = true;
    lcs.forEach(function (lc) {
      const g = lc.groups?.split(',').map(item => parseInt(item, 10))
      if (g?.includes(parseInt(group_id))) {
        if (g.length > 1) {
          unique = false;
        }
      }
    });
    return unique;
  }
  const turned_off_Devices = (group_id: string) => {
    let turned_off = false
    groups.forEach((group) => {
      if (group.id === group_id && group.sum === 'Tr.Err')
        turned_off = true
    })
    return turned_off;
  }

  const handleMaxStatus = (val: boolean) => {
    if (val)
      setLoadStatus(true)
    setMaxStatus(val)
  }

  const handleLoadStatus = (val: boolean) => {
    if (!val)
      setMaxStatus(false)
    setLoadStatus(val)
  }

  const handleMonitorToolbarTare = () => {
    if (!bleConnected) {
      updateErrStr(t('Msg.ErrConnectPRR'))
      return
    }
    const gv = groupVisual
    if (!gv || (!gv.highlight && !gv.only)) {
      fire_error(t('Monitor.Modal.SelectGroupForTare'))
      return
    }
    const gid = gv.groupId
    const groupRow = groups.find((g) => String(g.id) === gid)
    if (!groupRow) {
      fire_error(t('Monitor.Modal.SelectGroupForTare'))
      return
    }
    if (groupRow.tare === 'true') {
      void tare_off()
      return
    }
    if (!unique_group_lcs(gid)) {
      fire_error('This group contain non unique load cells');
      return
    }
    if (turned_off_Devices(gid)) {
      fire_error('This group contains non-transmitting load cells')
    }
    let tare_ok = true
    let ifBigger = true
    lcs.forEach(lc => {
      const g = lc.groups?.split(',').map((x) => String(x).trim()) ?? []
      if (g.includes(gid)) {
        const live = liveLC.find(item => item.id === lc.id)
        const v = strToFloat(live?.value) + strToFloat(live?.zero)
        if (v <= 0) {
          tare_ok = false
          ifBigger = false
        }
      }
    })
    if (!tare_ok) {
      if (!ifBigger) updateErrStr("One or more of your LC's load <= 0")
      return
    }
    void (async () => {
      await tare_group(gid)
      const onOk = tare_on(true)
      if (onOk) {
        setSuccess({
          title: t('Monitor.Modal.TareMode'),
          subtitle: t('Monitor.Modal.TareSubtitle')
        })
      }
    })()
  }

  const tareStatusToggle = () => {
    if (tareStatus)
      tare_off()
    else
      tare_on();
  }

  const tare_on = (isTared = false) => {
    let go_tare = 0
    const taredGroupIds: string[] = []
    groups.forEach((group) => {
      if (group.tare === 'true') {
        go_tare = 1
        taredGroupIds.push(String(group.id))
      }
    })
    if (go_tare == 1 || isTared) {
      updateTareStatus(true)
      return true
    } else {
      updateTareStatus(false)
      fire_error('You must select at least one group in tare mode. doubletap the group name and then click "tare" button');
      return false
    }
  }

  const tare_off = async () => {
    updateTareStatus(false)
    const newGroups = groups.map((group) => ({ ...group, tare: '' }))
    updateGroups(newGroups)
    const clearedLcs = lcs.map((lc) => ({ ...lc, status_tare: false, tare: 0, weightnotare: undefined }))
    updateLCs(clearedLcs)
    return true
  }
  const handleGroupActionCall = async (type: string) => {
    await handleGroupAction(type)
  }

  return (
    <CommonLayout
      classes='p-2 gap-1'
      maxStatus={maxStatus}
      loadStatus={loadStatus}
      tareStatus={tareStatus}
      warning={warning}
      maxStatusToggle={handleMaxStatus}
      loadStatusToggle={handleLoadStatus}
      tareStatusToggle={tareStatusToggle}
      toolbarTareClick={handleMonitorToolbarTare}
      onWarning={setWarning}
      onDBHandler={setDBHandler}
      onTareAction={handleTareAction}
    >
      <div className='grid grid-cols-16 h-10 w-full overflow-visible'>
        {groups.map((item: IGroup, index: number) => {
          // console.log(item);
            let v = parseFloat(item.sum ?? '')
            let o = parseFloat(item.overload);
            const p = v / o * 100;

            const u = curProject?.units?.toLowerCase().replace('.', '') //for m.ton;
            const fx = (u == "mton") ? 3 : 0;

            if (isNaN(v)) {
              v = 0;
            }
            if (isNaN(o)) {
              o = 0;
            }

            /*

            <div
                key={index}
                className={`flex flex-col border-l border-dark cursor-pointer ${index === groups.length - 1 && 'border-r'}`}
                onDoubleClick={() => handleGroup(item)}
              >
                
                <Text
                  classes={`
                  h-1/2  text-dark !text-xs flex items-center justify-center
                  ${v > o ?
                    'bg-danger !important text-danger'
                    :
                    `${p > 130 ?
                      'bg-warning'
                      :
                      `${item.sum ? 'bg-primary' : 'bg-primary'}`
                    }`
                  }
                  ${p > 1}
                `}
                  label={item.overload ? item.title : ''}
                />
                {bleConnected ?
                  <Text
                    classes={item.sum === "Tr.Err" ? 'text-xs font-bold bg-danger rounded w-max p-1' : ('h-1/2 bg-medium text-dark !text-xs flex items-center justify-center')}
                    label={item.sum !== undefined && item.sum !== null ?
                      (item.sum === "Tr.Err" ? "Tr.Err" : (!Number.isNaN(parseFloat(item.sum)) ? parseFloat(item.sum).toFixed(fx) : ''))
                      : ''}
                  />
                  :
                  <div className="h-1/2 w-full bg-medium text-center flex justify-center items-center">
                    <span className={`text-xs font-bold ${item.overload && 'bg-danger'} text-white px-1.5 rounded w-max`}>{item.overload ? t("Common.TrErr") : ''}</span>
                  </div>
                }
                
              </div>

              */

              // Un grupo se considera "activo" si tiene definido un límite de sobrecarga (overload)
              const isActive = item.overload && Number(item.overload) > 0;

              const isGroupVisualFocus =
                !!groupVisual &&
                (groupVisual.highlight || groupVisual.only) &&
                groupVisual.groupId === String(item.id);

            return (

              <div
                key={index}
                className={`flex flex-col border-l border-dark cursor-pointer ${index === groups.length - 1 && 'border-r'} ${
                  isGroupVisualFocus ? 'relative z-[20] rounded-sm ring-4 ring-primary ring-offset-1' : ''
                }`}
                onPointerDown={onGroupPointerDown(item)}
                onPointerUp={onGroupPointerUp}
                onPointerCancel={onGroupPointerUp}
                onPointerLeave={onGroupPointerUp}
                onClick={() => handleGroupTap(item)}
              >
                {/* Título del grupo: Se mantiene Azul (Primary) a menos que haya sobrecarga real */}
                <Text
                  classes={`
                    h-1/2 text-dark !text-xs flex items-center justify-center
                    ${(v > o && o > 0) ? 'bg-danger text-white' : (p > 130 ? 'bg-warning' : 'bg-primary')}
                    ${isGroupVisualFocus ? 'font-bold' : ''}
                  `}
                  label={item.overload ? item.title : ''}
                />
                
                {bleConnected ?
                  <Text
                    /* Cuadro de valor: Cambia a Rojo solo si el texto es "Tr. Err" */
                    classes={item.sum === "Tr.Err" 
                      ? 'h-1/2 w-full bg-danger text-white font-bold !text-xs flex items-center justify-center' 
                      : `h-1/2 bg-medium text-dark !text-xs flex items-center justify-center${isGroupVisualFocus ? ' font-bold' : ''}`
                    }
                    label={item.sum === "Tr.Err" 
                      ? 
                        "Tr.Err" 
                      : 
                        (isActive)
                        ?
                          (item.sum && !isNaN(parseFloat(item.sum)) ? parseFloat(item.sum).toFixed(fx) : '')
                        :
                          ""
                    }
                  />
                  :
                  <div className="h-1/2 w-full bg-medium text-center flex justify-center items-center">
                    <span className={`text-xs font-bold ${item.overload && 'bg-danger'} text-white px-1.5 rounded w-max`}>
                      {item.overload ? "Tr.Err" : ''}
                    </span>
                  </div>
                }
              </div>

              
            )
          })}
      </div>
      {contentView()}
      <GroupActionModal
        mode="full"
        visible={visibleModal === MonitorModals.GroupAction}
        tare={tareStatus && !!(selectedRef.current && selectedRef.current?.tare === 'true')}
        onAction={(type) => {
          handleGroupActionCall(type);
        }}
        onClose={() => handleCloseModal()}
        highlightChecked={
          !!groupVisual &&
          groupVisual.groupId === String(selectedRef.current?.id ?? '') &&
          groupVisual.highlight
        }
        onlyGroupChecked={
          !!groupVisual &&
          groupVisual.groupId === String(selectedRef.current?.id ?? '') &&
          groupVisual.only
        }
        onHighlightChange={handleGroupHighlightChange}
        onOnlyGroupChange={handleGroupOnlyLcsChange}
      />
      <GroupActionModal
        mode="visualOnly"
        visible={visibleModal === MonitorModals.GroupVisual}
        tare={false}
        onAction={() => {}}
        onClose={() => handleCloseModal()}
        highlightChecked={
          !!groupVisual &&
          groupVisual.groupId === String(selectedRef.current?.id ?? '') &&
          groupVisual.highlight
        }
        onlyGroupChecked={
          !!groupVisual &&
          groupVisual.groupId === String(selectedRef.current?.id ?? '') &&
          groupVisual.only
        }
        onHighlightChange={handleGroupHighlightChange}
        onOnlyGroupChange={handleGroupOnlyLcsChange}
      />
      <GroupActionModal
        mode="zeroOnly"
        visible={visibleModal === MonitorModals.GroupZero}
        tare={false}
        onAction={(type) => {
          handleGroupActionCall(type);
        }}
        onClose={() => handleCloseModal()}
        highlightChecked={false}
        onlyGroupChecked={false}
        onHighlightChange={() => {}}
        onOnlyGroupChange={() => {}}
      />
      <SuccessModal
        visible={success ? true : false}
        title={success?.title || ''}
        message={success?.subtitle || ''}
        classes="gap-4"
        titleClasses='!text-3xl'
        onClose={() => setSuccess(null)}
      />
      {isZeroing && (
        <div className="progress-overlay-front">
          <div className="bg-[#121212] p-10 rounded-3xl shadow-[0_0_60px_rgba(250,204,21,0.3)] border-2 border-primary w-[400px] text-center">
            <h3 className="text-white mb-6 font-bold text-2xl tracking-[0.2em] uppercase">
              applying Zero
            </h3>
            
            {/* Contenedor de la barra */}
            <div className="w-full bg-gray-800 rounded-full h-8 overflow-hidden border border-gray-600 p-1">
              <div 
                className="bg-primary h-full rounded-full transition-all duration-300 ease-out shadow-[0_0_20px_#facc15]"
                style={{ width: `${zeroProgress}%` }}
              ></div>
            </div>
            
            {/* Info de progreso */}
            <div className="flex justify-between mt-4 px-2">
              <span className="text-gray-400 text-sm font-medium">
                {totalToZero} Dispositivos
              </span>
              <span className="text-primary font-black text-xl">
                {zeroProgress}%
              </span>
            </div>
          </div>
        </div>
      )}
    </CommonLayout>
  )
}

export default Monitor;