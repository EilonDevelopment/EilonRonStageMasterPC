/**
 * @deprecated Use crrUsbHandlerRefs directly.
 */
import { clearCrrUsbHandlerRefs, crrUsbHandlerRefs } from './crrUsbHandlerRefs';
import type { CrrUsbLcIdResolver, CrrUsbWeightHandler } from './crrUsbPipeline';

export type CrrUsbActiveHandlers = {
  onWeight: CrrUsbWeightHandler;
  resolveLcId: CrrUsbLcIdResolver;
};

export function bindCrrUsbActiveLayout(handlers: CrrUsbActiveHandlers): void {
  crrUsbHandlerRefs.onWeight = handlers.onWeight;
  crrUsbHandlerRefs.resolveLcId = handlers.resolveLcId;
}

export function clearCrrUsbActiveLayout(): void {
  clearCrrUsbHandlerRefs();
}

export function getCrrUsbActiveLayout(): typeof crrUsbHandlerRefs {
  return crrUsbHandlerRefs;
}
