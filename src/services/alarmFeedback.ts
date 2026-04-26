import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Shared alarm feedback: Web Audio beeps + native haptics.
 * iOS WKWebView keeps AudioContext suspended until a user gesture; BLE-driven alarms are not gestures,
 * so we prime audio on first touch/pointerdown and reuse one context app-wide.
 */

let audioContext: AudioContext | null = null;
let suspendTimer: number | null = null;
let primingListenersAttached = false;

const SUSPEND_AFTER_MS = 8000;
const isNativeIos = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

function scheduleAudioSuspend(): void {
  // iOS WKWebView can require a fresh user gesture after some suspend/resume cycles.
  // Keep alarm audio context alive on native iOS to avoid "mute until touch" regressions.
  if (isNativeIos) return;
  if (suspendTimer != null) window.clearTimeout(suspendTimer);
  suspendTimer = window.setTimeout(() => {
    suspendTimer = null;
    if (audioContext && audioContext.state === 'running') {
      void audioContext.suspend();
    }
  }, SUSPEND_AFTER_MS);
}

/**
 * Run synchronously from touchstart/pointerdown so iOS unlocks output.
 */
export function primeAlarmAudioFromUserGesture(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new Ctx();
    }
    void audioContext.resume();
    const buf = audioContext.createBuffer(1, 1, 22050);
    const src = audioContext.createBufferSource();
    src.buffer = buf;
    src.connect(audioContext.destination);
    src.start(0);
    scheduleAudioSuspend();
  } catch {
    /* ignore */
  }
}

/** Attach once: first tap anywhere primes audio for later overload/underload beeps. */
export function initAlarmAudioPriming(): void {
  if (primingListenersAttached || typeof document === 'undefined') return;
  primingListenersAttached = true;
  const handler = () => primeAlarmAudioFromUserGesture();
  document.addEventListener('touchstart', handler, { capture: true, passive: true });
  document.addEventListener('pointerdown', handler, { capture: true, passive: true });
}

async function getAudioContext(): Promise<AudioContext | null> {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new Ctx();
    }
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    return audioContext;
  } catch (e) {
    console.warn('Alarm audio context unavailable:', e);
    return null;
  }
}

function playNativeHapticBurst(count: number, stepMs: number): void {
  if (!Capacitor.isNativePlatform()) return;
  void (async () => {
    try {
      await Haptics.notification({ type: NotificationType.Warning });
    } catch {
      /* no-op */
    }
    for (let i = 1; i < count; i++) {
      await new Promise((r) => setTimeout(r, stepMs));
      try {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } catch {
        /* no-op */
      }
    }
  })();
}

/** After backgrounding, WKWebView may suspend audio again; call from App `resume`. */
export async function resumeAlarmAudioIfPossible(): Promise<void> {
  try {
    if (!audioContext || audioContext.state === 'closed') return;
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
  } catch {
    /* ignore */
  }
}

export function playAlarmBeep(count = 1, frequency = 800, duration = 200): void {
  const stepMs = duration + 100;
  playNativeHapticBurst(Math.max(1, count), stepMs);

  for (let i = 0; i < count; i++) {
    window.setTimeout(() => {
      void (async () => {
        const ctx = await getAudioContext();
        if (!ctx) return;

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration / 1000);

        oscillator.onended = () => {
          try {
            oscillator.disconnect();
            gainNode.disconnect();
          } catch {
            /* nodes may already be disconnected */
          }
        };

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + duration / 1000);
        scheduleAudioSuspend();
      })();
    }, i * stepMs);
  }
}
