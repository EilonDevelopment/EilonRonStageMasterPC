import React, { FC } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import { IonIcon } from '@ionic/react';
import { checkmarkCircleOutline } from 'ionicons/icons';
import Text from '../Text';

interface SuccessModalProps {
  visible: boolean;
  title?: string;
  message: string;
  classes?: string;
  titleClasses?: string;
  onClose: () => void;
}

const SuccessModal: FC<SuccessModalProps> = props => {
  const {
    visible,
    title = '',
    message,
    classes = '',
    titleClasses = '',
    onClose,
  } = props;
  const { t } = useTranslation();

  return (
    <Modal
      headerDisable={true}
      visible={visible}
      classes={`w-96 border border-secondary rounded-md`}
      cancelTitle={t("Common.Okay")}
      contentClasses={`!items-center py-5 ${classes}`}
      footerClasses='!justify-center'
      onClose={() => onClose()}
    >
      <IonIcon color='success' icon={checkmarkCircleOutline} className='text-[96px]' />
      <Text classes={`text-success text-lg font-medium ${titleClasses}`} label={title || t('Common.Confirmed')} />
      <Text label={message} />
    </Modal>
  )
}

export default SuccessModal;
