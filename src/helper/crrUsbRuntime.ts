import type { CrrUsbWeightHandler, CrrUsbLcIdResolver } from './crrUsbPipeline';
import { crrUsbHandlerRefs, isCrrUsbHandlerLive } from './crrUsbHandlerRefs';

export type CrrUsbRuntimeStats = {
  rxChunks: number;
  framesEmitted: number;
  framerCandidates: number;
  resolveNull: number;
  weightCalls: number;
  weightAccepted: number;
  lastRawRxHex: string;
  framerBufferBytes: number;
  lastLcId: number | null;
  lastG4Flags: number | null;
  lastG4Units: number | null;
  lastG4ValueInUnits: number | null;
  lastWeightKg: number | null;
  lastWeightMton: number | null;
  lastGrossKg: number | null;
  lastWireHex: string;
  lastUiValue: string;
  lastDropReason: string;
};

/** Last time any USB RX chunk arrived (raw serial activity). */
export let crrUsbLastRxAtMs = 0;

export function markCrrUsbRx(): void {
  crrUsbLastRxAtMs = Date.now();
}

/** Skip global Tr.Err silence while CRR USB link is starting (S2S + first frames). */
export let crrUsbLinkGraceUntilMs = 0;

export function beginCrrUsbLinkSession(): void {
  crrUsbLinkGraceUntilMs = Date.now() + 4000;
}

export function isCrrUsbLinkGraceActive(): boolean {
  return Date.now() < crrUsbLinkGraceUntilMs;
}

export {
  g4BatteryPercent,
  g4ChecksumValid,
  g4DecodeLcId,
  g4DecodeWeightInUnits,
  g4UnitsCode,
  g4WeightToMton,
} from './crrUsbWeight';

export const crrUsbRuntime = {
  onWeight: ((_sample, _portPath) => {}) as CrrUsbWeightHandler,
  resolveLcId: ((_decodedId) => null) as CrrUsbLcIdResolver,
  stats: {
    rxChunks: 0,
    framesEmitted: 0,
    framerCandidates: 0,
    resolveNull: 0,
    weightCalls: 0,
    weightAccepted: 0,
    lastRawRxHex: '',
    framerBufferBytes: 0,
    lastLcId: null,
    lastG4Flags: null,
    lastG4Units: null,
    lastG4ValueInUnits: null,
    lastWeightKg: null,
    lastWeightMton: null,
    lastGrossKg: null,
    lastWireHex: '',
    lastUiValue: '',
    lastDropReason: '',
  } as CrrUsbRuntimeStats,
};

export function bindCrrUsbRuntime(handlers: {
  onWeight: CrrUsbWeightHandler;
  resolveLcId: CrrUsbLcIdResolver;
}): void {
  crrUsbRuntime.onWeight = handlers.onWeight;
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
  (window as any).rsmCrrDebug = () => ({
    ...crrUsbRuntime.stats,
    handlerReady: isCrrUsbHandlerLive(),
  });
  (window as any).__rsmCrrTest = (window as any).__rsmCrrTest ?? false;
}
