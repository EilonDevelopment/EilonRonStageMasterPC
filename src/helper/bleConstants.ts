/**
 * Central BLE timing for native picker + connect (iOS/Android).
 * Plugin defaults: connect 10000ms, other calls 5000ms — see @capacitor-community/bluetooth-le TimeoutOptions.
 */

/** How long to run LE scan before showing the device list (was 6000ms). */
export const BLE_SCAN_DURATION_MS = 12_000;

/** BleClient.connect() timeout (default plugin value is 10_000ms). */
export const BLE_CONNECT_TIMEOUT_MS = 20_000;
