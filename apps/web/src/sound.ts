/** All sounds are synthesised with Web Audio: nothing to download, works offline. */
let ctx: AudioContext | null = null;
let muted = false;
try {
  muted = localStorage.getItem('hexania:mute') === '1';
} catch {
  /* ignore */
}

export const isMuted = (): boolean => muted;
export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem('hexania:mute', m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Browsers only start audio after a gesture; call this from the first tap. */
export function unlockAudio(): void {
  audio();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + start;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(start: number, dur: number, gain: number, freq: number): void {
  const c = audio();
  if (!c) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(c.destination);
  src.start(c.currentTime + start);
}

export type Sfx = 'dice' | 'build' | 'city' | 'coin' | 'robber' | 'turn' | 'card' | 'win' | 'click' | 'error';

export function play(name: Sfx): void {
  if (muted) return;
  switch (name) {
    case 'dice':
      for (let i = 0; i < 6; i++) noise(i * 0.07, 0.05, 0.5, 1800 + i * 150);
      tone(220, 0.45, 0.12, 'triangle', 0.18);
      break;
    case 'build':
      tone(140, 0, 0.12, 'square', 0.12, 70);
      noise(0, 0.08, 0.35, 700);
      break;
    case 'city':
      tone(196, 0, 0.14, 'triangle', 0.2);
      tone(294, 0.1, 0.2, 'triangle', 0.2);
      break;
    case 'coin':
      tone(988, 0, 0.09, 'sine', 0.16);
      tone(1319, 0.08, 0.2, 'sine', 0.16);
      break;
    case 'robber':
      tone(110, 0, 0.35, 'sawtooth', 0.12, 55);
      break;
    case 'turn':
      tone(660, 0, 0.1, 'sine', 0.18);
      tone(880, 0.12, 0.16, 'sine', 0.18);
      break;
    case 'card':
      noise(0, 0.06, 0.3, 3200);
      break;
    case 'win':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.14, 0.5, 'triangle', 0.2));
      break;
    case 'click':
      tone(520, 0, 0.04, 'sine', 0.08);
      break;
    case 'error':
      tone(180, 0, 0.18, 'square', 0.08, 120);
      break;
  }
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}
