import React, { FC, useRef } from 'react';
import { ILC } from '../../helper/types';
import Text from '../Text';
import { lcBelongsToGroup } from '../../helper/lcGroupMembership';
import { getLcGrossLoadBand } from '../../helper/lcLoadStatus';
import useAppData from '../../hooks/useAppData';

const LC_LONG_PRESS_MS = 600;

interface MonitorStopProps {
  data: ILC[];
  unit: string;
  max: boolean;
  tare?: boolean;
  onCellLongPress?: (lc: ILC) => void;
  groupVisualGroupId?: string | null;
  groupVisualHighlight?: boolean;
}

const MonitorStopTile: FC<{
  item: ILC;
  max: boolean;
  tare: boolean;
  preOverloadPct?: string;
  onCellLongPress?: (lc: ILC) => void;
  groupVisualGroupId?: string | null;
  groupVisualHighlight?: boolean;
}> = ({ item, max, tare, preOverloadPct, onCellLongPress, groupVisualGroupId, groupVisualHighlight }) => {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const rawValueStr = String(item.value ?? '').trim();
  const hasTransmissionError =
    rawValueStr === 'Tr.Err' || rawValueStr === 'Tr. Err' || Number(item.value) === -99999999;
  const useTareValue =
    !hasTransmissionError && tare && item.status_tare && item.weightnotare != null && item.weightnotare !== '';
  const loadBand = !max ? getLcGrossLoadBand(item.value, item.overload, item.underload, preOverloadPct) : 'normal';
  const isDanger = loadBand === 'danger';
  const isOverload = loadBand === 'overload';
  const isUnderload = loadBand === 'underload';
  const isPreOverload = loadBand === 'pre-overload';
  const isAlert = isDanger || isOverload || isUnderload;
  const displayedValue = hasTransmissionError ? 'Tr.Err' : useTareValue ? item.weightnotare : (item.value ?? 'Tr.Err');
  const display = isDanger ? 'DANGER' : max ? (item.max ?? '0') : displayedValue;
  const displayLabel = String(display ?? '');
  const displayStr = String(display ?? '').trim();
  const isZeroDisplay = displayStr === '0' || (displayStr !== '' && !Number.isNaN(Number(displayStr)) && Number(displayStr) === 0);
  const showAlertStyling = isAlert && !isZeroDisplay;
  const showPreOverloadStyling = isPreOverload && !isZeroDisplay && !showAlertStyling;
  const inTareMode = !hasTransmissionError && useTareValue;

  const gid = String(groupVisualGroupId || '').trim();
  const groupRing =
    !!groupVisualHighlight && !!gid && lcBelongsToGroup(item, gid)
      ? ' ring-2 ring-primary ring-offset-1 ring-offset-[var(--ion-background-color,#1e1e1e)]'
      : '';

  return (
    <div
      className={`
        flex flex-col items-center w-full py-2 gap-2 min-h-[4.5rem] border-2 rounded-lg
        ${showAlertStyling ? 'border-red-600 shadow-[0_0_12px_rgba(220,38,38,0.6)]' : showPreOverloadStyling ? 'border-warning shadow-[0_0_8px_rgba(255,196,9,0.5)]' : 'border-gray-500'}
        ${max ? 'bg-cyan2' : inTareMode ? 'bg-cyan-600' : showPreOverloadStyling ? 'bg-warning' : 'bg-gray-400'}
        ${groupRing}
      `}
      onPointerDownCapture={() => {
        if (!onCellLongPress) return;
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTriggeredRef.current = false;
        longPressTimerRef.current = setTimeout(() => {
          longPressTimerRef.current = null;
          longPressTriggeredRef.current = true;
          onCellLongPress(item);
        }, LC_LONG_PRESS_MS);
      }}
      onPointerUpCapture={(ev: React.PointerEvent) => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        if (longPressTriggeredRef.current) {
          ev.preventDefault();
          ev.stopPropagation();
        }
        longPressTriggeredRef.current = false;
      }}
      onPointerCancelCapture={() => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        longPressTriggeredRef.current = false;
      }}
    >
      <Text type="lg-dark" classes="font-bold leading-5 text-lg" label={item.title || item.id} />
      <Text
        type="white"
        classes={`leading-tight !text-5xl tabular-nums ${showAlertStyling ? 'font-extrabold text-white drop-shadow-sm' : showPreOverloadStyling ? 'font-extrabold !text-dark' : 'font-bold !text-gray-900'} ${
          displayLabel === '' || displayLabel === 'Tr.Err' ? 'bg-medium !text-red-500 rounded-bold px-2 py-1 font-extrabold' : ''
        }`}
        label={displayLabel}
      />
    </div>
  );
};

const MonitorStop: FC<MonitorStopProps> = (props) => {
  const {
    data,
    unit,
    max,
    tare = false,
    onCellLongPress,
    groupVisualGroupId = null,
    groupVisualHighlight = false,
  } = props;
  const { curProject } = useAppData();

  return (
    <div
      className={`
        grid
        ${data.length === 1 && 'grid-cols-1'}
        ${data.length === 2 && 'grid-cols-2'}
        ${data.length === 3 && 'grid-cols-3'}
        ${data.length >= 4 && 'grid-cols-4'}
      `}
    >
      {data.length > 0 &&
        data.map((item: ILC) => (
          <MonitorStopTile
            key={String(item.lc_id ?? item.id)}
            item={item}
            max={max}
            tare={tare}
            preOverloadPct={curProject?.pre_overload}
            onCellLongPress={onCellLongPress}
            groupVisualGroupId={groupVisualGroupId}
            groupVisualHighlight={groupVisualHighlight}
          />
        ))}
    </div>
  );
};

export default MonitorStop;
