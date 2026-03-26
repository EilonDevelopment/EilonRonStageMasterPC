import React, { ChangeEvent, FC, useEffect, useState } from 'react';
import { IonIcon, IonImg } from '@ionic/react';
import { cameraSharp, imageSharp } from 'ionicons/icons';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { useTranslation } from 'react-i18next';

import Modal from './Modal';
import Text from '../Text';
import { ILC, IProject } from '../../helper/types';
import { Capacitor } from '@capacitor/core';
import TextInput from '../TextInput';

interface ProofProjectInformationModalProps {
  visible: boolean;
  selectedLC?: Partial<ILC>;
  onAction: (data: InformationTypes) => void;
  onClose: () => void;
}

export interface InformationTypes {
  productDesc?: string;
  machineCode?: string;
  company?: string;
  serialORTag?: string;
  productName?: string;
  tel?: string;
  wll?: string;
  modelName?: string;
  contact?: string;
  testMethod?: string;
  testLocation?: string;
  address?: string;
  notes?: string;
}

const ProofProjectInformationModal: FC<ProofProjectInformationModalProps> = props => {
  const {
    visible,
    selectedLC,
    onAction,
    onClose,
  } = props;
  const { t } = useTranslation();
  // const [img, setImg] = useState<string>('');
  const [data, setData] = useState<InformationTypes>({
    productDesc: '',
    machineCode: '',
    company: '',
    serialORTag: '',
    productName: '',
    tel: '',
    wll: '',
    modelName: '',
    contact: '',
    testMethod: '',
    testLocation: '',
    address: '',
    notes: '',
  })

  useEffect(() => {
    setData({
      ...selectedLC,
      productDesc: selectedLC?.productdescription ?? '',
      machineCode: selectedLC?.machinecode ?? '',
      company: selectedLC?.certcompany ?? '',
      serialORTag: selectedLC?.serialortag ?? '',
      productName: selectedLC?.productname ?? '',
      tel: selectedLC?.companytel ?? '',
      wll: selectedLC?.wll ?? '',
      modelName: selectedLC?.modelname ?? '',
      contact: selectedLC?.companycontact ?? '',
      testMethod: selectedLC?.testmethod ?? '',
      testLocation: selectedLC?.testlocation ?? '',
      address: selectedLC?.certcompanyaddress ?? '',
      notes: selectedLC?.notes ?? '',
    })
  }, [selectedLC])

  // useEffect(() => {
  //   return () => setImg('')
  // }, [])

  // useEffect(() => {
  //   if (img) {
  //     onAction(img)
  //   }
  // }, [img])

  const handleChange = (key: keyof InformationTypes, e: ChangeEvent<HTMLInputElement>) => {
    setData(d => ({
      ...d,
      [key]: e.target.value,
    }))
    console.log({selectedLC, data})
  }

  return (
    <Modal
      visible={visible}
      header={t("Project.ProjectInformation")}
      classes='w-[700px] h-[360px] border border-secondary rounded-md overflow-auto'
      contentClasses='py-2 px-6 gap-2'
      footerClasses='!justify-center'
      onClose={() => onClose()}
      okTitle='Ok'
      cancelTitle='Cancel'
      onAction={() => {
        console.log('ok clicked')
        onAction(data)
      }}
    >
      <div className='grid grid-cols-3 gap-5'>
        <div className='flex flex-col gap-4 justify-end'>
          <Text label={t('ProofTest.Modal.CertNum')} />
          <Text label={t('ProofTest.Modal.AutoGen')} />
        </div>
        <TextInput
          classes='justify-end'
          label={t('ProofTest.Modal.ProductDesc')}
          value={data.productDesc ?? '' ?? ''}
          onChange={e => handleChange('productDesc', e)}
        />
        <TextInput
          classes='justify-end'
          label={t('ProofTest.Modal.MachineCode')}
          value={data.machineCode ?? ''}
          onChange={e => handleChange('machineCode', e)}
        />

        <TextInput
          classes='justify-end'
          label={t('ProofTest.Modal.Company')}
          value={data.company ?? ''}
          onChange={e => handleChange('company', e)}
        />
        <TextInput
          classes='justify-end'
          label={t('ProofTest.Modal.SerialORTag')}
          value={data.serialORTag ?? ''}
          onChange={e => handleChange('serialORTag', e)}
        />
        <TextInput
          classes='justify-end'
          label={t('ProofTest.Modal.ProductName')}
          value={data.productName ?? ''}
          onChange={e => handleChange('productName', e)}
        />

        <TextInput
          classes='justify-end'
          label={t('ProofTest.Modal.Tel')}
          value={data.tel ?? ''}
          onChange={e => handleChange('tel', e)}
        />
        <TextInput
          classes='justify-end'
          label={t('ProofTest.Modal.WLL')}
          value={data.wll ?? ''}
          onChange={e => handleChange('wll', e)}
        />
        <TextInput
          classes='justify-end'
          label={t('ProofTest.Modal.ModelName')}
          value={data.modelName ?? ''}
          onChange={e => handleChange('modelName', e)}
        />

        <TextInput
          classes='justify-end'
          label={t('ProofTest.Modal.Contact')}
          value={data.contact ?? ''}
          onChange={e => handleChange('contact', e)}
        />
        <TextInput
          classes='justify-end'
          label={t('ProofTest.Modal.TestMethod')}
          value={data.testMethod ?? ''}
          onChange={e => handleChange('testMethod', e)}
        />
        <TextInput
          classes='justify-end'
          label={t('ProofTest.Modal.TestLocation')}
          value={data.testLocation ?? ''}
          onChange={e => handleChange('testLocation', e)}
        />

        <TextInput
          classes='justify-end'
          label={t('ProofTest.Modal.Address')}
          value={data.address ?? ''}
          onChange={e => handleChange('address', e)}
        />
        <TextInput
          classes='justify-end'
          label={t('ProofTest.Modal.Notes')}
          value={data.notes ?? ''}
          onChange={e => handleChange('notes', e)}
        />
      </div>
    </Modal>
  )
}

export default ProofProjectInformationModal;
