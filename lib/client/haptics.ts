'use client';

/**
 * Haptics for the small controls — the button press, the tab you just moved to, the
 * round you flicked past. Everything else on this app is silent and mostly one-handed
 * at a board, so a short tick is the only feedback that doesn't disturb the room.
 *
 * Settings live in localStorage rather than on the server: it's a property of the
 * phone in your hand, not of your account, and the same account on a tablet shouldn't
 * inherit it. Every read and write is guarded — private mode throws on access.
 *
 * Support: Android/Chromium implement navigator.vibrate. iOS Safari does not (there is
 * no web API for the Taptic Engine), so `hapticsSupported()` is false there and the
 * settings panel says so instead of offering a control that does nothing.
 */

export type HapticIntensity = 'light' | 'medium' | 'strong';
export type HapticKind = 'tick' | 'select' | 'success' | 'warn';

export interface HapticSettings {
  enabled: boolean;
  intensity: HapticIntensity;
}

export const DEFAULT_HAPTICS: HapticSettings = { enabled: true, intensity: 'light' };

const KEY = 'pn:haptics';
const EVENT = 'pn:haptics-changed';

/** Base pulse length per intensity, in milliseconds. Kept short: this is a tick. */
const PULSE: Record<HapticIntensity, number> = { light: 8, medium: 18, strong: 32 };

/** Each kind as a multiple of the base pulse, with gaps for the two-beat patterns. */
const PATTERN: Record<HapticKind, (ms: number) => number | number[]> = {
  tick: (ms) => ms,
  select: (ms) => Math.round(ms * 1.5),
  success: (ms) => [ms, 40, Math.round(ms * 1.5)],
  warn: (ms) => [Math.round(ms * 2), 60, Math.round(ms * 2)],
};

let cache: HapticSettings | null = null;

function isIntensity(value: unknown): value is HapticIntensity {
  return value === 'light' || value === 'medium' || value === 'strong';
}

export function getHaptics(): HapticSettings {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<HapticSettings> | null;
    cache = {
      enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : DEFAULT_HAPTICS.enabled,
      intensity: isIntensity(raw?.intensity) ? raw.intensity : DEFAULT_HAPTICS.intensity,
    };
  } catch {
    cache = { ...DEFAULT_HAPTICS };
  }
  return cache;
}

export function setHaptics(patch: Partial<HapticSettings>): HapticSettings {
  const next = { ...getHaptics(), ...patch };
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the setting still applies until the tab is closed.
  }
  window.dispatchEvent(new CustomEvent(EVENT));
  return next;
}

/** Subscribe to changes made anywhere in the app (returns an unsubscribe). */
export function onHapticsChanged(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function hapticsSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Fire one haptic. Safe to call from any handler: it never throws, and does nothing
 * when haptics are off, unsupported, or the user asked for reduced motion.
 */
export function haptic(kind: HapticKind = 'tick'): void {
  if (typeof window === 'undefined' || !hapticsSupported()) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const settings = getHaptics();
  if (!settings.enabled) return;
  try {
    navigator.vibrate(PATTERN[kind](PULSE[settings.intensity]));
  } catch {
    // Some browsers throw when the page isn't the active one. Nothing to do.
  }
}
