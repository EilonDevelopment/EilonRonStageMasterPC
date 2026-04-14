import React, { FC } from 'react';
import { ILC } from '../../helper/types';
import CustomDataGrid from '../CustomDataGrid';
import { useTranslation } from 'react-i18next';
import { Typography } from '@mui/material';
import useAppData from '../../hooks/useAppData';

interface MonitorListProps {
  data: ILC[];
  max: boolean; // AÑADIDO
}

const MonitorList: FC<MonitorListProps> = props => {
  const { data, max} = props;
  const { t } = useTranslation()
  const { curProject, tareStatus } = useAppData();

  const hasTransmissionError = (raw: any) => {
    const s = String(raw ?? '').trim();
    return s === 'Tr.Err' || s === 'Tr. Err' || Number(raw) === -99999999;
  };

  const displayValue = (row: ILC) => {
    if (hasTransmissionError(row.value)) return 'Tr.Err';
    const useTareValue =
      tareStatus &&
      row.status_tare &&
      row.weightnotare != null &&
      row.weightnotare !== '';
    return useTareValue ? row.weightnotare : (row.value ?? '');
  };

  const columns = [
    {
      flex: 0.079,
      minWidth: 60,
      field: 'id',
      headerName: t('Monitor.List.Id'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className='text-dark dark:text-light'>{row.id}</span>
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'title',
      headerName: t('Monitor.List.Name'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className='text-dark dark:text-light'>{row.title}</span>
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'value',
      headerName: t('Monitor.List.Load'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => {
        const dv = displayValue(row);
        const isTrErr = !dv || dv === 'Tr.Err' || dv === 'Tr. Err';
        const val = Number(dv);
        const over = Number(row.overload);
        const under = Number(row.underload);
        const isDanger = !Number.isNaN(val) && !Number.isNaN(over) && over > 0 && val >= over * 1.3;
        const isOverload = !Number.isNaN(val) && !Number.isNaN(over) && val > over;
        const isUnderload = !Number.isNaN(val) && !Number.isNaN(under) && val < under;
        const isZeroValue = dv === '0' || parseFloat(String(dv).trim()) === 0;
        const showAlert = (isDanger || isOverload || isUnderload) && !isZeroValue;
        const hasValue = dv && !isTrErr;
        const inTareMode = !hasTransmissionError(row.value) && tareStatus && row.status_tare && row.weightnotare != null && row.weightnotare !== '';
        const display = isDanger ? 'DANGER' : (isTrErr ? 'Tr.Err' : dv);
        const cellClass = showAlert ? 'bg-red-600 text-black' : (isTrErr ? 'bg-danger text-white' : (inTareMode ? 'bg-cyan-600 text-white' : (hasValue ? 'bg-green-600 text-white' : '')));
        return (
          <div className={`px-1 py-0.5 font-medium rounded inline-block min-w-[60px] text-center ${cellClass}`}>
            {display}
          </div>
        );
      }
    },
    {
      flex: 0.079,
      minWidth: 60,
      field: 'percent',
      headerName: '%',
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => {
        const dv = displayValue(row);
        return (
          <span className='text-dark dark:text-light'>
            {dv && dv !== 'Tr.Err' && row.overload ? ((parseFloat(dv) / parseFloat(row.overload)) * 100).toFixed() : ''}
          </span>
        );
      }
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'battery',
      headerName: t('Monitor.List.Battery'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className='text-dark dark:text-light'>{row.battery}</span>
    },
    {
      flex: 0.105,
      minWidth: 80,
      field: 'underload',
      headerName: t('Monitor.List.Underload'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className='text-dark dark:text-light'>{row.underload}</span>
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'overload',
      headerName: t('Monitor.List.Overload'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className='text-dark dark:text-light'>{row.overload}</span>
    },
    {
      flex: 0.118,
      minWidth: 90,
      field: 'sum',
      headerName: t('Monitor.List.Total'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className='text-dark dark:text-light'>{row.total_sum ? 'Yes' : 'No'}</span>
    },
    /*{
      flex: 0.118,
      minWidth: 90,
      field: 'maximum',
      headerName: t('Monitor.List.Maximum'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className='text-dark dark:text-light'>{row.max??'0'}{parseInt(row.id) <= 10 ? curProject.windmeter_units : curProject.units}</span>
    },*/
    
    
   /* {
      flex: 0.118,
      minWidth: 90,
      field: 'maximum',
      headerName:  t('Monitor.List.Maximum'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => {
        const dv = displayValue(row);
        // Lógica de valor a mostrar: si estamos en modo MAX, usamos row.max
        const valToShow =  (row.max ?? '0');

        const isTrErr = !valToShow || valToShow === 'Tr.Err' || valToShow === 'Tr. Err';
        const val = Number(valToShow);
        const over = Number(row.overload);
        const under = Number(row.underload);

        // Desactivamos alertas visuales si estamos viendo el MAX (así no parpadea en rojo mientras vemos picos)
        const isDanger = !max && !Number.isNaN(val) && !Number.isNaN(over) && over > 0 && val >= over * 1.3;
        const isOverload = !max && !Number.isNaN(val) && !Number.isNaN(over) && val > over;
        const isUnderload = !max && !Number.isNaN(val) && !Number.isNaN(under) && val < under;
        
        const isZeroValue = valToShow === '0' || parseFloat(String(valToShow).trim()) === 0;
        const showAlert = (isDanger || isOverload || isUnderload) && !isZeroValue;
        const hasValue = valToShow && !isTrErr;
        const inTareMode = tareStatus && row.status_tare && row.weightnotare != null && row.weightnotare !== '';
        
        const display = isDanger ? 'DANGER' : (isTrErr ? 'Tr.Err' : valToShow);
        
        // Color CYAN si el modo MAX está activo, si no, colores normales
        const cellClass =  'bg-cyan2 text-white';
        // Obtenemos los decimales según la unidad
        const u = curProject?.units?.toLowerCase().replace('.', '') ?? '';
        const fx = (u === 'mton') ? 3 : 0;
        const maxValue = row.max != null ? parseFloat(String(row.max)).toFixed(fx) : '0';
        const unitLabel = parseInt(row.id) <= 10 ? curProject.windmeter_units : curProject.units;
        return (
          <div className={`px-1 py-0.5 font-medium rounded inline-block min-w-[60px] text-center ${cellClass}`}>
            {display}
          </div>
        );
      }
    },



    */
    //renderCell: ({ row }) => <span className='text-dark dark:text-light'>{row.overload}</span>
    {
      flex: 0.118,
      minWidth: 90,
      field: 'maximum',
      headerName: t('Monitor.List.Maximum'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => {
        // Obtenemos los decimales según la unidad
        const u = curProject?.units?.toLowerCase().replace('.', '') ?? '';
        const fx = (u === 'mton') ? 3 : 0;
        const maxValue = row.max != null ? parseFloat(String(row.max)).toFixed(fx) : '0';
        const unitLabel = parseInt(row.id) <= 10 ? curProject.windmeter_units : curProject.units;

        return (
          <div className="text-dark dark:text-light">
            {maxValue}{unitLabel}
          </div>
        );
      }
    },


    {
      flex: 0.118,
      minWidth: 90,
      field: 'groups',
      headerName: t('Monitor.List.Group'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className='text-dark dark:text-light'>{row.groups || ''}</span>
    },
  ];

  return (
    <div className="w-full min-w-0">
      <CustomDataGrid
        columns={columns}
        data={data}
      />
    </div>
  )
}

export default MonitorList;
