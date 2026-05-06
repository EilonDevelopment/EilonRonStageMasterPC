import React, { FC, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import Text from '../Text';
import SelectButtons from '../Buttons/SelectButtons';
import { IProject } from '../../helper/types';
import { Unit_List, Windmeter_Unit_List } from '../../helper/constants';
import TextInput from '../TextInput';
import { IonButton, IonToggle } from '@ionic/react';
import useAppData from '../../hooks/useAppData';
import NumericKeypadOverlay from '../NumericKeypadOverlay';
import { sanitizeDigitsOnly, sanitizeUnsignedDecimal, type NumericKeypadVariant } from '../../helper/numericFieldInput';

interface ProjectSettingModalProps {
  visible: boolean;
  data: IProject;
  unitsOnly?: boolean;
  onAction: (project: IProject) => void;
  onClose: () => void;
}

const NATIVE_NUMERIC_PAD = Capacitor.isNativePlatform();

const NATIVE_NUMERIC_FIELD_SHELL =
  'flex w-full flex-row justify-between border border-medium border-gray2 px-3 py-1.5 min-h-[44px] items-center bg-white dark:bg-slate-950';
const NATIVE_NUMERIC_FIELD_TEXT =
  'flex-1 w-full min-w-0 text-left tabular-nums outline-none bg-transparent text-dark dark:text-light text-base font-normal';
const NATIVE_NUMERIC_FIELD_BTN =
  'm-0 w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left rounded-none';

const TEXT_FIELD_ROW_CHROME = 'min-h-[44px] items-center bg-white dark:bg-slate-950';

type MoreSettingsNumericField = 'total_overload' | 'report_interval_seconds' | 'pre_overload';

type NumericPadState = {
  field: MoreSettingsNumericField;
  variant: NumericKeypadVariant;
  title: string;
  draft: string;
};

const beforeInputDigitsOnly: React.FormEventHandler<HTMLInputElement> = (e) => {
  const ev = e.nativeEvent as InputEvent;
  if (!ev.data || ev.inputType === 'insertFromPaste') return;
  if (!/^\d$/.test(ev.data)) e.preventDefault();
};

const beforeInputUnsignedDecimal: React.FormEventHandler<HTMLInputElement> = (e) => {
  const ev = e.nativeEvent as InputEvent;
  if (!ev.data || ev.inputType === 'insertFromPaste') return;
  if (/^\d$/.test(ev.data)) return;
  if (ev.data === '.' || ev.data === ',') return;
  e.preventDefault();
};

const ProjectSettingModal: FC<ProjectSettingModalProps> = (props) => {
  const { visible, data, unitsOnly = false, onAction, onClose } = props;
  const { t } = useTranslation();
  const [project, setProject] = useState<IProject>({ cycle: false, report_interval_seconds: 60 } as IProject);
  const { isMobile } = useAppData();
  const [numericPad, setNumericPad] = useState<NumericPadState | null>(null);
  const DEFAULT_TOTAL_OVERLOAD_KG = 500;

  const getDefaultTotalOverloadByUnits = (units?: string) => {
    const u = String(units || 'KG').toUpperCase();
    if (u === 'LBS') return (DEFAULT_TOTAL_OVERLOAD_KG * 2.20462).toFixed(2);
    if (u === 'M.TON') return (DEFAULT_TOTAL_OVERLOAD_KG / 1000).toFixed(3);
    return String(DEFAULT_TOTAL_OVERLOAD_KG);
  };

  useEffect(() => {
    setProject(data);
  }, [data]);

  useEffect(() => {
    if (!visible) setNumericPad(null);
  }, [visible]);

  const get_units_multiply = (units: any) => {
    let multiply = 0;
    switch (project.units) {
      case 'KG':
        multiply = units == 'LBS' ? 2.20462 : 0.001;
        break;
      case 'LBS':
        multiply = units == 'KG' ? 0.453592 : 0.000453592;
        break;
      case 'M.TON':
        multiply = units == 'KG' ? 1000 : 2204.62;
        break;
    }
    return multiply;
  };

  const handleChangeProject = (field: string, value: string | boolean | number) => {
    if (field === 'report_interval_seconds') {
      if (value === '') {
        setProject((v) => ({ ...v, report_interval_seconds: '' as any }));
        return;
      }
      const num = Number(value);
      if (!isNaN(num)) {
        const n = Math.min(86400, num);
        setProject((v) => ({ ...v, report_interval_seconds: n }));
      }
      return;
    }
    if (field === 'units') {
      const multiply = value !== project.units ? get_units_multiply(value) : 1;
      let fixed = 0;
      if (value == 'KG' || value == 'LBS') {
        fixed = 1;
      } else {
        fixed = 3;
      }
      const currentTotalOverload =
        project?.total_overload !== undefined && String(project.total_overload).trim() !== ''
          ? String(project.total_overload)
          : getDefaultTotalOverloadByUnits(project.units);
      setProject((v) => ({ ...v, total_overload: (parseFloat(currentTotalOverload) * multiply).toFixed(fixed) }));
    }
    setProject((v) => ({ ...v, [field]: value }));
  };

  const openNumericPad = async (field: MoreSettingsNumericField, variant: NumericKeypadVariant, title: string) => {
    try {
      await Keyboard.hide();
    } catch {
      /* noop */
    }
    let draft = '';
    if (field === 'total_overload') {
      draft =
        project?.total_overload !== undefined && String(project.total_overload).trim() !== ''
          ? String(project.total_overload)
          : getDefaultTotalOverloadByUnits(project.units);
    } else if (field === 'report_interval_seconds') {
      const v = project.report_interval_seconds;
      draft = v === '' || v === undefined || v === null ? '' : String(v);
    } else {
      draft = project.pre_overload != null && String(project.pre_overload).trim() !== '' ? String(project.pre_overload) : '';
    }
    setNumericPad({ field, variant, title, draft });
  };

  const commitNumericPad = () => {
    if (!numericPad) return;
    const { field, draft } = numericPad;
    if (field === 'total_overload') {
      handleChangeProject('total_overload', sanitizeUnsignedDecimal(draft));
    } else if (field === 'report_interval_seconds') {
      handleChangeProject('report_interval_seconds', sanitizeDigitsOnly(draft));
    } else {
      handleChangeProject('pre_overload', sanitizeDigitsOnly(draft));
    }
    setNumericPad(null);
  };

  const renderNativeNumericShell = (display: React.ReactNode, onOpen: () => void) => (
    <button type="button" className={NATIVE_NUMERIC_FIELD_BTN} onClick={onOpen}>
      <div className={NATIVE_NUMERIC_FIELD_SHELL}>
        <span className={NATIVE_NUMERIC_FIELD_TEXT}>{display}</span>
      </div>
    </button>
  );

  const totalOverloadLabel = t('Project.TotalOverload');
  const reportIntervalLabel = t('Project.ReportInterval');
  const preOverloadLabel = `${t('Project.PreoverloadWarning')} (%)`;

  return (
    <Modal
      header={t('Project.ProjectSettingTitle')}
      visible={visible}
      classes={`w-[550px] ${isMobile ? ' max-h-[335px] ' : ''} `}
      contentClasses={`py-4 gap-4 ${isMobile ? '' : 'px-7 gap-5'}`}
      showFooter={false}
      footerSlot={
        <div className="flex w-full justify-end gap-2">
          <IonButton color="secondary" onClick={() => onClose()}>
            {t('Common.Cancel')}
          </IonButton>
          <IonButton color="primary" onClick={() => onAction(project)}>
            {t('Common.Okay')}
          </IonButton>
        </div>
      }
      onAction={() => onAction(project)}
      onClose={() => onClose()}
    >
      {visible && (
        <div className="flex flex-row items-center gap-2">
          <Text label={t('Project.Units')} />
          <SelectButtons
            value={project.units || 'kg'}
            list={Unit_List}
            onSelect={(value) => handleChangeProject('units', value.toString())}
          />
        </div>
      )}
      {visible && (
        <div className="flex flex-row items-center gap-2">
          <Text label={t('Project.WindmeterUnits')} />
          <SelectButtons
            value={project.windmeter_units || 'meter'}
            list={Windmeter_Unit_List}
            onSelect={(value) => handleChangeProject('windmeter_units', value.toString())}
          />
        </div>
      )}
      {!unitsOnly && visible && (
        <>
          {NATIVE_NUMERIC_PAD ? (
            <div className="gap-3 flex flex-col w-full">
              <Text type="dark" label={totalOverloadLabel} />
              {renderNativeNumericShell(
                project?.total_overload !== undefined && String(project.total_overload).trim() !== ''
                  ? String(project.total_overload)
                  : getDefaultTotalOverloadByUnits(project.units),
                () => openNumericPad('total_overload', 'unsigned-decimal', totalOverloadLabel)
              )}
            </div>
          ) : (
            <TextInput
              label={totalOverloadLabel}
              type="text"
              inputMode="decimal"
              inputContainerClasses={TEXT_FIELD_ROW_CHROME}
              value={project.total_overload || getDefaultTotalOverloadByUnits(project.units)}
              onBeforeInput={beforeInputUnsignedDecimal}
              onChange={(e) => handleChangeProject('total_overload', sanitizeUnsignedDecimal(e.target.value))}
            />
          )}
        </>
      )}
      {!unitsOnly && visible && (
        <div className="flex flex-row items-center gap-2">
          <IonToggle
            enableOnOffLabels={true}
            checked={project.cycle || false}
            onIonChange={(e) => handleChangeProject('cycle', e.detail.checked)}
          />
          <Text label={t('Project.ReportsCycle')} />
        </div>
      )}
      {!unitsOnly && visible && (
        <>
          {NATIVE_NUMERIC_PAD ? (
            <div className="gap-3 flex flex-col w-full">
              <Text type="dark" label={reportIntervalLabel} />
              {renderNativeNumericShell(
                project.report_interval_seconds === '' || project.report_interval_seconds === undefined || project.report_interval_seconds === null ? (
                  <span className="text-slate-400 dark:text-slate-500">—</span>
                ) : (
                  String(project.report_interval_seconds)
                ),
                () => openNumericPad('report_interval_seconds', 'digits', reportIntervalLabel)
              )}
            </div>
          ) : (
            <TextInput
              label={reportIntervalLabel}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputContainerClasses={TEXT_FIELD_ROW_CHROME}
              value={project.report_interval_seconds ?? 60}
              onBeforeInput={beforeInputDigitsOnly}
              onChange={(e) => handleChangeProject('report_interval_seconds', sanitizeDigitsOnly(e.target.value))}
            />
          )}
        </>
      )}
      {!unitsOnly && visible && <Text classes="text-muted text-xs" label={t('Project.ReportIntervalHint')} />}
      {!unitsOnly && visible && (
        <>
          {NATIVE_NUMERIC_PAD ? (
            <div className="gap-3 flex flex-col w-full">
              <Text type="dark" label={preOverloadLabel} />
              {renderNativeNumericShell(
                project.pre_overload != null && String(project.pre_overload).trim() !== '' ? (
                  String(project.pre_overload)
                ) : (
                  <span className="text-slate-400 dark:text-slate-500">—</span>
                ),
                () => openNumericPad('pre_overload', 'digits', preOverloadLabel)
              )}
            </div>
          ) : (
            <TextInput
              label={preOverloadLabel}
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              inputContainerClasses={TEXT_FIELD_ROW_CHROME}
              value={project.pre_overload || ''}
              onBeforeInput={beforeInputDigitsOnly}
              onChange={(e) => handleChangeProject('pre_overload', sanitizeDigitsOnly(e.target.value))}
            />
          )}
        </>
      )}
      {numericPad && (
        <NumericKeypadOverlay
          open
          title={numericPad.title}
          value={numericPad.draft}
          variant={numericPad.variant}
          onChange={(next) => setNumericPad((p) => (p ? { ...p, draft: next } : null))}
          onDone={commitNumericPad}
          onCancel={() => setNumericPad(null)}
        />
      )}
    </Modal>
  );
};

export default ProjectSettingModal;
