import React, { Dispatch, FC, SetStateAction, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import Draggable, { DraggableCore, DraggableData, DraggableEvent } from 'react-draggable';
import { Rnd } from 'react-rnd';

import { lcBelongsToGroup } from "../../helper/lcGroupMembership";
import { arrowUndoOutline, cameraOutline, closeCircleOutline, createOutline, homeOutline, imageOutline, locateOutline, lockClosedOutline, lockOpenOutline } from "ionicons/icons";

/** Re-enable the crosshair control after auto-place / home-drag issues are fixed. */
const SHOW_MONITOR_AUTO_PLACE_BUTTON = false;
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
  onCellClick?: (item: ILC) => void;
  onCellLongPress?: (item: ILC) => void;
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
  const ev = e as {
    clientX?: number;
    clientY?: number;
    changedTouches?: TouchList;
    touches?: TouchList;
    nativeEvent?: unknown;
  };
  if (ev.changedTouches && ev.changedTouches.length > 0) {
    const t = ev.changedTouches[0];
    return { x: t.clientX, y: t.clientY };
  }
  if (ev.touches && ev.touches.length > 0) {
    const t = ev.touches[0];
    return { x: t.clientX, y: t.clientY };
  }
  if (typeof ev.clientX === 'number' && typeof ev.clientY === 'number') {
    return { x: ev.clientX, y: ev.clientY };
  }
  if (ev.nativeEvent != null) return getClientPoint(ev.nativeEvent);
  return null;
}

/** Touchend / synthetic events sometimes omit coordinates — use drag node center as fallback. */
function clientPointFromDragStop(
  e: unknown,
  data: Partial<DraggableData>
): { x: number; y: number } | null {
  const dataAny = data as DraggableData & { __clientX?: number; __clientY?: number };
  if (Number.isFinite(dataAny.__clientX) && Number.isFinite(dataAny.__clientY)) {
    return { x: Number(dataAny.__clientX), y: Number(dataAny.__clientY) };
  }
  const p = getClientPoint(e);
  if (p) return p;
  const full = data as DraggableData;
  const node = full?.node as HTMLElement | undefined;
  if (node?.getBoundingClientRect) {
    const r = node.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
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
  lcH: number,
  zoom = 1,
  panX = 0,
  panY = 0
): { x: number; y: number } | null {
  const node = data.node as HTMLElement | undefined;
  if (!node?.getBoundingClientRect || !stage) return null;
  const nr = node.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const z = Math.max(1e-6, zoom);
  const x = Math.round((nr.left - sr.left - panX) / z);
  const y = Math.round((nr.top - sr.top - panY) / z);
  return clampLcToImageRect(x, y, imgW, imgH, lcW, lcH);
}

/** Draggable’s `data.node` is unreliable on WKWebView after remounts (e.g. auto-place); use the real handle in the tree. */
function lcHandleStageXYFromDomId(
  lcId: string | number,
  stage: HTMLElement | null,
  imgW: number,
  imgH: number,
  lcW: number,
  lcH: number,
  zoom = 1,
  panX = 0,
  panY = 0
): { x: number; y: number } | null {
  if (typeof document === 'undefined' || !stage) return null;
  const inner = document.getElementById(`monitor${lcId}`);
  const handle = inner?.parentElement;
  if (!handle?.getBoundingClientRect) return null;
  const nr = handle.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const z = Math.max(1e-6, zoom);
  const x = Math.round((nr.left - sr.left - panX) / z);
  const y = Math.round((nr.top - sr.top - panY) / z);
  return clampLcToImageRect(x, y, imgW, imgH, lcW, lcH);
}

function lcHandleOffsetInColumnFromDomId(
  lcId: string | number,
  columnEl: HTMLElement | null,
  boundsRight: number,
  boundsBottom: number,
  /** Lane uses translateY(-scroll); convert viewport offset to content Y. */
  contentScrollY = 0
): { x: number; y: number } | null {
  if (typeof document === 'undefined' || !columnEl) return null;
  const inner = document.getElementById(`monitor${lcId}`);
  const handle = inner?.parentElement;
  if (!handle?.getBoundingClientRect) return null;
  const nr = handle.getBoundingClientRect();
  const cr = columnEl.getBoundingClientRect();
  const x = Math.round(nr.left - cr.left);
  const y = Math.round(nr.top - cr.top + contentScrollY);
  const nx = Math.max(0, Math.min(Math.max(0, boundsRight), x));
  const ny = Math.max(0, Math.min(Math.max(0, boundsBottom), y));
  return { x: nx, y: ny };
}

/** WKWebView: column drags can report stale x/y vs `prevDisplay` even though the handle moved. */
function positionFromDragNodeInColumn(
  data: DraggableData,
  columnEl: HTMLElement | null,
  boundsRight: number,
  boundsBottom: number,
  contentScrollY = 0
): { x: number; y: number } | null {
  const node = data.node as HTMLElement | undefined;
  if (!node?.getBoundingClientRect || !columnEl) return null;
  const nr = node.getBoundingClientRect();
  const cr = columnEl.getBoundingClientRect();
  const x = Math.round(nr.left - cr.left);
  const y = Math.round(nr.top - cr.top + contentScrollY);
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
  lcH: number,
  zoom = 1,
  panX = 0,
  panY = 0
): { x: number; y: number } | null {
  const geom = positionFromDragNodeInStage(data, stage, imgW, imgH, lcW, lcH, zoom, panX, panY);
  if (!geom) return null;
  if (geom.x !== storedX || geom.y !== storedY) return geom;
  return null;
}

function columnPositionFromDomIfChanged(
  data: DraggableData,
  prevDisplay: { x: number; y: number },
  columnEl: HTMLElement | null,
  boundsRight: number,
  boundsBottom: number,
  contentScrollY = 0
): { x: number; y: number } | null {
  const geom = positionFromDragNodeInColumn(data, columnEl, boundsRight, boundsBottom, contentScrollY);
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
  const pos = temp[index];
  if (!pos) return columnStackDefaultY(index, lcBoxHeight);
  // Home lane is vertical-only: never keep lateral offsets.
  return { x: 0, y: pos.y };
}

/** Persisted temp absolute position for Home lane (x is normalized to 0). */
function tempFromAbsoluteColumnPosition(
  _index: number,
  abs: { x: number; y: number },
  _lcBoxHeight: number
): { x: number; y: number } {
  return { x: 0, y: abs.y };
}

/**
 * Single-column home: snap Y to row grid; if that row is already used by another LC in home,
 * use the first free row from the top (still within scroll bounds when possible).
 */
function homeColumnDropGridPosition(
  absY: number,
  lcBoxH: number,
  boundsBottom: number,
  layoutList: ILC[],
  temp: Record<number, { x: number; y: number }>,
  movedIndex: number
): { x: number; y: number } {
  const maxYTop = Math.max(0, boundsBottom - lcBoxH);
  const maxRow = Math.max(0, Math.floor(maxYTop / lcBoxH));
  let preferredRow = Math.round(absY / lcBoxH);
  preferredRow = Math.max(0, Math.min(maxRow, preferredRow));

  const occupied = new Set<number>();
  layoutList.forEach((item, j) => {
    if (j === movedIndex) return;
    if (!lcInColumnSlot(item)) return;
    const p = columnDisplayPosition(j, temp, lcBoxH);
    const r = Math.max(0, Math.min(maxRow, Math.round(p.y / lcBoxH)));
    occupied.add(r);
  });

  const pickRow = (r: number) => ({ x: 0, y: r * lcBoxH });

  if (!occupied.has(preferredRow)) {
    return pickRow(preferredRow);
  }
  for (let r = 0; r <= maxRow; r++) {
    if (!occupied.has(r)) return pickRow(r);
  }
  return pickRow(maxRow + 1);
}

function compactHomeTemp(
  layoutList: ILC[],
  lcBoxH: number,
  forcedHomeIndex?: number
): Record<number, { x: number; y: number }> {
  const next: Record<number, { x: number; y: number }> = {};
  let slot = 0;
  layoutList.forEach((item, j) => {
    const shouldBeInHome = j === forcedHomeIndex || lcInColumnSlot(item);
    if (!shouldBeInHome) return;
    const abs = { x: 0, y: slot * lcBoxH };
    next[j] = tempFromAbsoluteColumnPosition(j, abs, lcBoxH);
    slot += 1;
  });
  return next;
}

function compactHomeTempAfterRemoving(
  layoutList: ILC[],
  removedIndex: number,
  lcBoxH: number
): Record<number, { x: number; y: number }> {
  return compactHomeTemp(
    layoutList.map((item, j) => (j === removedIndex ? { ...item, view_x: '1', view_y: '1' } : item)),
    lcBoxH
  );
}

/** (0,0) is reserved for column; nudge so on-image layout does not collapse into column slot */
function nudgeOffColumnSentinel(nx: number, ny: number): { x: number; y: number } {
  if (nx === 0 && ny === 0) return { x: 1, y: 1 };
  return { x: nx, y: ny };
}

const STAGE_FIT_MIN = 80;
/** Pinch zoom: 1 = fitted image; no zoom-out below fit. Max pinch zoom-in. */
const STAGE_VIEW_ZOOM_MIN = 1;
const STAGE_VIEW_ZOOM_MAX = 8;

/** Ignore sub-pixel / WKWebView jitter so we don't reset user zoom after pinch (see applyStageFit). */
function baseStageFitMeaningfullyChanged(prevW: number, prevH: number, baseW: number, baseH: number): boolean {
  if (prevW <= 0 || prevH <= 0) return false;
  const thW = Math.max(3, Math.floor(prevW * 0.02));
  const thH = Math.max(3, Math.floor(prevH * 0.02));
  return Math.abs(prevW - baseW) > thW || Math.abs(prevH - baseH) > thH;
}

function clampStagePan(
  pan: { x: number; y: number },
  zoom: number,
  stageW: number,
  stageH: number
): { x: number; y: number } {
  if (zoom <= 1.0001) return { x: 0, y: 0 };
  const minX = stageW - stageW * zoom;
  const minY = stageH - stageH * zoom;
  return {
    x: Math.max(minX, Math.min(0, pan.x)),
    y: Math.max(minY, Math.min(0, pan.y)),
  };
}

function pinchPointerDistance(
  m: Map<number, { clientX: number; clientY: number }>
): number {
  if (m.size < 2) return 0;
  const pts = Array.from(m.values());
  const a = pts[0];
  const b = pts[1];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** Largest axis-aligned rect with same aspect as (imgW,imgH) inside (availW,availH), centered. */
function fitImageRectToViewport(
  availW: number,
  availH: number,
  imgW: number,
  imgH: number
): { width: number; height: number; x: number; y: number } {
  const iw = Math.max(1, imgW);
  const ih = Math.max(1, imgH);
  const aw = Math.max(1, availW);
  const ah = Math.max(1, availH);
  const scale = Math.min(aw / iw, ah / ih);
  const width = Math.max(STAGE_FIT_MIN, Math.floor(iw * scale));
  const height = Math.max(STAGE_FIT_MIN, Math.floor(ih * scale));
  const x = Math.max(0, Math.floor((aw - width) / 2));
  const y = Math.max(0, Math.floor((ah - height) / 2));
  return { width, height, x, y };
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
  /** Match CSS `transform: scale(...)` on the stage so drag deltas stay in layout pixels. */
  dragScale?: number;
  /** Extra pixels Draggable may move left (on-image only) so release can land over the home strip. */
  boundsLeftSlop?: number;
  /** Extra pixels Draggable may move above 0 (on-image only). */
  boundsTopSlop?: number;
  /** Home column: this LC is the one under the finger — paint above siblings and the image panel. */
  columnLiftRaised?: boolean;
  groupHighlight?: boolean;
  /** `columnIndex` is list index (home column); optional for stage LCs. */
  onDragLiftChange?: (active: boolean, columnIndex?: number) => void;
  onCellClick?: (item: ILC, index: number) => void;
  onCellDoubleTap?: (item: ILC, index: number) => void;
  onStop: (
    e: DraggableEvent,
    data: DraggableData,
    index: number,
    x: number,
    y: number,
    dragGestureSeen: boolean
  ) => void;
  onCellLongPress?: (item: ILC, index: number) => void;
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
    dragScale = 1,
    boundsLeftSlop = 0,
    boundsTopSlop = 0,
    columnLiftRaised = false,
    groupHighlight,
    onDragLiftChange,
    onCellClick,
    onCellDoubleTap,
    onCellLongPress,
    onStop,
  } = props;

  /** WKWebView often sends wrong x/y on onStop after heavy layout (e.g. auto-place); onDrag still updates. */
  const lastDragPosRef = useRef({ x: 0, y: 0 });
  const lastDragClientRef = useRef<{ x: number; y: number } | null>(null);
  const dragMovedRef = useRef(false);
  const lastTapAtRef = useRef(0);
  const suppressClickUntilRef = useRef(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

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
  // Safety thresholds must always use GROSS (physical load), not tare-adjusted net.
  const safetyValue = numVal;
  const isDanger = !Number.isNaN(safetyValue) && !Number.isNaN(numOver) && numOver > 0 && safetyValue >= numOver * 1.3;
  const isOverload = !Number.isNaN(safetyValue) && !Number.isNaN(numOver) && safetyValue > numOver;
  const isUnderload = !Number.isNaN(safetyValue) && !Number.isNaN(numUnder) && safetyValue < numUnder;
  const displayValue = isDanger ? 'DANGER' : (value ? value : (bleConnected ? value : t("Common.TrErr")));
  const valueShown = useTareValue ? weightnotare : (value ?? '');
  const showRedValueBg = (isDanger || isOverload || isUnderload);
  const statusText = isDanger ? 'DANGER' : '';

  return (
    <div
      className="pointer-events-auto"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        touchAction: 'none',
        ...(columnLiftRaised
          ? { zIndex: 2147483646, isolation: 'isolate' as const }
          : {}),
      }}
    >
      <Draggable
        handle=".handle"
        defaultPosition={{ x: 0, y: 0 }}
        grid={[1, 1]}
        scale={dragScale}
        disabled={!!disabled || locked}
        bounds={{
          left: -x - boundsLeftSlop,
          top: -y - boundsTopSlop,
          right: boundsRight,
          bottom: boundsBottom,
        }}
        onStart={() => {
          lastDragPosRef.current = { x: 0, y: 0 };
          lastDragClientRef.current = null;
          dragMovedRef.current = false;
          onDragLiftChange?.(true, index);
        }}
        onDrag={(dragEvt, d) => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          if (!dragMovedRef.current) {
            dragMovedRef.current = true;
          }
          lastDragPosRef.current = { x: d.x, y: d.y };
          const p = getClientPoint(dragEvt);
          if (p) lastDragClientRef.current = p;
        }}
        onStop={(e, data) => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          if (!dragMovedRef.current) {
            const p = getClientPoint(e);
            const enriched = p ? { ...data, __clientX: p.x, __clientY: p.y } : data;
            onStop(e, enriched as DraggableData, index, x, y, false);
          } else {
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
            const enriched = lastDragClientRef.current
              ? { ...nudged, __clientX: lastDragClientRef.current.x, __clientY: lastDragClientRef.current.y }
              : nudged;
            onStop(e, enriched as DraggableData, index, x, y, true);
            suppressClickUntilRef.current = Date.now() + 250;
          }
          // After reposition (flushSync), not before: turning lift off immediately re-applies
          // overflow-hidden on the home column while nodes still sit mid-drag → clipped halves
          // that look like “cells under the image” (see iPad screenshots).
          queueMicrotask(() => onDragLiftChange?.(false, index));
        }}
      >
        <div
          className={`handle monitor-lc-handle border w-20 h-10.5 flex flex-col text-xs rounded cursor-pointer shrink-0${groupHighlight ? ' ring-4 ring-primary ring-offset-1 z-[20] relative' : ''}`}
          style={{ touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
          onPointerDownCapture={() => {
            onDragLiftChange?.(true, index);
            longPressTriggeredRef.current = false;
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = setTimeout(() => {
              longPressTimerRef.current = null;
              longPressTriggeredRef.current = true;
              suppressClickUntilRef.current = Date.now() + 400;
              onCellLongPress?.(item, index);
            }, 600);
          }}
          onPointerUp={(ev) => {
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
            if (longPressTriggeredRef.current) {
              ev.preventDefault();
              ev.stopPropagation();
              return;
            }
            if (dragMovedRef.current) return;
            // Trigger on pointer-up because Draggable may suppress `onClick` after tiny moves.
            onCellClick?.(item, index);
            suppressClickUntilRef.current = Date.now() + 250;
            // Keep desktop double-click behavior for "send back to home" via onDoubleClick below.
            if (!onCellDoubleTap || ev.pointerType !== 'touch') return;
            const now = Date.now();
            if (now - lastTapAtRef.current <= 350) {
              lastTapAtRef.current = 0;
              onCellDoubleTap(item, index);
              ev.preventDefault();
              ev.stopPropagation();
              return;
            }
            lastTapAtRef.current = now;
          }}
          onDoubleClick={() => onCellDoubleTap?.(item, index)}
          onClick={() => {
            if (Date.now() < suppressClickUntilRef.current) return;
            if (longPressTriggeredRef.current) return;
            onCellClick?.(item, index);
          }}
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
              : (statusText ? statusText : (bleConnected && useTareValue
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
    (prev.boundsLeftSlop ?? 0) === (next.boundsLeftSlop ?? 0) &&
    (prev.boundsTopSlop ?? 0) === (next.boundsTopSlop ?? 0) &&
    prev.columnLiftRaised === next.columnLiftRaised &&
    prev.groupHighlight === next.groupHighlight &&
    prev.onDragLiftChange === next.onDragLiftChange &&
    prev.onCellClick === next.onCellClick &&
    prev.onCellDoubleTap === next.onCellDoubleTap &&
    prev.onCellLongPress === next.onCellLongPress
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
    onCellClick,
    onCellLongPress,
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
  /** Bumped when LCs go from none-on-image → some (e.g. after “all to home”); remounts `<img>` so WKWebView doesn’t paint it above LCs. */
  const [lcImageCompositingBust, setLcImageCompositingBust] = useState(0);

  const hasBackgroundImage = !!curProject?.p_image;
  const imageNaturalSizeRef = useRef<{ width: number; height: number } | null>(null);

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

  /** Used for flex sibling z-order: stage LCs can paint left of the image box (bounds slop) into the home strip’s screen band. */
  const anyLcOnImageStage = useMemo(
    () => hasBackgroundImage && displayList.some((item) => !lcInColumnSlot(item)),
    [displayList, hasBackgroundImage]
  );

  const groupVid = groupVisualGroupId ?? '';
  const highlightActive = groupVisualHighlight && !!groupVid;

  /** Cap graph size to avoid unbounded growth and crashes with many LCs / long run times */
  const MAX_GRAPH_POINTS = 1000;
  const [labels, setLabels] = useState<string[]>([])
  const [graphData, setGraphData] = useState<any[]>([])

  const [width, setWidth] = useState(100)
  const [height, setHeight] = useState(100)
  /** Placeholder until DB / fit-to-viewport fills real dimensions. */
  const frameDefaultSize: SizeInfoType = {
    width: 320,
    height: 240,
  };
  const currProjectRef = useRef(curProject)
  currProjectRef.current = curProject
  const [sizeInfo, setSizeInfo] = useState<SizeInfoType>({
    width: Number(curProject?.p_image_w) > 0 ? Number(curProject.p_image_w) : frameDefaultSize.width,
    height: Number(curProject?.p_image_h) > 0 ? Number(curProject.p_image_h) : frameDefaultSize.height,
  })
  const [posInfo, setPosInfo] = useState<PosInfoType>({
    x: Number(curProject?.p_image_l) || 0,
    y: Number(curProject?.p_image_t) || 0,
  })
  const [triggered, setTriggered] = useState<boolean>(false)

  const posInfoRef = useRef<PosInfoType>(posInfo)
  const sizeInfoRef = useRef<SizeInfoType>(sizeInfo)
  const rndRef = useRef<Rnd>(null)
  /** Latest `applyStageFitToContentArea` — avoids effects that must not re-run when the callback identity changes. */
  const applyStageFitToContentAreaRef = useRef<() => void>(() => {})
  const contentSideRef = useRef<HTMLDivElement>(null)
  const flag = useRef<number>(0)
  /** So we only set size from container once per project (avoids infinite setState loop). */
  const didSetSizeFromContainerRef = useRef<string | number | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  /** Image stage (same coord system as view_x / view_y on the photo) */
  const imageStageRef = useRef<HTMLDivElement>(null)
  /** Column strip inner layer (same coord system as column `left` / `top` on LCs). */
  const lcColumnRef = useRef<HTMLDivElement>(null)
  /** Home lane + scrollbar (hit-test “drop back to home”). */
  const homeLaneStripRef = useRef<HTMLDivElement>(null)
  const [lcBoundsRight, setLcBoundsRight] = useState(3000)
  const [lcBoundsBottom, setLcBoundsBottom] = useState(2000)
  /** Bounds for background image: restrict top/left/right like LCs; no bottom restriction. */
  const [imageBoundsRight, setImageBoundsRight] = useState(3000)
  const [imageBoundsBottom, setImageBoundsBottom] = useState(600)
  /** 1 = fitted stage; pinch changes zoom while `sizeInfo` stays logical (storage) pixels. */
  const [stageViewZoom, setStageViewZoom] = useState(1)
  const stageViewZoomRef = useRef(1)
  const [stageViewPan, setStageViewPan] = useState({ x: 0, y: 0 })
  const stageViewPanRef = useRef({ x: 0, y: 0 })
  const [monitorBodyHeight, setMonitorBodyHeight] = useState(400)
  const persistStageFitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Coalesce ResizeObserver bursts so fit + Rnd updates do not thrash layout (WKWebView / black screen). */
  const stageFitRafRef = useRef<number | null>(null)
  const stagePinchPointersRef = useRef(
    new Map<number, { clientX: number; clientY: number }>()
  )
  const stagePinchGestureRef = useRef<{
    startDist: number
    startZoom: number
  } | null>(null)
  const stagePanGestureRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startPanX: number
    startPanY: number
  } | null>(null)
  /** Explicit offset parent for drag so touch/Android uses same coordinate system as wrapper. */
  //const [dragOffsetParent, setDragOffsetParent] = useState<HTMLDivElement | null>(null)
  const LC_BOX_WIDTH = 80
  const LC_BOX_HEIGHT = 43
  /** Extra pixels around the home strip for “drop back to home” hit-testing (fat finger / WKWebView). */
  const HOME_STRIP_DROP_SLACK_PX = 16
  const LC_HOME_STRIP_WIDTH = LC_BOX_WIDTH

  /** LCs shown in the left “home” lane (no image, or still at 0,0). */
  const columnLaneEntries = useMemo(
    () => lcBoxesToRender.filter(({ item }) => lcInColumnSlot(item)),
    [lcBoxesToRender]
  );

  const columnContentHeight = useMemo(() => {
    let maxBottom = 0
    columnLaneEntries.forEach(({ index }) => {
      const pos = columnDisplayPosition(index, tempHomePositions, LC_BOX_HEIGHT)
      maxBottom = Math.max(maxBottom, pos.y + LC_BOX_HEIGHT)
    })
    return Math.max(maxBottom, LC_BOX_HEIGHT)
  }, [columnLaneEntries, tempHomePositions])

  useLayoutEffect(() => {
    setLcBoundsBottom(Math.max(columnContentHeight, LC_BOX_HEIGHT))
  }, [columnContentHeight])

  const [columnScrollTop, setColumnScrollTop] = useState(0)
  const [columnLcDragging, setColumnLcDragging] = useState(false)
  /** Which home-column LC is under the finger (z + panel lift from first pointer-down). */
  const [columnDragLiftIndex, setColumnDragLiftIndex] = useState<number | null>(null)
  /** While dragging an LC on the image, lift clipping so it can move toward the home strip. */
  const [stageLcDragging, setStageLcDragging] = useState(false)
  const columnScrollTopRef = useRef(0)
  columnScrollTopRef.current = columnScrollTop

  useEffect(() => {
    stageViewZoomRef.current = stageViewZoom
  }, [stageViewZoom])
  useEffect(() => {
    stageViewPanRef.current = stageViewPan
  }, [stageViewPan])

  useLayoutEffect(() => {
    const wrap = wrapperRef.current
    if (!wrap) return
    const upd = () => setMonitorBodyHeight(Math.max(LC_BOX_HEIGHT, wrap.clientHeight))
    upd()
    const ro = new ResizeObserver(upd)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  const syncSelectedPlanImageFields = useCallback(async (
    projectIdRaw: string | number | undefined,
    fields: { p_image?: string; p_image_w?: number; p_image_h?: number; p_image_l?: number; p_image_t?: number }
  ) => {
    const pid = normalizeProjectId(projectIdRaw);
    if (!pid) return;
    const stateRow = await db.monitor_plan_state.get(pid);
    const selectedPlanId = String(stateRow?.selected_plan_id || '').trim();
    if (!selectedPlanId) return;
    const plan = await db.monitor_plans.get(Number(selectedPlanId));
    if (!plan) return;
    if (normalizeProjectId(plan.project_id) !== pid) return;
    await db.monitor_plans.update(Number(plan.id), {
      ...fields,
      updated_at: Date.now(),
    });
  }, []);

  const applyStageFitToContentArea = useCallback(() => {
    const el = contentSideRef.current
    const proj = currProjectRef.current
    if (!el || !proj?.p_image) return
    const availW = el.clientWidth
    const availH = el.clientHeight
    if (availW < STAGE_FIT_MIN || availH < STAGE_FIT_MIN) return

    const natural = imageNaturalSizeRef.current
    const iw = natural?.width ?? Number(proj.p_image_w)
    const ih = natural?.height ?? Number(proj.p_image_h)
    const { width: baseW, height: baseH } =
      Number.isFinite(iw) && iw > 0 && Number.isFinite(ih) && ih > 0
        ? fitImageRectToViewport(availW, availH, iw, ih)
        : fitImageRectToViewport(availW, availH, availW, availH)

    const prevW = sizeInfoRef.current.width
    const prevH = sizeInfoRef.current.height
    const prevX = posInfoRef.current.x
    const prevY = posInfoRef.current.y

    const fitChanged = baseStageFitMeaningfullyChanged(prevW, prevH, baseW, baseH)
    if (fitChanged) {
      stageViewZoomRef.current = 1
      setStageViewZoom(1)
      stageViewPanRef.current = { x: 0, y: 0 }
      setStageViewPan({ x: 0, y: 0 })
    } else {
      const pan = clampStagePan(stageViewPanRef.current, stageViewZoomRef.current, baseW, baseH)
      if (pan.x !== stageViewPanRef.current.x || pan.y !== stageViewPanRef.current.y) {
        stageViewPanRef.current = pan
        setStageViewPan(pan)
      }
    }

    const pos: PosInfoType = {
      x: Math.max(0, Math.floor((availW - baseW) / 2)),
      y: Math.max(0, Math.floor((availH - baseH) / 2)),
    }

    const size = { width: baseW, height: baseH }
    if (prevW === baseW && prevH === baseH && prevX === pos.x && prevY === pos.y) {
      return
    }

    // Keep persisted LC coordinates stable across project switches / refits.
    // Re-scaling here caused occasional drift relative to canvas after changing projects.

    setSizeInfo(size)
    setPosInfo(pos)
    sizeInfoRef.current = size
    posInfoRef.current = pos
    const rndSize = { width: size.width, height: size.height }
    requestAnimationFrame(() => {
      rndRef.current?.updateSize(rndSize)
      rndRef.current?.updatePosition(pos)
    })

    if (persistStageFitTimerRef.current) clearTimeout(persistStageFitTimerRef.current)
    persistStageFitTimerRef.current = setTimeout(() => {
      persistStageFitTimerRef.current = null
      const id = currProjectRef.current?.id
      if (!id || !currProjectRef.current?.p_image) return
      void f_update_project_image_size(id, size.width, size.height)
      void f_update_project_image_position(id, pos.y, pos.x)
      const el2 = contentSideRef.current
      void f_reposition_stage(id, el2?.clientWidth ?? availW, el2?.clientHeight ?? availH)
    }, 400)
  }, [f_update_project_image_size, f_update_project_image_position, f_reposition_stage, onMoveLC, syncSelectedPlanImageFields])

  applyStageFitToContentAreaRef.current = applyStageFitToContentArea

  useEffect(() => {
    imageNaturalSizeRef.current = null;
    if (!curProject?.p_image || typeof window === 'undefined') return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        imageNaturalSizeRef.current = {
          width: img.naturalWidth,
          height: img.naturalHeight,
        };
        requestAnimationFrame(() => {
          applyStageFitToContentAreaRef.current();
        });
      }
    };
    img.src = curProject.p_image;
  }, [curProject?.p_image]);

  useEffect(() => {
    stageViewZoomRef.current = 1
    setStageViewZoom(1)
    stageViewPanRef.current = { x: 0, y: 0 }
    setStageViewPan({ x: 0, y: 0 })
    requestAnimationFrame(() => {
      applyStageFitToContentAreaRef.current()
    })
  }, [curProject?.id])

  const onStagePinchPointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (locked || layoutProgress || !hasBackgroundImage) return;
      if (e.pointerType === 'mouse') return;
      const root = imageStageRef.current;
      if (!root || !root.contains(e.target as Node)) return;
      const targetEl = e.target as HTMLElement | null;
      stagePinchPointersRef.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
      });
      if (
        stageViewZoomRef.current > 1.001 &&
        stagePinchPointersRef.current.size === 1 &&
        !targetEl?.closest('.monitor-lc-handle')
      ) {
        stagePanGestureRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startPanX: stageViewPanRef.current.x,
          startPanY: stageViewPanRef.current.y,
        };
      }
      if (stagePinchPointersRef.current.size === 2) {
        stagePanGestureRef.current = null;
        const d = pinchPointerDistance(stagePinchPointersRef.current);
        stagePinchGestureRef.current = {
          startDist: Math.max(d, 10),
          startZoom: stageViewZoomRef.current,
        };
      }
    },
    [locked, layoutProgress, hasBackgroundImage]
  );

  const onStagePinchPointerMoveCapture = useCallback(
    (e: React.PointerEvent) => {
      if (!stagePinchPointersRef.current.has(e.pointerId)) return;
      stagePinchPointersRef.current.set(e.pointerId, {
        clientX: e.clientX,
        clientY: e.clientY,
      });

      const pan = stagePanGestureRef.current;
      if (
        pan &&
        pan.pointerId === e.pointerId &&
        stagePinchPointersRef.current.size === 1 &&
        stageViewZoomRef.current > 1.001
      ) {
        e.preventDefault();
        const stageW = sizeInfoRef.current.width || frameDefaultSize.width;
        const stageH = sizeInfoRef.current.height || frameDefaultSize.height;
        const rawPan = {
          x: pan.startPanX + (e.clientX - pan.startX),
          y: pan.startPanY + (e.clientY - pan.startY),
        };
        const nextPan = clampStagePan(rawPan, stageViewZoomRef.current, stageW, stageH);
        if (nextPan.x !== stageViewPanRef.current.x || nextPan.y !== stageViewPanRef.current.y) {
          stageViewPanRef.current = nextPan;
          setStageViewPan(nextPan);
        }
        return;
      }

      const g = stagePinchGestureRef.current;
      if (!g || stagePinchPointersRef.current.size < 2) return;
      const d = pinchPointerDistance(stagePinchPointersRef.current);
      if (d < 6) return;
      const raw = g.startZoom * (d / g.startDist);
      const next = Math.min(STAGE_VIEW_ZOOM_MAX, Math.max(STAGE_VIEW_ZOOM_MIN, raw));
      const zOld = stageViewZoomRef.current;
      if (Math.abs(next - zOld) < 0.003) return;
      const pts = Array.from(stagePinchPointersRef.current.values());
      if (pts.length < 2) return;
      const stage = imageStageRef.current;
      if (!stage) return;
      const sr = stage.getBoundingClientRect();
      const fx = (pts[0].clientX + pts[1].clientX) / 2 - sr.left;
      const fy = (pts[0].clientY + pts[1].clientY) / 2 - sr.top;
      const panOld = stageViewPanRef.current;
      const lx = (fx - panOld.x) / Math.max(1e-6, zOld);
      const ly = (fy - panOld.y) / Math.max(1e-6, zOld);
      const unclamped = { x: fx - lx * next, y: fy - ly * next };
      const stageW = sizeInfoRef.current.width || frameDefaultSize.width;
      const stageH = sizeInfoRef.current.height || frameDefaultSize.height;
      const nextPan = clampStagePan(unclamped, next, stageW, stageH);
      stageViewZoomRef.current = next;
      stageViewPanRef.current = nextPan;
      setStageViewZoom(next);
      setStageViewPan(nextPan);
    },
    [frameDefaultSize.height, frameDefaultSize.width]
  );

  const onStagePinchPointerUpCapture = useCallback((e: React.PointerEvent) => {
    stagePinchPointersRef.current.delete(e.pointerId);
    if (stagePanGestureRef.current?.pointerId === e.pointerId) {
      stagePanGestureRef.current = null;
    }
    if (stagePinchPointersRef.current.size < 2) {
      stagePinchGestureRef.current = null;
    }
  }, []);

  const onStageWheelZoom = useCallback(
    (e: React.WheelEvent) => {
      if (locked || layoutProgress || !hasBackgroundImage) return;
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = 1 + Math.min(0.25, Math.max(-0.25, -e.deltaY * 0.002));
      const zOld = stageViewZoomRef.current;
      const next = Math.min(STAGE_VIEW_ZOOM_MAX, Math.max(STAGE_VIEW_ZOOM_MIN, zOld * factor));
      if (Math.abs(next - zOld) < 0.002) return;
      const stage = imageStageRef.current;
      if (!stage) return;
      const sr = stage.getBoundingClientRect();
      const fx = e.clientX - sr.left;
      const fy = e.clientY - sr.top;
      const panOld = stageViewPanRef.current;
      const lx = (fx - panOld.x) / Math.max(1e-6, zOld);
      const ly = (fy - panOld.y) / Math.max(1e-6, zOld);
      const unclamped = { x: fx - lx * next, y: fy - ly * next };
      const stageW = sizeInfoRef.current.width || frameDefaultSize.width;
      const stageH = sizeInfoRef.current.height || frameDefaultSize.height;
      const nextPan = clampStagePan(unclamped, next, stageW, stageH);
      stageViewZoomRef.current = next;
      stageViewPanRef.current = nextPan;
      setStageViewZoom(next);
      setStageViewPan(nextPan);
    },
    [locked, layoutProgress, hasBackgroundImage, frameDefaultSize.height, frameDefaultSize.width]
  );

  const columnViewportH = useMemo(() => {
    const cap = Math.max(LC_BOX_HEIGHT, monitorBodyHeight)
    return Math.min(Math.max(columnContentHeight, LC_BOX_HEIGHT), cap)
  }, [columnContentHeight, monitorBodyHeight])

  const columnScrollMax = useMemo(
    () => Math.max(0, columnContentHeight - columnViewportH),
    [columnContentHeight, columnViewportH]
  )

  // Stage LCs need enough left slop to visually cross from the image box to Home.
  // Include the fitted-image left offset inside content plus Home strip width.
  const stageToHomeLeftSlop = Math.max(
    LC_HOME_STRIP_WIDTH,
    LC_HOME_STRIP_WIDTH + Math.max(0, Number(posInfo?.x ?? 0)) + 24
  );

  useLayoutEffect(() => {
    const clamped = Math.min(Math.max(0, columnScrollTop), columnScrollMax)
    if (clamped !== columnScrollTop) setColumnScrollTop(clamped)
  }, [columnScrollTop, columnScrollMax])

  const homeTouchScrollRef = useRef<{
    pointerId: number
    startY: number
    startScroll: number
  } | null>(null)

  const onHomeTouchScrollPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const maxScroll = Math.max(0, columnContentHeight - columnViewportH)
    if (maxScroll <= 0 || e.pointerType !== 'touch') return
    homeTouchScrollRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startScroll: columnScrollTopRef.current,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [columnContentHeight, columnViewportH])

  const onHomeTouchScrollPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = homeTouchScrollRef.current
    if (!d || e.pointerId !== d.pointerId) return
    const maxScroll = Math.max(0, columnContentHeight - columnViewportH)
    if (maxScroll <= 0) return
    const dy = e.clientY - d.startY
    const next = Math.min(Math.max(0, d.startScroll - dy), maxScroll)
    if (Math.abs(dy) > 2) {
      e.preventDefault()
      e.stopPropagation()
    }
    setColumnScrollTop(next)
  }, [columnContentHeight, columnViewportH])

  const onHomeTouchScrollPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = homeTouchScrollRef.current
    if (d && e.pointerId === d.pointerId) {
      homeTouchScrollRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
    }
  }, [])

  const onHomeLaneWheel = useCallback(
    (e: React.WheelEvent) => {
      const maxScroll = Math.max(0, columnContentHeight - columnViewportH)
      if (maxScroll <= 0) return
      e.preventDefault()
      e.stopPropagation()
      setColumnScrollTop((s) => Math.min(Math.max(0, s + e.deltaY), maxScroll))
    },
    [columnContentHeight, columnViewportH]
  )

  const onColumnHomeDragLift = useCallback((active: boolean, fromIndex?: number) => {
    setColumnLcDragging(active)
    if (active && fromIndex !== undefined) setColumnDragLiftIndex(fromIndex)
    if (!active) setColumnDragLiftIndex(null)
  }, [])

  const onStageLcDragLift = useCallback((active: boolean, _fromIndex?: number) => {
    setStageLcDragging(active)
  }, [])

  /** Home strip vs image panel are flex siblings: raise the side being dragged so LCs never paint under the other. */
  // Home vs image *panel* still swap while dragging so a stage LC can cross into the home strip.
  // Inside the stage, the photo is pinned to z:-1 (see imageStageRef) so it never paints over LCs.
  // When any LC is on the image, keep the image panel above the home lane while idle so slop drags
  // are not hidden under the home strip (Rnd remount after auto-place can delay drag-lift one frame).
  const homeLaneStackZ = columnLcDragging
    ? 60000
    : stageLcDragging
      ? 10
      : 19
  const imagePanelStackZ = stageLcDragging
    ? 60000
    : columnLcDragging
      ? 10
      : 20

  useEffect(() => {
    setColumnScrollTop(0)
  }, [curProject?.id])

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

  /** On first load when project has image but no saved dimensions: fit to visible area. */
  useLayoutEffect(() => {
    if (!curProject?.id || !curProject?.p_image || curProject.p_image_w != null || curProject.p_image_h != null) return;
    if (didSetSizeFromContainerRef.current === curProject.id) return;
    const el = contentSideRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w < STAGE_FIT_MIN || h < STAGE_FIT_MIN) return;
    didSetSizeFromContainerRef.current = curProject.id;
    requestAnimationFrame(() => {
      applyStageFitToContentArea();
    });
  }, [curProject?.id, curProject?.p_image, curProject?.p_image_w, curProject?.p_image_h, applyStageFitToContentArea]);

  useEffect(() => {
    const id = currProjectRef.current?.id
    if (!id) return
    void db.projects.get(id).then(() => {
      requestAnimationFrame(() => applyStageFitToContentArea())
    })
  }, [curProject.id, applyStageFitToContentArea])
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
  /** Fit image stage to visible content area; keep bounds in sync (no overflow). */
  useLayoutEffect(() => {
    const el = contentSideRef.current
    if (!el) return
    const run = () => {
      setImageBoundsRight(el.clientWidth)
      setImageBoundsBottom(el.clientHeight)
      if (stageFitRafRef.current != null) cancelAnimationFrame(stageFitRafRef.current)
      stageFitRafRef.current = requestAnimationFrame(() => {
        stageFitRafRef.current = null
        applyStageFitToContentArea()
      })
    }
    run()
    const ro = new ResizeObserver(run)
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (stageFitRafRef.current != null) {
        cancelAnimationFrame(stageFitRafRef.current)
        stageFitRafRef.current = null
      }
      if (persistStageFitTimerRef.current) {
        clearTimeout(persistStageFitTimerRef.current)
        persistStageFitTimerRef.current = null
      }
    }
  }, [applyStageFitToContentArea])

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
      const scY = columnScrollTopRef.current
      if (abs.x !== prevDisplay.x || abs.y !== prevDisplay.y) return abs;
      const fromDom = columnPositionFromDomIfChanged(
        data as DraggableData,
        prevDisplay,
        lcColumnRef.current,
        lcBoundsRight,
        lcBoundsBottom,
        scY
      );
      if (fromDom) return fromDom;
      if (dragGestureSeen) {
        const byId = lcHandleOffsetInColumnFromDomId(
          cur.id,
          lcColumnRef.current,
          lcBoundsRight,
          lcBoundsBottom,
          scY
        );
        if (byId && (byId.x !== prevDisplay.x || byId.y !== prevDisplay.y)) return byId;
      }
      return abs;
    };

    const getCanvasLogicalBounds = () => {
      const canvasW = Math.max(LC_BOX_WIDTH, imageBoundsRight);
      const canvasH = Math.max(LC_BOX_HEIGHT, imageBoundsBottom);
      const offX = Math.round(Number(posInfoRef.current?.x ?? posInfo.x ?? 0));
      const offY = Math.round(Number(posInfoRef.current?.y ?? posInfo.y ?? 0));
      const minX = -offX;
      const minY = -offY;
      const maxX = canvasW - offX - LC_BOX_WIDTH;
      const maxY = canvasH - offY - LC_BOX_HEIGHT;
      return {
        minX,
        minY,
        maxX: Math.max(minX, maxX),
        maxY: Math.max(minY, maxY),
      };
    };

    const getPaintedImageRects = (
      stageRect: DOMRect,
      stageW: number,
      stageH: number,
      zoom: number,
      pan: { x: number; y: number }
    ) => {
      const natural = imageNaturalSizeRef.current;
      const srcWRaw = natural?.width ?? Number(curProject?.p_image_w) ?? stageW;
      const srcHRaw = natural?.height ?? Number(curProject?.p_image_h) ?? stageH;
      const srcW = Number.isFinite(srcWRaw) && srcWRaw > 0 ? srcWRaw : stageW;
      const srcH = Number.isFinite(srcHRaw) && srcHRaw > 0 ? srcHRaw : stageH;
      const painted = fitImageRectToViewport(stageW, stageH, srcW, srcH);
      const left = stageRect.left + pan.x + painted.x * zoom;
      const top = stageRect.top + pan.y + painted.y * zoom;
      return {
        logical: {
          left: painted.x,
          top: painted.y,
          right: painted.x + painted.width,
          bottom: painted.y + painted.height,
        },
        client: {
          left,
          top,
          right: left + painted.width * zoom,
          bottom: top + painted.height * zoom,
        },
      };
    };

    if (!hasBackgroundImage || lcInColumnSlot(cur)) {
      if (!hasBackgroundImage) {
        const ptNoImg = clientPointFromDragStop(e, data);
        const stageNoImg = contentSideRef.current;
        if (ptNoImg && stageNoImg) {
          const sr = stageNoImg.getBoundingClientRect();
          if (ptNoImg.x >= sr.left && ptNoImg.x <= sr.right && ptNoImg.y >= sr.top && ptNoImg.y <= sr.bottom) {
            const sw = Math.max(LC_BOX_WIDTH, stageNoImg.clientWidth || imageBoundsRight);
            const sh = Math.max(LC_BOX_HEIGHT, stageNoImg.clientHeight || imageBoundsBottom);
            let nx = Math.round(ptNoImg.x - sr.left - LC_BOX_WIDTH / 2);
            let ny = Math.round(ptNoImg.y - sr.top - LC_BOX_HEIGHT / 2);
            nx = Math.max(0, Math.min(Math.max(0, sw - LC_BOX_WIDTH), nx));
            ny = Math.max(0, Math.min(Math.max(0, sh - LC_BOX_HEIGHT), ny));
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
        const rawCol = resolveColumnAbs(prevDisplay, newAbs);
        const colAbs = homeColumnDropGridPosition(
          rawCol.y,
          LC_BOX_HEIGHT,
          lcBoundsBottom,
          layoutList,
          tempHomePositionsRef.current,
          index
        );
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

      const pt = clientPointFromDragStop(e, data);
      const stage = imageStageRef.current;
      // Canonical layout box (same as Rnd / view_x,y everywhere). DOM rect can differ by subpixels
      // or briefly after layout — mixing rect deltas with imgW clamp caused a late “snap”.
      const iw = Math.max(1, sizeInfoRef.current.width || sizeInfo.width || 400);
      const ih = Math.max(1, sizeInfoRef.current.height || sizeInfo.height || 300);

      if (pt && stage) {
        const rect = stage.getBoundingClientRect();
        if (pt.x >= rect.left && pt.x <= rect.right && pt.y >= rect.top && pt.y <= rect.bottom) {
          const z = Math.max(1e-6, stageViewZoomRef.current);
          const pan = stageViewPanRef.current;
          let nx = Math.round((pt.x - rect.left - LC_BOX_WIDTH / 2 - pan.x) / z);
          let ny = Math.round((pt.y - rect.top - LC_BOX_HEIGHT / 2 - pan.y) / z);
          const canvasBounds = getCanvasLogicalBounds();
          nx = Math.max(canvasBounds.minX, Math.min(canvasBounds.maxX, nx));
          ny = Math.max(canvasBounds.minY, Math.min(canvasBounds.maxY, ny));
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

      // Android fallback: when touchend coordinates are stale/missing, dragging from Home toward
      // the right can be mis-classified as Home reorder. If X moved clearly outside Home strip,
      // force a stage drop near the left side of the canvas.
      if (stage && dragGestureSeen && newAbs.x > Math.round(LC_HOME_STRIP_WIDTH * 0.6)) {
        const rect = stage.getBoundingClientRect();
        const z = Math.max(1e-6, stageViewZoomRef.current);
        const pan = stageViewPanRef.current;
        const fallbackClientX = rect.left + 1;
        const fallbackClientY = pt
          ? Math.max(rect.top + 1, Math.min(rect.bottom - 1, pt.y))
          : Math.round((rect.top + rect.bottom) / 2);
        let nx = Math.round((fallbackClientX - rect.left - LC_BOX_WIDTH / 2 - pan.x) / z);
        let ny = Math.round((fallbackClientY - rect.top - LC_BOX_HEIGHT / 2 - pan.y) / z);
        const canvasBounds = getCanvasLogicalBounds();
        nx = Math.max(canvasBounds.minX, Math.min(canvasBounds.maxX, nx));
        ny = Math.max(canvasBounds.minY, Math.min(canvasBounds.maxY, ny));
        const nudged = nudgeOffColumnSentinel(nx, ny);
        const updatedItem: ILC = { ...cur, view_x: String(nudged.x), view_y: String(nudged.y) };
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
      // Image present + LC started in Home:
      // if drop is not clearly on the painted image, keep exact original home slot.
      // This prevents Android touch ambiguity from creating deep temporary Y positions
      // that look like cells "sunk" behind the image area.
      setTempHomePositions((prev) => {
        if (!(index in prev)) return prev;
        const next = { ...prev };
        delete next[index];
        return next;
      });
      return;
    }

    const ptHome = clientPointFromDragStop(e, data);
    const stripEl = homeLaneStripRef.current;
    const colEl = lcColumnRef.current;
    if (ptHome && stripEl && colEl) {
      const sr = stripEl.getBoundingClientRect();
      const m = HOME_STRIP_DROP_SLACK_PX;
      if (
        ptHome.x >= sr.left - m &&
        ptHome.x <= sr.right + m &&
        ptHome.y >= sr.top - m &&
        ptHome.y <= sr.bottom + m
      ) {
        const cr = colEl.getBoundingClientRect();
        const scY = columnScrollTopRef.current;
        const absY = Math.round(ptHome.y - cr.top + scY);
        const colAbs = homeColumnDropGridPosition(
          absY,
          LC_BOX_HEIGHT,
          lcBoundsBottom,
          layoutList,
          tempHomePositionsRef.current,
          index
        );
        flushSync(() => {
          setLayoutUndoStack((stack) =>
            pushLayoutUndoEntry(stack, {
              positions: snapshotFromList(layoutList),
              tempColumn: cloneTempColumn(tempHomePositionsRef.current),
            })
          );
          setTempHomePositions(compactHomeTemp(layoutList, LC_BOX_HEIGHT, index));
          onMoveLC({ ...cur, view_x: '0', view_y: '0' });
        });
        return;
      }
    }

    let nx = newAbs.x;
    let ny = newAbs.y;
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
        LC_BOX_HEIGHT,
        stageViewZoomRef.current,
        stageViewPanRef.current.x,
        stageViewPanRef.current.y
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
          LC_BOX_HEIGHT,
          stageViewZoomRef.current,
          stageViewPanRef.current.x,
          stageViewPanRef.current.y
        );
        if (byId && (byId.x !== ox || byId.y !== oy)) {
          nx = byId.x;
          ny = byId.y;
        }
      }
    }

    const canvasBounds = getCanvasLogicalBounds();
    nx = Math.max(canvasBounds.minX, Math.min(canvasBounds.maxX, nx));
    ny = Math.max(canvasBounds.minY, Math.min(canvasBounds.maxY, ny));
    const nudged = nudgeOffColumnSentinel(nx, ny);
    nx = nudged.x;
    ny = nudged.y;

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

  const findFirstFreeStageGridPosition = useCallback((layoutList: ILC[]) => {
    const stageW = hasBackgroundImage
      ? Math.max(LC_BOX_WIDTH, imageBoundsRight)
      : Math.max(LC_BOX_WIDTH, contentSideRef.current?.clientWidth || imageBoundsRight || LC_BOX_WIDTH);
    const stageH = hasBackgroundImage
      ? Math.max(LC_BOX_HEIGHT, imageBoundsBottom)
      : Math.max(LC_BOX_HEIGHT, contentSideRef.current?.clientHeight || imageBoundsBottom || LC_BOX_HEIGHT);
    const offX = hasBackgroundImage ? Math.round(Number(posInfoRef.current?.x ?? posInfo.x ?? 0)) : 0;
    const offY = hasBackgroundImage ? Math.round(Number(posInfoRef.current?.y ?? posInfo.y ?? 0)) : 0;
    const minX = hasBackgroundImage ? -offX : 0;
    const minY = hasBackgroundImage ? -offY : 0;
    const maxX = hasBackgroundImage ? (stageW - offX - LC_BOX_WIDTH) : (stageW - LC_BOX_WIDTH);
    const maxY = hasBackgroundImage ? (stageH - offY - LC_BOX_HEIGHT) : (stageH - LC_BOX_HEIGHT);
    const usableW = Math.max(LC_BOX_WIDTH, maxX - minX + LC_BOX_WIDTH);
    const usableH = Math.max(LC_BOX_HEIGHT, maxY - minY + LC_BOX_HEIGHT);
    const cols = Math.max(1, Math.floor(usableW / LC_BOX_WIDTH));
    const rows = Math.max(1, Math.floor(usableH / LC_BOX_HEIGHT));
    const occupied = new Set<string>();
    layoutList.forEach((item) => {
      if (lcInColumnSlot(item)) return;
      const x = parseInt(String(item.view_x ?? '0'), 10) || 0;
      const y = parseInt(String(item.view_y ?? '0'), 10) || 0;
      const c = Math.max(0, Math.min(cols - 1, Math.round((x - minX) / LC_BOX_WIDTH)));
      const r = Math.max(0, Math.min(rows - 1, Math.round((y - minY) / LC_BOX_HEIGHT)));
      occupied.add(`${r}:${c}`);
    });
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const key = `${r}:${c}`;
        if (occupied.has(key)) continue;
        const x = Math.max(minX, Math.min(maxX, minX + c * LC_BOX_WIDTH));
        const y = Math.max(minY, Math.min(maxY, minY + r * LC_BOX_HEIGHT));
        return nudgeOffColumnSentinel(x, y);
      }
    }
    return nudgeOffColumnSentinel(minX, minY);
  }, [LC_BOX_HEIGHT, LC_BOX_WIDTH, hasBackgroundImage, imageBoundsBottom, imageBoundsRight, posInfo.x, posInfo.y]);

  const handleHomeCellClickToCanvas = useCallback((item: ILC, index: number) => {
    if (locked || layoutProgress) return;
    const layoutList = listRef.current;
    if (!layoutList[index] || !lcInColumnSlot(layoutList[index])) return;
    const nextPos = findFirstFreeStageGridPosition(layoutList);
    flushSync(() => {
      setLayoutUndoStack((stack) =>
        pushLayoutUndoEntry(stack, {
          positions: snapshotFromList(layoutList),
          tempColumn: cloneTempColumn(tempHomePositionsRef.current),
        })
      );
      setTempHomePositions(compactHomeTempAfterRemoving(layoutList, index, LC_BOX_HEIGHT));
      onMoveLC({ ...item, view_x: String(nextPos.x), view_y: String(nextPos.y) });
    });
  }, [LC_BOX_HEIGHT, findFirstFreeStageGridPosition, layoutProgress, locked, onMoveLC]);

  const handleStageCellDoubleTapToHome = useCallback((item: ILC, index: number) => {
    if (locked || layoutProgress) return;
    const layoutList = listRef.current;
    if (!layoutList[index] || lcInColumnSlot(layoutList[index])) return;
    const colAbs = homeColumnDropGridPosition(
      0,
      LC_BOX_HEIGHT,
      lcBoundsBottom,
      layoutList,
      tempHomePositionsRef.current,
      index
    );
    flushSync(() => {
      setLayoutUndoStack((stack) =>
        pushLayoutUndoEntry(stack, {
          positions: snapshotFromList(layoutList),
          tempColumn: cloneTempColumn(tempHomePositionsRef.current),
        })
      );
      setTempHomePositions(compactHomeTemp(layoutList, LC_BOX_HEIGHT, index));
      onMoveLC({ ...item, view_x: '0', view_y: '0' });
    });
  }, [LC_BOX_HEIGHT, layoutProgress, lcBoundsBottom, locked, onMoveLC]);

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
    const prev = prevOnImageCountRef.current;
    prevOnImageCountRef.current = onImageCount;

    // All LCs back on home: still remount `<img>` (bust) so WKWebView drops the “bitmap above LCs”
    // layer that can stick after the overlay empties — but avoid Rnd/resize nudges (those regressed).
    if (prev > 0 && onImageCount === 0) {
      flushSync(() => {
        setLcImageCompositingBust((b) => b + 1);
        setLcRenderEpoch((v) => v + 1);
        setStageLcDragging(false);
        setColumnLcDragging(false);
      });
      return;
    }
    // Canvas was empty, first LC(s) placed back on the image — remount LC overlay + background img.
    if (prev === 0 && onImageCount > 0) {
      flushSync(() => {
        setLcRenderEpoch((v) => v + 1);
        setLcImageCompositingBust((b) => b + 1);
      });
      forceSceneRepaint();
      return;
    }
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
      setStageLcDragging(false);
      setColumnLcDragging(false);
      setColumnDragLiftIndex(null);
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
      setStageLcDragging(false);
      setColumnLcDragging(false);
      setColumnDragLiftIndex(null);
      return;
    }

    if (listLayoutUnchangedByIndex(layoutList, updated)) {
      setLayoutProgress(false);
      setLayoutProgressMessageKey('');
      setStageLcDragging(false);
      setColumnLcDragging(false);
      setColumnDragLiftIndex(null);
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
      // Mirror doHome / onImageCount→0: stale column drag lift leaves home z=60000 and image z=10,
      // so stage LCs paint under the home strip until the next column onStop microtask clears it.
      setStageLcDragging(false);
      setColumnLcDragging(false);
      setColumnDragLiftIndex(null);
    }
  }

  const handleUndoLayout = async () => {
    if (locked || layoutProgress || layoutUndoStack.length === 0) return;
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
        setStageLcDragging(false);
        setColumnLcDragging(false);
        setColumnDragLiftIndex(null);
      });
      forceSceneRepaint();
      await awaitDoubleRaf();
    } catch (err) {
      console.error('[MonitorView] Undo layout failed:', err);
    }
  };

  const handleHomeLayoutClick = () => {
    if (locked || layoutProgress) return;
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
          setStageLcDragging(false);
          setColumnLcDragging(false);
          setColumnDragLiftIndex(null);
        });
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
    const el = contentSideRef.current
    let newSize = { width: canvasWidth, height: canvasHeight }
    let currentPos = { x: 0, y: 0 }
    if (el && el.clientWidth >= STAGE_FIT_MIN && el.clientHeight >= STAGE_FIT_MIN) {
      const f = fitImageRectToViewport(el.clientWidth, el.clientHeight, canvasWidth, canvasHeight)
      newSize = { width: f.width, height: f.height }
      currentPos = { x: f.x, y: f.y }
    }
    const updatedProject = {
      ...curProject,
      p_image: dataUrl,
      p_image_w: newSize.width,
      p_image_h: newSize.height,
      p_image_l: currentPos.x,
      p_image_t: currentPos.y,
    }
    updateCurProject(updatedProject)
    updateProjects(updatedProject)
    await db.projects.update(curProject.id, {
      p_image: dataUrl,
      p_image_w: newSize.width,
      p_image_h: newSize.height,
      p_image_l: currentPos.x,
      p_image_t: currentPos.y,
    })
    await syncSelectedPlanImageFields(curProject.id, {
      p_image: dataUrl,
      p_image_w: newSize.width,
      p_image_h: newSize.height,
      p_image_l: currentPos.x,
      p_image_t: currentPos.y,
    });
    setLayoutUndoStack([])
    setTempHomePositions({})
    f_update_project_last_change()
    f_update_project_image_size(curProject.id, newSize.width, newSize.height)
    f_update_project_image_position(curProject.id, currentPos.y, currentPos.x)
    setSizeInfo(newSize)
    setPosInfo(currentPos)
    sizeInfoRef.current = newSize
    posInfoRef.current = currentPos
    stageViewZoomRef.current = 1
    setStageViewZoom(1)
    stageViewPanRef.current = { x: 0, y: 0 }
    setStageViewPan({ x: 0, y: 0 })
    rndRef.current?.updateSize({
      width: Math.max(STAGE_FIT_MIN, Math.floor(newSize.width)),
      height: Math.max(STAGE_FIT_MIN, Math.floor(newSize.height)),
    })
    rndRef.current?.updatePosition(currentPos)
    setShowBackgroundEditor(false)
    setImageToEdit(null)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => applyStageFitToContentArea())
    })
  }

  const handleRemoveBackgroundImage = () => {
    if (!curProject?.id || !curProject?.p_image) return
    void Swal.fire({
      title: t('Project.EditImage') || 'Edit image',
      text: t('Project.RemoveImageConfirm') || 'Remove background image?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: t('Common.Confirm') || 'Confirm',
      cancelButtonText: t('Common.Cancel') || 'Cancel',
      heightAuto: false,
    }).then(async (res) => {
      if (!res.isConfirmed) return
      const updatedProject = {
        ...curProject,
        p_image: '',
        p_image_w: undefined,
        p_image_h: undefined,
        p_image_l: undefined,
        p_image_t: undefined,
      }
      updateCurProject(updatedProject)
      updateProjects(updatedProject)
      await db.projects.update(curProject.id, {
        p_image: '',
        p_image_w: undefined,
        p_image_h: undefined,
        p_image_l: undefined,
        p_image_t: undefined,
      })
      await syncSelectedPlanImageFields(curProject.id, {
        p_image: '',
        p_image_w: undefined,
        p_image_h: undefined,
        p_image_l: undefined,
        p_image_t: undefined,
      });
      setStageViewZoom(1)
      stageViewZoomRef.current = 1
      setStageViewPan({ x: 0, y: 0 })
      stageViewPanRef.current = { x: 0, y: 0 }
      f_update_project_last_change()
    })
  }

  return (<>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={wrapperRef}
        className="wrapper relative flex min-h-0 flex-1 flex-row items-stretch overflow-hidden"
      >
        {/* LC column: home lane; scrolls when taller than viewport. Sticky so it stays in view while IonContent scrolls. */}
        <div
          ref={homeLaneStripRef}
          className={`lc-column relative flex shrink-0 flex-col self-start min-h-0 ${
            columnLcDragging ? 'overflow-visible' : ''
          }`}
          style={{ width: LC_HOME_STRIP_WIDTH, zIndex: homeLaneStackZ }}
        >
          <div
            key={`lc-col-${lcRenderEpoch}`}
            className={`flex min-w-0 flex-row items-stretch ${columnLcDragging ? 'overflow-visible' : ''}`}
            style={{ height: columnViewportH, touchAction: 'none' }}
            onPointerDown={onHomeTouchScrollPointerDown}
            onPointerMove={onHomeTouchScrollPointerMove}
            onPointerUp={onHomeTouchScrollPointerUp}
            onPointerCancel={onHomeTouchScrollPointerUp}
            onWheel={onHomeLaneWheel}
          >
            <div
              ref={lcColumnRef}
              className={`relative w-20 shrink-0 ${columnLcDragging ? 'overflow-visible' : 'overflow-hidden'}`}
              style={{ height: columnViewportH, touchAction: 'none' }}
              onPointerDown={onHomeTouchScrollPointerDown}
              onPointerMove={onHomeTouchScrollPointerMove}
              onPointerUp={onHomeTouchScrollPointerUp}
              onPointerCancel={onHomeTouchScrollPointerUp}
            >
              <div
                className={`relative z-10 ${columnLcDragging ? '' : 'isolate'}`}
                style={{
                  minHeight: columnContentHeight,
                  transform: `translate3d(0, ${-columnScrollTop}px, 0)`,
                }}
              >
                {columnLaneEntries.map(({ item, index }) => {
                  const displayPos = columnDisplayPosition(index, tempHomePositions, LC_BOX_HEIGHT);

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
                      disabled={true}
                      boundsRight={lcBoundsRight - displayPos.x}
                      boundsBottom={lcBoundsBottom - displayPos.y}
                      columnLiftRaised={columnDragLiftIndex === index}
                      groupHighlight={highlightActive && lcBelongsToGroup(item, groupVid)}
                      onCellClick={handleHomeCellClickToCanvas}
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
            </div>
          </div>
        </div>
        <div
          className={`rnd-container relative flex min-h-0 min-w-0 flex-1 flex-col border border-black dark:border-inherit ${
            (stageLcDragging || stageViewZoom > 1.0001) ? 'overflow-visible' : 'overflow-hidden'
          }`}
          style={{ zIndex: imagePanelStackZ, backgroundColor: 'transparent' }}
        >
          <div
            ref={contentSideRef}
            className={`content-side relative z-0 flex h-full min-h-0 w-full min-w-0 flex-1 ${
              (stageLcDragging || stageViewZoom > 1.0001) ? 'overflow-visible' : 'overflow-hidden'
            }`}
            style={{ backgroundColor: 'transparent' }}
          >
            {/* Rnd bounds = visible content area only (no scroll/overflow outside the panel). */}
            <div
              id="monitor-image-bounds"
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 z-0"
              style={{ width: imageBoundsRight, height: imageBoundsBottom }}
            />
            {curProject?.p_image ? (
              <Rnd
                key={`scene-${sceneRenderEpoch}`}
                ref={rndRef}
                position={posInfo ? posInfo : { x: 0, y: 0 }}
                size={
                  sizeInfo
                    ? {
                        width: Math.max(STAGE_FIT_MIN, Math.floor(sizeInfo.width)),
                        height: Math.max(STAGE_FIT_MIN, Math.floor(sizeInfo.height)),
                      }
                    : { width: frameDefaultSize.width, height: frameDefaultSize.height }
                }
                minWidth={STAGE_FIT_MIN}
                minHeight={STAGE_FIT_MIN}
                bounds="#monitor-image-bounds"
                className="rnd-child"
                disableDragging
                enableResizing={false}
              >
                {/*
                  Clip LC + image to Rnd bounds. Android WebView can leave "ghost" tiles outside the
                  shrunken box if ancestors use overflow: visible; paint containment limits damage.
                  Inner layer uses logical sizeInfo × CSS scale so LCs stay aligned with the photo.
                */}
                <div
                  className={`relative h-full w-full ${
                    (hasBackgroundImage || stageLcDragging || stageViewZoom > 1.0001) ? 'overflow-visible z-[3]' : 'overflow-hidden'
                  }`}
                  style={{ isolation: 'isolate', backgroundColor: 'transparent' }}
                >
                  <div
                    ref={imageStageRef}
                    className={`absolute left-0 top-0 box-border ${
                      (hasBackgroundImage || stageLcDragging || stageViewZoom > 1.0001) ? 'overflow-visible' : 'overflow-hidden'
                    }`}
                    style={{
                      width: sizeInfo?.width ?? frameDefaultSize.width,
                      height: sizeInfo?.height ?? frameDefaultSize.height,
                      touchAction: 'none',
                      isolation: 'isolate',
                      backgroundColor: 'transparent',
                    }}
                    onPointerDownCapture={onStagePinchPointerDownCapture}
                    onPointerMoveCapture={onStagePinchPointerMoveCapture}
                    onPointerUpCapture={onStagePinchPointerUpCapture}
                    onPointerCancelCapture={onStagePinchPointerUpCapture}
                    onWheel={onStageWheelZoom}
                  >
                    {/*
                      Photo is always the bottom layer inside this context (z:-1). LC overlay stays
                      above (z:1). Remount bust/key still helps WKWebView after big layout changes.
                    */}
                    <div
                      key={`lc-stage-bg-${lcImageCompositingBust}`}
                      className="rnd-bg-drag-handle handle absolute inset-0 box overflow-hidden rounded-sm dark:text-white"
                      style={{
                        zIndex: -1,
                        minWidth: '80px',
                        minHeight: '80px',
                        backgroundColor: 'transparent',
                        backgroundImage: `url(${JSON.stringify(curProject.p_image)})`,
                        backgroundSize: 'contain',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                        transform: `translate3d(${stageViewPan.x}px, ${stageViewPan.y}px, 0) scale(${stageViewZoom})`,
                        transformOrigin: '0 0',
                      }}
                      aria-hidden
                    />
                    {hasBackgroundImage && (
                    <div
                      key={`lc-img-${lcRenderEpoch}-${onImageCount}`}
                      className="absolute inset-0 pointer-events-none"
                      style={{ zIndex: 1 }}
                    >
                      {lcBoxesToRender
                        .filter(({ item }) => !lcInColumnSlot(item))
                        .map(({ item, index }) => {
                        const logicalPos = {
                          x: parseInt(String(item.view_x ?? '0'), 10) || 0,
                          y: parseInt(String(item.view_y ?? '0'), 10) || 0,
                        };
                        const displayPos = {
                          x: Math.round(logicalPos.x * stageViewZoom + stageViewPan.x),
                          y: Math.round(logicalPos.y * stageViewZoom + stageViewPan.y),
                        }
                        const canvasW = Math.max(LC_BOX_WIDTH, imageBoundsRight);
                        const canvasH = Math.max(LC_BOX_HEIGHT, imageBoundsBottom);
                        const offX = Math.round(Number(posInfoRef.current?.x ?? posInfo.x ?? 0));
                        const offY = Math.round(Number(posInfoRef.current?.y ?? posInfo.y ?? 0));
                        const minLogicalX = -offX;
                        const minLogicalY = -offY;
                        const maxLogicalX = Math.max(minLogicalX, canvasW - offX - LC_BOX_WIDTH);
                        const maxLogicalY = Math.max(minLogicalY, canvasH - offY - LC_BOX_HEIGHT);
                        const minDispX = stageViewPan.x + minLogicalX * stageViewZoom;
                        const minDispY = stageViewPan.y + minLogicalY * stageViewZoom;
                        const maxDispX = stageViewPan.x + maxLogicalX * stageViewZoom;
                        const maxDispY = stageViewPan.y + maxLogicalY * stageViewZoom;
                        const boundsRight = Math.max(minDispX - displayPos.x, maxDispX - displayPos.x);
                        const boundsBottom = Math.max(minDispY - displayPos.y, maxDispY - displayPos.y);
                        const dynamicLeftSlop = Math.max(stageToHomeLeftSlop, Math.ceil(-minDispX) + 6);
                        const dynamicTopSlop = Math.max(0, Math.ceil(-minDispY) + 6);
                        // Important: include x/y so Draggable remounts after saving a new base position.
                        const key = `${lcRenderEpoch}-${item.id}-${normalizeProjectId(item.project_id)}-${logicalPos.x}-${logicalPos.y}-${stageViewZoom.toFixed(3)}-${Math.round(stageViewPan.x)}-${Math.round(stageViewPan.y)}`;

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
                            dragScale={1}
                            boundsLeftSlop={dynamicLeftSlop}
                            boundsTopSlop={dynamicTopSlop}
                            groupHighlight={highlightActive && lcBelongsToGroup(item, groupVid)}
                            onDragLiftChange={onStageLcDragLift}
                            onCellDoubleTap={handleStageCellDoubleTapToHome}
                            onCellClick={onCellClick}
                            onCellLongPress={onCellLongPress}
                            onStop={(_e, data, idx, baseX, baseY, dragGestureSeen = false) =>
                              reposition_lc(
                                _e,
                                (() => {
                                  const absDisplay = absoluteFromDraggableStop(baseX, baseY, data)
                                  const z = Math.max(1e-6, stageViewZoom)
                                  return {
                                    ...data,
                                    x: Math.round((absDisplay.x - stageViewPan.x) / z),
                                    y: Math.round((absDisplay.y - stageViewPan.y) / z),
                                  }
                                })(),
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
                </div>
              </Rnd>
            ) : null}
            {!hasBackgroundImage && (
              <div
                ref={imageStageRef}
                className={`absolute inset-0 ${stageLcDragging ? 'overflow-visible z-[3]' : 'overflow-hidden'}`}
                style={{ isolation: 'isolate' }}
              >
                <div className="absolute inset-0 bg-[var(--ion-background-color,#1e1e1e)]" aria-hidden />
                <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
                  {lcBoxesToRender
                    .filter(({ item }) => !lcInColumnSlot(item))
                    .map(({ item, index }) => {
                      const displayPos = {
                        x: parseInt(String(item.view_x ?? '0'), 10) || 0,
                        y: parseInt(String(item.view_y ?? '0'), 10) || 0,
                      };
                      const stageW = Math.max(LC_BOX_WIDTH, imageBoundsRight);
                      const stageH = Math.max(LC_BOX_HEIGHT, imageBoundsBottom);
                      const boundsRight = Math.max(-displayPos.x, stageW - LC_BOX_WIDTH - displayPos.x);
                      const boundsBottom = Math.max(-displayPos.y, stageH - LC_BOX_HEIGHT - displayPos.y);
                      const key = `${lcRenderEpoch}-noimg-${item.id}-${normalizeProjectId(item.project_id)}-${displayPos.x}-${displayPos.y}`;
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
                          dragScale={1}
                          boundsLeftSlop={stageToHomeLeftSlop}
                          groupHighlight={highlightActive && lcBelongsToGroup(item, groupVid)}
                          onDragLiftChange={onStageLcDragLift}
                          onCellDoubleTap={handleStageCellDoubleTapToHome}
                          onCellClick={onCellClick}
                          onCellLongPress={onCellLongPress}
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
              </div>
            )}

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
              {curProject?.p_image && (
                <IonButton
                  color="medium"
                  className="m-0"
                  onClick={() => handleRemoveBackgroundImage()}
                  title={t('Project.RemoveImage') || 'Remove image'}
                >
                  <IonIcon slot="icon-only" icon={closeCircleOutline} size="small"></IonIcon>
                </IonButton>
              )}
              {SHOW_MONITOR_AUTO_PLACE_BUTTON ? (
                <IonButton
                  color="medium"
                  className="m-0"
                  disabled={locked || layoutProgress || !hasBackgroundImage}
                  onClick={() => void handlePos()}
                  title={t('Monitor.AutoPlace') || 'Auto place'}
                >
                  <IonIcon slot="icon-only" icon={locateOutline} size="small"></IonIcon>
                </IonButton>
              ) : null}
              <IonButton color="medium" className="m-0" onClick={() => setLocked(v => !v)}>
                <IonIcon slot="icon-only" icon={locked ? lockClosedOutline : lockOpenOutline} size="small"></IonIcon>
              </IonButton>
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
            </div>
          </div>
        </div>
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
