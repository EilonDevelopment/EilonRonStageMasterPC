import React, { DragEventHandler, FC, SyntheticEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import Draggable, { DraggableCore, DraggableData, DraggableEvent } from 'react-draggable';
import { Resizable, ResizableBox, ResizeCallbackData } from 'react-resizable';
import { Position, ResizableDelta, Rnd } from 'react-rnd';

import { arrowUndoOutline, cameraOutline, createOutline, homeOutline, imageOutline, locateOutline, lockClosedOutline, lockOpenOutline } from "ionicons/icons";
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

import { ILC } from '../../helper/types';
import { IonButton, IonIcon, IonSpinner } from '@ionic/react';
import { t } from 'i18next';
import useAppData from '../../hooks/useAppData';
import useFunctions from '../../hooks/useFunctions';
import { normalizeProjectId } from '../../helper/functions';
import { Line } from 'react-chartjs-2';
import { db } from '../../db';
import Swal from 'sweetalert2';
import BackgroundImageEditorModal from '../Modals/BackgroundImageEditorModal';
import './MonitorView.css';

interface SizeInfoType {
  width: number,
  height: number,
}
interface PosInfoType {
  x: number,
  y: number,
}

interface MonitorViewProps {
  data: ILC[],
  max: boolean;
  load: boolean;
  tare: boolean;
  onMoveLC: (lcItem: ILC) => void;
  onReset: (status: boolean) => void | Promise<void>;
}

type MonitorLcBoxProps = {
  item: ILC;
  index: number;
  x: number;
  y: number;
  tare: boolean;
  maxMode: boolean;
  loadMode: boolean;
  bleConnected: boolean;
  locked: boolean;
  disabled?: boolean;
  boundsRight: number;
  boundsBottom: number;
  onStop: (e: DraggableEvent, data: DraggableData, index: number, x: number, y: number) => void;
};

const MonitorLcBox = React.memo((props: MonitorLcBoxProps) => {
  const {
    item,
    index,
    x,
    y,
    tare,
    maxMode,
    loadMode,
    bleConnected,
    locked,
    disabled,
    boundsRight,
    boundsBottom,
    onStop,
  } = props;

  const {
    id,
    title,
    overload,
    underload,
    value = t("Common.TrErr"),
    battery = 0,
    status_tare,
    weightnotare,
  } = item;

  const numVal = Number(value);
  const numOver = Number(overload);
  const numUnder = Number(underload);
  const valueForCheck = (tare && status_tare && weightnotare != null && weightnotare !== '') ? Number(weightnotare) : numVal;
  const isDanger = !Number.isNaN(valueForCheck) && !Number.isNaN(numOver) && numOver > 0 && valueForCheck >= numOver * 1.3;
  const isOverload = !Number.isNaN(valueForCheck) && !Number.isNaN(numOver) && valueForCheck > numOver;
  const isUnderload = !Number.isNaN(valueForCheck) && !Number.isNaN(numUnder) && valueForCheck < numUnder;
  const displayValue = isDanger ? 'DANGER' : (value ? value : (bleConnected ? value : t("Common.TrErr")));
  const valueShown = (tare && status_tare && weightnotare != null && weightnotare !== '') ? weightnotare : (value ?? '');
  const isZeroValue = valueShown === '0' || parseFloat(String(valueShown).trim()) === 0;
  const showRedValueBg = (isDanger || isOverload || isUnderload) && !isZeroValue;

  return (
    <div
      className="pointer-events-auto"
      style={{ position: 'absolute', left: x, top: y, touchAction: 'none' }}
    >
      <Draggable
        handle=".handle"
        defaultPosition={{ x: 0, y: 0 }}
        grid={[1, 1]}
        scale={1}
        disabled={!!disabled || locked}
        bounds={{
          left: -x,
          top: -y,
          right: boundsRight,
          bottom: boundsBottom,
        }}
        onStop={(e, data) => onStop(e, data, index, x, y)}
      >
        <div
          className="handle monitor-lc-handle border w-20 h-10.5 flex flex-col text-xs rounded cursor-pointer shrink-0"
          style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
        >
          <div className="top-side bg-black text-white text-center rounded-t-sm py-0.5">{title ? title : id}</div>
          <div
            id={`monitor${id}`}
            className={`
            bottom-side text-center py-0.5 rounded-b-sm
            ${(maxMode ? 'bg-cyan2 text-white' : (showRedValueBg
                ? 'bg-red-600 text-black'
                : (tare && status_tare ? 'bg-cyan-600 text-white' : (
                    !bleConnected ? 'bg-medium text-danger' :
                    (`${value === t("Common.TrErr") ? 'bg-medium text-danger' :
                      'bg-green-600 text-white'}`)))))}
          `}
          >
            {maxMode
              ? (bleConnected ? (item.max ?? 0) : t("Common.TrErr"))
              : (isDanger ? 'DANGER' : (bleConnected && status_tare && tare
                  ? weightnotare
                  : (!loadMode ? (bleConnected ? `${battery}%` : t("Common.TrErr")) : displayValue)))}
          </div>
        </div>
      </Draggable>
    </div>
  );
}, (prev, next) => {
  return (
    prev.item === next.item &&
    prev.x === next.x &&
    prev.y === next.y &&
    prev.tare === next.tare &&
    prev.maxMode === next.maxMode &&
    prev.loadMode === next.loadMode &&
    prev.bleConnected === next.bleConnected &&
    prev.locked === next.locked &&
    prev.disabled === next.disabled &&
    prev.boundsRight === next.boundsRight &&
    prev.boundsBottom === next.boundsBottom
  );
});

const MonitorView: FC<MonitorViewProps> = (props) => {
  // console.log(curProject.p_image);

  const {
    data,
    max,
    load,
    tare: tareProp,
    // eslint-disable-next-line
    onMoveLC = () => { },
    // eslint-disable-next-line
    onReset = async () => { },
  } = props;

  const { bleConnected, curProject, liveLC, updateCurProject, updateProjects, updateLCs, groups, lcs, LCMax, platformType, tareStatus } = useAppData();
  // Use global tare from context so it persists when switching between monitor views (view/list/prog/stop)
  const tare = tareStatus ?? tareProp
  const { f_update_project_image_size, f_update_project_image_position, f_update_project_last_change, f_reposition_stage, f_load_lcs } = useFunctions()

  const imageFileInputRef = useRef<HTMLInputElement>(null)
  const [showBackgroundEditor, setShowBackgroundEditor] = useState(false)
  const [imageToEdit, setImageToEdit] = useState<string | null>(null)
  /** When true, modal opened for a new upload (gallery/camera) → use default sizes; when false, editing existing → use current sizes */
  const [isNewImageUpload, setIsNewImageUpload] = useState(false)
  const DEFAULT_UPLOAD_CANVAS_W = 319
  const DEFAULT_UPLOAD_CANVAS_H = 198

  const [list, setListData] = useState<ILC[]>([]);
  const [prevState, setPrevState] = useState<Partial<ILC>[]>([]);
  /** In home mode: temporary positions while dragging; not saved to DB. Cleared when entering home. */
  const [tempHomePositions, setTempHomePositions] = useState<Record<number, { x: number; y: number }>>({});

  const [locked, setLocked] = useState<boolean>(false);
  const [layoutProgress, setLayoutProgress] = useState(false);
  const [layoutProgressMessageKey, setLayoutProgressMessageKey] = useState('');
  /** Force remount of LC draggable nodes after heavy layout changes (iPad WebView can leave ghost layers). */
  const [lcRenderEpoch, setLcRenderEpoch] = useState(0);
  /** Force remount only of image scene (Rnd), not whole stage container. */
  const [sceneRenderEpoch, setSceneRenderEpoch] = useState(0);

  /** Default to home when lc_display_mode is undefined or not 'user' */
  const isUserMode = curProject?.lc_display_mode === 'user';
  const isHomeMode = !isUserMode;

  /** Merge lcs (context) into list so tare/weightnotare/value always reflect latest; use for display in all modes */
  const displayList = useMemo(() => {
    if (!list.length || !lcs.length) return list;
    const byKey = (lc: ILC) => `${lc.id}-${normalizeProjectId(lc.project_id)}`;
    const lcsMap = new Map(lcs.map((c: ILC) => [byKey(c), c]));
    return list.map((item: ILC) => {
      const ctx = lcsMap.get(byKey(item));
      if (!ctx) return item;
      return {
        ...item,
        value: ctx.value !== undefined ? ctx.value : item.value,
        weightnotare: ctx.weightnotare !== undefined ? ctx.weightnotare : item.weightnotare,
        status_tare: ctx.status_tare !== undefined ? ctx.status_tare : item.status_tare,
        tare: ctx.tare !== undefined ? ctx.tare : item.tare,
      };
    });
  }, [list, lcs]);

  /** Cap graph size to avoid unbounded growth and crashes with many LCs / long run times */
  const MAX_GRAPH_POINTS = 1000;
  const [labels, setLabels] = useState<string[]>([])
  const [graphData, setGraphData] = useState<any[]>([])

  const [width, setWidth] = useState(100)
  const [height, setHeight] = useState(100)
  /** Default = frame (ResizableBox) size until real values load; no arbitrary number. */
  const frameDefaultSize: SizeInfoType = {
    width: 10000,
    height: parseInt(curProject?.stage_y ?? '200', 10)
  };
  const currProjectRef = useRef<any>(curProject.p_image)
  const [sizeInfo, setSizeInfo] = useState<SizeInfoType>({
    width: currProjectRef?.current?.p_image_w ?? frameDefaultSize.width,
    height: currProjectRef?.current?.p_image_h ?? frameDefaultSize.height
  })
  const [posInfo, setPosInfo] = useState<PosInfoType>({
    x: currProjectRef?.current?.p_image_l ?? 0, y: currProjectRef?.current?.p_image_t ?? 0
  })
  const [triggered, setTriggered] = useState<boolean>(false)

  const posInfoRef = useRef<PosInfoType>(posInfo)
  const sizeInfoRef = useRef<SizeInfoType>(sizeInfo)
  const rndRef = useRef<Rnd>(null)
  const contentSideRef = useRef<HTMLDivElement>(null)
  const flag = useRef<number>(0)
  /** So we only set size from container once per project (avoids infinite setState loop). */
  const didSetSizeFromContainerRef = useRef<string | number | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [lcBoundsRight, setLcBoundsRight] = useState(3000)
  const [lcBoundsBottom, setLcBoundsBottom] = useState(2000)
  /** Bounds for background image: restrict top/left/right like LCs; no bottom restriction. */
  const [imageBoundsRight, setImageBoundsRight] = useState(3000)
  /** Explicit offset parent for drag so touch/Android uses same coordinate system as wrapper. */
  //const [dragOffsetParent, setDragOffsetParent] = useState<HTMLDivElement | null>(null)
  const LC_BOX_WIDTH = 80
  const LC_BOX_HEIGHT = 43
  /** On Android use scale 1 so touch tracks 1:1 (visualViewport.scale on device often wrong and causes lag). On web keep reactive to zoom. */
  /*const [dragScale, setDragScale] = useState(() =>
    platformType === 'android' ? 1 : (typeof window !== 'undefined' && window.visualViewport ? window.visualViewport.scale : 1)
  )*/
  /*useEffect(() => {
    if (platformType === 'android') return
    if (typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    const update = () => setDragScale(vv.scale)
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [platformType])*/

  /** On first load when project has image but no saved dimensions: use the black-framed area size as default. */
  useLayoutEffect(() => {
    if (!curProject?.id || !curProject?.p_image || curProject.p_image_w != null || curProject.p_image_h != null) return;
    if (didSetSizeFromContainerRef.current === curProject.id) return;
    const el = contentSideRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w < 80 || h < 80) return;
    didSetSizeFromContainerRef.current = curProject.id;
    const size = { width: w, height: h };
    const pos = { x: 0, y: 0 };
    setSizeInfo(size);
    setPosInfo(pos);
    sizeInfoRef.current = size;
    posInfoRef.current = pos;
    f_update_project_image_size(curProject.id, w, h);
    f_update_project_image_position(curProject.id, 0, 0);
    rndRef.current?.updateSize(size);
    rndRef.current?.updatePosition(pos);
  }, [curProject?.id, curProject?.p_image, curProject?.p_image_w, curProject?.p_image_h, f_update_project_image_size, f_update_project_image_position]);

  useEffect(() => {
    currProjectRef.current = curProject

  }, [curProject])
  useEffect(() => {
    setPosInfo({
      x: currProjectRef?.current?.p_image_l ?? 0, y: currProjectRef?.current?.p_image_t ?? 0
    })
    setSizeInfo({
      width: currProjectRef?.current?.p_image_w ?? frameDefaultSize.width,
      height: currProjectRef?.current?.p_image_h ?? frameDefaultSize.height
    })
  }, [curProject.id, frameDefaultSize.width, frameDefaultSize.height])
  useEffect(() => {
    const id = currProjectRef.current?.id;
    if (!id) return;

    db.projects.get(id).then(project => {
      if (!project) return;
      const hasSavedSize = project.p_image_w != null && project.p_image_h != null;
      if (hasSavedSize) {
        setSizeInfo({
          width: project.p_image_w,
          height: project.p_image_h,
        });
        setPosInfo({
          x: project.p_image_l ?? 0,
          y: project.p_image_t ?? 0,
        });
      }
      // when no saved size, useLayoutEffect will set size from container (black-framed area)
    });
  }, [curProject.id]);
  useEffect(() => {
    if (liveLC && !triggered) {
      setTriggered(true)
      setTimeout(() => {
        setTriggered(false)
        if (liveLC.length > 0) {
          setLabels(v => [...v, liveLC[0]?.time])
          setGraphData(v => {
            const newData = [...v];
            liveLC.forEach(item => {
              const existingItem = newData.find(dataItem => dataItem.id === item.id);
              if (existingItem) {
                existingItem.data = [...existingItem.data, item.value];
              } else {
                newData.push({
                  id: item.id,
                  data: [item.value]
                });
              }
            });
            return newData;
          });
        }
      }, 3000);
    }
  }, [liveLC]);

  useEffect(() => {
    // (async () => {
    //   if (!curProject) return
    //   await db.lcs.where('project_id').equals(curProject.id)
    //     .modify({ value: 0 })
    //   f_load_lcs()
    // })()
  }, [])

  useEffect(() => {
    sizeInfoRef.current = sizeInfo
  }, [sizeInfo])
  useEffect(() => {
    posInfoRef.current = posInfo
  }, [posInfo])
  useEffect(() => {
    console.log('data info: ', list);
    if (list.length) {
      setGraphData(list.map((item) => ({
        id: item.id,
        label: item.title,
        data: []
      })))
    }
  }, [list.length])

  useEffect(() => {
    if (curProject.p_image_l !== undefined)
      flag.current++
  }, [curProject])
  useEffect(() => {
    if (flag.current !== 1) return
    const size: SizeInfoType = { width: currProjectRef.current.p_image_w ?? frameDefaultSize.width, height: currProjectRef.current.p_image_h ?? frameDefaultSize.height }
    const pos: PosInfoType = { x: currProjectRef.current.p_image_l ?? 0, y: currProjectRef.current.p_image_t ?? 0 }

    setSizeInfo(size)
    setPosInfo(pos)

    rndRef.current?.updateSize(size)
    rndRef.current?.updatePosition(pos)

  }, [flag.current])

  useEffect(() => {
    setListData(data)
  }, [data])

  useEffect(() => {
    if (isHomeMode) {
      setTempHomePositions({});
    }
  }, [isHomeMode]);
/*
  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    setDragOffsetParent(el);
    const updateBounds = () => {
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const w = wrapper.clientWidth;
      setLcBoundsRight(Math.max(0, w - LC_BOX_WIDTH));
      if (curProject?.p_image && posInfo != null && sizeInfo != null) {
        setLcBoundsBottom(Math.max(0, posInfo.y + sizeInfo.height));
      } else {
        const rect = wrapper.getBoundingClientRect();
        const vv = typeof window !== 'undefined' && window.visualViewport;
        const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
        const bottomFromPage = viewportBottom - rect.top - LC_BOX_HEIGHT;
        setLcBoundsBottom(Math.max(0, bottomFromPage));
      }
    };
    updateBounds();
    const ro = new ResizeObserver(updateBounds);
    ro.observe(el);
    const onResizeOrScroll = () => updateBounds();
    window.addEventListener('resize', onResizeOrScroll);
    window.addEventListener('scroll', onResizeOrScroll, true);
    const vv = typeof window !== 'undefined' && window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', onResizeOrScroll);
      vv.addEventListener('scroll', onResizeOrScroll);
    }
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResizeOrScroll);
      window.removeEventListener('scroll', onResizeOrScroll, true);
      if (vv) {
        vv.removeEventListener('resize', onResizeOrScroll);
        vv.removeEventListener('scroll', onResizeOrScroll);
      }
    };
  }, [curProject?.p_image, posInfo, sizeInfo]);
*/
  /** Track content area width so background image is bounded on left/top/right (like LCs). */
  useLayoutEffect(() => {
    const el = contentSideRef.current;
    if (!el) return;
    const update = () => setImageBoundsRight(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const reposition_lc = (_e: Partial<DragEventHandler>, data: Partial<DraggableData>, index: number) => {
    if (isHomeMode) {
      setTempHomePositions(prev => ({ ...prev, [index]: { x: data.x ?? 0, y: data.y ?? 0 } }));
      return;
    }
    const updatedItem: ILC = { ...list[index], view_x: data.x + '', view_y: data.y + '' };
    setListData(v => v.map((item, idx) => {
      if (idx === index) return updatedItem;
      return item;
    }));
    onMoveLC(updatedItem);
  };

  const forceSceneRepaint = useCallback(() => {
    // WKWebView / Android WebView can keep stale composited snapshots after many absolute-position moves.
    // Remount only the Rnd scene and trigger resize a few times to flush compositor caches.
    setSceneRenderEpoch((v) => v + 1);
    const nudgeResize = () => window.dispatchEvent(new Event('resize'));
    requestAnimationFrame(() => {
      nudgeResize();
      requestAnimationFrame(() => {
        nudgeResize();
        setTimeout(nudgeResize, 0);
      });
    });
  }, []);

  /** Home column is unmounted in user+image mode; still bump repaint when toggling modes so WebView drops stale layers. */
  const prevHomeModeRef = useRef(isHomeMode);
  useLayoutEffect(() => {
    const prev = prevHomeModeRef.current;
    if (prev === isHomeMode) return;
    prevHomeModeRef.current = isHomeMode;
    if (!curProject?.p_image) return;
    flushSync(() => setLcRenderEpoch((v) => v + 1));
    forceSceneRepaint();
  }, [isHomeMode, curProject?.p_image, forceSceneRepaint]);

  const awaitDoubleRaf = () =>
    new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

  const runWithLayoutProgress = async (messageKey: string, action: () => void | Promise<void>) => {
    setLayoutProgressMessageKey(messageKey);
    setLayoutProgress(true);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    try {
      await Promise.resolve(action());
      await awaitDoubleRaf();
    } finally {
      setLayoutProgress(false);
      setLayoutProgressMessageKey('');
    }
  };

  const handlePos = async () => {
    if (!isUserMode || !curProject?.p_image || locked || layoutProgress) return;

    const canvasW = Number(sizeInfo?.width ?? 0);
    const canvasH = Number(sizeInfo?.height ?? 0);
    const margin = 8;
    const availW = canvasW - margin * 2;
    const availH = canvasH - margin * 2;
    if (availW < LC_BOX_WIDTH || availH < LC_BOX_HEIGHT) {
      void Swal.fire({
        title: t('Monitor.AutoPlace') || 'Auto place',
        text: 'Image area is too small to auto place cells.',
        icon: 'warning',
        heightAuto: false,
      });
      return;
    }

    const pendingIndices = list
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => {
        const x = parseInt(String(item.view_x ?? '0'), 10) || 0;
        const y = parseInt(String(item.view_y ?? '0'), 10) || 0;
        return x === 0 && (y === 0 || y === index * LC_BOX_HEIGHT);
      })
      .map(({ index }) => index);

    const targetIndices = pendingIndices.length > 0
      ? pendingIndices
      : list.map((_, index) => index);

    if (targetIndices.length === 0) return;

    setLayoutProgressMessageKey('Monitor.LayoutProgressAutoPlace');
    setLayoutProgress(true);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const maxCols = Math.max(1, Math.floor(availW / LC_BOX_WIDTH));
    const cols = Math.max(1, Math.min(maxCols, Math.ceil(Math.sqrt(targetIndices.length))));
    const rows = Math.ceil(targetIndices.length / cols);
    const maxX = Math.max(0, canvasW - LC_BOX_WIDTH - margin);
    const maxY = Math.max(0, canvasH - LC_BOX_HEIGHT - margin);
    const stepX = cols <= 1 ? 0 : Math.max(2, Math.floor((availW - LC_BOX_WIDTH) / (cols - 1)));
    const stepY = rows <= 1 ? 0 : Math.max(2, Math.floor((availH - LC_BOX_HEIGHT) / (rows - 1)));

    const updated = list.map((item) => ({ ...item }));
    targetIndices.forEach((listIndex, order) => {
      const col = order % cols;
      const row = Math.floor(order / cols);
      const x = Math.min(maxX, Math.max(margin, margin + col * stepX));
      const y = Math.min(maxY, Math.max(margin, margin + row * stepY));
      updated[listIndex] = { ...updated[listIndex], view_x: String(x), view_y: String(y) };
    });

    try {
      await db.lcs.bulkPut(updated);
      // Commit layout + LC keys in one paint so WebView does not briefly composite old positions.
      flushSync(() => {
        setListData(updated);
        updateLCs(updated);
        setLcRenderEpoch((v) => v + 1);
      });
      forceSceneRepaint();
      await awaitDoubleRaf();
      void Swal.fire({
        title: t('Monitor.AutoPlace') || 'Auto place',
        text: `Placed ${targetIndices.length} cells on the image.`,
        icon: 'success',
        heightAuto: false,
        timer: 1500,
        showConfirmButton: false,
      });
    } finally {
      setLayoutProgress(false);
      setLayoutProgressMessageKey('');
    }
  }

  const handleImageResize = (_e: MouseEvent | TouchEvent, _dir: string, _elementRef: HTMLElement, _resizeDelta: ResizableDelta, _position: Position) => {
    console.log('--- onResizeStop ---')
    const ttt = {
      width: sizeInfoRef?.current?.width ?? frameDefaultSize.width,
      height: sizeInfoRef?.current?.height ?? frameDefaultSize.height,
      x: posInfoRef?.current?.x,
      y: posInfoRef?.current?.y,
    }
    console.log({ ttt, _resizeDelta })


    const size: SizeInfoType = {
      width: (sizeInfoRef?.current?.width ?? frameDefaultSize.width) + _resizeDelta.width,
      height: (sizeInfoRef?.current?.height ?? frameDefaultSize.height) + _resizeDelta.height
    }
    const pos: PosInfoType = {
      x: posInfoRef?.current?.x ?? 0,
      y: posInfoRef?.current?.y ?? 0,
    }
    if (_dir === 'left' || _dir === 'topLeft' || _dir === 'bottomLeft') {
      pos.x -= _resizeDelta.width
    }
    if (_dir === 'top' || _dir === 'topLeft' || _dir === 'topRight') {
      pos.y -= _resizeDelta.height
    }
    flushSync(() => {
      setSizeInfo(size);
      setPosInfo(pos);
    });
    f_update_project_image_size(currProjectRef.current.id, size.width, size.height)
    f_update_project_image_position(currProjectRef.current.id, pos.y, pos.x)
    forceSceneRepaint();
  };
  const handleImagePosition = (_e: DraggableEvent, data: DraggableData) => {
    console.log('--- onDragStop ---', { data })
    const pos = {
      x: data.lastX,
      y: data.lastY,
    }
    setPosInfo(pos)
    f_update_project_image_position(currProjectRef.current.id, pos.y, pos.x)
    console.log('updated: ', {
      position: {
        x: data.lastX,
        y: data.lastY,
      }
    })
  }
  const handleFrameResize = (_e: SyntheticEvent, _data: ResizeCallbackData) => {
    const { size } = _data
    f_reposition_stage(currProjectRef.current.id, size.width, size.height)
  }

  const clear_lc_monitor = () => {
    console.log("===clear_lc_monitor===")
  }

  const draw_lc_monitor = () => {
    console.log("===draw_lc_monitor===")
  }

  const draw_monitor_background = () => {
    console.log("===draw_monitor_background===")
  }

  const random_rgba = () => {
    console.log("===random_rgba===")
  }

  const draw_chart_line = () => {
    console.log("===draw_chart_line===")
  }

  const draw_chart = () => {
    console.log("===draw_chart===")
  }

  const draw_monitor_background_size = () => {
    console.log("===draw_monitor_background_size===")
  }

  const monitor_dragdrop = () => {
    console.log("===monitor_dragdrop===")
  }

  const handleLoadBackgroundImage = async (type: 'gallery' | 'camera') => {
    if (!curProject?.id) return
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1')
    if (type === 'gallery' && platformType === 'android') {
      imageFileInputRef.current?.click()
      return
    }
    try {
      const source = type === 'camera' ? CameraSource.Camera : CameraSource.Photos
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source,
        ...(type === 'camera' ? { saveToGallery: true } : {}),
      })
      const newImage = image.dataUrl || ('data:image/jpeg;base64,' + (image.base64String || ''))
      setIsNewImageUpload(true)
      setImageToEdit(newImage)
      setShowBackgroundEditor(true)
    } catch (e) {
      console.log('image load error:', e)
    }
  }

  const handleBackgroundImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const newImage = reader.result as string
      if (!newImage) return
      setIsNewImageUpload(true)
      setImageToEdit(newImage)
      setShowBackgroundEditor(true)
    }
    reader.readAsDataURL(file)
  }

  const getActualScale = () => {
    if (!wrapperRef.current) return 1;
    const rect = wrapperRef.current.getBoundingClientRect();
    // Comparamos el ancho visual (offsetWidth) con el ancho real en pixeles de pantalla (rect.width)
    const scale = rect.width / wrapperRef.current.offsetWidth;
    return scale || 1;
  };

  const handleBackgroundEditorSave = async (result: { dataUrl: string; canvasWidth: number; canvasHeight: number }) => {
    if (!curProject?.id) return
    const { dataUrl, canvasWidth, canvasHeight } = result
    const newSize = { width: canvasWidth, height: canvasHeight }
    const currentPos = posInfoRef.current ?? { x: 0, y: 0 }
    const updatedProject = { ...curProject, p_image: dataUrl, p_image_w: canvasWidth, p_image_h: canvasHeight, p_image_l: currentPos.x, p_image_t: currentPos.y }
    updateCurProject(updatedProject)
    updateProjects(updatedProject)
    await db.projects.update(curProject.id, {
      p_image: dataUrl,
      p_image_w: canvasWidth,
      p_image_h: canvasHeight,
      p_image_l: currentPos.x,
      p_image_t: currentPos.y,
    })
    f_update_project_last_change()
    f_update_project_image_size(curProject.id, canvasWidth, canvasHeight)
    f_update_project_image_position(curProject.id, currentPos.y, currentPos.x)
    setSizeInfo(newSize)
    setPosInfo(currentPos)
    sizeInfoRef.current = newSize
    posInfoRef.current = currentPos
    rndRef.current?.updateSize(newSize)
    rndRef.current?.updatePosition(currentPos)
    setShowBackgroundEditor(false)
    setImageToEdit(null)
  }

  /** Only clip/contain the left strip when it has no LC overlay (user+image). Home column stacks many rows and must overflow visibly past the image box. */
  const clipEmptyLeftStrip = !!curProject?.p_image && isUserMode;

  return (<>
    <div className='flex flex-col'>
      <div
        ref={wrapperRef}
        className="wrapper flex flex-row min-h-[200px] relative"

        style={undefined}
      >
        {/* LC column: when no BG image, or in home mode, LCs go here (home = column layout as before).
            In user+image mode do not mount the overlay at all — an empty absolute inset-0 layer leaves Android WebView ghost tiles in the left strip. */}
        <div
          className={`lc-column relative shrink-0${clipEmptyLeftStrip ? ' overflow-hidden isolate' : ''}`}
          style={{
            width: LC_BOX_WIDTH,
            ...(clipEmptyLeftStrip ? { contain: 'layout paint' as const } : {}),
          }}
        >
          {(!curProject?.p_image || isHomeMode) && (
            <div key={`lc-col-${lcRenderEpoch}`} className="absolute inset-0 pointer-events-none z-10" aria-hidden>
              {displayList.map((item, index) => {
                const pos = isHomeMode
                  ? (tempHomePositions[index] ?? { x: 0, y: 0 })
                  : { x: parseInt(item.view_x ?? '0'), y: parseInt(item.view_y ?? '0') };
                const displayPos =
                  pos.x === 0 && pos.y === 0
                    ? { x: 0, y: index * LC_BOX_HEIGHT }
                    : pos;

                // Important: include x/y so Draggable remounts after saving a new base position.
                // Otherwise react-draggable keeps its internal transform and the LC can "jump" on drop (double offset).
                const key = `${lcRenderEpoch}-${item.id}-${normalizeProjectId(item.project_id)}-${displayPos.x}-${displayPos.y}`;
                return (
                  <MonitorLcBox
                    key={key}
                    item={item}
                    index={index}
                    x={displayPos.x}
                    y={displayPos.y}
                    tare={tare}
                    maxMode={max}
                    loadMode={load}
                    bleConnected={bleConnected}
                    locked={locked}
                    boundsRight={lcBoundsRight - displayPos.x}
                    boundsBottom={lcBoundsBottom - displayPos.y}
                    onStop={(_e, data, idx, baseX, baseY) =>
                      reposition_lc(_e, { ...data, x: baseX + data.x, y: baseY + data.y }, idx)
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
        <ResizableBox
          className={`border-black border rnd-container flex-1 min-w-0 overflow-visible`}
          width={10000}
          height={
            currProjectRef?.current?.p_image && posInfo != null && sizeInfo != null
              ? Math.max(parseInt(currProjectRef?.current?.stage_y ?? '200', 10), posInfo.y + sizeInfo.height)
              : parseInt(currProjectRef?.current?.stage_y ?? '200', 10)
          }
          axis='y'
          onResizeStop={handleFrameResize}
        >
          <div ref={contentSideRef} className="content-side flex-1 border relative z-0 dark:border-inherit w-full h-full overflow-visible">
            {/* Boundary for image drag/resize: top/left/right restricted like LCs, bottom unrestricted */}
            <div
              id="monitor-image-bounds"
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 z-0"
              style={{ width: imageBoundsRight, height: 10000 }}
            />
            {currProjectRef?.current?.p_image &&
              <Rnd
                key={`scene-${sceneRenderEpoch}`}
                ref={rndRef}
                position={posInfo ? posInfo : { x: 20, y: 20 }}
                size={sizeInfo ? sizeInfo : { width: frameDefaultSize.width, height: frameDefaultSize.height }}
                onResizeStop={handleImageResize}
                onDragStop={handleImagePosition}
                minWidth={80}
                minHeight={80}
                bounds="#monitor-image-bounds"
                dragHandleClassName="rnd-bg-drag-handle"
                className='rnd-child'
                disableDragging={locked}
                enableResizing={!locked}
              >
                {/*
                  Clip LC + image to Rnd bounds. Android WebView can leave "ghost" tiles outside the
                  shrunken box if ancestors use overflow: visible; paint containment limits damage.
                */}
                <div
                  className="relative h-full w-full overflow-hidden isolate"
                  style={{ contain: 'layout paint' }}
                >
                  <div
                    className="rnd-bg-drag-handle handle box border border-black dark:border-inherit dark:text-white"
                    style={{
                      minWidth: '80px',
                      minHeight: '80px',
                      width: '100%',
                      height: '100%',
                    }}
                  >
                    <img
                      src={currProjectRef.current.p_image}
                      alt=""
                      decoding="sync"
                      draggable={false}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'fill',
                        display: 'block',
                        imageRendering: 'crisp-edges',
                      }}
                    />
                  </div>
                  {/* LCs on image only in user mode; in home mode (or default) LCs stay in column */}
                  {isUserMode && (
                  <div key={`lc-img-${lcRenderEpoch}`} className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
                    {displayList.map((item, index) => {
                      const pos = isHomeMode
                        ? (tempHomePositions[index] ?? { x: 0, y: 0 })
                        : { x: parseInt(item.view_x ?? '0'), y: parseInt(item.view_y ?? '0') };
                      const displayPos =
                        pos.x === 0 && pos.y === 0
                          ? { x: 0, y: index * LC_BOX_HEIGHT }
                          : pos;
                      const imgW = sizeInfo.width ?? 400;
                      const imgH = sizeInfo.height ?? 300;
                      const boundsRight = Math.max(-displayPos.x, imgW - LC_BOX_WIDTH - displayPos.x);
                      const boundsBottom = Math.max(-displayPos.y, imgH - LC_BOX_HEIGHT - displayPos.y);
                      // Important: include x/y so Draggable remounts after saving a new base position.
                      const key = `${lcRenderEpoch}-${item.id}-${normalizeProjectId(item.project_id)}-${displayPos.x}-${displayPos.y}`;

                      return (
                        <MonitorLcBox
                          key={key}
                          item={item}
                          index={index}
                          x={displayPos.x}
                          y={displayPos.y}
                          tare={tare}
                          maxMode={max}
                          loadMode={load}
                          bleConnected={bleConnected}
                          locked={locked}
                          disabled={isHomeMode}
                          boundsRight={boundsRight}
                          boundsBottom={boundsBottom}
                          onStop={(_e, data, idx, baseX, baseY) =>
                            reposition_lc(_e, { ...data, x: baseX + data.x, y: baseY + data.y }, idx)
                          }
                        />
                      );
                    })}
                  </div>
                  )}
                </div>
              </Rnd>
            }

            <div className="control-btns flex flex-col absolute right-0 top-0 gap-0.5">
              <IonButton color="medium" className="m-0" onClick={() => handleLoadBackgroundImage('gallery')} title={t('Common.Image')}>
                <IonIcon slot="icon-only" icon={imageOutline} size="small"></IonIcon>
              </IonButton>
              <IonButton color="medium" className="m-0" onClick={() => handleLoadBackgroundImage('camera')} title={t('Common.Image')}>
                <IonIcon slot="icon-only" icon={cameraOutline} size="small"></IonIcon>
              </IonButton>
              {curProject?.p_image && (
                <IonButton
                  color="medium"
                  className="m-0"
                  onClick={() => { setIsNewImageUpload(false); setImageToEdit(curProject.p_image ?? null); setShowBackgroundEditor(true); }}
                  title={t('Project.EditImage') || 'Edit'}
                >
                  <IonIcon slot="icon-only" icon={createOutline} size="small"></IonIcon>
                </IonButton>
              )}
              <IonButton color="medium" className="m-0" disabled={locked || layoutProgress || !isUserMode || !curProject?.p_image} onClick={() => void handlePos()} title={t('Monitor.AutoPlace') || 'Auto place'}>
                <IonIcon slot="icon-only" icon={locateOutline} size="small"></IonIcon>
              </IonButton>
              <IonButton color="medium" className="m-0" onClick={() => setLocked(v => !v)}>
                <IonIcon slot="icon-only" icon={locked ? lockClosedOutline : lockOpenOutline} size="small"></IonIcon>
              </IonButton>
              {isUserMode && (
                <IonButton
                  color="medium"
                  className="m-0"
                  disabled={locked || layoutProgress}
                  onClick={() => {
                    Swal.fire({
                      title: t('Monitor.Modal.ReturnToHomeTitle'),
                      text: t('Monitor.Modal.ReturnToHomeConfirm'),
                      icon: 'question',
                      showCancelButton: true,
                      confirmButtonColor: '#3085d6',
                      cancelButtonColor: '#d33',
                      confirmButtonText: t('Common.Confirm'),
                      cancelButtonText: t('Common.Cancel'),
                      heightAuto: false,
                    }).then(async (result) => {
                      if (result.isConfirmed) {
                        await runWithLayoutProgress('Monitor.LayoutProgressHome', () => onReset(true));
                      }
                    });
                  }}
                  title={t('Monitor.Modal.SendToHome')}
                >
                  <IonIcon slot="icon-only" icon={homeOutline} size="small"></IonIcon>
                </IonButton>
              )}
              {isHomeMode && (
                <IonButton
                  color="medium"
                  className="m-0"
                  disabled={locked || layoutProgress}
                  onClick={() =>
                    void runWithLayoutProgress('Monitor.LayoutProgressUser', () => onReset(false))
                  }
                  title={t('Monitor.Modal.RestoreMyPositions')}
                >
                  <IonIcon slot="icon-only" icon={arrowUndoOutline} size="small"></IonIcon>
                </IonButton>
              )}
            </div>
          </div>
        </ResizableBox>
      </div>
      <div className='flex flex-row px-8 pt-5'>
        {curProject.show_graphs === true && graphData.length > 0 &&
          <Line
            datasetIdKey='id'
            data={{
              labels: labels,
              datasets: graphData
            }}
            options={{
              elements: {
                line: {
                  cubicInterpolationMode: 'monotone'
                }
              }
            }}
          />
        }
      </div>
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleBackgroundImageFileSelect}
      />
      <BackgroundImageEditorModal
        visible={showBackgroundEditor}
        imageDataUrl={imageToEdit}
        initialCanvasWidth={isNewImageUpload ? DEFAULT_UPLOAD_CANVAS_W : (sizeInfo.width ?? curProject?.p_image_w ?? 400)}
        initialCanvasHeight={isNewImageUpload ? DEFAULT_UPLOAD_CANVAS_H : (sizeInfo.height ?? curProject?.p_image_h ?? 300)}
        onClose={() => { setShowBackgroundEditor(false); setImageToEdit(null); setIsNewImageUpload(false); }}
        onSave={handleBackgroundEditorSave}
      />
    </div>
    {layoutProgress && typeof document !== 'undefined'
      ? createPortal(
          <div className="monitor-layout-progress-backdrop" role="status" aria-live="polite">
            <div className="monitor-layout-progress-card">
              <IonSpinner name="crescent" className="monitor-layout-progress-spinner" />
              <div className="monitor-layout-progress-bar" aria-hidden />
              {layoutProgressMessageKey ? (
                <p className="monitor-layout-progress-text">{t(layoutProgressMessageKey)}</p>
              ) : null}
            </div>
          </div>,
          document.body
        )
      : null}
  </>
  )
}

export default MonitorView;
