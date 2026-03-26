import React, { FC } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import { IonIcon } from '@ionic/react';
import { checkmarkCircleOutline, trashOutline, warningOutline } from 'ionicons/icons';
import Text from '../Text';
import useAppData from '../../hooks/useAppData';

interface DeleteConfirmModalProps {
  visible: boolean;
  title?: string;
  message: string;
  onAction: () => void;
  onClose: () => void;
}

const DeleteConfirmModal: FC<DeleteConfirmModalProps> = props => {
  const {
    visible,
    title = '',
    message,
    onAction,
    onClose,
  } = props;
  const { t } = useTranslation();
  const {isMobile} = useAppData();
  return (
    <Modal
      headerDisable={true}
      visible={visible}
      classes='w-96 border border-secondary rounded-md'
      okTitle={t("Common.Delete")}
      okColor='danger'
      cancelTitle={t("Common.Cancel")}
      contentClasses='!items-center py-5 px-6 !mt-0'
      footerClasses={`${isMobile ? "" : 'justify-center px-5 py-2'}`}
      onAction={() => onAction()}
      onClose={() => onClose()}
    >
      <IonIcon color='warning' icon={warningOutline} className='text-[96px]' />
      <Text classes='text-danger text-lg font-medium' label={title} />
      <Text classes='text-center' label={message} />
    </Modal>
  )
}

export default DeleteConfirmModal;
