import React, { FC, useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { IonToggle } from '@ionic/react';
import Modal from './Modal';
import Text from '../Text';
import TextInput from '../TextInput';
import NumericKeypadOverlay from '../NumericKeypadOverlay';
import {
  sanitizeCommaDigits,
  sanitizeDigitsOnly,
  sanitizeLcIds,
  sanitizeSignedDecimal,
  sanitizeUnsignedDecimal,
  type NumericKeypadVariant,
} from '../../helper/numericFieldInput';

type OverrideFlags = {
  title: boolean;
  psw: boolean;
  underload: boolean;
  overload: boolean;
  total_sum: boolean;
  groups: boolean;
};

type BulkValues = {
  idsInput: string;
  title: string;
  psw: string;
  underload: string;
  overload: string;
  total_sum: boolean;
  groups: string;
};

export type BulkEditLcPayload = {
  ids: string[];
  overrides: OverrideFlags;
  values: BulkValues;
};

interface BulkEditLCModalProps {
  visible: boolean;
  initialIds?: string[];
  onAction: (type: 'save', payload: BulkEditLcPayload) => void;
  onClose: () => void;
}

const parseIdsInput = (input: string): { ok: boolean; ids: string[]; error?: string } => {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, ids: [], error: 'Enter one or more LC IDs/ranges.' };
  const tokens = raw.split(',').map((t) => t.trim()).filter(Boolean);
  const out: number[] = [];
  for (const token of tokens) {
    if (token.includes('-')) {
      const [aRaw, bRaw] = token.split('-').map((v) => v.trim());
      const a = Number(aRaw);
      const b = Number(bRaw);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > b) {
        return { ok: false, ids: [], error: `Invalid range "${token}".` };
      }
      for (let n = a; n <= b; n += 1) out.push(n);
    } else {
      const n = Number(token);
      if (!Number.isInteger(n) || n < 0) {
        return { ok: false, ids: [], error: `Invalid ID "${token}".` };
      }
      out.push(n);
    }
  }
  const deduped = Array.from(new Set(out)).sort((a, b) => a - b).map(String);
  return { ok: deduped.length > 0, ids: deduped, error: deduped.length > 0 ? undefined : 'No valid IDs found.' };
};

const NATIVE_NUMERIC_PAD = Capacitor.isNativePlatform();

const NATIVE_NUMERIC_FIELD_SHELL =
  'flex w-full flex-row justify-between border border-medium border-gray2 px-3 py-1.5 min-h-[44px] items-center bg-white dark:bg-slate-950';
const NATIVE_NUMERIC_FIELD_TEXT =
  'flex-1 w-full min-w-0 text-left tabular-nums outline-none bg-transparent text-dark dark:text-light text-base font-normal';
const NATIVE_NUMERIC_FIELD_BTN =
  'm-0 w-full cursor-pointer appearance-none border-0 bg-transparent p-0 text-left rounded-none';

const TEXT_FIELD_ROW_CHROME = 'min-h-[44px] items-center bg-white dark:bg-slate-950';

type BulkNumericPadField = 'idsInput' | 'psw' | 'underload' | 'overload' | 'groups';

type NumericPadState = {
  field: BulkNumericPadField;
  variant: NumericKeypadVariant;
  title: string;
  draft: string;
};

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

const beforeInputCommaDigits: React.FormEventHandler<HTMLInputElement> = (e) => {
  const ev = e.nativeEvent as InputEvent;
  if (!ev.data || ev.inputType === 'insertFromPaste') return;
  if (/^\d$/.test(ev.data)) return;
  if (ev.data === ',') return;
  e.preventDefault();
};

const BulkEditLCModal: FC<BulkEditLCModalProps> = ({ visible, initialIds = [], onAction, onClose }) => {
  const [overrides, setOverrides] = useState<OverrideFlags>({
    title: false,
    psw: false,
    underload: false,
    overload: false,
    total_sum: false,
    groups: false,
  });
  const [values, setValues] = useState<BulkValues>({
    idsInput: '',
    title: '',
    psw: '',
    underload: '',
    overload: '',
    total_sum: false,
    groups: '',
  });
  const [localError, setLocalError] = useState('');
  const [numericPad, setNumericPad] = useState<NumericPadState | null>(null);

  useEffect(() => {
    if (!visible) {
      setNumericPad(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setOverrides({
      title: false,
      psw: false,
      underload: false,
      overload: false,
      total_sum: false,
      groups: false,
    });
    setValues({
      idsInput: Array.from(new Set((initialIds || []).map((id) => String(id).trim()).filter(Boolean))).join(','),
      title: '',
      psw: '',
      underload: '',
      overload: '',
      total_sum: false,
      groups: '',
    });
    setLocalError('');
  }, [initialIds, visible]);

  const anyOverride = useMemo(() => Object.values(overrides).some(Boolean), [overrides]);

  const setOverride = (key: keyof OverrideFlags, checked: boolean) => {
    setOverrides((prev) => ({ ...prev, [key]: checked }));
  };

  const openNumericPad = async (field: BulkNumericPadField, variant: NumericKeypadVariant, title: string) => {
    try {
      await Keyboard.hide();
    } catch {
      /* noop */
    }
    const raw = values[field];
    setNumericPad({
      field,
      variant,
      title,
      draft: raw != null ? String(raw) : '',
    });
  };

  const commitNumericPad = () => {
    if (!numericPad) return;
    setValues((v) => ({ ...v, [numericPad.field]: numericPad.draft }));
    setNumericPad(null);
  };

  const save = () => {
    const parsed = parseIdsInput(values.idsInput);
    if (!parsed.ok) {
      setLocalError(parsed.error || 'Invalid IDs input.');
      return;
    }
    if (!anyOverride) {
      setLocalError('Select at least one "override all" field.');
      return;
    }
    setLocalError('');
    onAction('save', { ids: parsed.ids, overrides, values });
  };

  const overrideSwitchBlock = (checked: boolean, onChange: (value: boolean) => void) => (
    <div className="flex flex-col items-center justify-center min-w-[112px]">
      <div className="mb-1 h-[14px]" />
      <IonToggle checked={checked} onIonChange={(e) => onChange(e.detail.checked)} />
    </div>
  );

  const fieldVisualState = (enabled: boolean) => ({
    labelClasses: enabled ? '!text-white' : '!text-gray-500 dark:!text-gray-500',
    inputContainerClasses: enabled
      ? TEXT_FIELD_ROW_CHROME
      : 'min-h-[44px] items-center bg-gray-100/80 dark:bg-gray-700/40 border-gray-400 dark:border-gray-600',
    inputClasses: enabled ? 'text-dark dark:text-light' : 'text-gray-500 dark:text-gray-400',
  });

  const renderNativeNumericShell = (display: React.ReactNode, onOpen: () => void) => (
    <button type="button" className={NATIVE_NUMERIC_FIELD_BTN} onClick={onOpen}>
      <div className={NATIVE_NUMERIC_FIELD_SHELL}>
        <span className={NATIVE_NUMERIC_FIELD_TEXT}>{display}</span>
      </div>
    </button>
  );

  return (
    <Modal
      header="Edit LC"
      visible={visible}
      classes="w-full max-w-full sm:max-w-[760px]"
      contentClasses="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"
      okTitle="Save"
      cancelTitle="Cancel"
      onAction={save}
      onClose={onClose}
    >
      <div className="col-span-1 sm:col-span-2">
        {NATIVE_NUMERIC_PAD ? (
          <div className="gap-3 flex flex-col w-full">
            <Text type="dark" label="LC IDs / ranges" />
            {renderNativeNumericShell(
              (values.idsInput || '').trim() !== '' ? values.idsInput : <span className="text-slate-400 dark:text-slate-500">—</span>,
              () => openNumericPad('idsInput', 'lc-ids', 'LC IDs / ranges')
            )}
          </div>
        ) : (
          <TextInput
            label="LC IDs / ranges"
            value={values.idsInput}
            inputContainerClasses={TEXT_FIELD_ROW_CHROME}
            onBeforeInput={beforeInputLcIds}
            onChange={(e) => setValues((v) => ({ ...v, idsInput: sanitizeLcIds(e.target.value) }))}
          />
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Example: 10-15,18,0,25-46</p>
      </div>

      <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-2 sm:gap-3 items-end">
        {(() => {
          const f = fieldVisualState(overrides.title);
          return (
            <TextInput
              label="Name"
              value={values.title}
              readOnly={!overrides.title}
              labelClasses={f.labelClasses}
              inputContainerClasses={f.inputContainerClasses}
              inputClasses={f.inputClasses}
              onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
            />
          );
        })()}
        {overrideSwitchBlock(overrides.title, (checked) => setOverride('title', checked))}
      </div>

      <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-2 sm:gap-3 items-end">
        {(() => {
          const f = fieldVisualState(overrides.psw);
          return NATIVE_NUMERIC_PAD && overrides.psw ? (
            <div className="gap-3 flex flex-col w-full min-w-0">
              <Text type="dark" label="PSW" />
              {renderNativeNumericShell(
                values.psw != null && String(values.psw).trim() !== '' ? String(values.psw) : <span className="text-slate-400 dark:text-slate-500">—</span>,
                () => openNumericPad('psw', 'unsigned-decimal', 'PSW')
              )}
            </div>
          ) : (
            <TextInput
              label="PSW"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={values.psw}
              readOnly={!overrides.psw}
              labelClasses={f.labelClasses}
              inputContainerClasses={f.inputContainerClasses}
              inputClasses={f.inputClasses}
              onBeforeInput={overrides.psw ? beforeInputDigitsOnly : undefined}
              onChange={(e) =>
                setValues((v) => ({ ...v, psw: overrides.psw ? sanitizeDigitsOnly(e.target.value) : v.psw }))
              }
            />
          );
        })()}
        {overrideSwitchBlock(overrides.psw, (checked) => setOverride('psw', checked))}
      </div>

      <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-2 sm:gap-3 items-end">
        {(() => {
          const f = fieldVisualState(overrides.underload);
          return NATIVE_NUMERIC_PAD && overrides.underload ? (
            <div className="gap-3 flex flex-col w-full min-w-0">
              <Text type="dark" label="Underload" />
              {renderNativeNumericShell(
                values.underload != null && String(values.underload).trim() !== '' ? String(values.underload) : <span className="text-slate-400 dark:text-slate-500">—</span>,
                () => openNumericPad('underload', 'signed-decimal', 'Underload')
              )}
            </div>
          ) : (
            <TextInput
              label="Underload"
              type="text"
              inputMode="decimal"
              value={values.underload}
              readOnly={!overrides.underload}
              labelClasses={f.labelClasses}
              inputContainerClasses={f.inputContainerClasses}
              inputClasses={f.inputClasses}
              onBeforeInput={overrides.underload ? beforeInputSignedDecimal : undefined}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  underload: overrides.underload ? sanitizeSignedDecimal(e.target.value) : v.underload,
                }))
              }
            />
          );
        })()}
        {overrideSwitchBlock(overrides.underload, (checked) => setOverride('underload', checked))}
      </div>

      <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-2 sm:gap-3 items-end">
        {(() => {
          const f = fieldVisualState(overrides.overload);
          return NATIVE_NUMERIC_PAD && overrides.overload ? (
            <div className="gap-3 flex flex-col w-full min-w-0">
              <Text type="dark" label="Overload" />
              {renderNativeNumericShell(
                values.overload != null && String(values.overload).trim() !== '' ? String(values.overload) : <span className="text-slate-400 dark:text-slate-500">—</span>,
                () => openNumericPad('overload', 'unsigned-decimal', 'Overload')
              )}
            </div>
          ) : (
            <TextInput
              label="Overload"
              type="text"
              inputMode="decimal"
              value={values.overload}
              readOnly={!overrides.overload}
              labelClasses={f.labelClasses}
              inputContainerClasses={f.inputContainerClasses}
              inputClasses={f.inputClasses}
              onBeforeInput={overrides.overload ? beforeInputUnsignedDecimal : undefined}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  overload: overrides.overload ? sanitizeUnsignedDecimal(e.target.value) : v.overload,
                }))
              }
            />
          );
        })()}
        {overrideSwitchBlock(overrides.overload, (checked) => setOverride('overload', checked))}
      </div>

      <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-2 sm:gap-3 items-end">
        <div
          className={`flex items-center justify-between rounded border px-3 py-2 min-h-[42px] ${
            overrides.total_sum
              ? 'border-medium bg-light dark:bg-black/10'
              : 'border-gray-400 dark:border-gray-600 bg-gray-100/80 dark:bg-gray-700/40'
          }`}
        >
          <span className={`text-sm ${overrides.total_sum ? 'text-dark dark:text-light' : 'text-gray-500 dark:text-gray-400'}`}>Total Sum value</span>
          <IonToggle
            checked={values.total_sum}
            disabled={!overrides.total_sum}
            onIonChange={(e) => setValues((v) => ({ ...v, total_sum: e.detail.checked }))}
          />
        </div>
        {overrideSwitchBlock(overrides.total_sum, (checked) => setOverride('total_sum', checked))}
      </div>

      <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-2 sm:gap-3 items-end">
        {(() => {
          const f = fieldVisualState(overrides.groups);
          return NATIVE_NUMERIC_PAD && overrides.groups ? (
            <div className="gap-3 flex flex-col w-full min-w-0">
              <Text type="dark" label="Groups (comma separated)" />
              {renderNativeNumericShell(
                values.groups != null && String(values.groups).trim() !== '' ? String(values.groups) : <span className="text-slate-400 dark:text-slate-500">—</span>,
                () => openNumericPad('groups', 'digits-comma', 'Groups')
              )}
            </div>
          ) : (
            <TextInput
              label="Groups (comma separated)"
              value={values.groups}
              readOnly={!overrides.groups}
              labelClasses={f.labelClasses}
              inputContainerClasses={f.inputContainerClasses}
              inputClasses={f.inputClasses}
              onBeforeInput={overrides.groups ? beforeInputCommaDigits : undefined}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  groups: overrides.groups ? sanitizeCommaDigits(e.target.value) : v.groups,
                }))
              }
            />
          );
        })()}
        {overrideSwitchBlock(overrides.groups, (checked) => setOverride('groups', checked))}
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

      {localError ? (
        <div className="col-span-1 sm:col-span-2">
          <p className="text-sm text-danger">{localError}</p>
        </div>
      ) : null}
    </Modal>
  );
};

export default BulkEditLCModal;
