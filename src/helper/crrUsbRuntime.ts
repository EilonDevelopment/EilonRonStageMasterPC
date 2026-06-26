import type { CrrUsbBleHandler, CrrUsbLcIdResolver } from './crrUsbPipeline';
import { crrUsbG5SignedRawFromFrame, crrUsbG5WeightKgFromFrame, crrUsbWeightAnchorU16, crrUsbWireU16 } from './crrUsbWeight';

export type CrrUsbRuntimeStats = {
  rxChunks: number;
  framesEmitted: number;
  resolveNull: number;
  btParseCalls: number;
  btParseAccepted: number;
  lastBleHex: string;
  lastLcId: number | null;
  lastWireU16: number | null;
  lastAnchorU16: number | null;
  lastG5Raw: number | null;
  lastWeightKg: number | null;
  lastWeightMton: number | null;
  lastUiValue: string;
  lastDropReason: string;
};

/** Skip global Tr.Err silence while CRR USB link is starting (S2S + first frames). */
export let crrUsbLinkGraceUntilMs = 0;

export function beginCrrUsbLinkSession(): void {
  crrUsbLinkGraceUntilMs = Date.now() + 12_000;
}

export function isCrrUsbLinkGraceActive(): boolean {
  return Date.now() < crrUsbLinkGraceUntilMs;
}

export { crrUsbG5SignedRawFromFrame, crrUsbG5WeightKgFromFrame, crrUsbWeightAnchorU16, crrUsbWireU16 } from './crrUsbWeight';

export const crrUsbRuntime = {
  btParse: ((_packet: Uint8Array, _portPath?: string) => {}) as CrrUsbBleHandler,
  resolveLcId: ((_idLow: number) => null) as CrrUsbLcIdResolver,
  stats: {
    rxChunks: 0,
    framesEmitted: 0,
    resolveNull: 0,
    btParseCalls: 0,
    btParseAccepted: 0,
    lastBleHex: '',
    lastLcId: null,
    lastWireU16: null,
    lastAnchorU16: null,
    lastG5Raw: null,
    lastWeightKg: null,
    lastWeightMton: null,
    lastUiValue: '',
    lastDropReason: '',
  } as CrrUsbRuntimeStats,
};

export function bindCrrUsbRuntime(handlers: {
  btParse: CrrUsbBleHandler;
  resolveLcId: CrrUsbLcIdResolver;
}): void {
  crrUsbRuntime.btParse = handlers.btParse;
  crrUsbRuntime.resolveLcId = handlers.resolveLcId;
}

export function logCrrUsbDrop(reason: string): void {
  crrUsbRuntime.stats.lastDropReason = reason;
  if (typeof window !== 'undefined' && ((window as any).__rsmCrrTest || (window as any).__rsmCrrText)) {
    console.info('[CRR USB]', reason);
  }
}

export function installCrrUsbDebugConsole(): void {
  if (typeof window === 'undefined') return;
  (window as any).rsmCrrDebug = () => ({ ...crrUsbRuntime.stats });
  (window as any).__rsmCrrTest = (window as any).__rsmCrrTest ?? false;
}
