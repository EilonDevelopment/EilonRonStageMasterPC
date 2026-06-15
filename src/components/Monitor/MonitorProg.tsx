import React, { FC, useRef } from 'react';
import { ILC } from '../../helper/types';
import Text from '../Text';
import { lcBelongsToGroup } from '../../helper/lcGroupMembership';
import { getLcGrossLoadBand } from '../../helper/lcLoadStatus';
import useAppData from '../../hooks/useAppData';

const LC_LONG_PRESS_MS = 600;

interface MonitorProgProps {
  data: ILC[];
  unit: string;
  tare?: boolean;
  max?: boolean;
  onCellLongPress?: (lc: ILC) => void;
  groupVisualGroupId?: string | null;
  groupVisualHighlight?: boolean;
}

const cellStyle = (value: string, overload: string) => {
  const val = parseFloat(value);
  const overloadVal = parseFloat(overload);
  let percent = 100;

  if (!Number.isNaN(val) && !Number.isNaN(overloadVal) && overloadVal > 0) {
    percent = parseFloat((100 - val * 100 / overloadVal).toFixed(1));
  }

  return { height: Math.max(0, Math.min(100, percent)) + '%' };
};

const displayValue = (item: ILC, tare: boolean) => {
  const raw = String(item.value ?? '').trim();
  const hasTransmissionError = raw === 'Tr.Err' || raw === 'Tr. Err' || Number(item.value) === -99999999;
  if (hasTransmissionError) return 'Tr.Err';
  return tare && item.status_tare && item.weightnotare != null && item.weightnotare !== ''
    ? item.weightnotare
    : (item.value ?? '');
};

const MonitorProgTile: FC<{
  item: ILC;
  unit: string;
  tare: boolean;
  max: boolean;
  preOverloadPct?: string;
  onCellLongPress?: (lc: ILC) => void;
  groupVisualGroupId?: string | null;
  groupVisualHighlight?: boolean;
}> = ({ item, unit, tare, max, preOverloadPct, onCellLongPress, groupVisualGroupId, groupVisualHighlight }) => {
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  const isUnderload = (lc: ILC) => {
    const val = parseFloat(displayValue(lc, tare) ?? '');
    const under = parseFloat(lc.underload ?? '');
    return !Number.isNaN(val) && !Number.isNaN(under) && val < under;
  };

  const isOverload = (lc: ILC) => {
    const val = parseFloat(displayValue(lc, tare) ?? '');
    const over = parseFloat(lc.overload ?? '');
    return !Number.isNaN(val) && !Number.isNaN(over) && val > over;
  };

  const isDanger = (lc: ILC) => {
    const val = parseFloat(displayValue(lc, tare) ?? '');
    const over = parseFloat(lc.overload ?? '');
    return !Number.isNaN(val) && !Number.isNaN(over) && over > 0 && val >= over * 1.3;
  };

  const alertBorderStyle = {
    boxShadow: 'inset 0 0 8px rgba(239, 68, 68, 0.4), 0 0 12px rgba(239, 68, 68, 0.5)',
  };

  const showAlertBorder = isUnderload(item) || isOverload(item);
  const loadBand = !max ? getLcGrossLoadBand(item.value, item.overload, item.underload, preOverloadPct) : 'normal';
  const isPreOverload = loadBand === 'pre-overload';
  const dv = max && item.max != null ? item.max : displayValue(item, tare);
  const inTareMode =
    dv !== 'Tr.Err' &&
    dv !== 'Tr. Err' &&
    tare &&
    item.status_tare &&
    item.weightnotare != null &&
    item.weightnotare !== '';
  const danger = !max && isDanger(item);
  const headerClass = max ? 'bg-cyan2' : inTareMode ? 'bg-cyan-600' : 'bg-red1';

  const gid = String(groupVisualGroupId || '').trim();
  const groupRing =
    !!groupVisualHighlight && !!gid && lcBelongsToGroup(item, gid)
      ? ' ring-2 ring-primary ring-offset-1 ring-offset-[var(--ion-background-color,#1e1e1e)]'
      : '';

  return (
    <div
      className={`flex flex-col w-32 border rounded${groupRing}`}
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
      <div className="flex flex-col p-1 gap-2">
        <span className={`w-full text-center text-sm font-bold py-1 ${inTareMode ? 'text-white bg-cyan-700' : 'text-white bg-red1'}`}>
          {danger
            ? 'DANGER'
            : dv && dv !== 'Tr.Err' && dv !== 'Tr. Err' && !Number.isNaN(parseFloat(String(dv))) && item.overload
              ? `${(parseFloat(String(item.overload)) - parseFloat(String(dv))).toFixed(
                  String(item.overload).includes('.') ? 3 : 0
                )}${unit}`
              : dv === 'Tr.Err' || dv === 'Tr. Err'
                ? 'Tr.Err'
                : item.overload
                  ? `${item.overload}${unit}`
                  : '0'}
        </span>
        <div
          className={`flex flex-col h-24 rounded flex items-center justify-center relative ${showAlertBorder ? 'border-2 border-red-500' : isPreOverload ? 'border-2 border-warning bg-warning/30' : ''}`}
          style={showAlertBorder ? alertBorderStyle : undefined}
        >
          <span className="z-30 text-gray-900 font-extrabold text-xl tabular-nums drop-shadow-[0_1px_2px_rgba(255,255,255,0.9)]">
            {danger
              ? 'DANGER'
              : dv && dv !== 'Tr.Err' && dv !== 'Tr. Err' && !Number.isNaN(parseFloat(String(dv)))
                ? `${dv}${unit}`
                : dv === 'Tr.Err' || dv === 'Tr. Err'
                  ? 'Tr.Err'
                  : '0'}
          </span>
          <div className="absolute z-20 bg-white left-0 right-0 top-0" style={cellStyle(String(dv || ''), String(item.overload || ''))} />
          <div className="absolute z-10 left-0 right-0 bottom-0 top-0 bg-gradient-to-t from-cyan1 to-red1 rounded" />
        </div>
      </div>
      <hr className="border-dark dark:border-light" />
      <div className="flex flex-col w-full bg-gray-200 dark:bg-dark px-1 py-1.5 text-center">
        <Text type="sm-dark" classes="font-bold leading-5 text-base text-dark dark:text-light" label={item.title || item.id} />
        <Text
          type="sm-dark"
          classes="font-medium leading-4 text-dark dark:text-light"
          label={`${item.overload}${unit}` || ''}
        />
      </div>
    </div>
  );
};

const MonitorProg: FC<MonitorProgProps> = (props) => {
  const {
    data,
    unit,
    tare = false,
    max = false,
    onCellLongPress,
    groupVisualGroupId = null,
    groupVisualHighlight = false,
  } = props;
  const { curProject } = useAppData();

  return (
    <div className="flex flex-wrap gap-2">
      {data.length > 0 &&
        data.map((item: ILC) => (
          <MonitorProgTile
            key={String(item.lc_id ?? item.id)}
            item={item}
            unit={unit}
            tare={tare}
            max={max}
            preOverloadPct={curProject?.pre_overload}
            onCellLongPress={onCellLongPress}
            groupVisualGroupId={groupVisualGroupId}
            groupVisualHighlight={groupVisualHighlight}
          />
        ))}
    </div>
  );
};

export default MonitorProg;
