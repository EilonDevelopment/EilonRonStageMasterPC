import { isDesktopPc } from './appPlatform';
import { CrrPacketFramer } from './prrPacketFramer';
import { crrUsbRuntime } from './crrUsbRuntime';
import { subscribeUsbSerialData } from './usbSerialBridge';

export type CrrUsbBleHandler = (packet: Uint8Array, portPath?: string) => void | Promise<void>;
export type CrrUsbLcIdResolver = (idLow: number) => number | null;

const framerByPort = new Map<string, CrrPacketFramer>();
let unsubscribeData: (() => void) | null = null;

function bytesToHex(data: Uint8Array): string {
  return Array.from(data)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

function getFramer(portPath: string): CrrPacketFramer {
  let framer = framerByPort.get(portPath);
  if (!framer) {
    framer = new CrrPacketFramer(
      (ble) => {
        crrUsbRuntime.stats.framesEmitted += 1;
        crrUsbRuntime.stats.lastBleHex = bytesToHex(ble);
        const lcId = (ble[3] << 16) | (ble[4] << 8) | ble[5];
        const wire = ((ble[0] << 8) | ble[1]) & 0xffff;
        const signedRaw = (((ble[6] << 24) | (ble[7] << 16) | (ble[8] << 8) | ble[9]) | 0);
        const kg = signedRaw / 10;
        crrUsbRuntime.stats.lastLcId = lcId;
        crrUsbRuntime.stats.lastWireU16 = wire || null;
        crrUsbRuntime.stats.lastAnchorU16 = wire ? ((wire - signedRaw) & 0xffff) : null;
        crrUsbRuntime.stats.lastG5Raw = signedRaw;
        crrUsbRuntime.stats.lastWeightKg = kg;
        crrUsbRuntime.stats.lastWeightMton = kg / 1000;
        crrUsbRuntime.stats.btParseCalls += 1;
        void crrUsbRuntime.btParse(ble, portPath);
      },
      (idLow) => crrUsbRuntime.resolveLcId(idLow)
    );
    framerByPort.set(portPath, framer);
  }
  return framer;
}

/** Install IPC → framer bridge once (desktop). */
export function ensureCrrUsbPipeline(): void {
  if (!isDesktopPc() || unsubscribeData) return;

  unsubscribeData = subscribeUsbSerialData((portPath, chunk) => {
    crrUsbRuntime.stats.rxChunks += 1;
    getFramer(portPath).push(chunk);
  });
}

export function resetCrrUsbFramer(portPath: string): void {
  framerByPort.get(portPath)?.reset();
}

export function dropCrrUsbFramer(portPath: string): void {
  framerByPort.delete(portPath);
}
