import React, { FC, useRef } from 'react';
import { ILC } from '../../helper/types';
import Text from '../Text';
import { lcBelongsToGroup } from '../../helper/lcGroupMembership';

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
  onCellLongPress?: (lc: ILC) => void;
  groupVisualGroupId?: string | null;
  groupVisualHighlight?: boolean;
}> = ({ item, max, tare, onCellLongPress, groupVisualGroupId, groupVisualHighlight }) => {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const rawValueStr = String(item.value ?? '').trim();
  const hasTransmissionError =
    rawValueStr === 'Tr.Err' || rawValueStr === 'Tr. Err' || Number(item.value) === -99999999;
  const val = Number(item.value);
  const over = Number(item.overload);
  const under = Number(item.underload);
  const useTareValue =
    !hasTransmissionError && tare && item.status_tare && item.weightnotare != null && item.weightnotare !== '';
  const valueForCheck = useTareValue ? Number(item.weightnotare) : val;
  const isDanger = !max && !Number.isNaN(valueForCheck) && !Number.isNaN(over) && over > 0 && valueForCheck >= over * 1.3;
  const isOverload = !max && !Number.isNaN(valueForCheck) && !Number.isNaN(over) && valueForCheck > over;
  const isUnderload = !max && !Number.isNaN(valueForCheck) && !Number.isNaN(under) && valueForCheck < under;
  const isAlert = isDanger || isOverload || isUnderload;
  const displayedValue = hasTransmissionError ? 'Tr.Err' : useTareValue ? item.weightnotare : (item.value ?? 'Tr.Err');
  const display = isDanger ? 'DANGER' : max ? (item.max ?? '0') : displayedValue;
  const displayLabel = String(display ?? '');
  const displayStr = String(display ?? '').trim();
  const isZeroDisplay = displayStr === '0' || (displayStr !== '' && !Number.isNaN(Number(displayStr)) && Number(displayStr) === 0);
  const showAlertStyling = isAlert && !isZeroDisplay;
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
        ${showAlertStyling ? 'border-red-600 shadow-[0_0_12px_rgba(220,38,38,0.6)]' : 'border-gray-500'}
        ${max ? 'bg-cyan2' : inTareMode ? 'bg-cyan-600' : 'bg-gray-400'}
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
      <Text type="lg-dark" classes="font-medium leading-4" label={item.title || item.id} />
      <Text
        type="white"
        classes={`leading-4 !text-5xl ${showAlertStyling ? 'font-bold text-red-600' : 'font-medium !text-dark'} ${
          displayLabel === '' || displayLabel === 'Tr.Err' ? 'bg-danger rounded-bold p-1' : ''
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
            onCellLongPress={onCellLongPress}
            groupVisualGroupId={groupVisualGroupId}
            groupVisualHighlight={groupVisualHighlight}
          />
        ))}
    </div>
  );
};

export default MonitorStop;
