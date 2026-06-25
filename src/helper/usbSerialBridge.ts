import { isDesktopPc } from './appPlatform';

export type SerialPortInfo = {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  friendlyName?: string;
};

/** Default baud for PRR USB virtual COM — confirm with firmware if needed. */
export const PRR_USB_DEFAULT_BAUD = 115200;

export const SERIAL_BAUD_OPTIONS = [
  9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600,
] as const;

function api(): RsmElectronApi | null {
  if (!isDesktopPc()) return null;
  return window.rsmElectron ?? null;
}

export async function listUsbSerialPorts(): Promise<SerialPortInfo[]> {
  const bridge = api();
  if (!bridge) return [];
  return bridge.listSerialPorts();
}

export async function connectUsbSerial(
  portPath: string,
  baudRate = PRR_USB_DEFAULT_BAUD
): Promise<{ ok: boolean; error?: string }> {
  const bridge = api();
  if (!bridge) {
    return { ok: false, error: 'USB serial is only available in the desktop app.' };
  }
  return bridge.connectSerial(portPath, baudRate);
}

export async function disconnectUsbSerial(portPath: string): Promise<void> {
  const bridge = api();
  if (!bridge) return;
  await bridge.disconnectSerial(portPath);
}

type SerialDataHandler = (path: string, data: Uint8Array) => void;
type SerialPathHandler = (path: string) => void;
type SerialErrorHandler = (path: string, message: string) => void;

const serialDataHandlers = new Set<SerialDataHandler>();
const serialDisconnectedHandlers = new Set<SerialPathHandler>();
const serialErrorHandlers = new Set<SerialErrorHandler>();

let serialIpcBridgeInstalled = false;

function installSerialIpcBridge(): void {
  if (serialIpcBridgeInstalled) return;
  const bridge = api();
  if (!bridge) return;

  bridge.onSerialData((payload) => {
    const data = new Uint8Array(payload.data);
    serialDataHandlers.forEach((handler) => {
      try {
        handler(payload.path, data);
      } catch (error) {
        console.error('[usbSerialBridge] data handler error', error);
      }
    });
  });

  bridge.onSerialDisconnected((payload) => {
    serialDisconnectedHandlers.forEach((handler) => {
      try {
        handler(payload.path);
      } catch (error) {
        console.error('[usbSerialBridge] disconnect handler error', error);
      }
    });
  });

  bridge.onSerialError((payload) => {
    serialErrorHandlers.forEach((handler) => {
      try {
        handler(payload.path, payload.message);
      } catch (error) {
        console.error('[usbSerialBridge] error handler error', error);
      }
    });
  });

  serialIpcBridgeInstalled = true;
}

export function subscribeUsbSerialData(handler: SerialDataHandler): () => void {
  const bridge = api();
  if (!bridge) return () => undefined;
  installSerialIpcBridge();
  serialDataHandlers.add(handler);
  return () => {
    serialDataHandlers.delete(handler);
  };
}

export function subscribeUsbSerialDisconnected(handler: SerialPathHandler): () => void {
  const bridge = api();
  if (!bridge) return () => undefined;
  installSerialIpcBridge();
  serialDisconnectedHandlers.add(handler);
  return () => {
    serialDisconnectedHandlers.delete(handler);
  };
}

export function subscribeUsbSerialError(handler: SerialErrorHandler): () => void {
  const bridge = api();
  if (!bridge) return () => undefined;
  installSerialIpcBridge();
  serialErrorHandlers.add(handler);
  return () => {
    serialErrorHandlers.delete(handler);
  };
}

export async function writeUsbSerial(portPath: string, data: Uint8Array): Promise<{ ok: boolean; error?: string }> {
  const bridge = api();
  if (!bridge) return { ok: false, error: 'USB serial is only available in the desktop app.' };
  return bridge.writeSerial(portPath, Array.from(data));
}

export async function setUsbSerialBaud(
  portPath: string,
  baudRate: number
): Promise<{ ok: boolean; error?: string }> {
  const bridge = api();
  if (!bridge) return { ok: false, error: 'USB serial is only available in the desktop app.' };
  return bridge.setSerialBaud(portPath, baudRate);
}

export async function getUsbSerialStatus(): Promise<{ open: Array<{ path: string; isOpen: boolean; baudRate: number }> }> {
  const bridge = api();
  if (!bridge) return { open: [] };
  return bridge.getSerialStatus();
}
