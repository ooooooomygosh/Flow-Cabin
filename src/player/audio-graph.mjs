// Taps the deck's <audio> element with an AnalyserNode for `cabin:playback`
// energy. Only same-origin / blob: audio is routed (cross-origin media without
// CORS would be silenced by Web Audio). The graph is created inside a user
// gesture and only once the context is running, so playback never goes mute.
import { bassLevel } from './beat-tracker.mjs';
let context = null;
const graphs = new WeakMap();

export function canAnalyse(src, origin = globalThis.location?.origin) {
  if (!src) return false;
  try { const url = new URL(src, origin); return url.protocol === 'blob:' || url.origin === origin; } catch { return false; }
}
export async function ensureAnalyser(element) {
  if (!element) return null;
  if (graphs.has(element)) { if (context?.state === 'suspended') await context.resume().catch(() => {}); return graphs.get(element); }
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Context || !canAnalyse(element.currentSrc || element.src)) return null;
  try {
    context ||= new Context({ latencyHint: 'playback' });
    if (context.state !== 'running') await context.resume().catch(() => {});
    if (context.state !== 'running') return null;
    const source = context.createMediaElementSource(element), analyser = context.createAnalyser();
    // 2048 points: ~23 Hz bins, fine enough to read the kick drum's band for
    // beat tracking. Little smoothing, so onsets stay sharp.
    analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.2;
    source.connect(analyser); analyser.connect(context.destination);
    const frame = new Uint8Array(analyser.fftSize), spectrum = new Uint8Array(analyser.frequencyBinCount);
    const graph = { analyser, read: () => { analyser.getByteTimeDomainData(frame); return frame; }, bass: () => { analyser.getByteFrequencyData(spectrum); return bassLevel(spectrum, context.sampleRate, analyser.fftSize); } };
    graphs.set(element, graph); return graph;
  } catch { return null; }
}
export const analyserFor = (element) => (element && graphs.get(element)) || null;
