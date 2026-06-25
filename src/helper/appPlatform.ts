import { Capacitor } from '@capacitor/core';

/** Desktop PC build (Electron + USB). Mobile repo uses Capacitor android/ios only. */
export function getAppPlatform(): string {
  if (typeof window !== 'undefined' && window.rsmElectron?.isElectron) {
    return 'electron';
  }
  return Capacitor.getPlatform();
}

export function isDesktopPc(): boolean {
  return getAppPlatform() === 'electron';
}

export function isWebLikePlatform(): boolean {
  const p = getAppPlatform();
  return p === 'web' || p === 'electron';
}

export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform() && !isDesktopPc();
}
