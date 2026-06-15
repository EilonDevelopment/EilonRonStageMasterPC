import React, { FC, useMemo, useRef } from 'react';
import { GridRow, GridRowProps } from '@mui/x-data-grid';
import { ILC } from '../../helper/types';
import CustomDataGrid from '../CustomDataGrid';
import { useTranslation } from 'react-i18next';
import useAppData from '../../hooks/useAppData';
import { normalizeProjectId } from '../../helper/functions';
import { lcRankKey, stableRowIndexMap } from '../../helper/lcStableRowIndex';
import { lcBelongsToGroup } from '../../helper/lcGroupMembership';
import { getLcGrossLoadBand } from '../../helper/lcLoadStatus';

const LC_LONG_PRESS_MS = 600;

/** Filled each render by `MonitorList` when long-press zero is enabled (single list instance on screen). */
const monitorListLongPressHandler = { current: null as null | ((lc: ILC) => void) };

const MonitorListLongPressRow = React.memo(
  React.forwardRef<HTMLDivElement, GridRowProps>(function MonitorListLongPressRow(props, ref) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const triggeredRef = useRef(false);

    const emitLongPress = () => {
      const fn = monitorListLongPressHandler.current;
      if (!fn) return;
      const raw = props.row as ILC & { __stableIndex?: number };
      const { __stableIndex: _s, ...lc } = raw;
      fn(lc as ILC);
    };

    return (
      <GridRow
        ref={ref}
        {...props}
        onPointerDownCapture={(e: React.PointerEvent) => {
          props.onPointerDownCapture?.(e as any);
          if (!monitorListLongPressHandler.current) return;
          if (timerRef.current) clearTimeout(timerRef.current);
          triggeredRef.current = false;
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            triggeredRef.current = true;
            emitLongPress();
          }, LC_LONG_PRESS_MS);
        }}
        onPointerUpCapture={(e: React.PointerEvent) => {
          props.onPointerUpCapture?.(e as any);
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          if (triggeredRef.current) {
            e.preventDefault();
            e.stopPropagation();
          }
          triggeredRef.current = false;
        }}
        onPointerCancelCapture={(e: React.PointerEvent) => {
          props.onPointerCancelCapture?.(e as any);
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          triggeredRef.current = false;
        }}
      />
    );
  })
);

interface MonitorListProps {
  data: ILC[];
  max: boolean;
  onCellLongPress?: (lc: ILC) => void;
  groupVisualGroupId?: string | null;
  groupVisualHighlight?: boolean;
}

const MonitorList: FC<MonitorListProps> = (props) => {
  const { data, max, onCellLongPress, groupVisualGroupId = null, groupVisualHighlight = false } = props;
  const { t } = useTranslation()
  const { curProject, tareStatus, monitorListSortedLcIdsRef, lcs } = useAppData();

  const projectLcs = useMemo(() => {
    if (!curProject?.id) return [];
    const pid = normalizeProjectId(curProject.id);
    return lcs.filter((lc) => normalizeProjectId(lc.project_id) === pid);
  }, [lcs, curProject?.id]);

  const stableRankMap = useMemo(() => stableRowIndexMap(projectLcs), [projectLcs]);

  const gridRows = useMemo(
    () =>
      data.map((row) => ({
        ...row,
        __stableIndex: stableRankMap.get(lcRankKey(row)) ?? 0,
      })),
    [data, stableRankMap]
  );

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
      field: '__stableIndex',
      headerName: '#',
      flex: 0.055,
      minWidth: 44,
      sortable: false,
      filterable: false,
      disableReorder: true,
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }: { row: ILC & { __stableIndex: number } }) => (
        <span className="text-dark dark:text-light text-center tabular-nums block w-full">{row.__stableIndex}</span>
      ),
    },
    {
      flex: 0.079,
      minWidth: 60,
      field: 'id',
      headerName: t('Monitor.List.Id'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className='text-dark dark:text-light text-base font-bold tabular-nums'>{row.id}</span>
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
        const loadBand = getLcGrossLoadBand(row.value, row.overload, row.underload, curProject?.pre_overload);
        const isDanger = loadBand === 'danger';
        const isOverload = loadBand === 'overload';
        const isUnderload = loadBand === 'underload';
        const isPreOverload = loadBand === 'pre-overload';
        const isZeroValue = dv === '0' || parseFloat(String(dv).trim()) === 0;
        const showAlert = (isDanger || isOverload || isUnderload) && !isZeroValue;
        const hasValue = dv && !isTrErr;
        const inTareMode = !hasTransmissionError(row.value) && tareStatus && row.status_tare && row.weightnotare != null && row.weightnotare !== '';
        const display = isDanger ? 'DANGER' : (isTrErr ? 'Tr.Err' : dv);
        const cellClass = showAlert
          ? 'bg-red-700 text-white font-extrabold'
          : (isTrErr
            ? 'bg-medium text-red-500 font-extrabold'
            : (isPreOverload && !isZeroValue
              ? 'bg-warning text-dark font-extrabold'
              : (inTareMode
                ? 'bg-cyan-700 text-white font-bold'
                : (hasValue ? 'bg-green-600 text-white font-bold' : 'text-dark dark:text-light font-semibold'))));
        return (
          <div className={`px-2 py-1 text-base tabular-nums rounded inline-block min-w-[72px] text-center ${cellClass}`}>
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

  monitorListLongPressHandler.current = onCellLongPress ?? null;

  const getRowClassName = (params: { row: ILC & { __stableIndex?: number } }) => {
    const gid = String(groupVisualGroupId || '').trim();
    if (!groupVisualHighlight || !gid) return '';
    return lcBelongsToGroup(params.row, gid) ? 'monitor-list-row-group-hl' : '';
  };

  return (
    <div className="w-full min-w-0">
      <CustomDataGrid
        columns={columns}
        data={gridRows}
        getRowId={(row) => String((row as ILC).lc_id)}
        getRowClassName={groupVisualHighlight && groupVisualGroupId ? getRowClassName : undefined}
        components={onCellLongPress ? { Row: MonitorListLongPressRow } : undefined}
        onSortedRowIdsChange={(ids) => {
          if (monitorListSortedLcIdsRef) monitorListSortedLcIdsRef.current = ids;
        }}
      />
    </div>
  )
}

export default MonitorList;
