import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IonButton,
  IonCheckbox,
  IonInput,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonTextarea,
} from '@ionic/react';
import { useTranslation } from 'react-i18next';
import CommonLayout from '../../Layout/CommonLayout';
import { isDesktopPc } from '../../helper/appPlatform';
import { formatCrrUsbFrameRxLog } from '../../helper/crrUsbSerialDebug';
import { SerialDebugRxScanner } from '../../helper/crrUsbSerialDebugScan';
import { buildCrrS2sPacket, buildCrrReturnCodePacket, formatCrrS2sPacketSummary, type CrrS2sCell } from '../../helper/crrProtocol';
import {
  buildLabviewSavePackets,
  buildLabviewSaveWireBlob,
  formatLabviewSavePacketSummary,
  formatLabviewSaveTxHex,
  formatLabviewSessionPrefix,
  getLabviewSaveTemplateSessionPrefix,
  isCustomLabviewSessionPrefix,
  LABVIEW_SAVE_DEFAULT_SESSION_HEX,
  LABVIEW_SAVE_INTER_PACKET_DELAY_MS,
  LABVIEW_SAVE_P1_SIZE,
  LABVIEW_SAVE_P2_SIZE,
  LABVIEW_SAVE_P1_WIRE_SIZE,
  LABVIEW_SAVE_P2_WIRE_SIZE,
  parseCapturedHexDump,
  parseLabviewSessionPrefixHex,
  toCrrWireSavePacket,
  type LabviewSaveConfigPatch,
} from '../../helper/crrSaveParameters';
import { waitForCrrSaveAck } from '../../helper/crrUsbService';
import { CrrPacketFramer } from '../../helper/prrPacketFramer';
import {
  SERIAL_BAUD_OPTIONS,
  PRR_USB_DEFAULT_BAUD,
  connectUsbSerial,
  disconnectUsbSerial,
  getUsbSerialStatus,
  listUsbSerialPorts,
  setUsbSerialBaud,
  subscribeUsbSerialData,
  subscribeUsbSerialDisconnected,
  subscribeUsbSerialError,
  writeUsbSerial,
  type SerialPortInfo,
} from '../../helper/usbSerialBridge';
import './SerialDebug.css';

type LogLine = {
  id: number;
  ts: string;
  dir: 'RX' | 'TX' | 'SYS' | 'RX-IDN' | 'RX-CAND';
  text: string;
};

const MAX_LOG_LINES = 500;

/** Debug-only LC IDs for quick-test buttons. */
const DEBUG_RF_LC_ID = 600;
const DEFAULT_DEBUG_RS485_LC_ID = 4321;
const LV_SESSION_STORAGE_KEY = 'serialDebug.labviewSessionPrefix';
const DEFAULT_LV_SESSION_HEX = LABVIEW_SAVE_DEFAULT_SESSION_HEX;

function parseLcIdInput(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const id = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(id) || id <= 0 || id > 0xffffff) return null;
  return id;
}

function formatTs(d = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function bytesToHex(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function appendLineSuffix(text: string, cr: boolean, lf: boolean): Uint8Array {
  let payload = text;
  if (cr) payload += '\r';
  if (lf) payload += '\n';
  return new TextEncoder().encode(payload);
}

type PayloadResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; errorKey: 'HexEmpty' | 'HexInvalid' };

function parseHexInput(text: string): PayloadResult {
  const compact = text
    .trim()
    .replace(/0x/gi, '')
    .replace(/[\s,;:-]+/g, '');

  if (!compact) return { ok: false, errorKey: 'HexEmpty' };
  if (!/^[0-9A-Fa-f]+$/.test(compact)) return { ok: false, errorKey: 'HexInvalid' };

  const normalized = compact.length % 2 === 0 ? compact : `0${compact}`;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return { ok: true, bytes };
}

function buildSendPayload(
  text: string,
  sendAsHex: boolean,
  appendCr: boolean,
  appendLf: boolean,
): PayloadResult {
  if (!sendAsHex) {
    const bytes = appendLineSuffix(text, appendCr, appendLf);
    return bytes.length === 0 ? { ok: false, errorKey: 'HexEmpty' } : { ok: true, bytes };
  }

  const parsed = parseHexInput(text);
  if (!parsed.ok) return parsed;

  const extra = (appendCr ? 1 : 0) + (appendLf ? 1 : 0);
  if (extra === 0) return parsed;

  const bytes = new Uint8Array(parsed.bytes.length + extra);
  bytes.set(parsed.bytes);
  let offset = parsed.bytes.length;
  if (appendCr) bytes[offset++] = 0x0d;
  if (appendLf) bytes[offset++] = 0x0a;
  return { ok: true, bytes };
}

const SerialDebug: React.FC = () => {
  const { t } = useTranslation();
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [baudRate, setBaudRate] = useState<number>(PRR_USB_DEFAULT_BAUD);
  const [connected, setConnected] = useState(false);
  const [appendCr, setAppendCr] = useState(false);
  const [appendLf, setAppendLf] = useState(true);
  const [sendAsHex, setSendAsHex] = useState(true);
  const [command, setCommand] = useState('');
  const [rs485LcIdInput, setRs485LcIdInput] = useState(String(DEFAULT_DEBUG_RS485_LC_ID));
  const [lines, setLines] = useState<LogLine[]>([]);
  const [statusText, setStatusText] = useState('');
  const [saveInFlight, setSaveInFlight] = useState(false);
  const [lvSessionInput, setLvSessionInput] = useState(() => {
    try {
      return localStorage.getItem(LV_SESSION_STORAGE_KEY) ?? DEFAULT_LV_SESSION_HEX;
    } catch {
      return DEFAULT_LV_SESSION_HEX;
    }
  });
  const [skipIdentifyBeforeSave, setSkipIdentifyBeforeSave] = useState(true);
  const [rawP1Hex, setRawP1Hex] = useState('');
  const [rawP2Hex, setRawP2Hex] = useState('');
  const logIdRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const activePortRef = useRef('');
  const framerRef = useRef<CrrPacketFramer | null>(null);
  const framerPortRef = useRef('');
  const rxScannerRef = useRef<SerialDebugRxScanner | null>(null);
  const saveRxWatchUntilRef = useRef(0);

  const rs485LcId = useMemo(() => parseLcIdInput(rs485LcIdInput), [rs485LcIdInput]);

  const lvSessionPrefix = useMemo(() => parseLabviewSessionPrefixHex(lvSessionInput), [lvSessionInput]);

  const buildSavePatch = useCallback((): LabviewSaveConfigPatch => {
    const trimmed = lvSessionInput.trim();
    if (!trimmed) return {};
    if (!lvSessionPrefix) return {};
    return { sessionPrefix16: lvSessionPrefix };
  }, [lvSessionInput, lvSessionPrefix]);

  const usesCustomSession = useMemo(
    () => isCustomLabviewSessionPrefix(lvSessionPrefix),
    [lvSessionPrefix],
  );

  const buildSavePackets = useCallback(() => {
    const patch = buildSavePatch();
    return buildLabviewSavePackets(patch);
  }, [buildSavePatch]);

  const pushLine = useCallback((dir: LogLine['dir'], text: string) => {
    logIdRef.current += 1;
    setLines((prev) => {
      const next = [...prev, { id: logIdRef.current, ts: formatTs(), dir, text }];
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
    });
  }, []);

  const resetRxFramer = useCallback((portPath: string) => {
    framerPortRef.current = portPath;
    rxScannerRef.current = new SerialDebugRxScanner();
    framerRef.current = new CrrPacketFramer(
      (frame) => {
        pushLine('RX', formatCrrUsbFrameRxLog(portPath, frame));
      },
      () => null,
    );
  }, [pushLine]);

  const refreshPorts = useCallback(async () => {
    const list = await listUsbSerialPorts();
    setPorts(list);
    if (!selectedPort && list.length > 0) {
      setSelectedPort(list[0].path);
    }
  }, [selectedPort]);

  const syncOpenStatus = useCallback(async () => {
    const status = await getUsbSerialStatus();
    const open = status.open.find((p) => p.isOpen);
    if (open) {
      activePortRef.current = open.path;
      resetRxFramer(open.path);
      setSelectedPort(open.path);
      setBaudRate(open.baudRate);
      setConnected(true);
      setStatusText(t('SerialDebug.Connected', { port: open.path, baud: open.baudRate }));
    } else {
      activePortRef.current = '';
      setConnected(false);
      setStatusText(t('SerialDebug.Disconnected'));
    }
  }, [t, resetRxFramer]);

  useEffect(() => {
    if (!isDesktopPc()) return;
    void refreshPorts();
    void syncOpenStatus();
  }, [refreshPorts, syncOpenStatus]);

  useEffect(() => {
    if (!isDesktopPc()) return undefined;
    const unsubData = subscribeUsbSerialData((portPath, chunk) => {
      if (!framerRef.current || framerPortRef.current !== portPath) {
        resetRxFramer(portPath);
      }
      if (!rxScannerRef.current) {
        rxScannerRef.current = new SerialDebugRxScanner();
      }
      const scanEvents = rxScannerRef.current.push(chunk, portPath);
      scanEvents.forEach((ev) => {
        if (ev.kind === 'idn') pushLine('RX-IDN', ev.text);
        else pushLine('RX-CAND', ev.text);
      });
      if (Date.now() < saveRxWatchUntilRef.current && chunk.length > 0) {
        const hex = bytesToHex(chunk.length > 128 ? chunk.subarray(0, 128) : chunk);
        const suffix = chunk.length > 128 ? ` … +${chunk.length - 128} B` : '';
        pushLine('RX', `[${portPath}] raw ${chunk.length} B | HEX ${hex}${suffix}`);
      }
      framerRef.current?.push(chunk);
    });
    const unsubDisc = subscribeUsbSerialDisconnected((portPath) => {
      if (portPath === activePortRef.current) {
        activePortRef.current = '';
        setConnected(false);
        setStatusText(t('SerialDebug.Disconnected'));
      }
      pushLine('SYS', t('SerialDebug.PortClosed', { port: portPath }));
    });
    const unsubErr = subscribeUsbSerialError((portPath, message) => {
      pushLine('SYS', t('SerialDebug.PortError', { port: portPath, message }));
    });
    return () => {
      unsubData();
      unsubDisc();
      unsubErr();
    };
  }, [pushLine, resetRxFramer, t]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const handleConnect = async () => {
    if (!selectedPort) return;
    const result = await connectUsbSerial(selectedPort, baudRate);
    if (!result.ok) {
      pushLine('SYS', result.error || t('SerialDebug.ConnectFailed'));
      return;
    }
    activePortRef.current = selectedPort;
    resetRxFramer(selectedPort);
    setConnected(true);
    setStatusText(t('SerialDebug.Connected', { port: selectedPort, baud: baudRate }));
    pushLine('SYS', t('SerialDebug.Opened', { port: selectedPort, baud: baudRate }));
  };

  const handleDisconnect = async () => {
    const port = activePortRef.current || selectedPort;
    if (!port) return;
    await disconnectUsbSerial(port);
    activePortRef.current = '';
    framerRef.current = null;
    framerPortRef.current = '';
    setConnected(false);
    setStatusText(t('SerialDebug.Disconnected'));
    pushLine('SYS', t('SerialDebug.Closed', { port }));
  };

  const handleApplyBaud = async () => {
    const port = activePortRef.current || selectedPort;
    if (!port || !connected) {
      pushLine('SYS', t('SerialDebug.BaudNeedsConnection'));
      return;
    }
    const result = await setUsbSerialBaud(port, baudRate);
    if (!result.ok) {
      pushLine('SYS', result.error || t('SerialDebug.BaudFailed'));
      return;
    }
    pushLine('SYS', t('SerialDebug.BaudSet', { baud: baudRate }));
    setStatusText(t('SerialDebug.Connected', { port, baud: baudRate }));
  };

  const handleSend = async () => {
    const port = activePortRef.current || selectedPort;
    if (!port || !connected) {
      pushLine('SYS', t('SerialDebug.SendNeedsConnection'));
      return;
    }
    const built = buildSendPayload(command, sendAsHex, appendCr, appendLf);
    if (!built.ok) {
      pushLine('SYS', t(`SerialDebug.${built.errorKey}`));
      return;
    }
    const payload = built.bytes;
    const result = await writeUsbSerial(port, payload);
    if (!result.ok) {
      pushLine('SYS', result.error || t('SerialDebug.SendFailed'));
      return;
    }
    const suffix = `${appendCr ? ' CR' : ''}${appendLf ? ' LF' : ''}`.trim();
    const inputLabel = sendAsHex ? command.trim() : `"${command}"`;
    pushLine(
      'TX',
      `[${port}] ${payload.length} B | HEX ${bytesToHex(payload)} | ${sendAsHex ? 'HEX in' : 'ASCII'} ${inputLabel}${suffix ? ` (${suffix})` : ''}`,
    );
    setCommand('');
  };

  const handleSendBytes = async (
    payload: Uint8Array,
    summary: string,
    sysHintKey?: string,
    sysHintParams?: Record<string, string | number>,
    atomic = false,
  ) => {
    const port = activePortRef.current || selectedPort;
    if (!port || !connected) {
      pushLine('SYS', t('SerialDebug.SendNeedsConnection'));
      return false;
    }
    const result = await writeUsbSerial(port, payload, { atomic });
    if (!result.ok) {
      pushLine('SYS', result.error || t('SerialDebug.SendFailed'));
      return false;
    }
    pushLine('TX', `[${port}] ${payload.length} B | ${summary} | HEX ${payload.length > 96 ? formatLabviewSaveTxHex(payload) : bytesToHex(payload)}`);
    if (sysHintKey) {
      pushLine('SYS', t(sysHintKey, sysHintParams));
    }
    return true;
  };

  const handleSendSaveP1 = async () => {
    if (lvSessionInput.trim() && !lvSessionPrefix) {
      pushLine('SYS', t('SerialDebug.SaveSessionInvalid'));
      return;
    }
    if (usesCustomSession) {
      pushLine('SYS', t('SerialDebug.SaveSessionTemplateWarn'));
    }
    const { p1 } = buildSavePackets();
    await handleSendBytes(p1, formatLabviewSavePacketSummary('P1', p1), 'SerialDebug.SaveP1Hint');
  };

  const handleSendSaveP2 = async () => {
    if (lvSessionInput.trim() && !lvSessionPrefix) {
      pushLine('SYS', t('SerialDebug.SaveSessionInvalid'));
      return;
    }
    if (usesCustomSession) {
      pushLine('SYS', t('SerialDebug.SaveSessionTemplateWarn'));
    }
    const { p2 } = buildSavePackets();
    await handleSendBytes(p2, formatLabviewSavePacketSummary('P2', p2), 'SerialDebug.SaveP2Hint');
  };

  const handleSendSaveFull = async () => {
    const port = activePortRef.current || selectedPort;
    if (!port || !connected || saveInFlight) {
      if (!port || !connected) pushLine('SYS', t('SerialDebug.SendNeedsConnection'));
      return;
    }
    if (lvSessionInput.trim() && !lvSessionPrefix) {
      pushLine('SYS', t('SerialDebug.SaveSessionInvalid'));
      return;
    }
    setSaveInFlight(true);
    saveRxWatchUntilRef.current = Date.now() + 8000;
    try {
      pushLine('SYS', skipIdentifyBeforeSave ? t('SerialDebug.SaveFullStartNoIdn') : t('SerialDebug.SaveFullStart'));
      const sessionHex = lvSessionPrefix
        ? formatLabviewSessionPrefix(lvSessionPrefix)
        : formatLabviewSessionPrefix(getLabviewSaveTemplateSessionPrefix());
      pushLine('SYS', t('SerialDebug.SaveSessionUsing', { hex: sessionHex }));
      if (usesCustomSession) {
        pushLine('SYS', t('SerialDebug.SaveSessionTemplateWarn'));
      }
      try {
        localStorage.setItem(LV_SESSION_STORAGE_KEY, lvSessionInput.trim());
      } catch {
        /* ignore */
      }

      if (skipIdentifyBeforeSave) {
        const blob = buildLabviewSaveWireBlob(buildSavePatch());
        const ok = await handleSendBytes(
          blob,
          `Save full blob (${blob.length} B, atomic)`,
          'SerialDebug.SaveFullStartNoIdn',
          undefined,
          true,
        );
        if (!ok) return;
        pushLine('SYS', t('SerialDebug.SaveFullWaitIdn'));
        const ack = await waitForCrrSaveAck(port);
        if (ack) {
          pushLine('SYS', t('SerialDebug.SaveAckReceived'));
        } else {
          pushLine('SYS', t('SerialDebug.SaveNoAck'));
        }
        return;
      }

      pushLine('SYS', t('SerialDebug.SaveIdentifyWarn'));
      pushLine('SYS', t('SerialDebug.SaveIdentifyFirst'));
      const idPkt = buildCrrReturnCodePacket();
      await handleSendBytes(idPkt, 'Identify 0x34 (pre-save)');
      await sleep(400);
      const blob = buildLabviewSaveWireBlob(buildSavePatch());
      const ok = await handleSendBytes(
        blob,
        `Save full blob (${blob.length} B, atomic)`,
        undefined,
        undefined,
        true,
      );
      if (ok) {
        pushLine('SYS', t('SerialDebug.SaveFullWaitIdn'));
      }
    } finally {
      setSaveInFlight(false);
    }
  };

  const handleReplayRawSave = async () => {
    const port = activePortRef.current || selectedPort;
    if (!port || !connected || saveInFlight) {
      if (!port || !connected) pushLine('SYS', t('SerialDebug.SendNeedsConnection'));
      return;
    }
    if (!rawP1Hex.trim() || !rawP2Hex.trim()) {
      pushLine('SYS', t('SerialDebug.SaveRawEmpty'));
      return;
    }
    const rawP1 = parseCapturedHexDump(rawP1Hex);
    if (!rawP1) {
      pushLine('SYS', t('SerialDebug.SaveRawInvalid', { which: 'P1' }));
      return;
    }
    const rawP2 = parseCapturedHexDump(rawP2Hex);
    if (!rawP2) {
      pushLine('SYS', t('SerialDebug.SaveRawInvalid', { which: 'P2' }));
      return;
    }
    // Auto-strip the USB transport header when a full LabVIEW capture is pasted.
    const p1Bytes = rawP1.length >= LABVIEW_SAVE_P1_SIZE ? toCrrWireSavePacket(rawP1) : rawP1;
    const p2Bytes = rawP2.length >= LABVIEW_SAVE_P2_SIZE ? toCrrWireSavePacket(rawP2) : rawP2;
    if (p1Bytes.length !== rawP1.length) {
      pushLine('SYS', t('SerialDebug.SaveRawStripped', { which: 'P1', from: rawP1.length, to: p1Bytes.length }));
    }
    if (p2Bytes.length !== rawP2.length) {
      pushLine('SYS', t('SerialDebug.SaveRawStripped', { which: 'P2', from: rawP2.length, to: p2Bytes.length }));
    }
    if (p1Bytes.length !== LABVIEW_SAVE_P1_WIRE_SIZE) {
      pushLine('SYS', t('SerialDebug.SaveRawSizeWarn', { which: 'P1', got: p1Bytes.length, expected: LABVIEW_SAVE_P1_WIRE_SIZE }));
    }
    if (p2Bytes.length !== LABVIEW_SAVE_P2_WIRE_SIZE) {
      pushLine('SYS', t('SerialDebug.SaveRawSizeWarn', { which: 'P2', got: p2Bytes.length, expected: LABVIEW_SAVE_P2_WIRE_SIZE }));
    }
    setSaveInFlight(true);
    saveRxWatchUntilRef.current = Date.now() + 8000;
    try {
      pushLine('SYS', t('SerialDebug.SaveRawStart', { p1: p1Bytes.length, p2: p2Bytes.length }));
      const blob = new Uint8Array(p1Bytes.length + p2Bytes.length);
      blob.set(p1Bytes, 0);
      blob.set(p2Bytes, p1Bytes.length);
      const ok = await handleSendBytes(
        blob,
        `Raw save blob (${blob.length} B, atomic)`,
        'SerialDebug.SaveRawP2Sent',
        undefined,
        true,
      );
      if (!ok) return;
      pushLine('SYS', t('SerialDebug.SaveFullWaitIdn'));
      const ack = await waitForCrrSaveAck(port);
      if (ack) {
        pushLine('SYS', t('SerialDebug.SaveAckReceived'));
      } else {
        pushLine('SYS', t('SerialDebug.SaveNoAck'));
      }
    } finally {
      setSaveInFlight(false);
    }
  };

  const handleSendS2sTest = async (
    testName: string,
    allCells: CrrS2sCell[],
    wiredCells: CrrS2sCell[],
    hintKey: string,
    hintParams?: Record<string, string | number>,
  ) => {
    const port = activePortRef.current || selectedPort;
    if (!port || !connected) {
      pushLine('SYS', t('SerialDebug.SendNeedsConnection'));
      return;
    }

    const packet = buildCrrS2sPacket(allCells, wiredCells);
    const summary = formatCrrS2sPacketSummary(allCells, wiredCells);
    const hex = bytesToHex(packet);

    const result = await writeUsbSerial(port, packet);
    if (!result.ok) {
      pushLine('SYS', result.error || t('SerialDebug.SendFailed'));
      return;
    }

    pushLine('TX', `[${port}] ${packet.length} B | ${summary} | HEX ${hex}`);
    pushLine('SYS', t(hintKey, hintParams));

    console.log(`[SerialDebug] CRR Set-LC-List (0x32) — ${testName}`, {
      port,
      allCells,
      wiredCells,
      summary,
      byteLength: packet.length,
      hex,
      packet: Array.from(packet),
    });
  };

  const handleKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      void handleSend();
    }
  };

  if (!isDesktopPc()) {
    return (
      <CommonLayout title={t('SerialDebug.Title')}>
        <p>{t('SerialDebug.DesktopOnly')}</p>
      </CommonLayout>
    );
  }

  return (
    <CommonLayout
      title={t('SerialDebug.Title')}
      contentScrollDisabled
      classes="serial-debug-layout"
    >
      <div className="serial-debug-page">
        <p className="serial-debug-banner">{t('SerialDebug.TempNotice')}</p>

        <div className="serial-debug-toolbar">
          <IonItem lines="none" className="serial-debug-field">
            <IonLabel position="stacked">{t('SerialDebug.Port')}</IonLabel>
            <IonSelect
              legacy
              value={selectedPort}
              disabled={connected}
              onIonChange={(e) => setSelectedPort(String(e.detail.value))}
              interface="popover"
            >
              {ports.map((p) => (
                <IonSelectOption key={p.path} value={p.path}>
                  {p.path}
                  {p.friendlyName ? ` — ${p.friendlyName}` : ''}
                </IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>

          <IonItem lines="none" className="serial-debug-field">
            <IonLabel position="stacked">{t('SerialDebug.Baud')}</IonLabel>
            <IonSelect
              legacy
              value={baudRate}
              onIonChange={(e) => setBaudRate(Number(e.detail.value))}
              interface="popover"
            >
              {SERIAL_BAUD_OPTIONS.map((b) => (
                <IonSelectOption key={b} value={b}>
                  {b}
                </IonSelectOption>
              ))}
            </IonSelect>
          </IonItem>

          <div className="serial-debug-actions">
            <IonButton size="small" fill="outline" onClick={() => { void refreshPorts(); }}>
              {t('Common.Refresh')}
            </IonButton>
            {!connected ? (
              <IonButton size="small" onClick={() => { void handleConnect(); }}>
                {t('ConnectDevice.Connect')}
              </IonButton>
            ) : (
              <IonButton size="small" color="medium" onClick={() => { void handleDisconnect(); }}>
                {t('SerialDebug.Disconnect')}
              </IonButton>
            )}
            <IonButton size="small" fill="outline" disabled={!connected} onClick={() => { void handleApplyBaud(); }}>
              {t('SerialDebug.ApplyBaud')}
            </IonButton>
          </div>
        </div>

        <p className="serial-debug-status">{statusText}</p>

        <div className="serial-debug-quick-tests">
          <span className="serial-debug-quick-label">{t('SerialDebug.QuickTests')}</span>
          <IonItem
            lines="none"
            className={`serial-debug-rs485-id-field${rs485LcId == null ? ' serial-debug-rs485-id-invalid' : ''}`}
          >
            <IonLabel position="stacked">{t('SerialDebug.Rs485LcId')}</IonLabel>
            <IonInput
              legacy
              type="text"
              inputMode="numeric"
              value={rs485LcIdInput}
              placeholder={String(DEFAULT_DEBUG_RS485_LC_ID)}
              onIonInput={(e) => setRs485LcIdInput(String(e.detail.value ?? '').replace(/\D/g, ''))}
            />
          </IonItem>
          <IonButton
            size="small"
            fill="outline"
            color="tertiary"
            disabled={!connected}
            onClick={() => {
              void handleSendS2sTest(
                'RF-only test',
                [{ export: 0, id: DEBUG_RF_LC_ID }],
                [],
                'SerialDebug.S2sRfOnlyHint',
                { id: DEBUG_RF_LC_ID },
              );
            }}
          >
            {t('SerialDebug.S2sRfOnly', { id: DEBUG_RF_LC_ID })}
          </IonButton>
          <IonButton
            size="small"
            fill="outline"
            color="tertiary"
            disabled={!connected || rs485LcId == null}
            onClick={() => {
              if (rs485LcId == null) {
                pushLine('SYS', t('SerialDebug.InvalidLcId'));
                return;
              }
              void handleSendS2sTest(
                'RF+RS485 test',
                [
                  { export: 0, id: DEBUG_RF_LC_ID },
                  { export: 0, id: rs485LcId },
                ],
                [{ export: 0, id: rs485LcId }],
                'SerialDebug.S2sRfRs485Hint',
                { rfId: DEBUG_RF_LC_ID, rs485Id: rs485LcId },
              );
            }}
          >
            {t('SerialDebug.S2sRfRs485', {
              rfId: DEBUG_RF_LC_ID,
              rs485Id: rs485LcId ?? DEFAULT_DEBUG_RS485_LC_ID,
            })}
          </IonButton>
          <IonButton
            size="small"
            fill="outline"
            color="tertiary"
            disabled={!connected || rs485LcId == null}
            onClick={() => {
              if (rs485LcId == null) {
                pushLine('SYS', t('SerialDebug.InvalidLcId'));
                return;
              }
              void handleSendS2sTest(
                'RS485-only test',
                [{ export: 0, id: rs485LcId }],
                [{ export: 0, id: rs485LcId }],
                'SerialDebug.S2sRs485OnlyHint',
                { id: rs485LcId },
              );
            }}
          >
            {t('SerialDebug.S2sRs485Only', { id: rs485LcId ?? DEFAULT_DEBUG_RS485_LC_ID })}
          </IonButton>
        </div>

        <div className="serial-debug-quick-tests serial-debug-save-tests">
          <span className="serial-debug-quick-label">{t('SerialDebug.SaveLabview')}</span>
          <IonButton
            size="small"
            fill="solid"
            color="warning"
            disabled={!connected || saveInFlight}
            onClick={() => { void handleSendSaveP1(); }}
          >
            {t('SerialDebug.SaveP1')}
          </IonButton>
          <IonButton
            size="small"
            fill="solid"
            color="warning"
            disabled={!connected || saveInFlight}
            onClick={() => { void handleSendSaveP2(); }}
          >
            {t('SerialDebug.SaveP2')}
          </IonButton>
          <IonButton
            size="small"
            color="warning"
            disabled={!connected || saveInFlight}
            onClick={() => { void handleSendSaveFull(); }}
          >
            {t('SerialDebug.SaveFull')}
          </IonButton>
          <IonItem lines="none" className="serial-debug-lv-session-field">
            <IonLabel position="stacked">{t('SerialDebug.SaveSessionLabel')}</IonLabel>
            <IonInput
              legacy
              value={lvSessionInput}
              placeholder={t('SerialDebug.SaveSessionPlaceholder')}
              onIonInput={(e) => setLvSessionInput(String(e.detail.value ?? ''))}
            />
          </IonItem>
          <IonButton
            size="small"
            fill="outline"
            color="medium"
            onClick={() => {
              setLvSessionInput('');
              pushLine('SYS', t('SerialDebug.SaveSessionUsing', {
                hex: formatLabviewSessionPrefix(getLabviewSaveTemplateSessionPrefix()),
              }));
            }}
          >
            {t('SerialDebug.SaveSessionReset')}
          </IonButton>
          <IonItem lines="none">
            <IonCheckbox
              legacy
              checked={skipIdentifyBeforeSave}
              onIonChange={(e) => setSkipIdentifyBeforeSave(!!e.detail.checked)}
            />
            <IonLabel className="ion-padding-start">{t('SerialDebug.SaveSkipIdentify')}</IonLabel>
          </IonItem>

          <div className="serial-debug-raw-save">
            <span className="serial-debug-quick-label">{t('SerialDebug.SaveRawLabel')}</span>
            <IonItem lines="none" className="serial-debug-raw-field">
              <IonLabel position="stacked">{t('SerialDebug.SaveRawP1Label')}</IonLabel>
              <IonTextarea
                legacy
                value={rawP1Hex}
                rows={3}
                placeholder={t('SerialDebug.SaveRawP1Placeholder')}
                onIonInput={(e) => setRawP1Hex(String(e.detail.value ?? ''))}
              />
            </IonItem>
            <IonItem lines="none" className="serial-debug-raw-field">
              <IonLabel position="stacked">{t('SerialDebug.SaveRawP2Label')}</IonLabel>
              <IonTextarea
                legacy
                value={rawP2Hex}
                rows={3}
                placeholder={t('SerialDebug.SaveRawP2Placeholder')}
                onIonInput={(e) => setRawP2Hex(String(e.detail.value ?? ''))}
              />
            </IonItem>
            <IonButton
              size="small"
              color="danger"
              disabled={!connected || saveInFlight || !rawP1Hex.trim() || !rawP2Hex.trim()}
              onClick={() => { void handleReplayRawSave(); }}
            >
              {t('SerialDebug.SaveRawReplay')}
            </IonButton>
          </div>
        </div>

        <div className="serial-debug-log" aria-label="serial log">
          {lines.map((line) => (
            <div key={line.id} className={`serial-debug-line serial-debug-line-${line.dir.toLowerCase()}`}>
              <span className="serial-debug-ts">{line.ts}</span>
              <span className="serial-debug-dir">{line.dir}</span>
              <span className="serial-debug-text">{line.text}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        <div className="serial-debug-send">
          <IonItem lines="none">
            <IonLabel position="stacked">{t('SerialDebug.Command')}</IonLabel>
            <IonTextarea
              legacy
              value={command}
              autoGrow
              rows={2}
              placeholder={sendAsHex ? t('SerialDebug.CommandPlaceholderHex') : t('SerialDebug.CommandPlaceholder')}
              onIonInput={(e) => setCommand(String(e.detail.value ?? ''))}
              onKeyDown={handleKeyDown}
            />
          </IonItem>
          <div className="serial-debug-send-options">
            <IonItem lines="none">
              <IonCheckbox legacy checked={sendAsHex} onIonChange={(e) => setSendAsHex(!!e.detail.checked)} />
              <IonLabel className="ion-padding-start">{t('SerialDebug.SendAsHex')}</IonLabel>
            </IonItem>
            <IonItem lines="none">
              <IonCheckbox legacy checked={appendCr} onIonChange={(e) => setAppendCr(!!e.detail.checked)} />
              <IonLabel className="ion-padding-start">{t('SerialDebug.AppendCr')}</IonLabel>
            </IonItem>
            <IonItem lines="none">
              <IonCheckbox legacy checked={appendLf} onIonChange={(e) => setAppendLf(!!e.detail.checked)} />
              <IonLabel className="ion-padding-start">{t('SerialDebug.AppendLf')}</IonLabel>
            </IonItem>
            <IonButton onClick={() => { void handleSend(); }} disabled={!connected || !command.trim()}>
              {t('SerialDebug.Send')}
            </IonButton>
            <IonButton fill="clear" color="medium" onClick={() => setLines([])}>
              {t('SerialDebug.ClearLog')}
            </IonButton>
          </div>
        </div>
      </div>
    </CommonLayout>
  );
};

export default SerialDebug;
