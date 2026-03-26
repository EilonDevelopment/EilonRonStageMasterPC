import React, { ChangeEvent, FC, useEffect, useState } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import TextInput from '../TextInput';
import { IGroup } from '../../helper/types';
import { IonIcon } from '@ionic/react';
import { alertCircleOutline } from 'ionicons/icons';
import Text from '../Text';
import useAppData from '../../hooks/useAppData';

interface GroupModalProps {
  visible: boolean;
  data: IGroup | null;
  errMsg?: string;
  onAction: (info: IGroup) => void;
  onClose: () => void;
}

const GroupModal: FC<GroupModalProps> = props => {
  const {
    visible,
    data,
    errMsg = '',
    onAction,
    onClose,
  } = props;
  const { t } = useTranslation();

  const [info, setInfo] = useState<IGroup>({} as IGroup)
  const { isMobile } = useAppData();

  useEffect(() => {
    if (data)
      setInfo(data);
  }, [data])

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInfo(v => ({ ...v, [e.target.name]: e.target.value }))
  }

  return (
    <Modal
      header={`${t("Setting.Group")} ${info.id}`}
      visible={visible}
      classes={`${isMobile ? 'w-80' : 'w-96'} `}
      contentClasses={`${isMobile ? '' : 'px-6'}`}
      okTitle={t("Common.Okay")}
      footerClasses={`${isMobile?'':'px-6 py-2'}`}
      cancelTitle={t("Common.Cancel")}
      onAction={() => onAction(info)}
      onClose={() => onClose()}
    >
      <div className={`flex flex-col gap-2 ${isMobile ? "my-4" : ""}`}>
        <TextInput
          name='title'
          value={info.title}
          label={t("Setting.GroupName")}
          onChange={e => handleChange(e)}
        />
        <TextInput
          name='overload'
          type='number'
          value={info.overload}
          label={t("Setting.Overload")}
          onChange={e => handleChange(e)}
        />
        {errMsg &&
          <div className='flex flex-row items-center justify-center bg-red-100 py-2 gap-2 dark:bg-dark'>
            <IonIcon color='danger' icon={alertCircleOutline} className='text-2xl' />
            <Text label={errMsg} />
          </div>
        }
      </div>
    </Modal>
  )
}

export default GroupModal;
