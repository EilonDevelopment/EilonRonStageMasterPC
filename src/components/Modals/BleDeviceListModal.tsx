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
import type { BleDiscoveredDevice } from '../../helper/bleLeScanCollection';
import './BleDeviceListModal.css';

interface BleDeviceListModalProps {
  isOpen: boolean;
  scanning: boolean;
  devices: BleDiscoveredDevice[];
  onClose: () => void;
  /** Second arg is the advertised name (shown in the list), for reports / PRR log rows. */
  onConnect: (deviceId: string, displayName?: string) => void;
}

const BleDeviceListModal: FC<BleDeviceListModalProps> = ({
  isOpen,
  scanning,
  devices,
  onClose,
  onConnect,
}) => {
  const { t } = useTranslation();

  // When closed, do not keep ion-modal in the DOM (avoids invisible host/backdrop eating the first tap on iPad).
  if (typeof document === 'undefined' || !isOpen) {
    return null;
  }

  const modal = (
    <IonModal
      isOpen
      onDidDismiss={onClose}
      className="ble-device-list-modal"
      backdropDismiss={!scanning}
    >
      <IonHeader className="ion-no-border">
        <IonToolbar>
          <IonTitle className="ion-text-wrap px-2">
            {t('ConnectDevice.AvailableDevices')}
          </IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding" scrollY>
        <div className="flex flex-row justify-end mb-3">
          <IonButton fill="clear" size="small" onClick={onClose} disabled={scanning}>
            {t('Common.Cancel')}
          </IonButton>
        </div>
        {scanning && (
          <div className="flex flex-col items-center justify-center gap-4 py-10 min-h-[120px]">
            <IonSpinner name="crescent" />
            <p className="text-center text-dark dark:text-light max-w-md">
              {t('ConnectDevice.Scanning')}
            </p>
          </div>
        )}
        {!scanning && devices.length === 0 && (
          <p className="text-center py-8 text-dark dark:text-light">
            {t('ConnectDevice.NoDevices')}
          </p>
        )}
        {!scanning && devices.length > 0 && (
          <IonList className="bg-transparent p-0" lines="full">
            {devices.map((d) => (
              <IonItem key={d.deviceId} lines="full">
                <IonLabel className="ion-text-wrap">
                  <h2 className="text-base font-semibold">
                    {d.name?.trim() || t('ConnectDevice.UnknownDevice')}
                  </h2>
                  <p className="text-xs opacity-80 break-all">{d.deviceId}</p>
                  {d.rssi != null && (
                    <p className="text-xs opacity-60">RSSI {d.rssi} dBm</p>
                  )}
                </IonLabel>
                <IonButton
                  slot="end"
                  size="default"
                  onClick={() =>
                    onConnect(
                      d.deviceId,
                      d.name?.trim() || undefined
                    )
                  }
                >
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

export default BleDeviceListModal;
