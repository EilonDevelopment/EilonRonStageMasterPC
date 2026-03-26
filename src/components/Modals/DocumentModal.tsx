import React, { FC, useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import { IGroup, ILC, IProject } from '../../helper/types';
import { IonButton } from '@ionic/react';
import GroupCard from '../GroupCard';
import useAppData from '../../hooks/useAppData';

interface DocumentModalProps {
  visible: boolean;
  groups: IGroup[];
  lcs: ILC[];
  onAction: () => void;
  onClose: () => void;
}

const DocumentModal: FC<DocumentModalProps> = props => {
  const {
    visible,
    groups,
    lcs,
    onAction,
    onClose,
  } = props;
  const { t } = useTranslation();
  const { isMobile } = useAppData();
  const { updateConfirmed } = useAppData();

  const joinGroupWithLCs = useMemo(() => {
    return groups
      .filter((item) => item.overload !== '')
      .map((group) => {
        const liveRead = lcs.filter((item) => item.groups?.split(',').includes(group.group_id ?? 'empty')).reduce((result: number, prev: ILC) => result + parseFloat(prev.value ?? '0'), 0);
        return { ...group, liveRead };
      })
  }, [groups, lcs])

  const handleReset = () => {
    console.log('')
  }

  return (
    <Modal
      header={t("Menu.Document")}
      visible={visible}
      classes={` overflow-auto ${isMobile ? " max-h-80 w-96" : "max-h-[800px] w-[600px]"}`}
      contentClasses={`py-4 gap-4 ${isMobile ? '' : 'px-6'} `}
      footerClasses={`${isMobile ? "" : 'px-5 py-2'}`}
      cancelTitle={t("Common.Cancel")}
      modalType='document'
      onAction={() => onAction()}
      onClose={() => { onClose(); updateConfirmed(false); }}
    >
      <div className={`flex flex-col items-center bg-background  ${isMobile ? "" : "gap-2 "}`}>
        {
          joinGroupWithLCs.map((item, index) => {
            return (
              <GroupCard key={index} {...item} cardType='document' />
            )
          })
        }
      </div>
    </Modal>
  )
}

export default DocumentModal;
