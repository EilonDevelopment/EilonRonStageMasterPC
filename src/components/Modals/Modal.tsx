import { IonButton, IonIcon, IonModal } from '@ionic/react';
import { closeOutline } from 'ionicons/icons';
import React, { FC, ReactElement, useEffect, useRef, useState } from 'react';

import './index.css'
import { useTranslation } from 'react-i18next';
import TextInput from '../TextInput';
import useAppData from '../../hooks/useAppData';
import { jsPDF } from "jspdf";

interface ModalProps {
  visible: boolean;
  header?: string;
  headerSub?: ReactElement;
  headerDisable?: boolean;
  classes?: string;
  contentClasses?: string;
  footerClasses?: string;
  // eslint-disable-next-line
  children: any;
  dismiss?: boolean;
  okTitle?: string;
  okColor?: string;
  cancelTitle?: string;
  cancelColor?: string;
  pdfHeaderEnable?: boolean;
  modalType?: string;
  onAction?: () => void;
  onClose?: () => void;
  onPdfAction?: () => void;
  showFooter?: boolean;
}

const Modal: FC<ModalProps> = props => {
  const {
    visible,
    header = '',
    headerSub = null,
    headerDisable = false,
    classes = '',
    contentClasses = '',
    footerClasses = '',
    children,
    dismiss = true,
    okTitle = '',
    okColor = '',
    cancelTitle = '',
    cancelColor = '',
    modalType = '',
    pdfHeaderEnable = false,
    // eslint-disable-next-line
    onAction = () => { },
    // eslint-disable-next-line
    onClose = () => { },
    // eslint-disable-next-line
    onPdfAction = () => { },
    showFooter = true,
  } = props;

  const { confirmed, weighData, curProject } = useAppData();

  const { t } = useTranslation();
  const modal = useRef<HTMLIonModalElement>(null);

  const [truckNo, setTruckNo] = useState('');
  const [driverName, setDriverName] = useState('');
  const [towedNo, setTowedNo] = useState('');
  const [deliveryNo, setDeliveryNo] = useState('');
  const { isMobile } = useAppData();
  const handleDownloadPDF = () => {
    console.log('');
    const doc = new jsPDF('p', 'mm', 'a4', true);
    // if ($("#detailsheader_image").attr('src')) {
    //   doc.addImage($("#detailsheader_image").attr('src'), "JPEG", -30, 0, 260, 40);
    // }
    // doc.addFont("./fonts/arial-unicode-ms.ttf", "ArialUTF", "normal");

    const left_col_caption_x = 8;
    const left_col_x = 43;

    const right_col_caption_x = 97;
    const right_col_x = 129;

    doc.setFont('ArialUTF');
    doc.setFontSize(8);
    doc.setDrawColor(0);
    doc.setFillColor(0, 0, 255);
    doc.rect(7, 45, 193, 10, "F");
    doc.setTextColor(255, 255, 0);
    doc.text(t('Menu.Document'), 10, 51);

    doc.setLineWidth(0.3);
    doc.setDrawColor(220, 200, 200);
    doc.setTextColor(0, 0, 0);


    doc.text(t('Monitor.Header.Tare'), left_col_caption_x, 62);
    doc.text(weighData.tare.toString(), left_col_x, 62);

    doc.text(t('Monitor.Header.Net'), right_col_caption_x, 62);
    doc.text(weighData.net.toString(), right_col_x, 62);

    doc.text(t('Monitor.Header.Gross'), left_col_caption_x, 68);


    // const n = parseInt(next_certificate) + 1;
    doc.text(weighData.gross.toString(), left_col_x, 68);

    doc.text("Truck Number", right_col_caption_x, 68);
    doc.text(truckNo, right_col_x, 68);

    doc.text("Driver Name", left_col_caption_x, 74);
    doc.text(driverName, left_col_x, 74);

    doc.text("Towed No.", right_col_caption_x, 74);
    doc.text(towedNo, right_col_x, 74);

    doc.text("Delivery No.", left_col_caption_x, 80);
    doc.text(deliveryNo, left_col_x, 80);

    /* doc.setDrawColor(0);
      doc.setFillColor(255, 0, 0);
      doc.rect(7, 127, 193, 10, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(10, 133, app.locales.translate_one('Peak')+' '+app.peak+app.active_project.units);

      doc.addImage($("#chart1img").attr('src'), "PNG", 30, 150, 160, 80);
    */
    const file = curProject.title;
    if (typeof doc !== "undefined") {
      doc.save(file + ".pdf");
    } else {
      alert("Error 0xE001BADF");
    }
  }

  useEffect(() => {
    if (!visible)
      modal.current?.dismiss()
  }, [visible])

  return (
    <IonModal ref={modal} isOpen={visible} onDidDismiss={onClose} canDismiss={dismiss}>
      <div className='flex flex-row '>
        {confirmed && modalType === 'document' && <div className={`flex flex-col p-1 pt-14${isMobile ? "max-h-80 overflow-auto pt-[50px] px-4 pb-3" : ""}`}>
          <TextInput
            label={t("WeighingDocument.TruckNo")}
            type='number'
            value={truckNo}
            onChange={e => setTruckNo(e.target.value)}
          />
          <TextInput
            label={t("WeighingDocument.DriverName")}
            type='text'
            value={driverName}
            onChange={e => setDriverName(e.target.value)}
          />
          <TextInput
            label={t("WeighingDocument.TowedNo")}
            type='number'
            value={towedNo}
            onChange={e => setTowedNo(e.target.value)}
          />
          <TextInput
            label={t("WeighingDocument.DeliveryNo")}
            type='number'
            value={deliveryNo}
            onChange={e => setDeliveryNo(e.target.value)}
          />
          <IonButton color="warning" size="small" className={`${isMobile ? "mb-2 mt-3" : ""}`} onClick={handleDownloadPDF}>Download PDF</IonButton>
        </div>}
        <div className={`wrapper bg-light dark:bg-dark ${classes}`}>
          {!headerDisable &&
            <div className={`flex flex-row items-center border-b border-gray-200 dark:border-gray-600 ${isMobile ? 'px-4 py-2 fixed top-0 left-0 w-full z-[99999] bg-inherit' : ' px-6 py-4 fixed top-0 left-0 w-full z-[99999]'} bg-white dark:bg-dark`}>
              {header && <h1 className='text-xl font-medium text-black dark:text-white'>{header}</h1>}
              {headerSub}
              <IonIcon
                aria-hidden="true"
                color='dark'
                ios={closeOutline}
                md={closeOutline}
                className={`absolute text-xl top- right-2 ${isMobile ? "" : "right-6 "}`}
                onClick={() => onClose()}
              />
            </div>
          }
          <div className={`flex flex-col p-4 bg-light dark:bg-dark dark:text-white ${isMobile ? "mt-10" : "mt-14"} ${contentClasses}`} style={{'overflowY':'auto',maxHeight:'90vh'}}>
            {children}
          </div>
          {showFooter && (
            <div className={`flex flex-row justify-end w-full gap-2  ${isMobile ? "px-4 py-2" : 'pb-3 '}${footerClasses}`}>
              {okTitle && <IonButton color={okColor || 'primary'} onClick={() => onAction()}>{okTitle}</IonButton>}
              {cancelTitle && <IonButton color={cancelColor || 'secondary'} onClick={() => onClose()}>{cancelTitle}</IonButton>}
              {pdfHeaderEnable && <IonButton color='success' onClick={() => onPdfAction()}>{t("Common.PDFHeader")}</IonButton>}
            </div>
          )}
        </div>
      </div>
    </IonModal>
  )
}

export default Modal;
