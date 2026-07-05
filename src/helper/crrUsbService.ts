import { isDesktopPc } from './appPlatform';
import { normalizeProjectId } from './functions';
import { isRs485Lc } from './lcLinkType';
import type { ILC } from './types';
import {
  bufferContainsCrrIdentity,
  bufferContainsCrrSaveAck,
  buildCrrReturnCodePacket,
  buildCrrS2sPacket,
  CrrS2sCell,
} from './crrProtocol';
import {
  buildLabviewSaveWireBlob,
  type LabviewSaveConfigPatch,
} from './crrSaveParameters';
import type { CrrSettingsConfig } from './crrSettingsModel';
import type { SerialPortInfo } from './usbSerialBridge';
import {
  disconnectUsbSerial,
  subscribeUsbSerialData,
  writeUsbSerial,
} from './usbSerialBridge';

const CRR_IDENTIFY_TIMEOUT_MS = 3000;
const CRR_IDENTIFY_POLL_MS = 40;
const CRR_SAVE_ACK_TIMEOUT_MS = 8000;
const CRR_SAVE_ACK_POLL_MS = 40;

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
  while (list.length > 128) {
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

export type CrrS2sPartition = {
  /** First S2S section: every LC (RF + RS485), per CRR/LabVIEW. */
  allCells: CrrS2sCell[];
  /** Second S2S section: RS485/wired only (may repeat IDs from allCells). */
  wiredCells: CrrS2sCell[];
};

function lcToS2sCell(lc: ILC): CrrS2sCell | null {
  const id = Number.parseInt(String(lc.id), 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return { export: 0, id };
}

/**
 * Build S2S lists for CRR Set-LC-List (0x32).
 * Section 1: all project LCs. Section 2: RS485 subset only.
 */
export function lcsToS2sPartition(lcs: ILC[], projectId: string): CrrS2sPartition {
  const pid = normalizeProjectId(projectId);
  const allCells: CrrS2sCell[] = [];
  const wiredCells: CrrS2sCell[] = [];
  lcs
    .filter((lc) => normalizeProjectId(lc.project_id) === pid)
    .forEach((lc) => {
      const cell = lcToS2sCell(lc);
      if (!cell) return;
      allCells.push(cell);
      if (isRs485Lc(lc)) {
        wiredCells.push(cell);
      }
    });
  allCells.sort((a, b) => a.id - b.id);
  wiredCells.sort((a, b) => a.id - b.id);
  return { allCells, wiredCells };
}

/** @deprecated Use {@link lcsToS2sPartition}. */
export function lcsToS2sCells(lcs: ILC[], projectId: string): CrrS2sCell[] {
  const { allCells } = lcsToS2sPartition(lcs, projectId);
  return allCells;
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

export async function sendCrrS2sList(
  portPath: string,
  allCells: CrrS2sCell[],
  wiredCells: CrrS2sCell[] = [],
): Promise<{ ok: boolean; error?: string }> {
  const primary = allCells.filter((c) => Number.isFinite(c.id) && c.id > 0);
  const wired = wiredCells.filter((c) => Number.isFinite(c.id) && c.id > 0);
  const packet = buildCrrS2sPacket(primary, wired);
  return writeUsbSerial(portPath, packet);
}

export type LabviewSaveResult = {
  ok: boolean;
  ack: boolean;
  error?: string;
};

/**
 * LabVIEW Save Parameters to CRR — one contiguous ~5525 B wire blob (P1+P2).
 * Do NOT send identify 0x34 before save (CRR ignores commit after identify).
 */
export async function sendLabviewSaveToCrr(
  portPath: string,
  patch?: LabviewSaveConfigPatch | CrrSettingsConfig,
  options?: { waitForAckMs?: number },
): Promise<LabviewSaveResult> {
  ensureRxListener();
  clearRx(portPath);

  const blob = buildLabviewSaveWireBlob(patch);
  const writeResult = await writeUsbSerial(portPath, blob, { atomic: true });
  if (!writeResult.ok) {
    return { ok: false, ack: false, error: writeResult.error };
  }

  const waitMs = options?.waitForAckMs ?? CRR_SAVE_ACK_TIMEOUT_MS;
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const merged = mergedRx(portPath);
    if (merged.length > 0 && bufferContainsCrrSaveAck(merged)) {
      clearRx(portPath);
      return { ok: true, ack: true };
    }
    await sleep(CRR_SAVE_ACK_POLL_MS);
  }

  clearRx(portPath);
  return { ok: true, ack: false };
}

/** Wait for LabVIEW save commit ack (` IDN_ 1`) after P2 has been sent. */
export async function waitForCrrSaveAck(
  portPath: string,
  timeoutMs = CRR_SAVE_ACK_TIMEOUT_MS,
): Promise<boolean> {
  ensureRxListener();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const merged = mergedRx(portPath);
    if (merged.length > 0 && bufferContainsCrrSaveAck(merged)) {
      clearRx(portPath);
      return true;
    }
    await sleep(CRR_SAVE_ACK_POLL_MS);
  }
  clearRx(portPath);
  return false;
}

export async function disconnectCrrUsb(portPath: string): Promise<void> {
  if (verifiedCrrPort === portPath) {
    verifiedCrrPort = null;
  }
  clearRx(portPath);
  await disconnectUsbSerial(portPath);
}
