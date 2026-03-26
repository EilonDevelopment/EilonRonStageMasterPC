import React, { FC, useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import { IGroup, ILC, IProject } from '../../helper/types';
import GroupCard from '../GroupCard';
import useAppData from '../../hooks/useAppData';

interface TotalizerModalProps {
  visible: boolean;
  groups: IGroup[];
  lcs: ILC[];
  onAction: () => void;
  onClose: () => void;
}

const TotalizerModal: FC<TotalizerModalProps> = props => {
  const {
    visible,
    onAction,
    onClose,
  } = props;
  const { t } = useTranslation();
  const { isMobile } = useAppData();
  const {
    groups,
    lcs
  } = useAppData()

  const joinGroupWithLCs = useMemo(() => {
    return groups
      .filter((item) => item.overload !== '')
      .map((group) => {
        const liveRead = lcs.filter((item) => item.groups?.split(',').includes(group.group_id ?? 'empty')).reduce((result: number, prev: ILC) => result + parseFloat(prev.value ?? '0'), 0);
        return { ...group, liveRead };
      })
  }, [groups, lcs])

  return (
    <Modal
      header={t("Totalizer.Title")}
      visible={visible}
      classes={` overflow-auto ${isMobile ? 'w-[600px] max-h-80' : 'flex flex-col max-h-[800px] w-[800px] '} `}
      contentClasses={`py-4 gap-4 grid grid-cols-2 ${isMobile ? "" : ""}`}
      footerClasses={` px-6 py-2 ${isMobile ? "" : ''}`}
      cancelTitle={t("Common.Cancel")}
      onAction={() => onAction()}
      onClose={() => onClose()}
    >
      {
        joinGroupWithLCs.map((item, index) => {
          return (
            <GroupCard key={index} colorId={index} {...item} cardType='totalizer' />
          )
        })
      }
    </Modal>
  )
}

export default TotalizerModal;
