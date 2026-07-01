import React, { FC } from 'react';
import { createPortal } from 'react-dom';
import { IonSpinner } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import './CrrUsbConnectingModal.css';

export const CRR_USB_CONNECT_STAGES = [
  'CrrOpeningPort',
  'CrrIdentifying',
  'CrrSyncingList',
  'CrrWaitingForData',
  'CrrConnected',
] as const;

/** Progress stages when re-sending the LC list (add / edit / delete). */
export const CRR_USB_LIST_SYNC_STAGES = [
  'CrrSyncingList',
  'CrrWaitingForData',
  'CrrListSyncDone',
] as const;

export type CrrUsbConnectStageKey = (typeof CRR_USB_CONNECT_STAGES)[number];

interface CrrUsbConnectingModalProps {
  isOpen: boolean;
  progress: number;
  messageKey: CrrUsbConnectStageKey | string;
  titleKey?: string;
  stages?: readonly string[];
}

const CrrUsbConnectingModal: FC<CrrUsbConnectingModalProps> = ({
  isOpen,
  progress,
  messageKey,
  titleKey = 'CrrConnectingTitle',
  stages = CRR_USB_CONNECT_STAGES,
}) => {
  const { t } = useTranslation();

  if (typeof document === 'undefined' || !isOpen) {
    return null;
  }

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const percent = Math.round(clampedProgress * 100);
  const stageIndex = Math.max(
    0,
    stages.indexOf(messageKey),
  );
  const stageNumber = stageIndex >= 0 ? stageIndex + 1 : 1;
  const stageTotal = stages.length;
  const stageMessage = t(`ConnectDevice.${messageKey}`, {
    defaultValue: String(messageKey),
  });

  return createPortal(
    <div className="crr-usb-connecting-backdrop" role="dialog" aria-modal="true" aria-busy="true">
      <div className="crr-usb-connecting-card">
        <h2 className="crr-usb-connecting-title">{t(`ConnectDevice.${titleKey}`)}</h2>
        <p className="crr-usb-connecting-step">
          {t('ConnectDevice.CrrConnectingStep', { current: stageNumber, total: stageTotal })}
        </p>
        <IonSpinner name="crescent" className="crr-usb-connecting-spinner" />
        <p className="crr-usb-connecting-message" key={messageKey}>
          {stageMessage}
        </p>
        <div className="crr-usb-connecting-bar-track" aria-hidden="true">
          <div
            className="crr-usb-connecting-bar-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="crr-usb-connecting-percent">{percent}%</p>
      </div>
    </div>,
    document.body,
  );
};

export default CrrUsbConnectingModal;
