import React, { Dispatch, FC, SetStateAction, SyntheticEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

type LayoutSnapshot = Record<string, { view_x: string; view_y: string }>;

export type LayoutUndoEntry = {
  positions: LayoutSnapshot;
  tempColumn: Record<number, { x: number; y: number }>;
};

interface MonitorViewProps {
  data: ILC[],
  max: boolean;
  load: boolean;
  tare: boolean;
  onMoveLC: (lcItem: ILC) => void;
  /** Lives in Monitor page so undo survives switching view/list/prog/stop (MonitorView unmounts). */
  layoutUndoStack: LayoutUndoEntry[];
  setLayoutUndoStack: Dispatch<SetStateAction<LayoutUndoEntry[]>>;
  groupVisualGroupId?: string | null;
  groupVisualHighlight?: boolean;
  groupVisualOnly?: boolean;
}

function lcBelongsToGroup(item: ILC, groupId: string): boolean {
  if (!groupId) return false;
  const parts = item.groups?.split(',').map((g) => String(g).trim()).filter(Boolean) ?? [];
  return parts.includes(String(groupId));
}

const MAX_LAYOUT_UNDO = 10;

function lcLayoutKey(item: ILC): string {
  return `${item.id}-${normalizeProjectId(item.project_id)}`;
}

function snapshotFromList(lcList: ILC[]): LayoutSnapshot {
  const s: LayoutSnapshot = {};
  lcList.forEach((item) => {
    s[lcLayoutKey(item)] = {
      view_x: String(item.view_x ?? '0'),
      view_y: String(item.view_y ?? '0'),
    };
  });
  return s;
}

function applyLayoutSnapshot(lcList: ILC[], snap: LayoutSnapshot): ILC[] {
  return lcList.map((item) => {
    const pos = snap[lcLayoutKey(item)];
    if (!pos) return item;
    return { ...item, view_x: pos.view_x, view_y: pos.view_y };
  });
}

/** Stored coords (0,0) = show in left column; non-zero = on background image */
function lcInColumnSlot(item: ILC): boolean {
  const x = parseInt(String(item.view_x ?? '0'), 10) || 0;
  const y = parseInt(String(item.view_y ?? '0'), 10) || 0;
  return x === 0 && y === 0;
}

function layoutCoordsEqual(a: ILC, b: ILC): boolean {
  return String(a.view_x ?? '0') === String(b.view_x ?? '0') && String(a.view_y ?? '0') === String(b.view_y ?? '0');
}

/** True when every LC has the same view_x/view_y at the same list index. */
function listLayoutUnchangedByIndex(before: ILC[], after: ILC[]): boolean {
  if (before.length !== after.length) return false;
  return before.every((b, i) => layoutCoordsEqual(b, after[i]));
}

/**
 * Auto-place target LCs on the image in a grid (pixel coords in image box, same as drag).
 * Prefers LCs still in the column (0,0); if none, re-grids every LC.
 */
function computeAutoPlacedList(
  layoutList: ILC[],
  canvasW: number,
  canvasH: number,
  lcW: number,
  lcH: number,
  margin: number
): { updated: ILC[]; targetCount: number } {
  const pendingIndices = layoutList
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => lcInColumnSlot(item))
    .map(({ index }) => index);

  const targetIndices =
    pendingIndices.length > 0 ? pendingIndices : layoutList.map((_, index) => index);

  if (targetIndices.length === 0) {
    return { updated: layoutList.map((item) => ({ ...item })), targetCount: 0 };
  }

  const availW = canvasW - margin * 2;
  const availH = canvasH - margin * 2;
  const maxCols = Math.max(1, Math.floor(availW / lcW));
  const n = targetIndices.length;
  const cols = Math.max(1, Math.min(maxCols, Math.ceil(Math.sqrt(n))));
  const rows = Math.ceil(n / cols);
  const maxX = Math.max(0, canvasW - lcW - margin);
  const maxY = Math.max(0, canvasH - lcH - margin);
  const stepX = cols <= 1 ? 0 : Math.max(2, Math.floor((availW - lcW) / (cols - 1)));
  const stepY = rows <= 1 ? 0 : Math.max(2, Math.floor((availH - lcH) / (rows - 1)));

  const updated = layoutList.map((item) => ({ ...item }));
  targetIndices.forEach((listIndex, order) => {
    const col = order % cols;
    const row = Math.floor(order / cols);
    const x = Math.min(maxX, Math.max(margin, margin + col * stepX));
    const y = Math.min(maxY, Math.max(margin, margin + row * stepY));
    updated[listIndex] = { ...updated[listIndex], view_x: String(x), view_y: String(y) };
  });

  return { updated, targetCount: targetIndices.length };
}

function cloneTempColumn(t: Record<number, { x: number; y: number }>): Record<number, { x: number; y: number }> {
  const o: Record<number, { x: number; y: number }> = {};
  Object.keys(t).forEach((k) => {
    const n = Number(k);
    const v = t[n];
    if (v) o[n] = { x: v.x, y: v.y };
  });
  return o;
}

function pushLayoutUndoEntry(stack: LayoutUndoEntry[], entry: LayoutUndoEntry): LayoutUndoEntry[] {
  const next = [...stack, entry];
  if (next.length > MAX_LAYOUT_UNDO) next.shift();
  return next;
}

function getClientPoint(e: unknown): { x: number; y: number } | null {
  if (e == null || typeof e !== 'object') return null;
  const ev = e as { clientX?: number; clientY?: number; changedTouches?: TouchList };
  if (ev.changedTouches && ev.changedTouches.length > 0) {
    const t = ev.changedTouches[0];
    return { x: t.clientX, y: t.clientY };
  }
  if (typeof ev.clientX === 'number' && typeof ev.clientY === 'number') {
    return { x: ev.clientX, y: ev.clientY };
  }
  return null;
}

/** `baseX + data.x` must never use string concat (WebView sometimes gives string deltas). */
function absoluteFromDraggableStop(
  baseX: number,
  baseY: number,
  data: Partial<DraggableData>
): { x: number; y: number } {
  const dx = Number(data.x ?? 0);
  const dy = Number(data.y ?? 0);
  return {
    x: Math.round(baseX + (Number.isFinite(dx) ? dx : 0)),
    y: Math.round(baseY + (Number.isFinite(dy) ? dy : 0)),
  };
}

function clampLcToImageRect(
  x: number,
  y: number,
  imgW: number,
  imgH: number,
  lcW: number,
  lcH: number
): { x: number; y: number } {
  const nx = Math.max(0, Math.min(Math.max(0, imgW - lcW), x));
  const ny = Math.max(0, Math.min(Math.max(0, imgH - lcH), y));
  return nudgeOffColumnSentinel(nx, ny);
}

/** When react-draggable’s x/y match DB but the node actually moved (WKWebView), use DOM geometry. */
function positionFromDragNodeInStage(
  data: DraggableData,
  stage: HTMLElement | null,
  imgW: number,
  imgH: number,
  lcW: number,
  lcH: number
): { x: number; y: number } | null {
  const node = data.node as HTMLElement | undefined;
  if (!node?.getBoundingClientRect || !stage) return null;
  const nr = node.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const x = Math.round(nr.left - sr.left);
  const y = Math.round(nr.top - sr.top);
  return clampLcToImageRect(x, y, imgW, imgH, lcW, lcH);
}

/** Draggable’s `data.node` is unreliable on WKWebView after remounts (e.g. auto-place); use the real handle in the tree. */
function lcHandleStageXYFromDomId(
  lcId: string | number,
  stage: HTMLElement | null,
  imgW: number,
  imgH: number,
  lcW: number,
  lcH: number
): { x: number; y: number } | null {
  if (typeof document === 'undefined' || !stage) return null;
  const inner = document.getElementById(`monitor${lcId}`);
  const handle = inner?.parentElement;
  if (!handle?.getBoundingClientRect) return null;
  const nr = handle.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const x = Math.round(nr.left - sr.left);
  const y = Math.round(nr.top - sr.top);
  return clampLcToImageRect(x, y, imgW, imgH, lcW, lcH);
}

function lcHandleOffsetInColumnFromDomId(
  lcId: string | number,
  columnEl: HTMLElement | null,
  boundsRight: number,
  boundsBottom: number
): { x: number; y: number } | null {
  if (typeof document === 'undefined' || !columnEl) return null;
  const inner = document.getElementById(`monitor${lcId}`);
  const handle = inner?.parentElement;
  if (!handle?.getBoundingClientRect) return null;
  const nr = handle.getBoundingClientRect();
  const cr = columnEl.getBoundingClientRect();
  const x = Math.round(nr.left - cr.left);
  const y = Math.round(nr.top - cr.top);
  const nx = Math.max(0, Math.min(Math.max(0, boundsRight), x));
  const ny = Math.max(0, Math.min(Math.max(0, boundsBottom), y));
  return { x: nx, y: ny };
}

/** WKWebView: column drags can report stale x/y vs `prevDisplay` even though the handle moved. */
function positionFromDragNodeInColumn(
  data: DraggableData,
  columnEl: HTMLElement | null,
  boundsRight: number,
  boundsBottom: number
): { x: number; y: number } | null {
  const node = data.node as HTMLElement | undefined;
  if (!node?.getBoundingClientRect || !columnEl) return null;
  const nr = node.getBoundingClientRect();
  const cr = columnEl.getBoundingClientRect();
  const x = Math.round(nr.left - cr.left);
  const y = Math.round(nr.top - cr.top);
  const nx = Math.max(0, Math.min(Math.max(0, boundsRight), x));
  const ny = Math.max(0, Math.min(Math.max(0, boundsBottom), y));
  return { x: nx, y: ny };
}

/**
 * When draggable reports stale x/y on drag end, derive position from the handle in the stage (WKWebView).
 * Any integer mismatch vs stored layout counts (avoids missing 1px moves).
 */
function imagePositionFromDomIfChanged(
  data: DraggableData,
  storedX: number,
  storedY: number,
  stage: HTMLElement | null,
  imgW: number,
  imgH: number,
  lcW: number,
  lcH: number
): { x: number; y: number } | null {
  const geom = positionFromDragNodeInStage(data, stage, imgW, imgH, lcW, lcH);
  if (!geom) return null;
  if (geom.x !== storedX || geom.y !== storedY) return geom;
  return null;
}

function columnPositionFromDomIfChanged(
  data: DraggableData,
  prevDisplay: { x: number; y: number },
  columnEl: HTMLElement | null,
  boundsRight: number,
  boundsBottom: number
): { x: number; y: number } | null {
  const geom = positionFromDragNodeInColumn(data, columnEl, boundsRight, boundsBottom);
  if (!geom) return null;
  if (geom.x !== prevDisplay.x || geom.y !== prevDisplay.y) return geom;
  return null;
}

function columnStackDefaultY(index: number, lcBoxHeight: number): { x: number; y: number } {
  return { x: 0, y: index * lcBoxHeight };
}

function columnDisplayPosition(
  index: number,
  temp: Record<number, { x: number; y: number }>,
  lcBoxHeight: number
): { x: number; y: number } {
  const pos = temp[index] ?? { x: 0, y: 0 };
  if (pos.x === 0 && pos.y === 0) return columnStackDefaultY(index, lcBoxHeight);
  return pos;
}

/** Persisted temp: (0,0) means “use stacked slot” for this index */
function tempFromAbsoluteColumnPosition(
  index: number,
  abs: { x: number; y: number },
  lcBoxHeight: number
): { x: number; y: number } {
  const def = columnStackDefaultY(index, lcBoxHeight);
  if (abs.x === def.x && abs.y === def.y) return { x: 0, y: 0 };
  return abs;
}

/** (0,0) is reserved for column; nudge so on-image layout does not collapse into column slot */
function nudgeOffColumnSentinel(nx: number, ny: number): { x: number; y: number } {
  if (nx === 0 && ny === 0) return { x: 1, y: 1 };
  return { x: nx, y: ny };
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
  groupHighlight?: boolean;
  onStop: (
    e: DraggableEvent,
    data: DraggableData,
    index: number,
    x: number,
    y: number,
    dragGestureSeen: boolean
  ) => void;
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
    groupHighlight,
    onStop,
  } = props;

  /** WKWebView often sends wrong x/y on onStop after heavy layout (e.g. auto-place); onDrag still updates. */
  const lastDragPosRef = useRef({ x: 0, y: 0 });
  const dragMovedRef = useRef(false);

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

  const rawValueStr = String(value ?? '').trim();
  const hasTransmissionError =
    rawValueStr === 'Tr.Err' ||
    rawValueStr === 'Tr. Err' ||
    rawValueStr === t("Common.TrErr") ||
    Number(value) === -99999999;
  const numVal = Number(value);
  const numOver = Number(overload);
  const numUnder = Number(underload);
  const useTareValue = !hasTransmissionError && tare && status_tare && weightnotare != null && weightnotare !== '';
  const valueForCheck = useTareValue ? Number(weightnotare) : numVal;
  const isDanger = !Number.isNaN(valueForCheck) && !Number.isNaN(numOver) && numOver > 0 && valueForCheck >= numOver * 1.3;
  const isOverload = !Number.isNaN(valueForCheck) && !Number.isNaN(numOver) && valueForCheck > numOver;
  const isUnderload = !Number.isNaN(valueForCheck) && !Number.isNaN(numUnder) && valueForCheck < numUnder;
  const displayValue = isDanger ? 'DANGER' : (value ? value : (bleConnected ? value : t("Common.TrErr")));
  const valueShown = useTareValue ? weightnotare : (value ?? '');
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
        onStart={() => {
          lastDragPosRef.current = { x: 0, y: 0 };
          dragMovedRef.current = false;
        }}
        onDrag={(_e, d) => {
          dragMovedRef.current = true;
          lastDragPosRef.current = { x: d.x, y: d.y };
        }}
        onStop={(e, data) => {
          if (!dragMovedRef.current) {
            onStop(e, data, index, x, y, false);
            return;
          }
          const lx = lastDragPosRef.current.x;
          const ly = lastDragPosRef.current.y;
          const ddx = Number(data.deltaX);
          const ddy = Number(data.deltaY);
          const stopDeltasDead =
            (!Number.isFinite(ddx) || Math.abs(ddx) < 0.5) &&
            (!Number.isFinite(ddy) || Math.abs(ddy) < 0.5);
          const nudged =
            stopDeltasDead && (lx !== 0 || ly !== 0)
              ? { ...data, x: lx, y: ly, deltaX: 1, deltaY: 0 }
              : { ...data, x: lx, y: ly };
          onStop(e, nudged, index, x, y, true);
        }}
      >
        <div
          className={`handle monitor-lc-handle border w-20 h-10.5 flex flex-col text-xs rounded cursor-pointer shrink-0${groupHighlight ? ' ring-4 ring-primary ring-offset-1 z-[20] relative' : ''}`}
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
              : (isDanger ? 'DANGER' : (bleConnected && useTareValue
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
    prev.boundsBottom === next.boundsBottom &&
    prev.groupHighlight === next.groupHighlight
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
    layoutUndoStack,
    setLayoutUndoStack,
    groupVisualGroupId = null,
    groupVisualHighlight = false,
    groupVisualOnly = false,
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

  /** Single source of truth: parent `lcs` via `data`. */
  const list = data;
  const listRef = useRef<ILC[]>([]);

  /** No background image: LCs live in the left column; drags are temporary until we add image layout. */
  const [tempHomePositions, setTempHomePositions] = useState<Record<number, { x: number; y: number }>>({});
  const tempHomePositionsRef = useRef(tempHomePositions);
  tempHomePositionsRef.current = tempHomePositions;

  const [locked, setLocked] = useState<boolean>(false);
  const [layoutProgress, setLayoutProgress] = useState(false);
  const [layoutProgressMessageKey, setLayoutProgressMessageKey] = useState('');
  /** Force remount of LC draggable nodes after heavy layout changes (iPad WebView can leave ghost layers). */
  const [lcRenderEpoch, setLcRenderEpoch] = useState(0);
  /** Force remount only of image scene (Rnd), not whole stage container. */
  const [sceneRenderEpoch, setSceneRenderEpoch] = useState(0);

  const hasBackgroundImage = !!curProject?.p_image;

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

  /** Same rows/indices as `lcBoxesToRender` / `MonitorLcBox` props (not raw `list` vs merged `lcs` skew). */
  listRef.current = displayList;

  const lcBoxesToRender = useMemo(() => {
    const gid = groupVisualGroupId ?? '';
    const only = groupVisualOnly && !!gid;
    return displayList
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        if (!only) return true;
        return lcBelongsToGroup(item, gid);
      });
  }, [displayList, groupVisualGroupId, groupVisualOnly]);

  /** (0,0) = left column; non-zero = on image. Strip stays while any visible LC is still in column. */
  const hasUnplacedInColumn =
    hasBackgroundImage && lcBoxesToRender.some(({ item }) => lcInColumnSlot(item));
  const columnStripVisible = !hasBackgroundImage || hasUnplacedInColumn;

  const groupVid = groupVisualGroupId ?? '';
  const highlightActive = groupVisualHighlight && !!groupVid;

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
  /** Image stage (same coord system as view_x / view_y on the photo) */
  const imageStageRef = useRef<HTMLDivElement>(null)
  /** Column strip inner layer (same coord system as column `left` / `top` on LCs). */
  const lcColumnRef = useRef<HTMLDivElement>(null)
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
    if (!hasBackgroundImage) {
      setTempHomePositions({});
    }
  }, [hasBackgroundImage]);

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

  const reposition_lc = (
    e: DraggableEvent,
    data: Partial<DraggableData>,
    index: number,
    dragGestureSeen = false
  ) => {
    if (locked || layoutProgress) return;
    const layoutList = listRef.current;
    const cur = layoutList[index];
    if (!cur) return;

    let newAbs = { x: Math.round(Number(data.x ?? 0)), y: Math.round(Number(data.y ?? 0)) };
    if (!Number.isFinite(newAbs.x) || !Number.isFinite(newAbs.y)) return;

    const resolveColumnAbs = (
      prevDisplay: { x: number; y: number },
      abs: { x: number; y: number }
    ): { x: number; y: number } => {
      if (abs.x !== prevDisplay.x || abs.y !== prevDisplay.y) return abs;
      const fromDom = columnPositionFromDomIfChanged(
        data as DraggableData,
        prevDisplay,
        lcColumnRef.current,
        lcBoundsRight,
        lcBoundsBottom
      );
      if (fromDom) return fromDom;
      if (dragGestureSeen) {
        const byId = lcHandleOffsetInColumnFromDomId(cur.id, lcColumnRef.current, lcBoundsRight, lcBoundsBottom);
        if (byId && (byId.x !== prevDisplay.x || byId.y !== prevDisplay.y)) return byId;
      }
      return abs;
    };

    if (!hasBackgroundImage || lcInColumnSlot(cur)) {
      if (!hasBackgroundImage) {
        const prevDisplay = columnDisplayPosition(index, tempHomePositions, LC_BOX_HEIGHT);
        const colAbs = resolveColumnAbs(prevDisplay, newAbs);
        if (colAbs.x === prevDisplay.x && colAbs.y === prevDisplay.y) return;
        flushSync(() => {
          setLayoutUndoStack((stack) =>
            pushLayoutUndoEntry(stack, {
              positions: snapshotFromList(layoutList),
              tempColumn: cloneTempColumn(tempHomePositionsRef.current),
            })
          );
          setTempHomePositions((prev) => ({
            ...prev,
            [index]: tempFromAbsoluteColumnPosition(index, colAbs, LC_BOX_HEIGHT),
          }));
        });
        return;
      }

      const pt = getClientPoint(e);
      const stage = imageStageRef.current;
      const imgW = sizeInfo.width ?? 400;
      const imgH = sizeInfo.height ?? 300;

      if (pt && stage) {
        const rect = stage.getBoundingClientRect();
        if (pt.x >= rect.left && pt.x <= rect.right && pt.y >= rect.top && pt.y <= rect.bottom) {
          let nx = Math.round(pt.x - rect.left - LC_BOX_WIDTH / 2);
          let ny = Math.round(pt.y - rect.top - LC_BOX_HEIGHT / 2);
          nx = Math.max(0, Math.min(Math.max(0, imgW - LC_BOX_WIDTH), nx));
          ny = Math.max(0, Math.min(Math.max(0, imgH - LC_BOX_HEIGHT), ny));
          const nudged = nudgeOffColumnSentinel(nx, ny);
          nx = nudged.x;
          ny = nudged.y;

          const updatedItem: ILC = { ...cur, view_x: String(nx), view_y: String(ny) };
          flushSync(() => {
            setLayoutUndoStack((stack) =>
              pushLayoutUndoEntry(stack, {
                positions: snapshotFromList(layoutList),
                tempColumn: cloneTempColumn(tempHomePositionsRef.current),
              })
            );
            setTempHomePositions((prev) => {
              const next = { ...prev };
              delete next[index];
              return next;
            });
            onMoveLC(updatedItem);
          });
          return;
        }
      }

      const prevDisplay = columnDisplayPosition(index, tempHomePositions, LC_BOX_HEIGHT);
      const colAbs = resolveColumnAbs(prevDisplay, newAbs);
      if (colAbs.x === prevDisplay.x && colAbs.y === prevDisplay.y) return;
      flushSync(() => {
        setLayoutUndoStack((stack) =>
          pushLayoutUndoEntry(stack, {
            positions: snapshotFromList(layoutList),
            tempColumn: cloneTempColumn(tempHomePositionsRef.current),
          })
        );
        setTempHomePositions((prev) => ({
          ...prev,
          [index]: tempFromAbsoluteColumnPosition(index, colAbs, LC_BOX_HEIGHT),
        }));
      });
      return;
    }

    let nx = newAbs.x;
    let ny = newAbs.y;
    const nudged = nudgeOffColumnSentinel(nx, ny);
    nx = nudged.x;
    ny = nudged.y;
    const ox = parseInt(String(cur.view_x ?? '0'), 10) || 0;
    const oy = parseInt(String(cur.view_y ?? '0'), 10) || 0;

    const imgWOn = sizeInfo.width ?? 400;
    const imgHOn = sizeInfo.height ?? 300;
    const fullDrag = data as DraggableData;
    if (nx === ox && ny === oy) {
      const fromDom = imagePositionFromDomIfChanged(
        fullDrag,
        ox,
        oy,
        imageStageRef.current,
        imgWOn,
        imgHOn,
        LC_BOX_WIDTH,
        LC_BOX_HEIGHT
      );
      if (fromDom) {
        nx = fromDom.x;
        ny = fromDom.y;
      } else if (dragGestureSeen) {
        const byId = lcHandleStageXYFromDomId(
          cur.id,
          imageStageRef.current,
          imgWOn,
          imgHOn,
          LC_BOX_WIDTH,
          LC_BOX_HEIGHT
        );
        if (byId && (byId.x !== ox || byId.y !== oy)) {
          nx = byId.x;
          ny = byId.y;
        }
      }
    }

    if (nx === ox && ny === oy) return;

    flushSync(() => {
      setLayoutUndoStack((stack) =>
        pushLayoutUndoEntry(stack, {
          positions: snapshotFromList(layoutList),
          tempColumn: cloneTempColumn(tempHomePositionsRef.current),
        })
      );
      const updatedItem: ILC = { ...layoutList[index], view_x: String(nx), view_y: String(ny) };
      onMoveLC(updatedItem);
    });
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

  /** Column ↔ on-image: bump repaint so WebView drops stale layers. */
  const onImageCount = useMemo(
    () => (hasBackgroundImage ? displayList.filter((item) => !lcInColumnSlot(item)).length : 0),
    [displayList, hasBackgroundImage]
  );
  const prevOnImageCountRef = useRef(onImageCount);
  useLayoutEffect(() => {
    if (prevOnImageCountRef.current === onImageCount) return;
    prevOnImageCountRef.current = onImageCount;
    flushSync(() => setLcRenderEpoch((v) => v + 1));
    forceSceneRepaint();
  }, [onImageCount, forceSceneRepaint]);

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
    if (!hasBackgroundImage || locked || layoutProgress) return;

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

    setLayoutProgressMessageKey('Monitor.LayoutProgressAutoPlace');
    setLayoutProgress(true);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    const layoutList = listRef.current;
    if (layoutList.length === 0) {
      setLayoutProgress(false);
      setLayoutProgressMessageKey('');
      return;
    }

    const beforeSnap = snapshotFromList(layoutList);
    const beforeTemp = cloneTempColumn(tempHomePositionsRef.current);

    const { updated, targetCount } = computeAutoPlacedList(
      layoutList,
      canvasW,
      canvasH,
      LC_BOX_WIDTH,
      LC_BOX_HEIGHT,
      margin
    );

    if (targetCount === 0) {
      setLayoutProgress(false);
      setLayoutProgressMessageKey('');
      return;
    }

    if (listLayoutUnchangedByIndex(layoutList, updated)) {
      setLayoutProgress(false);
      setLayoutProgressMessageKey('');
      void Swal.fire({
        title: t('Monitor.AutoPlace') || 'Auto place',
        text: t('Monitor.AutoPlaceNoop') || 'Cell positions already match the auto grid.',
        icon: 'info',
        heightAuto: false,
        timer: 1500,
        showConfirmButton: false,
      });
      return;
    }

    try {
      await db.lcs.bulkPut(updated);
      // Same atomic pattern as drag end: undo entry + context + remount in one commit (avoids WebView / batch races).
      flushSync(() => {
        setLayoutUndoStack((stack) =>
          pushLayoutUndoEntry(stack, {
            positions: beforeSnap,
            tempColumn: beforeTemp,
          })
        );
        updateLCs(updated);
        setTempHomePositions({});
        setLcRenderEpoch((v) => v + 1);
      });
      forceSceneRepaint();
      await awaitDoubleRaf();
      void Swal.fire({
        title: t('Monitor.AutoPlace') || 'Auto place',
        text: t('Monitor.AutoPlaceDone', { count: targetCount }) || `Placed ${targetCount} cells on the image.`,
        icon: 'success',
        heightAuto: false,
        timer: 1500,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error('[MonitorView] Auto place failed:', err);
      void Swal.fire({
        title: t('Monitor.AutoPlace') || 'Auto place',
        text: t('Monitor.AutoPlaceError') || 'Could not save layout.',
        icon: 'error',
        heightAuto: false,
      });
    } finally {
      setLayoutProgress(false);
      setLayoutProgressMessageKey('');
    }
  }

  const handleUndoLayout = async () => {
    if (!hasBackgroundImage || locked || layoutProgress || layoutUndoStack.length === 0) return;
    const entry = layoutUndoStack[layoutUndoStack.length - 1];
    const nextStack = layoutUndoStack.slice(0, -1);
    const merged = applyLayoutSnapshot(listRef.current, entry.positions);
    try {
      await db.lcs.bulkPut(merged);
      flushSync(() => {
        setLayoutUndoStack(nextStack);
        setTempHomePositions(cloneTempColumn(entry.tempColumn ?? {}));
        updateLCs(merged);
        setLcRenderEpoch((v) => v + 1);
      });
      forceSceneRepaint();
      await awaitDoubleRaf();
    } catch (err) {
      console.error('[MonitorView] Undo layout failed:', err);
    }
  };

  const handleHomeLayoutClick = () => {
    if (!hasBackgroundImage || locked || layoutProgress) return;
    const layoutList = listRef.current;
    const anyOnImage = layoutList.some((item) => !lcInColumnSlot(item));
    const hasTemp = Object.keys(tempHomePositions).length > 0;
    if (!anyOnImage && !hasTemp) return;

    const doHome = async () => {
      await runWithLayoutProgress('Monitor.LayoutProgressHome', async () => {
        const base = listRef.current;
        const homeItems = base.map((item) => ({ ...item, view_x: '0', view_y: '0' }));
        setLayoutUndoStack((stack) =>
          pushLayoutUndoEntry(stack, {
            positions: snapshotFromList(base),
            tempColumn: cloneTempColumn(tempHomePositionsRef.current),
          })
        );
        await db.lcs.bulkPut(homeItems);
        flushSync(() => {
          updateLCs(homeItems);
          setTempHomePositions({});
          setLcRenderEpoch((v) => v + 1);
        });
        forceSceneRepaint();
      });
    };

    if (anyOnImage) {
      void Swal.fire({
        title: t('Monitor.Modal.ReturnToHomeTitle'),
        text: t('Monitor.Modal.ReturnToHomeConfirm'),
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: t('Common.Confirm'),
        cancelButtonText: t('Common.Cancel'),
        heightAuto: false,
      }).then((result) => {
        if (result.isConfirmed) void doHome();
      });
    } else {
      void doHome();
    }
  };

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
    const updatedProject = {
      ...curProject,
      p_image: dataUrl,
      p_image_w: canvasWidth,
      p_image_h: canvasHeight,
      p_image_l: currentPos.x,
      p_image_t: currentPos.y,
    }
    updateCurProject(updatedProject)
    updateProjects(updatedProject)
    await db.projects.update(curProject.id, {
      p_image: dataUrl,
      p_image_w: canvasWidth,
      p_image_h: canvasHeight,
      p_image_l: currentPos.x,
      p_image_t: currentPos.y,
    })
    setLayoutUndoStack([])
    setTempHomePositions({})
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

  /** Clip left strip when every LC is on the image (column has nothing to show). */
  const clipEmptyLeftStrip = hasBackgroundImage && !hasUnplacedInColumn;

  return (<>
    <div className='flex flex-col'>
      <div
        ref={wrapperRef}
        className="wrapper flex flex-row min-h-[200px] relative"

        style={undefined}
      >
        {/* LC column: only when there is no background image. With an image, LCs render on the picture. */}
        <div
          className={`lc-column relative shrink-0${clipEmptyLeftStrip ? ' overflow-hidden isolate' : ''}`}
          style={{
            width: columnStripVisible ? LC_BOX_WIDTH : 0,
            ...(clipEmptyLeftStrip ? { contain: 'layout paint' as const } : {}),
          }}
        >
          {columnStripVisible && (
            <div
              ref={lcColumnRef}
              key={`lc-col-${lcRenderEpoch}`}
              className="absolute inset-0 pointer-events-none z-10"
              aria-hidden
            >
              {lcBoxesToRender
                .filter(({ item }) => !hasBackgroundImage || lcInColumnSlot(item))
                .map(({ item, index }) => {
                const displayPos = columnDisplayPosition(index, tempHomePositions, LC_BOX_HEIGHT);

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
                    groupHighlight={highlightActive && lcBelongsToGroup(item, groupVid)}
                    onStop={(_e, data, idx, baseX, baseY, dragGestureSeen = false) =>
                      reposition_lc(
                        _e,
                        { ...data, ...absoluteFromDraggableStop(baseX, baseY, data) },
                        idx,
                        dragGestureSeen
                      )
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
                  ref={imageStageRef}
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
                  {hasBackgroundImage && (
                  <div key={`lc-img-${lcRenderEpoch}`} className="absolute inset-0 pointer-events-none" style={{ zIndex: 5 }}>
                    {lcBoxesToRender
                      .filter(({ item }) => !lcInColumnSlot(item))
                      .map(({ item, index }) => {
                      const displayPos = {
                        x: parseInt(String(item.view_x ?? '0'), 10) || 0,
                        y: parseInt(String(item.view_y ?? '0'), 10) || 0,
                      };
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
                          disabled={false}
                          boundsRight={boundsRight}
                          boundsBottom={boundsBottom}
                          groupHighlight={highlightActive && lcBelongsToGroup(item, groupVid)}
                          onStop={(_e, data, idx, baseX, baseY, dragGestureSeen = false) =>
                            reposition_lc(
                              _e,
                              { ...data, ...absoluteFromDraggableStop(baseX, baseY, data) },
                              idx,
                              dragGestureSeen
                            )
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
              <IonButton color="medium" className="m-0" disabled={locked || layoutProgress || !hasBackgroundImage} onClick={() => void handlePos()} title={t('Monitor.AutoPlace') || 'Auto place'}>
                <IonIcon slot="icon-only" icon={locateOutline} size="small"></IonIcon>
              </IonButton>
              <IonButton color="medium" className="m-0" onClick={() => setLocked(v => !v)}>
                <IonIcon slot="icon-only" icon={locked ? lockClosedOutline : lockOpenOutline} size="small"></IonIcon>
              </IonButton>
              {hasBackgroundImage && (
                <>
                  <IonButton
                    color="medium"
                    className="m-0"
                    disabled={locked || layoutProgress}
                    onClick={() => handleHomeLayoutClick()}
                    title={t('Monitor.Modal.SendToHome')}
                  >
                    <IonIcon slot="icon-only" icon={homeOutline} size="small"></IonIcon>
                  </IonButton>
                  <IonButton
                    color="medium"
                    className="m-0"
                    disabled={locked || layoutProgress || layoutUndoStack.length === 0}
                    onClick={() => void handleUndoLayout()}
                    title={t('Monitor.UndoLayout')}
                  >
                    <IonIcon slot="icon-only" icon={arrowUndoOutline} size="small"></IonIcon>
                  </IonButton>
                </>
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
