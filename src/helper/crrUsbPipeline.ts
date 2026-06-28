import type { CrrUsbWeightSample } from './crrUsbDisplay';
import { crrUsbHandlerRefs } from './crrUsbHandlerRefs';
import { isDesktopPc } from './appPlatform';
import { CrrPacketFramer } from './prrPacketFramer';
import { crrUsbRuntime, markCrrUsbRx } from './crrUsbRuntime';
import {
  crrUsbDecodeWeightFromFrame,
  g4BatteryPercent,
  g4DecodeLcId,
  g4SliceFromUsbFrame,
} from './crrUsbWeight';
import { subscribeUsbSerialData } from './usbSerialBridge';

export type CrrUsbWeightHandler = (sample: CrrUsbWeightSample, portPath?: string) => void;
export type CrrUsbLcIdResolver = (decodedId: number) => number | null;

const framerByPort = new Map<string, CrrPacketFramer>();
let unsubscribeData: (() => void) | null = null;

function bytesToHex(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

function resolveLcIdForFrame(decodedId: number): number | null {
  const resolved = crrUsbHandlerRefs.resolveLcId(decodedId);
  if (resolved !== null && resolved > 0) return resolved;
  return decodedId > 0 ? decodedId : null;
}

function handleCrrWeightFrame(frame: Uint8Array, portPath: string): void {
  const decoded = crrUsbDecodeWeightFromFrame(frame);
  if (!decoded) {
    crrUsbRuntime.stats.resolveNull += 1;
    crrUsbRuntime.stats.lastDropReason = 'decode failed';
    return;
  }

  const g4 = g4SliceFromUsbFrame(frame);
  if (!g4) {
    crrUsbRuntime.stats.resolveNull += 1;
    crrUsbRuntime.stats.lastDropReason = 'no g4 slice';
    return;
  }

  const decodedId = g4DecodeLcId(g4);
  const lcId = resolveLcIdForFrame(decodedId);
  if (lcId === null || lcId <= 0) {
    crrUsbRuntime.stats.resolveNull += 1;
    crrUsbRuntime.stats.lastDropReason = `lc resolve failed for id ${decodedId}`;
    return;
  }

  const battery = g4BatteryPercent(g4);
  const sample: CrrUsbWeightSample = {
    lcId,
    grossMton: decoded.mton,
    battery,
    encoding: decoded.encoding,
  };

  crrUsbRuntime.stats.framesEmitted += 1;
  crrUsbRuntime.stats.lastLcId = lcId;
  crrUsbRuntime.stats.lastG4ValueInUnits = decoded.valueInUnits;
  crrUsbRuntime.stats.lastWeightMton = decoded.mton;
  crrUsbRuntime.stats.lastWeightKg = decoded.mton * 1000;
  crrUsbRuntime.stats.lastGrossKg = decoded.mton * 1000;
  crrUsbRuntime.stats.lastWireHex = decoded.signedRaw.toString(16);
  crrUsbRuntime.stats.lastG4Flags = g4[1] & 0xff;
  crrUsbRuntime.stats.lastG4Units = g4[1] & 0x0f;
  crrUsbRuntime.stats.weightCalls += 1;
  crrUsbRuntime.stats.lastDropReason = '';

  crrUsbHandlerRefs.onWeight(sample, portPath);
}

function getFramer(portPath: string): CrrPacketFramer {
  let framer = framerByPort.get(portPath);
  if (!framer) {
    framer = new CrrPacketFramer(
      (frame) => handleCrrWeightFrame(frame, portPath),
      (decodedId) => resolveLcIdForFrame(decodedId)
    );
    framerByPort.set(portPath, framer);
  }
  return framer;
}

/** Install IPC → framer → Monitor bridge once (desktop). */
export function ensureCrrUsbPipeline(): void {
  if (!isDesktopPc() || unsubscribeData) return;

  unsubscribeData = subscribeUsbSerialData((portPath, chunk) => {
    markCrrUsbRx();
    crrUsbRuntime.stats.rxChunks += 1;
    const preview = chunk.length > 96 ? chunk.slice(0, 96) : chunk;
    crrUsbRuntime.stats.lastRawRxHex = bytesToHex(preview);
    const framer = getFramer(portPath);
    framer.push(chunk);
    crrUsbRuntime.stats.framerBufferBytes = framer.getBufferLength();
  });
}

export function resetCrrUsbFramer(portPath: string): void {
  framerByPort.get(portPath)?.reset();
}

export function dropCrrUsbFramer(portPath: string): void {
  framerByPort.delete(portPath);
}
