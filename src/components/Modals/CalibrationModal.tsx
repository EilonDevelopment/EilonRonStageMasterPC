import React, { FC, useEffect, useState } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import Text from '../Text';
import { ILC } from '../../helper/types';
import TextInput from '../TextInput';
import { IonIcon, IonToggle } from '@ionic/react';
import Button from '../Buttons/Button';
import { arrowForwardOutline, checkmarkOutline, closeOutline, closeSharp } from 'ionicons/icons';
import useAppData from '../../hooks/useAppData';

interface CalibrationModalProps {
  data: ILC;
  isConfirmModal: boolean;
  onAction: (diff: string) => void;
  onClose: () => void;
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

const CalibrationModal: FC<CalibrationModalProps> = props => {
  const {
    data,
    isConfirmModal,
    onAction,
    onClose,
  } = props;
  const { t } = useTranslation();

  const [step, setStep] = useState<number>(!isConfirmModal ? 1 : 4)
  const [knownLoad, setKnownLoad] = useState<string>('')
  const [caliBok, setCaliBok] = useState<boolean>(true)
  const { isMobile } = useAppData();
  const stepView = () => {
    switch (step) {
      case 1:
        return (
          <div className='flex flex-col gap-2'>
            <div className='flex flex-row gap-4'>
              <Text label="●" />
              <Text label={`${t("Setting.CalibrationModal.step1.subtitle1")} # ${data.lc_id}`} />
            </div>
            <div className='flex flex-row gap-4'>
              <Text label="●" />
              <Text label={`${t("Setting.CalibrationModal.step1.subtitle2")}`} />
            </div>
            <div className='grid grid-cols-2'>
              <div className='flex flex-col gap-2'>
                <TextInput
                  classes='rounded !gap-2'
                  label={`${t("Setting.CalibrationModal.loadLabel")}`}
                  labelClasses='text-center'
                  inputContainerClasses="!border-success bg-success rounded"
                  inputClasses='!text-white'
                  value={data.value || ''}
                  readOnly={true}
                />
              </div>
            </div>
          </div>
        )
      case 2:
        return (
          <div className='flex flex-col'>
            {Array(5).fill(0).map((item, index) => (
              <div key={index} className='flex flex-row gap-2'>
                <Text label={(index + 1).toString()} />
                <Text label={`${t(`Setting.CalibrationModal.step2.subtitle${index + 1}`)}`} />
              </div>
            ))}
            <div className='grid grid-cols-2 gap-8 mt-4'>
              <TextInput
                classes='rounded !gap-2'
                label={`${t("Setting.CalibrationModal.realLoadLabel")} (${'LBS'})`}
                labelClasses='text-center'
                inputContainerClasses="rounded"
                type='number'
                value={knownLoad}
                onChange={e => setKnownLoad(e.target.value)}
              />
              <TextInput
                classes='rounded !gap-2'
                label={`${t("Setting.CalibrationModal.loadLabel")}`}
                labelClasses='text-center'
                inputContainerClasses="!border-success bg-success rounded"
                inputClasses='!text-white'
                value={data.value || ''}
                readOnly={true}
              />
            </div>
          </div>
        )
      case 3:
        return (
          <div className='flex flex-col gap-1'>
            <Text classes='text-center' label={`${t("Setting.CalibrationModal.step3.result")} ${knownLoad}`} />
            <Text classes='text-center' label={`% ${t("Setting.CalibrationModal.step3.difference")}: ${knownLoad}`} />
            <div className={`flex flex-row px-4 py-2 border border-300 rounded gap-1 ${caliBok ? 'bg-green-200' : 'bg-red-200'}`}>
              {caliBok ?
                <>
                  <IonIcon src={checkmarkOutline} className='text-green-800 text-2xl font-bold mt-0.5' />
                  <Text classes='text-green-800 text-xl font-bold' label={t("Setting.CalibrationModal.step3.subtitle")} />
                </>
                :
                <>
                  <IonIcon src={closeSharp} className='text-danger text-3xl font-bold' />
                  <Text classes='text-green-800 text-xl font-bold' label={t("Setting.CalibrationModal.step3.subtitleFailed")} />
                </>
              }
            </div>
          </div>
        )
      case 4:
        return (
          <div className='flex flex-col flex-1 justify-center items-center'>
            <Text classes='!text-3xl' label={t('Setting.CalibrationModal.step4.Title')} />
          </div>
        )
      default:
        return (<></>)
    }
  }

  const handleNext = () => {
    console.log('handleNext  11', { step, calibok: caliBok, dataVal: data.value, knownLoad })
    if (step === 2) {
      const diff: number = parseFloat(data.value ?? '0') / parseFloat(knownLoad);
      if (diff < 0.95 || diff > 1.05)
        setCaliBok(false)
    }

    console.log('handleNext  22', { step })
    let diff = ''
    if (step === 3) {
      diff = ((1 - parseFloat(data.value ?? '0')) / parseFloat(knownLoad ?? '0')).toFixed(3)
      onAction(diff)
    }
    if (step === 4) {
      onClose()
    }
    console.log('handleNext  33', { step })
    setStep(v => v + 1)
  }

  return (
    <Modal
      header={t("Setting.AddLC")}
      visible={true}
      headerDisable={true}
      classes={`w-[450px]  overflow-auto ${isMobile ? "max-h-80" : ''}`}
      contentClasses={`py-2 gap-4 px-6  ${isMobile ? ' !mt-2' : 'pt-9 pb-5'}`}
      footerClasses={`${isMobile ? '' : 'pb-0'}`}
      onClose={() => onClose()}
    >
      {step < 4 && <>
        <div className='flex flex-row items-center justify-center w-full'>
          <StepItem value={1} active={true} />
          <hr className={`${step > 1 ? 'bg-primary' : 'bg-gray-300'} w-12 h-1.5`} />
          <StepItem value={2} active={step > 1} />
          <hr className={`${step > 2 ? 'bg-primary' : 'bg-gray-300'} w-12 h-1.5`} />
          <StepItem value={3} active={step > 2} />
        </div>
        <Text
          type='2xl-dark'
          classes='font-medium text-center'
          label={`${t("Setting.CalibrationModal.step1.title")} # ${data.lc_id}`}
        />
      </>
      }
      {stepView()}
      <div className='flex flex-row items-center justify-center gap-4'>
        {caliBok &&
          <Button
            classes={`px-4 py-2 flex-row-reverse text-white rounded ${step < 4 ? 'bg-success' : 'bg-secondary'}`}
            textClasses='text-white font-medium'
            icon={step < 4 ? arrowForwardOutline : ''}
            iconColorDisable={true}
            title={step < 4 ? t('Common.Next') : t('Common.Confirmed')}
            onAction={() => handleNext()}
          />
        }
        {step < 4 && <Button
          classes={`px-4 py-2 rounded ${step < 4 ? 'bg-gray-500' : 'bg-secondary'}`}
          textClasses='text-white font-medium'
          title={t('Common.Cancel')}
          onAction={() => onClose()}
        />}
      </div>
    </Modal>
  )
}

export default CalibrationModal;
  