import React, { FC } from 'react';
import { ILC } from '../../helper/types';
import Text from '../Text';

interface MonitorProgProps {
  data: ILC[],
  unit: string;
  tare?: boolean;
  max?: boolean; // AÑADIDO
}

const cellStyle = (value: string, overload: string) => {
  const val = parseFloat(value)
  const overloadVal = parseFloat(overload)
  let percent = 100;

  if (!Number.isNaN(val) && !Number.isNaN(overloadVal) && overloadVal > 0) {
    percent = parseFloat((100 - val * 100 / overloadVal).toFixed(1))
  }

  return { height: Math.max(0, Math.min(100, percent)) + '%' }
}

const displayValue = (item: ILC, tare: boolean) =>
{
  const raw = String(item.value ?? '').trim();
  const hasTransmissionError = raw === 'Tr.Err' || raw === 'Tr. Err' || Number(item.value) === -99999999;
  if (hasTransmissionError) return 'Tr.Err';
  return (tare && item.status_tare && item.weightnotare != null && item.weightnotare !== '')
    ? item.weightnotare
    : (item.value ?? '');
};

const MonitorProg: FC<MonitorProgProps> = props => {
  const { data, unit, tare = false, max = false } = props

  const isUnderload = (item: ILC) => {
    const val = parseFloat(displayValue(item, tare) ?? '')
    const under = parseFloat(item.underload ?? '')
    return !Number.isNaN(val) && !Number.isNaN(under) && val < under
  }

  const isOverload = (item: ILC) => {
    const val = parseFloat(displayValue(item, tare) ?? '')
    const over = parseFloat(item.overload ?? '')
    return !Number.isNaN(val) && !Number.isNaN(over) && val > over
  }

  const isDanger = (item: ILC) => {
    const val = parseFloat(displayValue(item, tare) ?? '')
    const over = parseFloat(item.overload ?? '')
    return !Number.isNaN(val) && !Number.isNaN(over) && over > 0 && val >= over * 1.3
  }

  const alertBorderStyle = {
    boxShadow: 'inset 0 0 8px rgba(239, 68, 68, 0.4), 0 0 12px rgba(239, 68, 68, 0.5)'
  }

  return (<div className='flex flex-wrap gap-2'>
    {data.length > 0 && data.map((item: ILC, index: number) => {
      //const dv = displayValue(item, tare)
      //const danger = isDanger(item)
      const showAlertBorder = isUnderload(item) || isOverload(item)
      const dv = (max && item.max != null) ? item.max : displayValue(item, tare)
      const inTareMode = dv !== 'Tr.Err' && dv !== 'Tr. Err' && tare && item.status_tare && item.weightnotare != null && item.weightnotare !== ''
      const danger = !max && isDanger(item) // No mostrar "DANGER" si estamos viendo históricos MAX
      const headerClass = max ? 'bg-cyan2' : (inTareMode ? 'bg-cyan-600' : 'bg-red1');


      return (
      <div key={index} className='flex flex-col w-32 border rounded'>
        <div className='flex flex-col p-1 gap-2'>
          <span className={`w-full text-center text-xs py-0.5 ${inTareMode ? 'text-white bg-cyan-600' : 'text-white bg-red1'}`}>
            {danger ? 'DANGER' : (dv && dv !== 'Tr.Err' && dv !== 'Tr. Err' && !Number.isNaN(parseFloat(dv)) && item.overload
              ? `${(parseFloat(item.overload) - parseFloat(dv)).toFixed(item.overload.includes('.') ? 3 : 0)}${unit}`
              : (dv === 'Tr.Err' || dv === 'Tr. Err' ? 'Tr.Err' : (item.overload ? `${item.overload}${unit}` : '0')))}
          </span>
          <div
            className={`flex flex-col h-24 rounded flex items-center justify-center relative ${showAlertBorder ? 'border-2 border-red-500' : ''}`}
            style={showAlertBorder ? alertBorderStyle : undefined}
          >
            <span className='z-30 text-black font-normal drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]'>
              {danger ? 'DANGER' : (dv && dv !== 'Tr.Err' && dv !== 'Tr. Err' && !Number.isNaN(parseFloat(dv))
                ? `${dv}${unit}`
                : (dv === 'Tr.Err' || dv === 'Tr. Err' ? 'Tr.Err' : '0'))}
            </span>
            <div className='absolute z-20 bg-white left-0 right-0 top-0' style={cellStyle(dv || "", item.overload || "")}>
            </div>
            <div className='absolute z-10 left-0 right-0 bottom-0 top-0 bg-gradient-to-t from-cyan1 to-red1 rounded'>
            </div>
          </div>
        </div>
        <hr className='border-dark dark:border-light' />
        <div className='flex flex-col w-full bg-gray-200 dark:bg-dark px-1 py-1.5 text-center'>
          <Text type='sm-dark' classes='font-medium leading-4 text-dark dark:text-light' label={item.title || item.id} />
          <Text type='sm-dark' classes='font-medium leading-4 text-dark dark:text-light' label={`${item.overload}${unit}` || ''} />
        </div>
      </div>
      )
    })}
  </div>)
}

export default MonitorProg;
