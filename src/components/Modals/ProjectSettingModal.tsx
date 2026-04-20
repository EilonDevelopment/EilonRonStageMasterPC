import React, { FC, useEffect, useState } from 'react';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import Text from '../Text';
import SelectButtons from '../Buttons/SelectButtons';
import { IProject } from '../../helper/types';
import { Unit_List, Windmeter_Unit_List } from '../../helper/constants';
import TextInput from '../TextInput';
import { IonToggle } from '@ionic/react';
import useAppData from '../../hooks/useAppData';

interface ProjectSettingModalProps {
  visible: boolean;
  data: IProject;
  onAction: (project: IProject) => void;
  onClose: () => void;
}

const ProjectSettingModal: FC<ProjectSettingModalProps> = props => {
  const {
    visible,
    data,
    onAction,
    onClose,
  } = props;
  const { t } = useTranslation();
  const [project, setProject] = useState<IProject>({ cycle: false, report_interval_seconds: 60 } as IProject);
  const { isMobile } = useAppData()

  useEffect(() => {
    // setProject({
    //   pre_overload: '100',
    //   cycle: false,
    //   show_graphs: false,
    //   ...data
    // } as IProject)
    setProject(data)
  }, [data])

  useEffect(() => {
    console.log("project", project)
  }, [project])

  // useEffect(() => {
  //   if (!visible)
  //     setProject({
  //       units: Unit_List[2].value,
  //       windmeter_units: Windmeter_Unit_List[2].value,
  //       pre_overload: '100',
  //       cycle: false,
  //       show_graphs: false,
  //     } as IProject)
  // }, [visible])

  const get_units_multiply = (units: any) => {
    let multiply = 0;
    switch (project.units) {
      case "KG":
        // fixed = 0;
        multiply = (units == "LBS") ? 2.20462 /*lbs*/ : 0.001 /*mton*/;
        break;
      case "LBS":
        // fixed = 0;
        multiply = (units == "KG") ? 0.453592 /*kg*/ : 0.000453592 /*mton*/;
        break;
      case "M.TON":
        // fixed = 3;
        multiply = (units == "KG") ? 1000 /*kg*/ : 2204.62 /*lbs*/;
        break; 
    }
    return multiply;
  }

  const handleChangeProject = (field: string, value: string | boolean | number) => {
    if (field === 'report_interval_seconds') {
      // 1. Permitimos que el campo esté vacío mientras el usuario escribe
      if (value === "") {
        setProject((v) => ({ ...v, report_interval_seconds: "" as any }));
        return;
      }

      // 2. Solo procesamos si es un número
      const num = Number(value);
      if (!isNaN(num)) {
        // Limitamos el máximo permitido (86400s), pero no forzamos un mínimo 
        // de 1 mientras escribe para no bloquear el borrado.
        const n = Math.min(86400, num);
        setProject((v) => ({ ...v, report_interval_seconds: n }));
      }
      return;
     // const n = Math.max(1, Math.min(86400, Number(value) || 60));
     // setProject((v) => ({ ...v, report_interval_seconds: n }));
     // return;
    }
    if (field === 'units') {
      const multiply = (value !== project.units) ? get_units_multiply(value) : 1;
      let fixed = 0;
      if (value == "KG" || value == "LBS") {
        fixed = 1;
      } else {
        fixed = 3;
      }
      setProject(v => ({ ...v, total_overload: (parseFloat(project?.total_overload ?? '231.999') * multiply).toFixed(fixed) }))
    }
    setProject((v) => ({ ...v, [field]: value }))
  }

  return (
    <Modal
      header={t("Project.ProjectSettingTitle")}
      visible={visible}
      // classes='w-max h-80 overflow-auto'
      classes={`w-[550px] overflow-auto ${isMobile ? ' max-h-[335px] ' : ''} `}
      contentClasses={`py-4 gap-4 ${isMobile ? '' : 'px-7 gap-5'}`}
      footerClasses={`${isMobile ? '' : 'px-6 py-2'}`}
      okTitle={t("Common.Okay")}
      cancelTitle={t("Common.Cancel")}
      onAction={() => onAction(project)}
      onClose={() => onClose()}
    >
      {visible && (
      <div className='flex flex-row items-center gap-2'>
        <Text label={t("Project.Units")} />
        <SelectButtons
          value={project.units || 'kg'}
          list={Unit_List}
          onSelect={(value) => handleChangeProject('units', value.toString())}
        />
      </div>
      )}
      {visible && (
      <div className='flex flex-row items-center gap-2'>
        <Text label={t("Project.WindmeterUnits")} />
        <SelectButtons
          value={project.windmeter_units || 'meter'}
          list={Windmeter_Unit_List}
          onSelect={(value) => handleChangeProject('windmeter_units', value.toString())}
        />
        
      </div>
      )}
      {visible && (
      <TextInput
        label={t("Project.TotalOverload")}
        type='number'
        value={project.total_overload || ''}
        onChange={e => handleChangeProject('total_overload', e.target.value)}
      />
      )}
      {visible && (
      <div className='flex flex-row items-center gap-2'>
        <IonToggle
          enableOnOffLabels={true}
          checked={project.cycle || false}
          onIonChange={e => handleChangeProject('cycle', e.target.checked)}
        ></IonToggle>
        <Text label={t('Project.ReportsCycle')} />
      </div>
      )}
      {visible && (
      <TextInput
        label={t('Project.ReportInterval')}
        type='number'
        value={project.report_interval_seconds ?? 60}
        onChange={e => handleChangeProject('report_interval_seconds', e.target.value)}
      />
      )}
      {visible && (
      <Text classes='text-muted text-xs' label={t('Project.ReportIntervalHint')} />
      )}
      {visible && (
      <TextInput
        label={`${t("Project.PreoverloadWarning")} (%)`}
        type='number'
        value={project.pre_overload || ''}
        onChange={e => handleChangeProject('pre_overload', e.target.value)}
      />
      )}
    </Modal>
  )
}

export default ProjectSettingModal;
