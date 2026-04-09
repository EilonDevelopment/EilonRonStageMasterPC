/**
 * COORDINATION — iOS branch (Mac / Cursor) ↔ Android branch (Windows / Cursor)
 * ---------------------------------------------------------------------------
 * Native CSV import via `@capawesome/capacitor-file-picker` for **Android + iOS**.
 * Web still uses a hidden `<input type="file">` in CommonLayout.
 *
 * For the Android-side teammate / other Cursor instance:
 * - If MIME types or read options must change for Android, update **PROJECT_IMPORT_CSV_TYPES**
 *   or `pickProjectCsvText()` here so iOS stays in sync.
 * - If you add another native import format, extend this module rather than branching
 *   only inside CommonLayout (reduces merge conflicts with the Mac branch).
 *
 * Coordinación (ES): Import CSV nativo centralizado aquí. Cambios de picker → este archivo.
 */
import { Capacitor } from '@capacitor/core';
import { FilePicker } from '@capawesome/capacitor-file-picker';

export const PROJECT_IMPORT_CSV_TYPES = [
  'text/csv',
  'application/csv',
  'text/comma-separated-values',
] as const;

/**
 * Native file picker for CSV import (Android + iOS). Web keeps using a hidden file input.
 * Centralized here to avoid large diffs in CommonLayout when merging iOS/Mac and Android branches.
 */
export function shouldUseNativeCsvPickerForImport(): boolean {
  const p = Capacitor.getPlatform();
  return p === 'android' || p === 'ios';
}

/** Returns decoded UTF-8 text, or null if user cancelled / no data. */
export async function pickProjectCsvText(): Promise<string | null> {
  const result = await FilePicker.pickFiles({
    types: [...PROJECT_IMPORT_CSV_TYPES],
    readData: true,
  });
  const file = result.files?.[0];
  if (!file?.data) {
    return null;
  }
  const binary = atob(file.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}
