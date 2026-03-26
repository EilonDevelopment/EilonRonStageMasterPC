import React, { FC, useEffect, useState } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import TextInput from '../TextInput';
import useAppData from '../../hooks/useAppData';

interface NewProjectModalProps {
  visible: boolean;
  dismiss: boolean;
  onAction: (name: string) => void;
  onClose: () => void;
}

const NewProjectModal: FC<NewProjectModalProps> = props => {
  const {
    visible,
    dismiss,
    onAction,
    onClose,
  } = props;
  const { t } = useTranslation();
  const { isMobile } = useAppData();
  const [projectName, setProjectName] = useState<string>('');

  useEffect(() => {
    setProjectName('')
  }, [visible])

  const handleAction = () => {
    let name = 'Untitled';
    if (projectName.trim() !== '') {
      name = projectName.trim();
    }
    onAction(name);
  }

  return (
    <Modal
      header={t("Project.NewProjectTitle")}
      visible={visible}
      classes='w-80'
      dismiss={dismiss}
      contentClasses={`${isMobile ? '' : 'px-6 py-4'}`}
      footerClasses={`${isMobile ? '' : 'px-6 pb-2'}`}
      okTitle={t("Common.Okay")}
      cancelTitle={dismiss ? t("Common.Cancel") : ''}
      onAction={handleAction}
      onClose={() => onClose()}
    >
      <div className={` flex flex-col  ${isMobile ? "my-2" : ''}`}>
        <TextInput
          value={projectName}
          label={t("Project.NewProjectInput")}
          onChange={e => setProjectName(e.target.value)}
        />
      </div>
    </Modal>
  )
}

export default NewProjectModal;
