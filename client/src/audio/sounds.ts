/**
 * Sound hooks. Game code calls sounds.play('explosion', size) and doesn't care
 * how it's produced. Right now every sound is synthesised with WebAudio (no
 * asset files needed); swap any entry for a real audio file later.
 */
export type SoundName = 'click' | 'fire' | 'explosion' | 'hit' | 'death' | 'turn' | 'buy' | 'error' | 'win' | 'tick';

const MUTE_KEY = 'tanks.muted';

class Sounds {
  muted = localStorage.getItem(MUTE_KEY) === '1';
  private ctx: AudioContext | null = null;

  private audio(): AudioContext | null {
    if (this.muted) return null;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    return this.muted;
  }

  /** `size` scales a sound (e.g. explosion radius / 100). */
  play(name: SoundName, size = 1): void {
    const ctx = this.audio();
    if (!ctx) return;
    const h = HOOKS[name];
    h(ctx, size);
  }
}

function tone(ctx: AudioContext, freq: number, dur: number, type: OscillatorType, vol: number, endFreq?: number) {
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

function noise(ctx: AudioContext, dur: number, vol: number, lowpass: number) {
  const t = ctx.currentTime;
  const len = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(lowpass, t);
  filter.frequency.exponentialRampToValueAtTime(60, t + dur);
  const gain = ctx.createGain();
  gain.gain.value = vol;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(t);
}

const HOOKS: Record<SoundName, (ctx: AudioContext, size: number) => void> = {
  click: (c) => tone(c, 660, 0.06, 'square', 0.05),
  tick: (c) => tone(c, 1000, 0.05, 'sine', 0.05),
  fire: (c) => {
    noise(c, 0.25, 0.35, 2500);
    tone(c, 220, 0.2, 'sawtooth', 0.08, 70);
  },
  explosion: (c, size) => {
    noise(c, 0.5 + size * 0.8, Math.min(0.9, 0.35 + size * 0.4), 900 + size * 600);
    tone(c, 90, 0.4 + size * 0.4, 'sine', 0.3, 30);
  },
  hit: (c) => tone(c, 300, 0.15, 'square', 0.06, 120),
  death: (c) => {
    tone(c, 400, 0.6, 'sawtooth', 0.1, 50);
    noise(c, 0.8, 0.4, 600);
  },
  turn: (c) => {
    tone(c, 523, 0.12, 'triangle', 0.1);
    setTimeout(() => tone(c, 784, 0.18, 'triangle', 0.1), 110);
  },
  buy: (c) => {
    tone(c, 880, 0.08, 'square', 0.05);
    setTimeout(() => tone(c, 1320, 0.12, 'square', 0.05), 70);
  },
  error: (c) => tone(c, 160, 0.2, 'square', 0.07),
  win: (c) => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(c, f, 0.25, 'triangle', 0.1), i * 140)),
};

export const sounds = new Sounds();
