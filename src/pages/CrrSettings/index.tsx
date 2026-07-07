import React, { useCallback, useMemo, useState } from 'react';
import {
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonCheckbox,
  IonInput,
  IonItem,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
} from '@ionic/react';
import { saveOutline, refreshOutline } from 'ionicons/icons';
import { IonIcon } from '@ionic/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import CommonLayout from '../../Layout/CommonLayout';
import { isDesktopPc } from '../../helper/appPlatform';
import {
  CC1101_REGISTER_NAMES,
  CRR_REGISTER_COLUMN_COUNT,
  RF_BAUD_RATE_OPTIONS,
  RF_COLUMN_LABELS,
  RF_MODULE_TYPE_OPTIONS,
  channelToFrequencyMhz,
  loadCrrSettingsFromStorage,
  resetCrrSettingsToTemplate,
  saveCrrSettingsToStorage,
  formatCrrSerialDecimal,
  parseCrrSerialDecimal,
  CRR_DEFAULT_SERIAL,
  type CrrBaudRate,
  type CrrModuleType,
  type CrrSettingsConfig,
  type RfSlotConfig,
} from '../../helper/crrSettingsModel';
import { CRR_CC24_TEMPLATES_BY_BAUD } from '../../helper/crrRfTemplates';
import { getVerifiedCrrPort, sendLabviewSaveToCrr } from '../../helper/crrUsbService';
import useAppData from '../../hooks/useAppData';
import './index.css';

type TabId = 'rf' | 'registers' | 'options';

const CC24_TYPES = new Set<CrrModuleType>(['CC24', 'SLAVE_CC24', 'SP_CC24']);

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.floor(n)));
}

function parseHexByte(text: string): number {
  const t = text.trim().replace(/^0x/i, '');
  if (!t) return 0;
  const n = Number.parseInt(t, 16);
  return clampByte(Number.isFinite(n) ? n : 0);
}

function formatHexByte(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

const CrrSettings: React.FC = () => {
  const { t } = useTranslation();
  const { bleConnected } = useAppData();
  const [tab, setTab] = useState<TabId>('rf');
  const [config, setConfig] = useState<CrrSettingsConfig>(() => loadCrrSettingsFromStorage());
  const [saving, setSaving] = useState(false);
  const [serialInput, setSerialInput] = useState(() => formatCrrSerialDecimal(loadCrrSettingsFromStorage().crrSerial));

  const verifiedPort = getVerifiedCrrPort();
  const canSave = Boolean(verifiedPort && bleConnected && !saving);

  const updateSlot = useCallback((index: number, patch: Partial<RfSlotConfig>) => {
    setConfig((prev) => {
      const slots = [...prev.slots];
      const prevSlot = slots[index];
      const next = { ...prevSlot, ...patch };

      if (patch.moduleType != null) {
        if (patch.moduleType === 'RS485' || patch.moduleType === 'BLE121LR' || patch.moduleType === 'SP_RS485') {
          next.channel = 0;
          next.baudRate = '10';
        }
      }

      const activating =
        patch.moduleType != null &&
        patch.moduleType !== 'OFF' &&
        prevSlot.moduleType === 'OFF';
      if (activating) {
        const baud: CrrBaudRate = next.baudRate ?? '10';
        if (CC24_TYPES.has(next.moduleType)) {
          next.registers = Array.from(CRR_CC24_TEMPLATES_BY_BAUD[baud]);
          next.registers[10] = next.channel & 0xff;
          next.registers[47] = 0xff;
        }
      }

      if (patch.baudRate != null && CC24_TYPES.has(next.moduleType)) {
        next.registers = Array.from(CRR_CC24_TEMPLATES_BY_BAUD[patch.baudRate]);
        next.registers[10] = next.channel & 0xff;
        next.registers[47] = 0xff;
      }

      if (patch.channel != null && CC24_TYPES.has(next.moduleType)) {
        next.registers = Array.from(CRR_CC24_TEMPLATES_BY_BAUD[next.baudRate]);
        next.registers[10] = patch.channel & 0xff;
        next.registers[47] = 0xff;
      }
      slots[index] = next;
      return { ...prev, slots };
    });
  }, []);

  const updateRegister = useCallback((col: number, regIndex: number, value: number) => {
    setConfig((prev) => {
      const slots = [...prev.slots];
      const slot = { ...slots[col] };
      const registers = [...slot.registers];
      registers[regIndex] = clampByte(value);
      slot.registers = registers;
      if (regIndex === 10) {
        slot.channel = clampByte(value);
      }
      slots[col] = slot;
      return { ...prev, slots };
    });
  }, []);

  const updateOption = useCallback((key: keyof CrrSettingsConfig['options'], checked: boolean) => {
    setConfig((prev) => ({
      ...prev,
      options: { ...prev.options, [key]: checked },
    }));
  }, []);

  const handleReset = () => {
    const defaults = resetCrrSettingsToTemplate();
    setConfig(defaults);
    setSerialInput(formatCrrSerialDecimal(defaults.crrSerial));
    toast.info(t('CrrSettings.ResetDone'));
  };

  const handleSaveLocal = () => {
    const serial = parseCrrSerialDecimal(serialInput);
    const payload = serial != null ? { ...config, crrSerial: serial } : config;
    saveCrrSettingsToStorage(payload);
    setConfig(payload);
    toast.success(t('CrrSettings.SavedLocal'));
  };

  const handleSaveToCrr = async () => {
    const port = getVerifiedCrrPort();
    if (!port) {
      toast.error(t('CrrSettings.NotConnected'));
      return;
    }
    const serial = parseCrrSerialDecimal(serialInput);
    const payload = serial != null ? { ...config, crrSerial: serial } : config;
    setSaving(true);
    saveCrrSettingsToStorage(payload);
    setConfig(payload);
    try {
      const result = await sendLabviewSaveToCrr(port, payload);
      if (!result.ok) {
        toast.error(result.error || t('CrrSettings.SaveFailed'));
        return;
      }
      if (result.ack) {
        toast.success(t('CrrSettings.SaveAck'));
      } else {
        toast.warning(t('CrrSettings.SaveNoAck'));
      }
    } finally {
      setSaving(false);
    }
  };

  const rfGrid = useMemo(() => (
    <div className="crr-settings-rf-grid">
      {config.slots.map((slot, index) => (
        <IonCard key={`addr-${index + 1}`} className="crr-settings-rf-card">
          <IonCardHeader>
            <IonCardTitle>{t('CrrSettings.Addr', { n: index + 1 })}</IonCardTitle>
          </IonCardHeader>
          <IonCardContent>
            <IonItem lines="none" className="crr-settings-field">
              <IonLabel position="stacked">{t('CrrSettings.ModuleType')}</IonLabel>
              <IonSelect
                legacy
                value={slot.moduleType}
                interface="popover"
                onIonChange={(e) => updateSlot(index, { moduleType: e.detail.value as CrrModuleType })}
              >
                {RF_MODULE_TYPE_OPTIONS.map((opt) => (
                  <IonSelectOption key={opt.value} value={opt.value}>
                    {t(`CrrSettings.${opt.labelKey}`)}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
            <IonItem lines="none" className="crr-settings-field">
              <IonLabel position="stacked">{t('CrrSettings.Channel')}</IonLabel>
              <IonInput
                legacy
                type="number"
                min={0}
                max={255}
                value={slot.moduleType === 'RS485' || slot.moduleType === 'BLE121LR' || slot.moduleType === 'SP_RS485' ? 0 : slot.channel}
                disabled={slot.moduleType === 'OFF' || slot.moduleType === 'RS485' || slot.moduleType === 'BLE121LR' || slot.moduleType === 'SP_RS485'}
                onIonInput={(e) => updateSlot(index, { channel: clampByte(Number(e.detail.value)) })}
              />
            </IonItem>
            <IonItem lines="none" className="crr-settings-field">
              <IonLabel position="stacked">{t('CrrSettings.BaudRate')}</IonLabel>
              <IonSelect
                legacy
                value={slot.baudRate}
                interface="popover"
                disabled={slot.moduleType === 'OFF' || slot.moduleType === 'RS485' || slot.moduleType === 'BLE121LR' || slot.moduleType === 'SP_RS485'}
                onIonChange={(e) => updateSlot(index, { baudRate: String(e.detail.value) as CrrBaudRate })}
              >
                {RF_BAUD_RATE_OPTIONS.map((b) => (
                  <IonSelectOption key={b} value={b}>
                    {b}
                  </IonSelectOption>
                ))}
              </IonSelect>
            </IonItem>
            <p className="crr-settings-freq">
              {t('CrrSettings.Frequency', {
                mhz: channelToFrequencyMhz(slot.channel, slot.moduleType).toFixed(3),
              })}
            </p>
          </IonCardContent>
        </IonCard>
      ))}
    </div>
  ), [config.slots, t, updateSlot]);

  const registerTable = useMemo(() => (
    <div className="crr-settings-registers-wrap">
      <table className="crr-settings-registers">
        <thead>
          <tr>
            <th>{t('CrrSettings.Register')}</th>
            {RF_COLUMN_LABELS.map((label) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CC1101_REGISTER_NAMES.map((name, regIndex) => (
            <tr key={name}>
              <td className="crr-settings-reg-name">{name}</td>
              {Array.from({ length: CRR_REGISTER_COLUMN_COUNT }, (_, col) => {
                const slot = config.slots[col];
                const disabled = slot.moduleType === 'OFF' || !CC24_TYPES.has(slot.moduleType);
                const val = slot.registers[regIndex] ?? 0;
                return (
                  <td key={`${col}-${regIndex}`}>
                    <input
                      className="crr-settings-reg-input"
                      value={formatHexByte(val)}
                      disabled={disabled}
                      onChange={(e) => updateRegister(col, regIndex, parseHexByte(e.target.value))}
                      aria-label={`${name} ${RF_COLUMN_LABELS[col]}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ), [config.slots, t, updateRegister]);

  if (!isDesktopPc()) {
    return (
      <CommonLayout title={t('CrrSettings.Title')}>
        <p>{t('CrrSettings.DesktopOnly')}</p>
      </CommonLayout>
    );
  }

  return (
    <CommonLayout title={t('CrrSettings.Title')} classes="crr-settings-layout">
      <div className="crr-settings-page">
        <div className="crr-settings-toolbar">
          <div className="crr-settings-status">
            <IonBadge color={bleConnected && verifiedPort ? 'success' : 'medium'}>
              {bleConnected && verifiedPort
                ? t('CrrSettings.Connected', { port: verifiedPort })
                : t('CrrSettings.Disconnected')}
            </IonBadge>
          </div>
          <div className="crr-settings-actions">
            <IonButton fill="outline" color="medium" onClick={handleReset}>
              <IonIcon slot="start" icon={refreshOutline} />
              {t('CrrSettings.ResetTemplate')}
            </IonButton>
            <IonButton fill="outline" onClick={handleSaveLocal}>
              {t('CrrSettings.SaveLocal')}
            </IonButton>
            <IonButton color="primary" disabled={!canSave} onClick={() => { void handleSaveToCrr(); }}>
              {saving ? <IonSpinner name="crescent" /> : <IonIcon slot="start" icon={saveOutline} />}
              {t('CrrSettings.SaveToCrr')}
            </IonButton>
          </div>
        </div>

        <IonSegment
          value={tab}
          onIonChange={(e) => setTab((e.detail.value as TabId) ?? 'rf')}
          className="crr-settings-tabs"
        >
          <IonSegmentButton value="rf">
            <IonLabel>{t('CrrSettings.TabRf')}</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="registers">
            <IonLabel>{t('CrrSettings.TabRegisters')}</IonLabel>
          </IonSegmentButton>
          <IonSegmentButton value="options">
            <IonLabel>{t('CrrSettings.TabOptions')}</IonLabel>
          </IonSegmentButton>
        </IonSegment>

        {tab === 'rf' && rfGrid}
        {tab === 'registers' && registerTable}
        {tab === 'options' && (
          <IonCard className="crr-settings-options-card">
            <IonCardHeader>
              <IonCardTitle>{t('CrrSettings.CrrOptions')}</IonCardTitle>
            </IonCardHeader>
            <IonCardContent>
              <IonItem lines="none" className="crr-settings-field crr-settings-serial-field">
                <IonLabel position="stacked">{t('CrrSettings.CrrSerial')}</IonLabel>
                <IonInput
                  legacy
                  type="text"
                  inputMode="numeric"
                  value={serialInput}
                  placeholder={formatCrrSerialDecimal(CRR_DEFAULT_SERIAL)}
                  onIonInput={(e) => setSerialInput(String(e.detail.value ?? '').replace(/\D/g, ''))}
                />
              </IonItem>
              <div className="crr-settings-options-grid">
                {(Object.keys(config.options) as (keyof CrrSettingsConfig['options'])[]).map((key) => (
                  <IonItem key={key} lines="none">
                    <IonCheckbox
                      legacy
                      checked={config.options[key]}
                      onIonChange={(e) => updateOption(key, !!e.detail.checked)}
                    />
                    <IonLabel className="ion-padding-start">{t(`CrrSettings.Option_${key}`)}</IonLabel>
                  </IonItem>
                ))}
              </div>
            </IonCardContent>
          </IonCard>
        )}
      </div>
    </CommonLayout>
  );
};

export default CrrSettings;
