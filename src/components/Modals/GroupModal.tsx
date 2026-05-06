import React, { ChangeEvent, FC, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import Modal from './Modal';
import { useTranslation } from 'react-i18next';
import TextInput from '../TextInput';
import { IGroup } from '../../helper/types';
import { IonIcon } from '@ionic/react';
import { alertCircleOutline } from 'ionicons/icons';
import Text from '../Text';
import useAppData from '../../hooks/useAppData';
import NumericKeypadOverlay from '../NumericKeypadOverlay';
import { sanitizeUnsignedDecimal, type NumericKeypadVariant } from '../../helper/numericFieldInput';

interface GroupModalProps {
  visible: boolean;
  data: IGroup | null;
  errMsg?: string;
  onAction: (info: IGroup) => void;
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

const beforeInputUnsignedDecimal: React.FormEventHandler<HTMLInputElement> = (e) => {
  const ev = e.nativeEvent as InputEvent;
  if (!ev.data || ev.inputType === 'insertFromPaste') return;
  if (/^\d$/.test(ev.data)) return;
  if (ev.data === '.' || ev.data === ',') return;
  e.preventDefault();
};

type OverloadPadState = {
  variant: NumericKeypadVariant;
  title: string;
  draft: string;
};

const GroupModal: FC<GroupModalProps> = (props) => {
  const { visible, data, errMsg = '', onAction, onClose } = props;
  const { t } = useTranslation();

  const [info, setInfo] = useState<IGroup>({} as IGroup);
  const { isMobile } = useAppData();
  const [overloadPad, setOverloadPad] = useState<OverloadPadState | null>(null);

  useEffect(() => {
    if (data) setInfo(data);
  }, [data]);

  useEffect(() => {
    if (!visible) setOverloadPad(null);
  }, [visible]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInfo((v) => ({ ...v, [e.target.name]: e.target.value }));
  };

  const overloadLabel = t('Setting.Overload');

  const openOverloadPad = async () => {
    try {
      await Keyboard.hide();
    } catch {
      /* noop */
    }
    const raw = info.overload;
    setOverloadPad({
      variant: 'unsigned-decimal',
      title: overloadLabel,
      draft: raw != null && String(raw).trim() !== '' ? String(raw) : '',
    });
  };

  const commitOverloadPad = () => {
    if (!overloadPad) return;
    setInfo((v) => ({ ...v, overload: sanitizeUnsignedDecimal(overloadPad.draft) }));
    setOverloadPad(null);
  };

  return (
    <Modal
      header={`${t('Setting.Group')} ${info.id}`}
      visible={visible}
      classes={`${isMobile ? 'w-80' : 'w-96'} `}
      contentClasses={`${isMobile ? '' : 'px-6'}`}
      okTitle={t('Common.Okay')}
      footerClasses={`${isMobile ? '' : 'px-6 py-2'}`}
      cancelTitle={t('Common.Cancel')}
      onAction={() => onAction(info)}
      onClose={() => onClose()}
    >
      <div className={`flex flex-col gap-2 ${isMobile ? 'my-4' : ''}`}>
        <TextInput name="title" value={info.title} label={t('Setting.GroupName')} onChange={(e) => handleChange(e)} />
        {NATIVE_NUMERIC_PAD ? (
          <div className="gap-3 flex flex-col w-full">
            <Text type="dark" label={overloadLabel} />
            <button type="button" className={NATIVE_NUMERIC_FIELD_BTN} onClick={openOverloadPad}>
              <div className={NATIVE_NUMERIC_FIELD_SHELL}>
                <span className={NATIVE_NUMERIC_FIELD_TEXT}>
                  {info.overload != null && String(info.overload).trim() !== '' ? (
                    String(info.overload)
                  ) : (
                    <span className="text-slate-400 dark:text-slate-500">—</span>
                  )}
                </span>
              </div>
            </button>
          </div>
        ) : (
          <TextInput
            name="overload"
            type="text"
            inputMode="decimal"
            pattern="[0-9.,]*"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="done"
            value={info.overload ?? ''}
            label={overloadLabel}
            inputContainerClasses={TEXT_FIELD_ROW_CHROME}
            onBeforeInput={beforeInputUnsignedDecimal}
            onChange={(e) =>
              setInfo((v) => ({ ...v, overload: sanitizeUnsignedDecimal(e.target.value) }))
            }
          />
        )}
        {errMsg && (
          <div className="flex flex-row items-center justify-center bg-red-100 py-2 gap-2 dark:bg-dark">
            <IonIcon color="danger" icon={alertCircleOutline} className="text-2xl" />
            <Text label={errMsg} />
          </div>
        )}
      </div>
      {overloadPad && (
        <NumericKeypadOverlay
          open
          title={overloadPad.title}
          value={overloadPad.draft}
          variant={overloadPad.variant}
          onChange={(next) => setOverloadPad((p) => (p ? { ...p, draft: next } : null))}
          onDone={commitOverloadPad}
          onCancel={() => setOverloadPad(null)}
        />
      )}
    </Modal>
  );
};

export default GroupModal;
