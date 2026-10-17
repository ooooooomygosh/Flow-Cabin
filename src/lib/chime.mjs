// A short synthesized chime on a throwaway AudioContext (closed right after).
// Presets: 'test' confirms the output device (onboarding 试听); 'focus' ends a focus round.
export const CHIMES = Object.freeze({
  test: { type: 'square', peak: 0.08, attack: 0.02, length: 0.16, notes: [[523.25, 0], [659.25, 0.18], [783.99, 0.36]] },
  focus: { type: 'triangle', peak: 0.16, attack: 0.02, length: 0.9, notes: [[659.25, 0], [880, 0.18], [1046.5, 0.36]] }
});
export function playChime(preset = 'test', { win = globalThis } = {}) {
  const Context = win.AudioContext || win.webkitAudioContext, chime = CHIMES[preset] || CHIMES.test;
  if (!Context) return { ok: false, error: '这个环境不能播放测试音。' };
  try {
    const context = new Context(), start = context.currentTime + 0.02;
    for (const [frequency, offset] of chime.notes) {
      const osc = context.createOscillator(), gain = context.createGain(), at = start + offset;
      osc.type = chime.type; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(chime.peak, at + chime.attack); gain.gain.exponentialRampToValueAtTime(0.0001, at + chime.length);
      osc.connect(gain).connect(context.destination); osc.start(at); osc.stop(at + chime.length + 0.05);
    }
    const last = Math.max(...chime.notes.map(([, offset]) => offset)) + chime.length;
    setTimeout(() => context.close?.().catch?.(() => {}), (last + 0.5) * 1000);
    return { ok: true, kind: 'chime' };
  } catch (error) { return { ok: false, error: error?.message || '无法播放测试音' }; }
}
