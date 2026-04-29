import React, { FC, useEffect, useMemo, useState } from 'react';
import { IonToggle } from '@ionic/react';
import Modal from './Modal';
import TextInput from '../TextInput';

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
      ? 'bg-transparent border-medium'
      : 'bg-gray-100/80 dark:bg-gray-700/40 border-gray-400 dark:border-gray-600',
    inputClasses: enabled ? 'text-dark dark:text-light' : 'text-gray-500 dark:text-gray-400',
  });

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
        <TextInput
          label="LC IDs / ranges"
          value={values.idsInput}
          onChange={(e) => setValues((v) => ({ ...v, idsInput: e.target.value }))}
        />
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
          return (
        <TextInput
          label="PSW"
          type="number"
          value={values.psw}
          readOnly={!overrides.psw}
          labelClasses={f.labelClasses}
          inputContainerClasses={f.inputContainerClasses}
          inputClasses={f.inputClasses}
          onChange={(e) => setValues((v) => ({ ...v, psw: e.target.value }))}
        />
          );
        })()}
        {overrideSwitchBlock(overrides.psw, (checked) => setOverride('psw', checked))}
      </div>

      <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-2 sm:gap-3 items-end">
        {(() => {
          const f = fieldVisualState(overrides.underload);
          return (
        <TextInput
          label="Underload"
          type="number"
          value={values.underload}
          readOnly={!overrides.underload}
          labelClasses={f.labelClasses}
          inputContainerClasses={f.inputContainerClasses}
          inputClasses={f.inputClasses}
          onChange={(e) => setValues((v) => ({ ...v, underload: e.target.value }))}
        />
          );
        })()}
        {overrideSwitchBlock(overrides.underload, (checked) => setOverride('underload', checked))}
      </div>

      <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px] gap-2 sm:gap-3 items-end">
        {(() => {
          const f = fieldVisualState(overrides.overload);
          return (
        <TextInput
          label="Overload"
          type="number"
          value={values.overload}
          readOnly={!overrides.overload}
          labelClasses={f.labelClasses}
          inputContainerClasses={f.inputContainerClasses}
          inputClasses={f.inputClasses}
          onChange={(e) => setValues((v) => ({ ...v, overload: e.target.value }))}
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
          return (
        <TextInput
          label="Groups (comma separated)"
          value={values.groups}
          readOnly={!overrides.groups}
          labelClasses={f.labelClasses}
          inputContainerClasses={f.inputContainerClasses}
          inputClasses={f.inputClasses}
          onChange={(e) => setValues((v) => ({ ...v, groups: e.target.value }))}
        />
          );
        })()}
        {overrideSwitchBlock(overrides.groups, (checked) => setOverride('groups', checked))}
      </div>

      {localError ? (
        <div className="col-span-1 sm:col-span-2">
          <p className="text-sm text-danger">{localError}</p>
        </div>
      ) : null}
    </Modal>
  );
};

export default BulkEditLCModal;

