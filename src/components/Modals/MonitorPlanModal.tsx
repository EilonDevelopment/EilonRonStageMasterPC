import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import { IonToggle } from '@ionic/react';
import Modal from './Modal';
import Text from '../Text';

type GroupOption = { id: string; title: string };

interface MonitorPlanModalProps {
  visible: boolean;
  mode: 'create' | 'edit';
  title: string;
  defaultName: string;
  groups: GroupOption[];
  selectedGroupIds: string[];
  onClose: () => void;
  onSave: (payload: { name: string; includedGroupIds: string[] }) => void;
}

const MonitorPlanModal: FC<MonitorPlanModalProps> = ({
  visible,
  mode,
  title,
  defaultName,
  groups,
  selectedGroupIds,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState(defaultName);
  const [groupIds, setGroupIds] = useState<string[]>(selectedGroupIds);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    // Only initialize form values when modal transitions closed -> open.
    if (visible && !wasVisibleRef.current) {
      setName(defaultName);
      setGroupIds(selectedGroupIds);
    }
    wasVisibleRef.current = visible;
  }, [visible, defaultName, selectedGroupIds]);

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => Number(a.id || 0) - Number(b.id || 0)),
    [groups]
  );

  const toggleGroup = (gid: string) => {
    setGroupIds((prev) => (prev.includes(gid) ? prev.filter((x) => x !== gid) : [...prev, gid]));
  };

  const handleSave = () => {
    onSave({
      name: String(name || '').trim(),
      includedGroupIds: Array.from(new Set(groupIds.map((g) => String(g).trim()).filter(Boolean))).sort(
        (a, b) => Number(a) - Number(b)
      ),
    });
  };

  return (
    <Modal
      header={title}
      visible={visible}
      classes="w-full max-w-full sm:max-w-[620px]"
      contentClasses="grid grid-cols-1 gap-3 sm:gap-4"
      showFooter={false}
      footerSlot={
        <div className="flex w-full justify-end gap-2">
          <button className="px-4 py-2 border border-gray-500 rounded" onClick={onClose}>Cancel</button>
          <button className="px-4 py-2 bg-primary text-white rounded" onClick={handleSave}>Save</button>
        </div>
      }
      onClose={onClose}
      onAction={handleSave}
    >
      <div className="flex flex-col gap-1">
        <Text label="Plan Name" />
        <input
          className="w-full border border-gray-400 rounded px-3 py-2 bg-transparent text-dark dark:text-light"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={mode === 'create' ? 'Plan name' : ''}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Text label="Groups to include" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {sortedGroups.map((g) => (
            <label key={g.id} className="flex items-center gap-2 cursor-pointer">
              <IonToggle
                checked={groupIds.includes(String(g.id))}
                onIonChange={() => toggleGroup(String(g.id))}
              />
              <span className="text-sm text-dark dark:text-light">{g.title || `Grp ${g.id}`}</span>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default MonitorPlanModal;

