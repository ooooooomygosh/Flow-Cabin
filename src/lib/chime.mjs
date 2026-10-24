// A short synthesized chime on a throwaway AudioContext (closed right after).
// Presets: 'test' confirms the output device (onboarding 试听); 'focus' ends a focus round.
// The end-of-round sound can be one of FOCUS_CHIMES (设置 › 专注工具 › 提示音), at a chosen volume.
export const CHIMES = Object.freeze({
  test: { type: 'square', peak: 0.08, attack: 0.02, length: 0.16, notes: [[523.25, 0], [659.25, 0.18], [783.99, 0.36]] },
  focus: { type: 'triangle', peak: 0.16, attack: 0.02, length: 0.9, notes: [[659.25, 0], [880, 0.18], [1046.5, 0.36]] },
  wood: { type: 'sine', peak: 0.22, attack: 0.004, length: 0.14, notes: [[740, 0], [740, 0.16], [988, 0.42]] },
  soft: { type: 'sine', peak: 0.14, attack: 0.08, length: 1.6, notes: [[523.25, 0], [659.25, 0.5], [783.99, 1]] },
  digital: { type: 'square', peak: 0.06, attack: 0.005, length: 0.12, notes: [[1318.5, 0], [1318.5, 0.18], [1318.5, 0.36], [1318.5, 0.72], [1318.5, 0.9]] }
});
// id → preset and label. 'bell' is the original focus chime.
export const FOCUS_CHIMES = Object.freeze([['bell', 'focus', '风铃'], ['wood', 'wood', '木鱼'], ['soft', 'soft', '柔和'], ['digital', 'digital', '电子']]);
export const focusChime = (id) => FOCUS_CHIMES.find(([key]) => key === id)?.[1] || 'focus';
// volume: 0..1 multiplies the preset's own peak (1 = as designed).
export function playChime(preset = 'test', { win = globalThis, volume = 1 } = {}) {
  const Context = win.AudioContext || win.webkitAudioContext, chime = CHIMES[preset] || CHIMES.test;
  const level = Math.max(0, Math.min(1, Number.isFinite(Number(volume)) ? Number(volume) : 1));
  if (!Context) return { ok: false, error: '这个环境不能播放测试音。' };
  if (level <= 0) return { ok: true, kind: 'muted' };
  try {
    const context = new Context(), start = context.currentTime + 0.02, peak = Math.max(0.0002, chime.peak * level);
    for (const [frequency, offset] of chime.notes) {
      const osc = context.createOscillator(), gain = context.createGain(), at = start + offset;
      osc.type = chime.type; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(peak, at + chime.attack); gain.gain.exponentialRampToValueAtTime(0.0001, at + chime.length);
      osc.connect(gain).connect(context.destination); osc.start(at); osc.stop(at + chime.length + 0.05);
    }
    const last = Math.max(...chime.notes.map(([, offset]) => offset)) + chime.length;
    setTimeout(() => context.close?.().catch?.(() => {}), (last + 0.5) * 1000);
    return { ok: true, kind: 'chime' };
  } catch (error) { return { ok: false, error: error?.message || '无法播放测试音' }; }
}
