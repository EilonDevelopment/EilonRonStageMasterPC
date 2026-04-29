import React, { FC, useEffect, useMemo, useState } from 'react';
import { IonToggle } from '@ionic/react';
import Modal from './Modal';
import Text from '../Text';
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

      <div className="col-span-1 sm:col-span-2 flex items-center gap-2">
        <IonToggle checked={overrides.title} onIonChange={(e) => setOverride('title', e.detail.checked)} />
        <Text label="Override all: Name" />
      </div>
      <TextInput label="Name" value={values.title} readOnly={!overrides.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} />

      <div className="col-span-1 sm:col-span-2 flex items-center gap-2">
        <IonToggle checked={overrides.psw} onIonChange={(e) => setOverride('psw', e.detail.checked)} />
        <Text label="Override all: PSW" />
      </div>
      <TextInput label="PSW" type="number" value={values.psw} readOnly={!overrides.psw} onChange={(e) => setValues((v) => ({ ...v, psw: e.target.value }))} />

      <div className="col-span-1 sm:col-span-2 flex items-center gap-2">
        <IonToggle checked={overrides.underload} onIonChange={(e) => setOverride('underload', e.detail.checked)} />
        <Text label="Override all: Underload" />
      </div>
      <TextInput label="Underload" type="number" value={values.underload} readOnly={!overrides.underload} onChange={(e) => setValues((v) => ({ ...v, underload: e.target.value }))} />

      <div className="col-span-1 sm:col-span-2 flex items-center gap-2">
        <IonToggle checked={overrides.overload} onIonChange={(e) => setOverride('overload', e.detail.checked)} />
        <Text label="Override all: Overload" />
      </div>
      <TextInput label="Overload" type="number" value={values.overload} readOnly={!overrides.overload} onChange={(e) => setValues((v) => ({ ...v, overload: e.target.value }))} />

      <div className="col-span-1 sm:col-span-2 flex items-center gap-2">
        <IonToggle checked={overrides.total_sum} onIonChange={(e) => setOverride('total_sum', e.detail.checked)} />
        <Text label="Override all: Total Sum" />
      </div>
      <div className="col-span-1 sm:col-span-2 flex items-center gap-2">
        <IonToggle checked={values.total_sum} disabled={!overrides.total_sum} onIonChange={(e) => setValues((v) => ({ ...v, total_sum: e.detail.checked }))} />
        <Text label="Total Sum value" />
      </div>

      <div className="col-span-1 sm:col-span-2 flex items-center gap-2">
        <IonToggle checked={overrides.groups} onIonChange={(e) => setOverride('groups', e.detail.checked)} />
        <Text label="Override all: Groups" />
      </div>
      <div className="col-span-1 sm:col-span-2">
        <TextInput
          label="Groups (comma separated)"
          value={values.groups}
          readOnly={!overrides.groups}
          onChange={(e) => setValues((v) => ({ ...v, groups: e.target.value }))}
        />
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

