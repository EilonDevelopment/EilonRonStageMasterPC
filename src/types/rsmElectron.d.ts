interface SerialDataPayload {
  path: string;
  data: number[];
}

interface SerialPathPayload {
  path: string;
}

interface SerialErrorPayload {
  path: string;
  message: string;
}

interface SerialOpenPortStatus {
  path: string;
  isOpen: boolean;
  baudRate: number;
}

interface RsmElectronApi {
  isElectron: true;
  listSerialPorts(): Promise<
    Array<{
      path: string;
      manufacturer?: string;
      serialNumber?: string;
      friendlyName?: string;
    }>
  >;
  connectSerial(path: string, baudRate?: number): Promise<{ ok: boolean; error?: string; baudRate?: number }>;
  disconnectSerial(path: string): Promise<{ ok: boolean }>;
  writeSerial(path: string, data: number[]): Promise<{ ok: boolean; error?: string; bytes?: number }>;
  setSerialBaud(path: string, baudRate: number): Promise<{ ok: boolean; error?: string; baudRate?: number }>;
  getSerialStatus(): Promise<{ open: SerialOpenPortStatus[] }>;
  onSerialData(callback: (payload: SerialDataPayload) => void): () => void;
  onSerialDisconnected(callback: (payload: SerialPathPayload) => void): () => void;
  onSerialError(callback: (payload: SerialErrorPayload) => void): () => void;
}

interface Window {
  rsmElectron?: RsmElectronApi;
}
