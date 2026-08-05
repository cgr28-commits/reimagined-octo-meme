/** Soft Web Audio tones for the quote assistant — no media files required. */

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedContext || sharedContext.state === "closed") {
    sharedContext = new AudioCtx();
  }
  return sharedContext;
}

async function ensureRunning(context: AudioContext): Promise<boolean> {
  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return false;
    }
  }
  return context.state === "running";
}

function tone(
  context: AudioContext,
  {
    frequency,
    startAt,
    duration,
    volume = 0.045,
    type = "sine",
  }: {
    frequency: number;
    startAt: number;
    duration: number;
    volume?: number;
    type?: OscillatorType;
  },
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

async function playSequence(
  notes: Array<{ frequency: number; offset: number; duration: number; volume?: number }>,
) {
  const context = getAudioContext();
  if (!context || !(await ensureRunning(context))) return;

  const now = context.currentTime;
  for (const note of notes) {
    tone(context, {
      frequency: note.frequency,
      startAt: now + note.offset,
      duration: note.duration,
      volume: note.volume,
    });
  }
}

/** Soft open chime when the chat panel opens. */
export function playBotOpenSound() {
  void playSequence([
    { frequency: 523.25, offset: 0, duration: 0.12, volume: 0.04 },
    { frequency: 659.25, offset: 0.1, duration: 0.16, volume: 0.045 },
  ]);
}

/** Short “working” ticks while the bot prepares a reply. */
export function playBotWorkingSound() {
  void playSequence([
    { frequency: 440, offset: 0, duration: 0.07, volume: 0.035 },
    { frequency: 440, offset: 0.14, duration: 0.07, volume: 0.03 },
    { frequency: 554.37, offset: 0.28, duration: 0.1, volume: 0.04 },
  ]);
}

/** Soft reply chime when the bot answer appears. */
export function playBotReplySound() {
  void playSequence([
    { frequency: 659.25, offset: 0, duration: 0.1, volume: 0.04 },
    { frequency: 783.99, offset: 0.09, duration: 0.14, volume: 0.045 },
  ]);
}
