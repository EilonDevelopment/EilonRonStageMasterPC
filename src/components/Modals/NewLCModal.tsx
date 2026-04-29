import React, { FC, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import Text from '../Text';
import { ILC } from '../../helper/types';
import TextInput from '../TextInput';
import { IonIcon, IonToggle } from '@ionic/react';
import Button from '../Buttons/Button';
import { getNewLCIds } from '../../helper/functions';
import useAppData from '../../hooks/useAppData';
import useFunctions from '../../hooks/useFunctions';
import { informationCircleOutline } from 'ionicons/icons';
interface NewLCModalProps {
  visible: boolean;
  data: Partial<ILC>;
  onAction: (type: string, lc?: Partial<ILC>) => void;
  onClose: () => void;
}

const NewLCModal: FC<NewLCModalProps> = props => {
  const {
    visible,
    data,
    onAction,
    onClose,
  } = props;
  const { t } = useTranslation();
  const { f_verify_lc_id } = useFunctions()

  const [lc, setLC] = useState<Partial<ILC>>({
    underload: '-10',
    total_sum: false,
    ...data,
  });
  const [groups, setGroups] = useState<string>('')
  const [visibleGroups, setVisibleGroups] = useState<boolean>(true);
  const [infoPopover, setInfoPopover] = useState<{ text: string; x: number; y: number } | null>(null);
  const infoPopoverRef = useRef<HTMLDivElement | null>(null);
  const { isMobile, updateErrStr, curProject } = useAppData()
  const refIDInput = useRef<HTMLInputElement>(null)
  const SetvisibleCapacityRef = useRef<boolean>(false)
  const unitKey = useRef(curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg');
  const fxRef = useRef((curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg') === 'mton' ? 3 : 0)
  const lcRef = useRef(lc)

  useEffect(() => {
    unitKey.current = curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg';
  }, [curProject.units]);

  useEffect(() => {
    fxRef.current = ((curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg') === 'mton' ? 3 : 0)
  }, [curProject.units])

  useEffect(() => {
    lcRef.current = lc
  }, [lc])

  useEffect(() => {
    setLC((v: any) => ({
      underload: '-10',
      calibration_offset: '1',
      ...data,
      total_sum: data?.total_sum ?? false
    }))
    if (data?.groups) {
      setGroups(data.groups)
    } else {
      setGroups('');
    }
  }, [data])

  useEffect(() => {
    setLC(v => ({ ...v, groups }))
  }, [groups])

  useEffect(() => {
    if (!infoPopover) return;
    const handleOutsidePointerDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (infoPopoverRef.current && target && infoPopoverRef.current.contains(target)) return;
      setInfoPopover(null);
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [infoPopover]);

  const handleChangeProject = (field: string, value: string | boolean) => {
    let id_cap: any
    if (lc.lc_id && field === 'unitList') {
      setLC(v => ({ ...v, lc_id: value.toString() }))
    } else {
      setLC(v => ({ ...v, [field]: value }))

      if (field === 'unitList') {
        const idList = getNewLCIds([], value.toString() || '')
        id_cap = f_verify_lc_id(value.toString());
        if (id_cap) {
          SetvisibleCapacityRef.current = true
        }
        else
          SetvisibleCapacityRef.current = false
        if (idList && idList.length > 0) {
          if (idList.some(item => parseInt(item) <= 10)) {
            setVisibleGroups(false)
            return
          }
        }
        setVisibleGroups(true)
      }
      if (SetvisibleCapacityRef.current && id_cap && id_cap.capacity) {
        const capacity = id_cap.capacity
        setLC({ ...lcRef.current, [field]: value, capacity })
      }
    }
  }

  const handleDupllicate = () => {
    const { groups, overload, underload, project_id, psw, title, total_sum } = lc
    setLC({ groups, overload, underload, project_id, psw, title, total_sum })
    refIDInput.current?.focus()
  }

  const handleDelete = () => {
    console.log('handleDelete')
  }

  const handleChangeGroup = (value: string) => {
    const groupList = groups.split(',')
    if (groupList.length > 0) {
      if (groupList.includes(value))
        setGroups(groupList.filter(item => item !== value).sort().join(','))
      else
        setGroups([...groupList, value].filter(item => item).sort().join(','))
    } else
      setGroups(value)
  }

  const formGrid = `grid w-full grid-cols-1 sm:grid-cols-2 gap-3 ${isMobile ? '' : 'sm:gap-4'}`;
  const showFieldInfo = (ev: React.MouseEvent<HTMLButtonElement>, text: string) => {
    ev.preventDefault();
    ev.stopPropagation();
    const rect = ev.currentTarget.getBoundingClientRect();
    const popW = 230;
    const popH = 76;
    const pad = 8;
    const placeRight = rect.right + popW + pad <= window.innerWidth;
    const nextX = placeRight ? rect.right + 8 : rect.left - popW - 8;
    const nextY = Math.min(
      window.innerHeight - popH - pad,
      Math.max(pad, rect.top + rect.height / 2 - popH / 2)
    );
    setInfoPopover({
      text,
      x: Math.max(pad, nextX),
      y: nextY,
    });
  };

  return (
    <Modal
      header={lc?.lc_id ? t("Setting.EditLC") : t("Setting.AddLC")}
      visible={visible}
      showFooter={false}
      classes={`w-full max-w-full overflow-hidden ${isMobile ? '' : 'sm:max-w-[650px]'}`}
      contentClasses={formGrid}
      footerClasses='!py-0'
      onClose={() => onClose()}
      footerSlot={(
        <div className="flex flex-col gap-3 w-full">
          {lc.lc_id &&
            !Number.isNaN(parseInt(String(lc.lc_id), 10)) &&
            parseInt(String(lc.lc_id), 10) > 10 && (
              <div className="flex flex-wrap justify-end gap-2 w-full">
                <Button
                  classes="px-3 py-2 border border-primary rounded min-h-[44px]"
                  textClasses="font-medium text-sm"
                  title={t('Setting.Calibration')}
                  onAction={() => onAction('calibration')}
                />
                <Button
                  classes="px-3 py-2 border border-gray-500 dark:border-gray-400 rounded min-h-[44px]"
                  textClasses="font-medium text-sm"
                  title={t('Setting.DeleteCalibration')}
                  onAction={() => onAction('calibration-delete')}
                />
              </div>
            )}
          <div className="flex flex-wrap justify-end gap-2 w-full">
            <Button
              classes="px-4 py-2 border border-gray-400 dark:border-gray-500 rounded min-h-[44px]"
              textClasses="font-medium text-sm"
              title={t('Common.Cancel')}
              onAction={() => onClose()}
            />
            {lc.lc_id ? (
              <>
                <Button
                  classes="px-4 py-2 bg-gray-500 text-white rounded min-h-[44px]"
                  textClasses="text-white font-medium text-sm"
                  title={t('Common.Duplicate')}
                  onAction={() => handleDupllicate()}
                />
                <Button
                  classes="px-4 py-2 bg-danger text-white rounded min-h-[44px]"
                  textClasses="text-white font-medium text-sm"
                  title={t('Common.Delete')}
                  onAction={() => onAction('delete')}
                />
              </>
            ) : null}
            <Button
              classes="px-5 py-2.5 bg-success text-white rounded min-h-[44px] min-w-[96px]"
              textClasses="text-white font-semibold text-sm"
              title={t('Common.Save')}
              onAction={() => onAction('save', lcRef.current)}
            />
          </div>
        </div>
      )}
    >
      <TextInput
        label={t("Setting.Name")}
        value={lc.title || ''}
        onChange={e => handleChangeProject('title', e.target.value)}
      />
      <div>
        <div className='mb-1 flex items-center gap-1.5'>
          <Text label={t("Setting.PSW")} />
          <button
            type='button'
            className='inline-flex items-center justify-center bg-transparent border-none p-0 m-0 cursor-pointer'
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => showFieldInfo(e, 'Explanation of P.S.W pending to be added')}
          >
            <IonIcon icon={informationCircleOutline} className='text-primary text-lg' />
          </button>
        </div>
        <TextInput
          enableLabel={false}
          type='number'
          value={lc.psw || ''}
          inputClasses='w-full'
          onChange={e => handleChangeProject('psw', e.target.value)}
        />
      </div>
      <div>
        <div className='mb-1 flex items-center gap-1.5'>
          <Text label={t("Setting.Underload")} />
          <button
            type='button'
            className='inline-flex items-center justify-center bg-transparent border-none p-0 m-0 cursor-pointer'
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => showFieldInfo(e, 'Explanation of Underload pending to be added')}
          >
            <IonIcon icon={informationCircleOutline} className='text-primary text-lg' />
          </button>
        </div>
        <TextInput
          enableLabel={false}
          type='number'
          value={lc.underload || ''}
          onChange={e => handleChangeProject('underload', e.target.value)}
        />
      </div>
      <div>
        <div className='mb-1 flex items-center gap-1.5'>
          <Text label={t("Setting.Overload")} />
          <button
            type='button'
            className='inline-flex items-center justify-center bg-transparent border-none p-0 m-0 cursor-pointer'
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => showFieldInfo(e, 'Explanation of Overload pending to be added')}
          >
            <IonIcon icon={informationCircleOutline} className='text-primary text-lg' />
          </button>
        </div>
        <TextInput
          enableLabel={false}
          type='number'
          value={lc.overload || ''}
          inputClasses='w-full'
          onChange={e => handleChangeProject('overload', e.target.value)}
        />
      </div>
      <div className='col-span-1 sm:col-span-2 flex flex-row items-center gap-3 py-1'>
        <IonToggle
          enableOnOffLabels={true}
          checked={lc.total_sum || false}
          onIonChange={e => handleChangeProject('total_sum', e.detail.checked)}
        />
        <Text label={t('Setting.TotalSum')} />
        <button
          type='button'
          className='inline-flex items-center justify-center bg-transparent border-none p-0 m-0 cursor-pointer'
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => showFieldInfo(e, 'Explanation of Total Sum pending to be added')}
        >
          <IonIcon icon={informationCircleOutline} className='text-primary text-lg' />
        </button>
      </div>

      {SetvisibleCapacityRef.current === true && (
        <TextInput
          label={`${t("Setting.Capacity")}`}
          type='text'
          value={lc.capacity && unitKey.current in lc.capacity ? parseFloat(lc.capacity[unitKey.current]).toFixed(fxRef.current) : '0.00'}
          readOnly
        />
      )}

      <div className="col-span-1 sm:col-span-2 space-y-1">
        <TextInput
          inputRef={refIDInput}
          classes="w-full"
          label={t('Setting.LcIds')}
          value={lc.id ? lc.id : (lc.unitList || '')}
          readOnly={!!lc.lc_id}
          onChange={e => handleChangeProject('unitList', e.target.value)}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug px-0.5">
          {t('Setting.LcIdsHint')}
        </p>
      </div>
      <div className='col-span-1 sm:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-3 pt-1'>
        {visibleGroups && Array(16).fill(0).map((item, index) => (
          <div
            key={index}
            className='flex flex-row items-center gap-2 min-h-[40px]'
            onClick={() => handleChangeGroup((index + 1).toString())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleChangeGroup((index + 1).toString());
              }
            }}
            role="button"
            tabIndex={0}
          >
            <IonToggle
              enableOnOffLabels={true}
              checked={groups.split(',').includes((index + 1).toString())}
            />
            <Text label={`${t('Setting.Group')} ${index + 1}`} />
          </div>
        ))}
      </div>
      {infoPopover && typeof document !== 'undefined' && createPortal(
        <div
          ref={infoPopoverRef}
          className='fixed z-[99999] w-[230px] rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs leading-snug text-slate-700 dark:text-slate-100 shadow-lg'
          style={{ left: `${infoPopover.x}px`, top: `${infoPopover.y}px` }}
        >
          {infoPopover.text}
        </div>,
        document.body
      )}
    </Modal>
  )
}

export default NewLCModal;
