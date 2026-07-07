import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import Text from '../Text';
import { ILC } from '../../helper/types';
import { normalizeLcLinkType, type LcLinkType } from '../../helper/lcLinkType';
import {
  buildCrrExportSelectOptions,
  CRR_EXPORT_NONE,
  formatCrrExportLabel,
  listCrrExportDestinations,
  normalizeCrrExportStored,
  sanitizeCrrExportValue,
} from '../../helper/crrExport';
import { isDesktopPc } from '../../helper/appPlatform';
import { loadCrrSettingsFromStorage } from '../../helper/crrSettingsModel';
import TextInput from '../TextInput';
import { IonIcon, IonSelect, IonSelectOption, IonToggle } from '@ionic/react';
import Button from '../Buttons/Button';
import { getNewLCIds } from '../../helper/functions';
import useAppData from '../../hooks/useAppData';
import useFunctions from '../../hooks/useFunctions';
import { informationCircleOutline } from 'ionicons/icons';
import NumericKeypadOverlay from '../NumericKeypadOverlay';
import {
  sanitizeDigitsOnly,
  sanitizeLcIds,
  sanitizeSignedDecimal,
  sanitizeUnsignedDecimal,
  type NumericKeypadVariant,
} from '../../helper/numericFieldInput';

const beforeInputDigitsOnly: React.FormEventHandler<HTMLInputElement> = (e) => {
  const ev = e.nativeEvent as InputEvent;
  if (!ev.data || ev.inputType === 'insertFromPaste') return;
  if (!/^\d$/.test(ev.data)) e.preventDefault();
};

const beforeInputSignedDecimal: React.FormEventHandler<HTMLInputElement> = (e) => {
  const ev = e.nativeEvent as InputEvent;
  if (!ev.data || ev.inputType === 'insertFromPaste') return;
  if (/^\d$/.test(ev.data)) return;
  if (ev.data === '.' || ev.data === ',') return;
  if (ev.data === '-' || ev.data === '−') return;
  e.preventDefault();
};

const beforeInputUnsignedDecimal: React.FormEventHandler<HTMLInputElement> = (e) => {
  const ev = e.nativeEvent as InputEvent;
  if (!ev.data || ev.inputType === 'insertFromPaste') return;
  if (/^\d$/.test(ev.data)) return;
  if (ev.data === '.' || ev.data === ',') return;
  e.preventDefault();
};

const beforeInputLcIds: React.FormEventHandler<HTMLInputElement> = (e) => {
  const ev = e.nativeEvent as InputEvent;
  if (!ev.data || ev.inputType === 'insertFromPaste') return;
  if (/^\d$/.test(ev.data)) return;
  if (ev.data === ',' || ev.data === '-') return;
  e.preventDefault();
};

type NumericPadState = {
  field: 'psw' | 'underload' | 'overload' | 'unitList';
  variant: NumericKeypadVariant;
  title: string;
  draft: string;
};

interface NewLCModalProps {
  visible: boolean;
  data: Partial<ILC>;
  onAction: (type: string, lc?: Partial<ILC>) => void;
  onClose: () => void;
}

const NATIVE_NUMERIC_PAD = Capacitor.isNativePlatform();

/** Same chrome as `TextInput` inner wrapper so native tap-targets read as text fields, not plain labels. */
const NATIVE_NUMERIC_FIELD_SHELL =
  'flex w-full flex-row justify-between border border-medium border-gray2 px-3 py-1.5 min-h-[44px] items-center bg-white dark:bg-slate-950';
const NATIVE_NUMERIC_FIELD_TEXT =
  'flex-1 w-full min-w-0 text-left tabular-nums outline-none bg-transparent text-dark dark:text-light text-base font-normal';
const NATIVE_NUMERIC_FIELD_BTN =
  'm-0 w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left rounded-none';

/** Match filled row style on P.S.W / Underload / Overload for plain `TextInput` rows (Name, LC IDs, web numeric fields). */
const TEXT_FIELD_ROW_CHROME = 'min-h-[44px] items-center bg-white dark:bg-slate-950';

const NewLCModal: FC<NewLCModalProps> = (props) => {
  const { visible, data, onAction, onClose } = props;
  const { t } = useTranslation();
  const { f_verify_lc_id } = useFunctions();

  const [lc, setLC] = useState<Partial<ILC>>({
    underload: '-10',
    total_sum: false,
    crr_export: CRR_EXPORT_NONE,
    ...data,
  });
  const [groups, setGroups] = useState<string>('');
  const [visibleGroups, setVisibleGroups] = useState<boolean>(true);
  const [infoPopover, setInfoPopover] = useState<{ text: string; x: number; y: number } | null>(null);
  const [numericPad, setNumericPad] = useState<NumericPadState | null>(null);
  const infoPopoverRef = useRef<HTMLDivElement | null>(null);
  const { isMobile, curProject } = useAppData();
  const refIDInput = useRef<HTMLInputElement>(null);
  const SetvisibleCapacityRef = useRef<boolean>(false);
  const unitKey = useRef(curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg');
  const fxRef = useRef((curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg') === 'mton' ? 3 : 0);
  const lcRef = useRef(lc);

  useEffect(() => {
    unitKey.current = curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg';
  }, [curProject.units]);

  useEffect(() => {
    fxRef.current = (curProject && curProject.units ? curProject.units.replace('.', '').toLowerCase() : 'kg') === 'mton' ? 3 : 0;
  }, [curProject.units]);

  useEffect(() => {
    lcRef.current = lc;
  }, [lc]);

  useEffect(() => {
    if (!visible) {
      setNumericPad(null);
    }
  }, [visible]);

  useEffect(() => {
    setLC((v: any) => ({
      underload: '-10',
      calibration_offset: '1',
      ...data,
      link_type: normalizeLcLinkType(data?.link_type),
      crr_export: normalizeCrrExportStored(data?.crr_export ?? CRR_EXPORT_NONE),
      total_sum: data?.total_sum ?? false,
    }));
    if (data?.groups) {
      setGroups(data.groups);
    } else {
      setGroups('');
    }
  }, [data]);

  useEffect(() => {
    setLC((v) => ({ ...v, groups }));
  }, [groups]);

  useEffect(() => {
    if (!infoPopover) return;
    const handleOutsidePointerDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (infoPopoverRef.current && target && infoPopoverRef.current.contains(target)) return;
      setInfoPopover(null);
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [infoPopover]);

  const openNumericPad = async (
    field: 'psw' | 'underload' | 'overload' | 'unitList',
    variant: NumericKeypadVariant,
    title: string
  ) => {
    try {
      await Keyboard.hide();
    } catch {
      /* native only */
    }
    const raw =
      field === 'psw'
        ? lc.psw
        : field === 'underload'
          ? lc.underload
          : field === 'overload'
            ? lc.overload
            : lc.id
              ? String(lc.id)
              : lc.unitList;
    setNumericPad({
      field,
      variant,
      title,
      draft: raw != null ? String(raw) : '',
    });
  };

  const commitNumericPad = () => {
    if (!numericPad) return;
    handleChangeProject(numericPad.field, numericPad.draft);
    setNumericPad(null);
  };

  const handleChangeProject = (field: string, value: string | boolean | number) => {
    let id_cap: any;
    if (lc.lc_id && field === 'unitList') {
      setLC((v) => ({ ...v, lc_id: value.toString() }));
    } else {
      setLC((v) => ({ ...v, [field]: value }));

      if (field === 'unitList') {
        const idList = getNewLCIds([], value.toString() || '');
        id_cap = f_verify_lc_id(value.toString());
        if (id_cap) {
          SetvisibleCapacityRef.current = true;
        } else SetvisibleCapacityRef.current = false;
        if (idList && idList.length > 0) {
          if (idList.some((item) => parseInt(item, 10) <= 10)) {
            setVisibleGroups(false);
            return;
          }
        }
        setVisibleGroups(true);
      }
      if (SetvisibleCapacityRef.current && id_cap && id_cap.capacity) {
        const capacity = id_cap.capacity;
        setLC({ ...lcRef.current, [field]: value, capacity });
      }
    }
  };

  const crrExportDestCount = useMemo(
    () => listCrrExportDestinations(loadCrrSettingsFromStorage()).length,
    [visible],
  );
  const crrExportOptions = useMemo(
    () => buildCrrExportSelectOptions(loadCrrSettingsFromStorage(), t),
    [t, visible],
  );

  const crrExportValue = useMemo(
    () => sanitizeCrrExportValue(lc.crr_export ?? CRR_EXPORT_NONE, crrExportDestCount).value,
    [crrExportDestCount, lc.crr_export],
  );

  const handleDupllicate = () => {
    const { groups: g, overload, underload, project_id, psw, title, total_sum, link_type, crr_export } = lc;
    setLC({
      groups: g,
      overload,
      underload,
      project_id,
      psw,
      title,
      total_sum,
      link_type: normalizeLcLinkType(link_type),
      crr_export: normalizeCrrExportStored(crr_export),
    });
    refIDInput.current?.focus();
  };

  const handleChangeGroup = (value: string) => {
    const groupList = groups.split(',');
    if (groupList.length > 0) {
      if (groupList.includes(value)) setGroups(groupList.filter((item) => item !== value).sort().join(','));
      else setGroups([...groupList, value].filter((item) => item).sort().join(','));
    } else setGroups(value);
  };

  const formGrid = `grid w-full grid-cols-1 sm:grid-cols-2 gap-3 ${isMobile ? '' : 'sm:gap-4'}`;
  const showFieldInfo = (ev: React.MouseEvent<HTMLButtonElement>, text: string) => {
    ev.preventDefault();
    ev.stopPropagation();
    const rect = ev.currentTarget.getBoundingClientRect();
    const popW = 230;
    const popH = 76;
    const pad = 8;
    const placeRight = rect.right + popW + pad <= window.innerWidth;
    const nextX = placeRight ? rect.right + 8 : rect.left - popW - 8;
    const nextY = Math.min(window.innerHeight - popH - pad, Math.max(pad, rect.top + rect.height / 2 - popH / 2));
    setInfoPopover({
      text,
      x: Math.max(pad, nextX),
      y: nextY,
    });
  };

  const pswLabel = t('Setting.PSW');
  const underLabel = t('Setting.Underload');
  const overLabel = t('Setting.Overload');
  const lcIdsLabel = t('Setting.LcIds');

  return (
    <Modal
      header={lc?.lc_id ? t('Setting.EditLC') : t('Setting.AddLC')}
      visible={visible}
      showFooter={false}
      classes={`w-full max-w-full overflow-hidden ${isMobile ? '' : 'sm:max-w-[650px]'}`}
      contentClasses={formGrid}
      footerClasses="!py-0"
      onClose={() => onClose()}
      footerSlot={
        <div className="flex flex-col gap-3 w-full">
          {lc.lc_id && !Number.isNaN(parseInt(String(lc.lc_id), 10)) && parseInt(String(lc.lc_id), 10) > 10 && (
            <div className="flex flex-wrap justify-end gap-2 w-full">
              <Button
                classes="px-3 py-2 border border-primary rounded min-h-[44px]"
                textClasses="font-medium text-sm"
                title={t('Setting.Calibration')}
                onAction={() => onAction('calibration')}
              />
              <Button
                classes="px-3 py-2 border border-gray-500 dark:border-gray-400 rounded min-h-[44px]"
                textClasses="font-medium text-sm"
                title={t('Setting.DeleteCalibration')}
                onAction={() => onAction('calibration-delete')}
              />
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 w-full">
            <Button
              classes="px-4 py-2 border border-gray-400 dark:border-gray-500 rounded min-h-[44px]"
              textClasses="font-medium text-sm"
              title={t('Common.Cancel')}
              onAction={() => onClose()}
            />
            {lc.lc_id ? (
              <>
                <Button
                  classes="px-4 py-2 bg-gray-500 text-white rounded min-h-[44px]"
                  textClasses="text-white font-medium text-sm"
                  title={t('Common.Duplicate')}
                  onAction={() => handleDupllicate()}
                />
                <Button
                  classes="px-4 py-2 bg-danger text-white rounded min-h-[44px]"
                  textClasses="text-white font-medium text-sm"
                  title={t('Common.Delete')}
                  onAction={() => onAction('delete')}
                />
              </>
            ) : null}
            <Button
              classes="px-5 py-2.5 bg-success text-white rounded min-h-[44px] min-w-[96px]"
              textClasses="text-white font-semibold text-sm"
              title={t('Common.Save')}
              onAction={() => onAction('save', lcRef.current)}
            />
          </div>
        </div>
      }
    >
      <TextInput
        label={t('Setting.Name')}
        value={lc.title || ''}
        inputContainerClasses={TEXT_FIELD_ROW_CHROME}
        onChange={(e) => handleChangeProject('title', e.target.value)}
      />
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <Text label={pswLabel} />
          <button
            type="button"
            className="inline-flex items-center justify-center bg-transparent border-none p-0 m-0 cursor-pointer"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => showFieldInfo(e, 'Explanation of P.S.W pending to be added')}
          >
            <IonIcon icon={informationCircleOutline} className="text-primary text-lg" />
          </button>
        </div>
        {NATIVE_NUMERIC_PAD ? (
          <button type="button" className={NATIVE_NUMERIC_FIELD_BTN} onClick={() => openNumericPad('psw', 'unsigned-decimal', pswLabel)}>
            <div className={NATIVE_NUMERIC_FIELD_SHELL}>
              <span className={NATIVE_NUMERIC_FIELD_TEXT}>
                {lc.psw != null && lc.psw !== '' ? String(lc.psw) : <span className="text-slate-400 dark:text-slate-500">—</span>}
              </span>
            </div>
          </button>
        ) : (
          <TextInput
            enableLabel={false}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            value={lc.psw || ''}
            inputClasses="w-full"
            inputContainerClasses={TEXT_FIELD_ROW_CHROME}
            onBeforeInput={beforeInputDigitsOnly}
            onChange={(e) => handleChangeProject('psw', sanitizeDigitsOnly(e.target.value))}
          />
        )}
      </div>
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <Text label={underLabel} />
          <button
            type="button"
            className="inline-flex items-center justify-center bg-transparent border-none p-0 m-0 cursor-pointer"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => showFieldInfo(e, 'Explanation of Underload pending to be added')}
          >
            <IonIcon icon={informationCircleOutline} className="text-primary text-lg" />
          </button>
        </div>
        {NATIVE_NUMERIC_PAD ? (
          <button type="button" className={NATIVE_NUMERIC_FIELD_BTN} onClick={() => openNumericPad('underload', 'signed-decimal', underLabel)}>
            <div className={NATIVE_NUMERIC_FIELD_SHELL}>
              <span className={NATIVE_NUMERIC_FIELD_TEXT}>
                {lc.underload != null && lc.underload !== '' ? String(lc.underload) : <span className="text-slate-400 dark:text-slate-500">—</span>}
              </span>
            </div>
          </button>
        ) : (
          <TextInput
            enableLabel={false}
            type="text"
            inputMode="decimal"
            pattern="[-0-9.,]*"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            inputClasses="w-full"
            inputContainerClasses={TEXT_FIELD_ROW_CHROME}
            value={lc.underload || ''}
            onBeforeInput={beforeInputSignedDecimal}
            onChange={(e) => handleChangeProject('underload', sanitizeSignedDecimal(e.target.value))}
          />
        )}
      </div>
      <div>
        <div className="mb-1 flex items-center gap-1.5">
          <Text label={overLabel} />
          <button
            type="button"
            className="inline-flex items-center justify-center bg-transparent border-none p-0 m-0 cursor-pointer"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => showFieldInfo(e, 'Explanation of Overload pending to be added')}
          >
            <IonIcon icon={informationCircleOutline} className="text-primary text-lg" />
          </button>
        </div>
        {NATIVE_NUMERIC_PAD ? (
          <button type="button" className={NATIVE_NUMERIC_FIELD_BTN} onClick={() => openNumericPad('overload', 'unsigned-decimal', overLabel)}>
            <div className={NATIVE_NUMERIC_FIELD_SHELL}>
              <span className={NATIVE_NUMERIC_FIELD_TEXT}>
                {lc.overload != null && lc.overload !== '' ? String(lc.overload) : <span className="text-slate-400 dark:text-slate-500">—</span>}
              </span>
            </div>
          </button>
        ) : (
          <TextInput
            enableLabel={false}
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            value={lc.overload || ''}
            inputClasses="w-full"
            inputContainerClasses={TEXT_FIELD_ROW_CHROME}
            onBeforeInput={beforeInputUnsignedDecimal}
            onChange={(e) => handleChangeProject('overload', sanitizeUnsignedDecimal(e.target.value))}
          />
        )}
      </div>
      <div>
        <Text label={t('Setting.LinkType')} />
        <IonSelect
          interface="popover"
          className={`w-full ${TEXT_FIELD_ROW_CHROME} border border-medium border-gray2 rounded-none`}
          value={normalizeLcLinkType(lc.link_type)}
          onIonChange={(e) => handleChangeProject('link_type', e.detail.value as LcLinkType)}
        >
          <IonSelectOption value="rf">{t('Setting.LinkTypeRf')}</IonSelectOption>
          <IonSelectOption value="rs485">{t('Setting.LinkTypeRs485')}</IonSelectOption>
        </IonSelect>
      </div>
      {isDesktopPc() ? (
        <div>
          <Text label={t('Setting.CrrExport')} />
          <IonSelect
            interface="popover"
            className={`w-full ${TEXT_FIELD_ROW_CHROME} border border-medium border-gray2 rounded-none`}
            value={crrExportValue}
            onIonChange={(e) => handleChangeProject('crr_export', Number(e.detail.value))}
          >
            {crrExportOptions.map((opt) => (
              <IonSelectOption key={`crr-export-${opt.value}`} value={opt.value}>
                {opt.label}
              </IonSelectOption>
            ))}
          </IonSelect>
        </div>
      ) : null}
      <div className="col-span-1 sm:col-span-2 flex flex-row items-center gap-3 py-1">
        <IonToggle enableOnOffLabels={true} checked={lc.total_sum || false} onIonChange={(e) => handleChangeProject('total_sum', e.detail.checked)} />
        <Text label={t('Setting.TotalSum')} />
        <button
          type="button"
          className="inline-flex items-center justify-center bg-transparent border-none p-0 m-0 cursor-pointer"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => showFieldInfo(e, 'Explanation of Total Sum pending to be added')}
        >
          <IonIcon icon={informationCircleOutline} className="text-primary text-lg" />
        </button>
      </div>

      {SetvisibleCapacityRef.current === true && (
        <TextInput
          label={`${t('Setting.Capacity')}`}
          type="text"
          value={lc.capacity && unitKey.current in lc.capacity ? parseFloat(lc.capacity[unitKey.current]).toFixed(fxRef.current) : '0.00'}
          readOnly
          inputContainerClasses={TEXT_FIELD_ROW_CHROME}
        />
      )}

      <div className="col-span-1 sm:col-span-2 space-y-1">
        {NATIVE_NUMERIC_PAD && !lc.lc_id ? (
          <div className="gap-3 flex flex-col w-full">
            <Text type="dark" label={lcIdsLabel} />
            <button type="button" className={NATIVE_NUMERIC_FIELD_BTN} onClick={() => openNumericPad('unitList', 'lc-ids', lcIdsLabel)}>
              <div className={NATIVE_NUMERIC_FIELD_SHELL}>
                <span className={NATIVE_NUMERIC_FIELD_TEXT}>
                  {(lc.unitList || '').trim() !== '' ? String(lc.unitList) : <span className="text-slate-400 dark:text-slate-500">—</span>}
                </span>
              </div>
            </button>
          </div>
        ) : (
          <TextInput
            inputRef={refIDInput}
            classes="w-full"
            label={lcIdsLabel}
            value={lc.id ? lc.id : lc.unitList || ''}
            readOnly={!!lc.lc_id}
            inputContainerClasses={TEXT_FIELD_ROW_CHROME}
            onBeforeInput={!lc.lc_id ? beforeInputLcIds : undefined}
            onChange={(e) => handleChangeProject('unitList', sanitizeLcIds(e.target.value))}
          />
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug px-0.5">{t('Setting.LcIdsHint')}</p>
      </div>
      <div className="col-span-1 sm:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-3 pt-1">
        {visibleGroups &&
          Array(16)
            .fill(0)
            .map((_item, index) => (
              <div
                key={index}
                className="flex flex-row items-center gap-2 min-h-[40px]"
                onClick={() => handleChangeGroup((index + 1).toString())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleChangeGroup((index + 1).toString());
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <IonToggle enableOnOffLabels={true} checked={groups.split(',').includes((index + 1).toString())} />
                <Text label={`${t('Setting.Group')} ${index + 1}`} />
              </div>
            ))}
      </div>
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
      {infoPopover &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={infoPopoverRef}
            className="fixed z-[99999] w-[230px] rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs leading-snug text-slate-700 dark:text-slate-100 shadow-lg"
            style={{ left: `${infoPopover.x}px`, top: `${infoPopover.y}px` }}
          >
            {infoPopover.text}
          </div>,
          document.body
        )}
    </Modal>
  );
};

export default NewLCModal;
