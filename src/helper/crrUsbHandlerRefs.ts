import type { CrrUsbLcIdResolver, CrrUsbWeightHandler } from './crrUsbPipeline';

const NOOP_WEIGHT: CrrUsbWeightHandler = () => undefined;
const NOOP_RESOLVE: CrrUsbLcIdResolver = () => null;

/** Live USB → Monitor handlers (CommonLayout). */
export const crrUsbHandlerRefs: {
  onWeight: CrrUsbWeightHandler;
  resolveLcId: CrrUsbLcIdResolver;
} = {
  onWeight: NOOP_WEIGHT,
  resolveLcId: NOOP_RESOLVE,
};

export function isCrrUsbHandlerLive(): boolean {
  return crrUsbHandlerRefs.onWeight !== NOOP_WEIGHT;
}

export function clearCrrUsbHandlerRefs(): void {
  crrUsbHandlerRefs.onWeight = NOOP_WEIGHT;
  crrUsbHandlerRefs.resolveLcId = NOOP_RESOLVE;
}
