import React, { FC } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import { IonIcon } from '@ionic/react';
import { closeCircleOutline } from 'ionicons/icons';
import Text from '../Text';

interface ErrorModalProps {
  visible: boolean;
  message: string;
  onClose: () => void;
}

const ErrorModal: FC<ErrorModalProps> = props => {
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
      classes='w-96 border border-secondary rounded-md'
      cancelTitle={t("Common.Okay")}
      contentClasses='!items-center py-5'
      footerClasses='!justify-center'
      onClose={() => onClose()}
    >
      <IonIcon color='danger' icon={closeCircleOutline} className='text-[96px]' />
      <Text classes='text-danger text-lg font-medium' label={t('Common.Error')} />
      <div className="text-center w-full">
        <Text label={message} />
      </div>
    </Modal>
  )
}

export default ErrorModal;
