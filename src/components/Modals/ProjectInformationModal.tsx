import React, { FC, useEffect, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { cameraSharp, imageSharp } from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useTranslation } from 'react-i18next';

import Modal from './Modal';
import Text from '../Text';
import { IProject } from '../../helper/types';
import { Capacitor } from '@capacitor/core';
import useAppData from '../../hooks/useAppData';
import { defineCustomElements } from '@ionic/pwa-elements/loader';

defineCustomElements(window);
interface ProjectInformationModalProps {
  visible: boolean;
  onAction: (url: string) => void;
  onClose: () => void;
}

const ProjectInformationModal: FC<ProjectInformationModalProps> = props => {
  const {
    visible,
    onAction,
    onClose,
  } = props;
  const { t } = useTranslation();
  const { isMobile } = useAppData();

  const [img, setImg] = useState<string>('');

  useEffect(() => {
    return () => setImg('')
  }, [])

  useEffect(() => {
    if (img) {
      onAction(img)
    }
  }, [img])

  const hanldeImgLoad = async (type: string) => {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('skipResumeAlert', '1')
    try {
      if (type === 'camera') {
        const image = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Camera,
          saveToGallery: true
        })
        setImg(image.dataUrl || ('data:image/jpeg;base64,' + (image.base64String || '')))
      } else {
        const image = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.DataUrl,
          source: CameraSource.Photos
        })
        setImg(image.dataUrl || ('data:image/jpeg;base64,' + (image.base64String || '')))
      }
    } catch (error) {
      console.log('image result error: ', error)
    }
  }

  return (
    <Modal
      visible={visible}
      header={t("Project.ProjectInformation")}
      classes={` ${isMobile ? 'w-[600px] max-h-[340px] border border-secondary rounded-md overflow-auto' : 'w-[600px] border border-secondary rounded-md overflow-auto'}`}
      contentClasses='py-2 px-6 gap-2'
      footerClasses='!justify-center'
      onClose={() => onClose()}
    >
      <Text label={t("Project.ProjectInformationSubtitle")} />
      <div className='flex flex-row items-center gap-2 w-full'>
        <IonIcon
          src={imageSharp}
          color='primary'
          className='text-3xl rounded'
          onClick={() => hanldeImgLoad('gallery')}
        />
        <IonIcon
          src={cameraSharp}
          color='primary'
          className='text-4xl rounded'
          onClick={() => hanldeImgLoad('camera')}
        />
      </div>
      {img &&
        <div className="min-h-[200px] w-full flex items-center justify-center bg-black/5 rounded overflow-hidden">
          <img
            src={img.startsWith('data:') ? img : Capacitor.convertFileSrc(img)}
            alt=""
            className="max-w-full max-h-[280px] w-auto h-auto object-contain"
          />
        </div>
      }
    </Modal>
  )
}

export default ProjectInformationModal;
