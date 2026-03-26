import React, { FC } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import { IonIcon } from '@ionic/react';
import { checkmarkCircleOutline } from 'ionicons/icons';
import Text from '../Text';
import Button from '../Buttons/Button';
import useAppData from '../../hooks/useAppData';

interface SelectDeviceModalProps {
  visible: boolean;
  onAction: (type: string) => void;
  onClose: () => void;
}

const SelectDeviceModal: FC<SelectDeviceModalProps> = props => {
  const {
    visible,
    onAction,
    onClose,
  } = props;
  const { t } = useTranslation();
  const { isMobile } = useAppData()
  return (
    <Modal
      headerDisable={true}
      visible={visible}
      classes={`border border-secondary rounded-md ${isMobile ? "" : ""}`}
      contentClasses={`!items-center !mt-0 gap-5 ${isMobile ? "" : ""}`}
      footerClasses='!py-0'
      onClose={() => onClose()}
    >
      <Text type='2xl-dark' classes='font-medium px-5' label={t('ConnectDevice.ModalTitle')} />
      <div className='flex flex-row justify-center gap-4'>
        <Button
          title='PRR'
          textClasses='text-white'
          classes='px-6 py-2 bg-primary font-medium rounded'
          onAction={() => onAction('prr')}
        />
        <Button
          title='LC'
          textClasses='text-white'
          classes='px-6 py-2 bg-danger font-medium rounded'
          onAction={() => onAction('lc')}
        />
        <Button
          title='USB'
          textClasses='text-white'
          classes='px-6 py-2 bg-dark font-medium rounded'
          onAction={() => onAction('usb')}
        />
      </div>
    </Modal>
  )
}

export default SelectDeviceModal;
