/**
 * COORDINATION — iOS branch (Mac / Cursor) ↔ Android branch (Windows / Cursor)
 * ---------------------------------------------------------------------------
 * This module owns **native BLE scan prerequisites** so `CommonLayout.tsx` stays thin.
 *
 * For the Android-side teammate / other Cursor instance:
 * - If you need to change *when* we block the user before scanning (e.g. new Android
 *   permission rules), prefer editing **here** instead of inlining logic in CommonLayout.
 * - iOS does **not** require location for BLE scan like Android; do not re-add a global
 *   `isLocationEnabled()` check for all platforms without discussing — it breaks iPad.
 * - After merging `ios-development-ai` into your branch (or into `main`), run your usual
 *   Android tests; this file is shared — avoid Android-only hacks that break `ios` path.
 *
 * Coordinación (ES): La lógica “¿Bluetooth? ¿GPS solo en Android?” vive aquí. Para menos
 * conflictos en merge, ampliá reglas en este archivo, no dupliquéis en CommonLayout.
 */
import { Capacitor } from '@capacitor/core';
import { BleClient } from '@capacitor-community/bluetooth-le';

export type BleScanPrerequisiteFailure =
  | { ok: false; reason: 'bluetooth_off' }
  | { ok: false; reason: 'location_off' };

export type BleScanPrerequisiteResult = { ok: true } | BleScanPrerequisiteFailure;

/**
 * Preconditions before starting a BLE device scan.
 * - Android: Bluetooth + location services (common requirement for BLE scan).
 * - iOS/iPadOS: Bluetooth only (do not gate on GPS like Android).
 * Keep platform rules here so CommonLayout stays merge-friendly across iOS/Android branches.
 */
export async function checkNativeBleScanPrerequisites(): Promise<BleScanPrerequisiteResult> {
  if (Capacitor.getPlatform() === 'web') {
    return { ok: true };
  }

  const bluetoothEnabled = await BleClient.isEnabled();
  if (!bluetoothEnabled) {
    return { ok: false, reason: 'bluetooth_off' };
  }

  if (Capacitor.getPlatform() === 'android') {
    const locationEnabled = await BleClient.isLocationEnabled();
    if (!locationEnabled) {
      return { ok: false, reason: 'location_off' };
    }
  }

  return { ok: true };
}
