import { BleClient } from '@capacitor-community/bluetooth-le';
import type { ScanResult } from '@capacitor-community/bluetooth-le';

export interface BleDiscoveredDevice {
  deviceId: string;
  name?: string;
  rssi?: number;
}

/**
 * Scan for BLE peripherals advertising `serviceUuid`, merge results by deviceId, then stop scan.
 * Used instead of `requestDevice()` so we can show a real list + Connect in app UI (iOS/Android).
 * @param abortRef - set `.current = true` to end scan early (e.g. user closed modal).
 */
export async function collectBleDevicesForService(
  serviceUuid: string,
  scanDurationMs: number,
  optionalServices: string[] = [],
  abortRef?: { current: boolean }
): Promise<BleDiscoveredDevice[]> {
  const byId = new Map<string, BleDiscoveredDevice>();

  try {
    await BleClient.requestLEScan(
      {
        services: [serviceUuid],
        optionalServices,
        allowDuplicates: false,
      },
      (result: ScanResult) => {
        const id = result.device.deviceId;
        const name =
          result.device.name ||
          result.localName ||
          byId.get(id)?.name;
        const rssi = result.rssi ?? byId.get(id)?.rssi;
        byId.set(id, { deviceId: id, name, rssi });
      }
    );

    const start = Date.now();
    while (Date.now() - start < scanDurationMs) {
      if (abortRef?.current) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  } finally {
    await BleClient.stopLEScan().catch(() => undefined);
  }

  if (abortRef?.current) {
    return [];
  }

  return Array.from(byId.values()).sort(
    (a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)
  );
}
