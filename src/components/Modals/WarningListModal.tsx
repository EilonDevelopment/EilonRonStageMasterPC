import React, { FC } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import { ILog, IProject } from '../../helper/types';
import CustomDataGrid from '../CustomDataGrid';
import Button from '../Buttons/Button';
import useAppData from '../../hooks/useAppData';

interface WarningListModalProps {
  visible: boolean;
  data: ILog[];
  onClear: () => void;
  onClose: () => void;
}

const WarningListModal: FC<WarningListModalProps> = props => {
  const {
    visible,
    data,
    onClear,
    onClose,
  } = props;
  const { t } = useTranslation();
  const { isMobile } = useAppData();
  const columns = [
    {
      flex: 0.35,
      minWidth: 100,
      field: 'time',
      headerName: t('Monitor.List.Time'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className="text-dark dark:text-light">{row.log_date}</span>
    },
    {
      flex: 0.2,
      minWidth: 110,
      field: 'title',
      headerName: t('Monitor.List.LC'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className="text-dark dark:text-light">{row.lc_id || ''}</span>
    },
    {
      flex: 0.15,
      minWidth: 90,
      field: 'value',
      headerName: t('Monitor.List.Value'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => <span className="text-dark dark:text-light">{row.value || ''}</span>
    },
    {
      flex: 0.15,
      minWidth: 90,
      field: 'overload',
      headerName: t('Monitor.List.Overload'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => {
        const value = Number(row.value);
        const overload = Number(row.overload);
        const isOverload = !isNaN(value) && !isNaN(overload) && value > overload;
        return (
          <div 
            className={`w-full h-full flex items-center justify-center border border-red-500 rounded ${isOverload ? '' : 'border-transparent'}`}
            style={isOverload ? {
              boxShadow: 'inset 0 0 8px rgba(239, 68, 68, 0.4), 0 0 12px rgba(239, 68, 68, 0.5)'
            } : {}}
          >
            <span className="text-dark dark:text-light">
              {row.overload || ''}
            </span>
          </div>
        )
      }
    },
    {
      flex: 0.15,
      minWidth: 90,
      field: 'underload',
      headerName: t('Monitor.List.Underload'),
      // eslint-disable-next-line
      // @ts-ignore
      renderCell: ({ row }) => {
        const value = Number(row.value);
        const underload = Number(row.underload);
        const isUnderload = !isNaN(value) && !isNaN(underload) && value < underload;
        return (
          <div 
            className={`w-full h-full flex items-center justify-center border border-red-500 rounded ${isUnderload ? '' : 'border-transparent'}`}
            style={isUnderload ? {
              boxShadow: 'inset 0 0 8px rgba(239, 68, 68, 0.4), 0 0 12px rgba(239, 68, 68, 0.5)'
            } : {}}
          >
            <span className="text-dark dark:text-light">
              {row.underload || ''}
            </span>
          </div>
        )
      }
    },
  ];

  return (<>
    <Modal
      visible={visible}
      header={t("Monitor.Modal.Warnings")}
      headerSub={
        <Button
          title={t('Common.Clear')}
          classes={`${isMobile ? "px-4 py-2" : "px-4 py-1"} bg-danger  rounded ml-10`}
          textClasses='text-white'
          onAction={() => { onClear(); }}
        />
      }
      classes='w-max border border-secondary rounded-md'
      contentClasses={` !items-center  px-6 ${isMobile ? "!mt-14" : " py-2 pt-6"}`}
      footerClasses='!justify-center'
      cancelTitle={t('Common.Cancel')}
      onClose={() => onClose()}
    >
  <div style={{ maxHeight: "70vh", overflowY: "auto", width: "100%", minWidth: 0 }}>
      <CustomDataGrid
        columns={columns}
        data={data}
      />
      </div>
    </Modal>
  </>)
}

export default WarningListModal;
