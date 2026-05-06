import React, { FC, useEffect, useState } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import { IonCheckbox, IonIcon } from '@ionic/react';
import { arrowForwardOutline, closeCircleOutline, informationCircleOutline } from 'ionicons/icons';
import Text from '../Text';
import Button from '../Buttons/Button';
import useAppData from '../../hooks/useAppData';

export type GroupActionModalMode = 'full' | 'visualOnly' | 'zeroOnly';

interface GroupActionModalProps {
  visible: boolean;
  tare: boolean;
  onAction: (type: string) => void;
  onClose: () => void;
  highlightChecked: boolean;
  onlyGroupChecked: boolean;
  onHighlightChange: (checked: boolean) => void;
  onOnlyGroupChange: (checked: boolean) => void;
  /** full = double-tap dialog; visualOnly = highlight/show-only; zeroOnly = long-press zero confirm */
  mode?: GroupActionModalMode;
  zeroTitle?: string;
  zeroSubtitle?: string;
}

const StepItem = (props: { value: number; active: boolean; }) => (
  <span
    className={`
      flex items-center justify-center text-white font-medium rounded-full w-8 h-8
      ${props.active ? 'bg-primary' : 'bg-gray-300'}
    `}
  >
    {props.value}
  </span>
)

const GroupActionModal: FC<GroupActionModalProps> = props => {
  const {
    visible,
    tare,
    onAction,
    onClose,
    highlightChecked,
    onlyGroupChecked,
    onHighlightChange,
    onOnlyGroupChange,
    mode = 'full',
    zeroTitle,
    zeroSubtitle,
  } = props;
  const { t } = useTranslation();

  const [status, setStatus] = useState<string>('group')
  const [confirmed, setConfirmed] = useState<number>(1)
  const { isMobile } = useAppData()

  const isFull = mode === 'full'
  const isVisualOnly = mode === 'visualOnly'
  const isZeroOnly = mode === 'zeroOnly'

  useEffect(() => {
    if (!visible) return
    setConfirmed(1)
    setStatus(isZeroOnly ? 'zero' : 'group')
  }, [visible, isZeroOnly])

  const handleTare = () => {
    onAction('tare')
  }

  const handleZero = () => {
    setStatus('zero')
  }

  const handleNext = () => {
    if (confirmed === 1)
      setConfirmed(v => v + 1)
    else
      onAction('zero')
  }

  return (<>
    <Modal
      headerDisable={true}
      visible={visible}
      classes={` w-[450px] border border-secondary rounded -md ${isMobile ? "" : ""}`}
      contentClasses={`!items-center py-5 gap-5 ${isMobile ? "" : "p-0"}`}
      footerClasses='!py-0'
      onClose={() => onClose()}
    >
      {status === 'group' && isFull ? <>
        <IonIcon color='primary' icon={informationCircleOutline} className='text-[96px]' />
        <Text classes='text-danger !text-3xl font-medium' label={t('Monitor.Modal.GroupAction')} />
        <div className='flex flex-row justify-center items-center gap-2'>
          <Button classes='px-6 py-3 bg-primary rounded-lg' textClasses='text-white font-semibold' title={tare ? t('Monitor.Modal.CancelTare') : t('Monitor.Modal.Tare')} onAction={() => handleTare()} />
          <Button classes='px-6 py-3 bg-danger rounded-lg' textClasses='text-white font-semibold' title={t('Monitor.Modal.Zero')} onAction={() => handleZero()} />
        </div>
        <hr className='w-full border-gray-300' />
        <div className='flex flex-col w-full gap-2 px-2'>
          <div className='flex flex-row items-center gap-2'>
            <IonCheckbox
              checked={highlightChecked}
              onIonChange={(e) => onHighlightChange(!!e.detail.checked)}
            />
            <Text label={t('Monitor.Modal.HighlightLC')} />
          </div>
          <div className='flex flex-row items-center gap-2'>
            <IonCheckbox
              checked={onlyGroupChecked}
              onIonChange={(e) => onOnlyGroupChange(!!e.detail.checked)}
            />
            <Text label={t('Monitor.Modal.ShowOnlyGroupLcs')} />
          </div>
        </div>
      </> : status === 'group' && isVisualOnly ? <>
        <IonIcon color='primary' icon={informationCircleOutline} className='text-[72px]' />
        <Text classes='text-danger !text-2xl font-medium' label={t('Monitor.Modal.GroupDisplayOptions')} />
        <div className='flex flex-col w-full gap-2 px-2'>
          <div className='flex flex-row items-center gap-2'>
            <IonCheckbox
              checked={highlightChecked}
              onIonChange={(e) => onHighlightChange(!!e.detail.checked)}
            />
            <Text label={t('Monitor.Modal.HighlightLC')} />
          </div>
          <div className='flex flex-row items-center gap-2'>
            <IonCheckbox
              checked={onlyGroupChecked}
              onIonChange={(e) => onOnlyGroupChange(!!e.detail.checked)}
            />
            <Text label={t('Monitor.Modal.ShowOnlyGroupLcs')} />
          </div>
        </div>
      </> : <>
        <div className='flex flex-row items-center justify-center w-full'>
          <StepItem value={1} active={true} />
          <hr className={`${confirmed > 1 ? 'bg-primary' : 'bg-gray-300'} w-12 h-1.5`} />
          <StepItem value={2} active={confirmed > 1} />
        </div>
        <Text classes='!text-3xl font-bold' label={zeroTitle || t('Monitor.Modal.ZeroGroup')} />
        <Text classes='px-5 text-center' label={zeroSubtitle || t('Monitor.Modal.ZeroSubtitle')} />
        <div className='flex flex-row items-center justify-center gap-4'>
          <Button
            classes='px-4 py-2 bg-primary flex-row-reverse text-white rounded'
            textClasses='text-white font-medium'
            icon={arrowForwardOutline}
            iconColorDisable={true}
            title={t('Common.Next')}
            onAction={() => handleNext()}
          />
          <Button
            classes={`px-4 py-2 rounded bg-gray-500`}
            textClasses='text-white font-medium'
            title={t('Common.Cancel')}
            onAction={() => onClose()}
          />
        </div>
      </>}
    </Modal></>
  )
}

export default GroupActionModal;
