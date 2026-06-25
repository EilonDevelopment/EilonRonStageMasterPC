import { isDesktopPc } from './appPlatform';
import { normalizeProjectId } from './functions';
import type { ILC } from './types';
import {
  bufferContainsCrrIdentity,
  buildCrrReturnCodePacket,
  buildCrrS2sPacket,
  CrrS2sCell,
} from './crrProtocol';
import type { SerialPortInfo } from './usbSerialBridge';
import {
  disconnectUsbSerial,
  subscribeUsbSerialData,
  writeUsbSerial,
} from './usbSerialBridge';

const CRR_IDENTIFY_TIMEOUT_MS = 3000;
const CRR_IDENTIFY_POLL_MS = 40;

let verifiedCrrPort: string | null = null;
let syncHandler: (() => Promise<void>) | null = null;

const rxByPort = new Map<string, Uint8Array[]>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function appendRx(portPath: string, chunk: Uint8Array): void {
  const list = rxByPort.get(portPath) ?? [];
  list.push(chunk);
  while (list.length > 32) {
    list.shift();
  }
  rxByPort.set(portPath, list);
}

function clearRx(portPath: string): void {
  rxByPort.delete(portPath);
}

function mergedRx(portPath: string): Uint8Array {
  const chunks = rxByPort.get(portPath) ?? [];
  if (chunks.length === 0) return new Uint8Array(0);
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
}

let rxListenerInstalled = false;

function ensureRxListener(): void {
  if (rxListenerInstalled || !isDesktopPc()) return;
  subscribeUsbSerialData((portPath, chunk) => {
    appendRx(portPath, chunk);
  });
  rxListenerInstalled = true;
}

export function isFtdiSerialPort(port: SerialPortInfo): boolean {
  const manufacturer = String(port.manufacturer ?? '').toLowerCase();
  const friendlyName = String(port.friendlyName ?? '').toLowerCase();
  return manufacturer.includes('ftdi') || friendlyName.includes('ftdi');
}

export function lcsToS2sCells(lcs: ILC[], projectId: string): CrrS2sCell[] {
  const pid = normalizeProjectId(projectId);
  return lcs
    .filter((lc) => normalizeProjectId(lc.project_id) === pid)
    .map((lc) => ({ export: 0, id: Number.parseInt(String(lc.id), 10) }))
    .filter((cell) => Number.isFinite(cell.id) && cell.id > 0)
    .sort((a, b) => a.id - b.id);
}

export function getVerifiedCrrPort(): string | null {
  return verifiedCrrPort;
}

export function setVerifiedCrrPort(portPath: string | null): void {
  verifiedCrrPort = portPath;
}

export function registerCrrLcListSync(handler: () => Promise<void>): () => void {
  syncHandler = handler;
  return () => {
    if (syncHandler === handler) {
      syncHandler = null;
    }
  };
}

export async function requestCrrLcListSync(): Promise<void> {
  if (!isDesktopPc() || !verifiedCrrPort || !syncHandler) return;
  await syncHandler();
}

export async function identifyCrrDevice(portPath: string): Promise<boolean> {
  ensureRxListener();
  clearRx(portPath);

  const packet = buildCrrReturnCodePacket();
  const writeResult = await writeUsbSerial(portPath, packet);
  if (!writeResult.ok) {
    return false;
  }

  const deadline = Date.now() + CRR_IDENTIFY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const merged = mergedRx(portPath);
    if (merged.length > 0 && bufferContainsCrrIdentity(merged)) {
      clearRx(portPath);
      return true;
    }
    await sleep(CRR_IDENTIFY_POLL_MS);
  }

  clearRx(portPath);
  return false;
}

export async function sendCrrS2sList(portPath: string, cells: CrrS2sCell[]): Promise<{ ok: boolean; error?: string }> {
  const rfCells = cells.filter((c) => Number.isFinite(c.id) && c.id > 0);
  const packet = buildCrrS2sPacket(rfCells, []);
  return writeUsbSerial(portPath, packet);
}

export async function disconnectCrrUsb(portPath: string): Promise<void> {
  if (verifiedCrrPort === portPath) {
    verifiedCrrPort = null;
  }
  clearRx(portPath);
  await disconnectUsbSerial(portPath);
}
