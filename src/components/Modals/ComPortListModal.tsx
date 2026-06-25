import React, { FC } from 'react';
import { createPortal } from 'react-dom';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/react';
import { useTranslation } from 'react-i18next';
import type { SerialPortInfo } from '../../helper/usbSerialBridge';
import './ComPortListModal.css';

interface ComPortListModalProps {
  isOpen: boolean;
  loading: boolean;
  ports: SerialPortInfo[];
  onClose: () => void;
  onConnect: (portPath: string) => void;
  onRefresh: () => void;
}

const ComPortListModal: FC<ComPortListModalProps> = ({
  isOpen,
  loading,
  ports,
  onClose,
  onConnect,
  onRefresh,
}) => {
  const { t } = useTranslation();

  if (typeof document === 'undefined' || !isOpen) {
    return null;
  }

  const modal = (
    <IonModal isOpen onDidDismiss={onClose} className="com-port-list-modal" backdropDismiss>
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle className="ion-text-wrap px-2">
            {t('ConnectDevice.ComPortsTitle')}
          </IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding" scrollY>
        <div className="flex flex-row justify-end gap-2 mb-3">
          <IonButton fill="outline" size="small" onClick={onRefresh} disabled={loading}>
            {t('Common.Refresh')}
          </IonButton>
          <IonButton fill="clear" size="small" onClick={onClose}>
            {t('Common.Cancel')}
          </IonButton>
        </div>
        {loading && (
          <div className="flex flex-col items-center justify-center gap-4 py-10 min-h-[120px]">
            <IonSpinner name="crescent" />
            <p className="text-center text-dark dark:text-light max-w-md">
              {t('ConnectDevice.ComPortsLoading')}
            </p>
          </div>
        )}
        {!loading && ports.length === 0 && (
          <p className="text-center py-8 text-dark dark:text-light">
            {t('ConnectDevice.ComPortsEmpty')}
          </p>
        )}
        {!loading && ports.length > 0 && (
          <IonList className="bg-transparent p-0" lines="full">
            {ports.map((p) => (
              <IonItem key={p.path} lines="full">
                <IonLabel className="ion-text-wrap">
                  <h2 className="text-base font-semibold">{p.path}</h2>
                  {p.friendlyName ? (
                    <p className="text-xs opacity-80 break-all">{p.friendlyName}</p>
                  ) : null}
                  {p.manufacturer ? (
                    <p className="text-xs opacity-60">{p.manufacturer}</p>
                  ) : null}
                </IonLabel>
                <IonButton slot="end" size="default" onClick={() => onConnect(p.path)}>
                  {t('ConnectDevice.Connect')}
                </IonButton>
              </IonItem>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonModal>
  );

  return createPortal(modal, document.body);
};

export default ComPortListModal;
