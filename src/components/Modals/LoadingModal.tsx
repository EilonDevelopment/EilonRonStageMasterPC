import React, { FC } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import { IonSpinner } from '@ionic/react';
import Text from '../Text';

interface LoadingModalProps {
  visible: boolean;
  message?: string;
  onClose?: () => void;
}

const noop = (): void => undefined;

const LoadingModal: FC<LoadingModalProps> = props => {
  const {
    visible,
    message,
    onClose,
  } = props;
  const { t } = useTranslation();

  return (
    <Modal
      headerDisable={true}
      visible={visible}
      classes="w-96 border border-secondary rounded-md"
      contentClasses="!items-center py-5"
      showFooter={false}
      dismiss={false}
      onClose={onClose ?? noop}
    >
      <IonSpinner name="crescent" color="primary" className="text-[96px] w-24 h-24" />
      <Text classes="text-primary text-lg font-medium mt-4" label={message ?? t('Common.PleaseWait')} />
    </Modal>
  );
};

export default LoadingModal;
