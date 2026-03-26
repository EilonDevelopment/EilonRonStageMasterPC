import React, { FC, useEffect, useState } from 'react';
import { IonIcon } from '@ionic/react';
import { downloadSharp, documentAttachSharp } from 'ionicons/icons';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import Text from '../Text';
import { IProject } from '../../helper/types';
import TextInput from '../TextInput';
import useAppData from '../../hooks/useAppData';

interface ProjectListModalProps {
  visible: boolean;
  data: IProject[];
  onSelect: (id: string, replace: boolean) => void;
  onAction: () => void;
  onClose: () => void;
  onExport?: (project: IProject) => void;
  onImport?: () => void;
}

const ProjectListModal: FC<ProjectListModalProps> = props => {
  const {
    visible,
    data,
    onSelect,
    onAction,
    onClose,
    onExport,
    onImport,
  } = props;
  const { t } = useTranslation();

  const [filter, setFilter] = useState<string>('');
  const [filteredList, setFilteredList] = useState<IProject[]>([])
  const { isMobile } = useAppData()

  useEffect(() => {
    if (filter)
      setFilteredList(data.filter(item => item.title && item.title.toLowerCase().includes(filter.toLowerCase())))
    else
      setFilteredList(data)

  }, [data, filter])

  return (
    <>
      <Modal
        visible={visible}
        header={t("Project.ProjectList")}
        classes={` w-80 border border-secondary rounded-md ${isMobile ? ' overflow-auto max-h-[324px]' : ''}`}
        okTitle={undefined}
        showFooter={false}
        contentClasses='!items-center py-2 px-6'
        onClose={() => onClose()}
      >
        <div className="flex flex-row gap-2 w-full items-center" onClick={(e) => e.stopPropagation()}>
          <TextInput
            placeholder='Search'
            classes='flex-1'
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </div>
        {filteredList.length > 0 && <div className='flex flex-col py-4 gap-2 w-full'>
          {filteredList.map((item: IProject) => (
            <div
              key={item.id}
              className='w-full px-3 border-b border-medium cursor-pointer flex flex-row items-center justify-between gap-2'
              onClick={() => onSelect(item.id, true)}
            >
              <Text label={item.title} classes='flex-1' />
              {onExport && (
                <button
                  type="button"
                  className="p-1.5 shrink-0 text-primary hover:opacity-80 transition-opacity"
                  title={t('Project.Export') || 'Export'}
                  onClick={(e) => { e.stopPropagation(); onExport(item); }}
                >
                  <IonIcon icon={downloadSharp} className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
        </div>}
        <div className="flex flex-col gap-2 w-full mt-4">
          <button
            type="button"
            className="w-full py-1.5 px-5 rounded-md bg-primary text-white text-sm font-normal hover:opacity-90 transition-opacity"
            onClick={() => onAction()}
          >
            {t("Project.NewProjectTitle")}
          </button>
          {onImport && (
            <button
              type="button"
              className="w-full py-1.5 px-5 rounded-md bg-primary text-white text-sm font-normal hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
              onClick={() => onImport()}
            >
              <IonIcon icon={documentAttachSharp} className="w-4 h-4" />
              <span>{t('Project.Import') || 'Import'}</span>
            </button>
          )}
        </div>
      </Modal></>
  )
}

export default ProjectListModal;
