import React, { FC, useEffect, useState } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import TextInput from '../TextInput';
import { alertOutline } from 'ionicons/icons';
import { IonIcon } from '@ionic/react';
import useAppData from '../../hooks/useAppData';

interface BeforeAlertModalProps {
  visible: boolean;
  onAction: () => void;
  onClose: () => void;
}

const BeforeAlertModal: FC<BeforeAlertModalProps> = props => {
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
      modalType='BeforeAlert'
      classes={` ${isMobile ? 'w-48' : ''}`}
      okTitle={t("Common.Okay")}
      onAction={() => onAction()}
      onClose={() => onClose()}
    >
      <div className='flex flex-col items-center m-10'>
        <IonIcon src={alertOutline} color="warning" className='border-2 border-warning rounded-full w-20 h-20 mb-5' />
        <h1 className='text-danger italic text-lg'>{t("Common.BeforeAlert")}</h1>
        <ol className='text-center py-2 text-lg list-decimal'>
          <li>{t("Common.Alert1")}</li>
          <li>{t("Common.Alert2")}</li>
          <li>{t("Common.Alert3")}</li>
          <li>{t("Common.Alert4")}</li>
          <li>{t("Common.Alert5")}</li>
          <li>{t("Common.Alert6")}</li>
          <li>{t("Common.Alert7")}</li>
          <li>{t("Common.Alert8")}</li>
        </ol>
      </div>
    </Modal>
  )
}

export default BeforeAlertModal;
