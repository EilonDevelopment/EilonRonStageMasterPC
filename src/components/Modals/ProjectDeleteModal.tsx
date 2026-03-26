import React, { FC, useEffect, useState } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import Text from '../Text';
import { IProject } from '../../helper/types';
import TextInput from '../TextInput';

interface ProjectDeleteModalProps {
  visible: boolean;
  data: IProject[];
  onSelect: (id: string) => void;
  onClose: () => void;
}

const ProjectDeleteModal: FC<ProjectDeleteModalProps> = props => {
  const {
    visible,
    data,
    onSelect,
    onClose,
  } = props;
  const { t } = useTranslation();

  const [filter, setFilter] = useState<string>('');
  const [filteredList, setFilteredList] = useState<IProject[]>([])

  useEffect(() => {
    if (filter)
      setFilteredList(data.filter(item => item.title && item.title.toLowerCase().includes(filter.toLowerCase())))
    else
      setFilteredList(data)

  }, [data, filter])

  return (
    <Modal
      visible={visible}
      header={t("Project.DeleteProject")}
      classes='w-80 border border-secondary rounded-md py-10'
      contentClasses='!items-center py-2 px-6'
      footerClasses='!justify-center'
      onClose={() => onClose()}
    >
      <TextInput
        placeholder='search'
        classes='w-full'
        value={filter}
        onChange={e => setFilter(e.target.value)}
      />
      {filteredList.length > 0 && <div className='grid grid-cols-2 py-4 gap-2 w-full'>
        {filteredList.map((item: IProject, index: number) => (
          <div
            key={index}
            className='w-full px-3 text-center cursor-pointer'
            onClick={() => onSelect(item.id)}
          >
            <Text classes='!text-primary' label={item.title} />
          </div>
        ))}
      </div>}
    </Modal>
  )
}

export default ProjectDeleteModal;
