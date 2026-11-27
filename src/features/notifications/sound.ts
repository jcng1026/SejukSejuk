// FR-NOT-4 sounds, synthesised with the Web Audio API so no audio files ship.
// Browsers only allow audio after the user has interacted with the page, so
// primeAudio() runs on the first pointer or key press.

export type SoundKind = "job_done" | "high_flag";

// Notes as [frequency Hz, start offset s]: a rising pair for success, a
// brighter triple for a High flag.
const PATTERNS: Record<SoundKind, readonly (readonly [number, number])[]> = {
  job_done: [
    [660, 0],
    [880, 0.12],
  ],
  high_flag: [
    [988, 0],
    [988, 0.18],
    [1319, 0.36],
  ],
};
const NOTE_SECONDS = 0.16;
const PEAK_GAIN = 0.15;

let context: AudioContext | null = null;
let isEnabled = true;
const listeners = new Set<() => void>();

export function primeAudio(): void {
  if (typeof window === "undefined" || !("AudioContext" in window)) return;
  context ??= new AudioContext();
  if (context.state === "suspended") void context.resume();
}

export function playSound(kind: SoundKind): void {
  if (!isEnabled || !context || context.state !== "running") return;
  const now = context.currentTime;
  for (const [frequency, offset] of PATTERNS[kind]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now + offset);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, now + offset + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + NOTE_SECONDS);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + NOTE_SECONDS);
  }
}

// A tiny external store so every toggle and player sees the same preference.
export function setSoundEnabled(next: boolean): void {
  if (next === isEnabled) return;
  isEnabled = next;
  for (const listener of listeners) listener();
}

export function isSoundEnabled(): boolean {
  return isEnabled;
}

export function subscribeSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
