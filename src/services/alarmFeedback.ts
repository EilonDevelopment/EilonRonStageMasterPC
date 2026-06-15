import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Shared alarm feedback: Web Audio beeps + native haptics + local notifications in background.
 * iOS WKWebView cannot reliably play Web Audio while minimized; local notifications use the system sound.
 */

export type SafetyAlarmDetail = {
  title?: string;
  body?: string;
};

let audioContext: AudioContext | null = null;
let suspendTimer: number | null = null;
let primingListenersAttached = false;
let appInForeground = true;
let pendingAlarmBurst = false;
let notificationsReady = false;
let notificationsInitStarted = false;
let lastBgNotificationAt = 0;
let notificationIdCounter = 9000;

/** Must match `ios/App/App/safety_alarm.wav` in the Xcode bundle (Capacitor: no sound on iOS if omitted). */
const SAFETY_ALARM_SOUND = 'safety_alarm.wav';

let iosAlarmAudio: HTMLAudioElement | null = null;
let iosAlarmAudioUrl: string | null = null;

const SUSPEND_AFTER_MS = 8000;

/** Request permission for background alarm sounds via local notifications (native only). */
export async function initSafetyAlarmNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform() || notificationsInitStarted) return;
  notificationsInitStarted = true;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display === 'granted') {
      notificationsReady = true;
      return;
    }
    if (display === 'prompt' || display === 'prompt-with-rationale') {
      const req = await LocalNotifications.requestPermissions();
      notificationsReady = req.display === 'granted';
    }
  } catch {
    notificationsReady = false;
  }
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  if (notificationsReady) return true;
  await initSafetyAlarmNotifications();
  return notificationsReady;
}

/** iOS/Android: system notification sound while app is minimized (Web Audio is blocked). */
async function playBackgroundAlarmNotification(detail: SafetyAlarmDetail): Promise<boolean> {
  if (!(await ensureNotificationPermission())) return false;
  const now = Date.now();
  if (now - lastBgNotificationAt < 1000) return false;
  lastBgNotificationAt = now;
  try {
    const id = (notificationIdCounter++ % 10000) + 9000;
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: detail.title ?? 'Stage Master',
          body: detail.body ?? 'Safety alarm',
          sound: SAFETY_ALARM_SOUND,
          schedule: { at: new Date(now + 50) },
          autoCancel: true,
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

const isNativeIos = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

function encodeWavBlob(frequency: number, durationSec: number, sampleRate = 22050): Blob {
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = 1 - i / numSamples;
    const sample = Math.sin((2 * Math.PI * frequency * t)) * 0.35 * envelope;
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, Math.floor(sample * 32767))), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function ensureIosAlarmAudioElement(): HTMLAudioElement | null {
  if (!isNativeIos || typeof Audio === 'undefined') return null;
  if (!iosAlarmAudio) {
    iosAlarmAudio = new Audio();
    iosAlarmAudio.preload = 'auto';
    iosAlarmAudio.setAttribute('playsinline', 'true');
    if (!iosAlarmAudioUrl) {
      iosAlarmAudioUrl = URL.createObjectURL(encodeWavBlob(800, 0.22));
    }
    iosAlarmAudio.src = iosAlarmAudioUrl;
  }
  return iosAlarmAudio;
}

function scheduleAudioSuspend(): void {
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

    const iosAudio = ensureIosAlarmAudioElement();
    if (iosAudio) {
      iosAudio.volume = 0.01;
      void iosAudio.play().then(() => {
        iosAudio.pause();
        iosAudio.currentTime = 0;
        iosAudio.volume = 1;
      }).catch(() => {
        iosAudio.volume = 1;
      });
    }
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

async function playWebAudioBeep(frequency: number, duration: number): Promise<boolean> {
  try {
    const ctx = await getAudioContext();
    if (!ctx || ctx.state !== 'running') return false;

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
    return true;
  } catch {
    return false;
  }
}

async function playIosElementBeep(): Promise<boolean> {
  const a = ensureIosAlarmAudioElement();
  if (!a) return false;
  try {
    a.currentTime = 0;
    await a.play();
    return true;
  } catch {
    return false;
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

async function playSingleBeep(frequency: number, duration: number): Promise<boolean> {
  const viaCtx = await playWebAudioBeep(frequency, duration);
  if (viaCtx) return true;
  if (isNativeIos) return playIosElementBeep();
  return false;
}

async function playBeepBurst(count: number, frequency: number, duration: number): Promise<boolean> {
  const stepMs = duration + 100;
  let anyPlayed = false;
  for (let i = 0; i < count; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, stepMs));
    if (await playSingleBeep(frequency, duration)) anyPlayed = true;
  }
  return anyPlayed;
}

export function setAlarmAppInForeground(active: boolean): void {
  appInForeground = active;
}

/** After backgrounding, WKWebView may suspend audio again; call from App `resume`. */
export async function resumeAlarmAudioIfPossible(): Promise<void> {
  appInForeground = true;
  try {
    if (audioContext && audioContext.state === 'closed') {
      audioContext = null;
    }
    if (audioContext?.state === 'suspended') {
      await audioContext.resume();
    }
    if (isNativeIos) {
      const a = ensureIosAlarmAudioElement();
      if (a) {
        try {
          a.currentTime = 0;
          await a.play();
          a.pause();
          a.currentTime = 0;
        } catch {
          /* may still need a user tap on strict iOS builds */
        }
      }
    }
  } catch {
    /* ignore */
  }
  flushAlarmBeepsOnForeground();
}

export function flushAlarmBeepsOnForeground(): void {
  if (!pendingAlarmBurst) return;
  pendingAlarmBurst = false;
  void playBeepBurst(4, 800, 200);
}

export function playAlarmBeep(
  count = 1,
  frequency = 800,
  duration = 200,
  detail?: SafetyAlarmDetail,
): void {
  const stepMs = duration + 100;
  playNativeHapticBurst(Math.max(1, count), stepMs);

  const alarmDetail: SafetyAlarmDetail = {
    title: detail?.title ?? 'Stage Master',
    body: detail?.body ?? 'Safety alarm',
  };

  if (!appInForeground) {
    void (async () => {
      const notified = await playBackgroundAlarmNotification(alarmDetail);
      const played = await playBeepBurst(count, frequency, duration);
      if (!notified && !played) pendingAlarmBurst = true;
    })();
    return;
  }

  void (async () => {
    const played = await playBeepBurst(count, frequency, duration);
    if (!played) pendingAlarmBurst = true;
  })();
}
