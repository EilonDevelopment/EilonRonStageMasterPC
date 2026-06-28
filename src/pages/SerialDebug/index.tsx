import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  IonButton,
  IonCheckbox,
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
  dir: 'RX' | 'TX' | 'SYS';
  text: string;
};

const MAX_LOG_LINES = 500;

function formatTs(d = new Date()): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
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
  const [lines, setLines] = useState<LogLine[]>([]);
  const [statusText, setStatusText] = useState('');
  const logIdRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const activePortRef = useRef('');
  const framerRef = useRef<CrrPacketFramer | null>(null);
  const framerPortRef = useRef('');

  const pushLine = useCallback((dir: LogLine['dir'], text: string) => {
    logIdRef.current += 1;
    setLines((prev) => {
      const next = [...prev, { id: logIdRef.current, ts: formatTs(), dir, text }];
      return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
    });
  }, []);

  const resetRxFramer = useCallback((portPath: string) => {
    framerPortRef.current = portPath;
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
