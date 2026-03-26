import React, { FC } from 'react';
import { ILC } from '../../helper/types';
import Text from '../Text';

interface MonitorStopProps {
  data: ILC[],
  unit: string;
  max: boolean;
  tare?: boolean;
}

const MonitorStop: FC<MonitorStopProps> = props => {
  const { data, unit, max, tare = false } = props

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
      {data.length > 0 && data.map((item: ILC, index: number) => {
        const val = Number(item.value);
        const over = Number(item.overload);
        const under = Number(item.underload);
        const valueForCheck = (tare && item.status_tare && item.weightnotare != null && item.weightnotare !== '') ? Number(item.weightnotare) : val;
        const isDanger = !max && !Number.isNaN(valueForCheck) && !Number.isNaN(over) && over > 0 && valueForCheck >= over * 1.3;
        const isOverload = !max && !Number.isNaN(valueForCheck) && !Number.isNaN(over) && valueForCheck > over;
        const isUnderload = !max && !Number.isNaN(valueForCheck) && !Number.isNaN(under) && valueForCheck < under;
        const isAlert = isDanger || isOverload || isUnderload;
        const displayedValue = (tare && item.status_tare && item.weightnotare != null && item.weightnotare !== '') ? item.weightnotare : (item.value ?? 'Tr.Err');
        const display = isDanger ? 'DANGER' : (max ? (item.max ?? '0') : displayedValue);
        const displayStr = String(display ?? '').trim();
        const isZeroDisplay = displayStr === '0' || (displayStr !== '' && !Number.isNaN(Number(displayStr)) && Number(displayStr) === 0);
        const showAlertStyling = isAlert && !isZeroDisplay;
        const inTareMode = tare && item.status_tare && item.weightnotare != null && item.weightnotare !== '';
        return (
        <div
          key={index}
          className={`
            flex flex-col items-center w-full py-2 gap-2 min-h-[4.5rem] border-2 rounded-lg
            ${showAlertStyling ? 'border-red-600 shadow-[0_0_12px_rgba(220,38,38,0.6)]' : 'border-gray-500'}
            ${max ? 'bg-cyan2' : (inTareMode ? 'bg-cyan-600' : 'bg-gray-400')}
          `}
        >
          <Text type='lg-dark' classes='font-medium leading-4' label={item.title || item.id} />
          <Text
            type='white'
            classes={`leading-4 !text-5xl ${showAlertStyling ? 'font-bold text-red-600' : 'font-medium !text-dark'} ${(display === undefined || display === null || display === '' || display === 'Tr.Err') ? 'bg-danger rounded-bold p-1' : ''}`}
            label={display}
          />
        </div>
      );})}
    </div>
  )
}

export default MonitorStop;
