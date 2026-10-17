// Taps the deck's <audio> element with an AnalyserNode for `cabin:playback`
// energy. Only same-origin / blob: audio is routed (cross-origin media without
// CORS would be silenced by Web Audio). The graph is created inside a user
// gesture and only once the context is running, so playback never goes mute.
import { bassLevel } from './beat-tracker.mjs';
import { createIdleSuspend } from '../audio/idle-suspend.mjs';
let context = null, idle = null;
const routed = new Set(); // <audio> elements whose sound flows through this context
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
    if (!context) { context = new Context(/* default 'interactive': ~40 ms to the ear, not ~95 ms with 'playback' */); idle = createIdleSuspend(context, { ms: 2000, busy: () => [...routed].some((media) => !media.paused) }); }
    if (context.state !== 'running') await context.resume().catch(() => {});
    if (context.state !== 'running') return null;
    const source = context.createMediaElementSource(element), analyser = context.createAnalyser();
    // 2048 points: ~23 Hz bins, fine enough to read the kick drum's band for
    // beat tracking. Little smoothing, so onsets stay sharp.
    analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.2;
    source.connect(analyser); analyser.connect(context.destination);
    const frame = new Uint8Array(analyser.fftSize), spectrum = new Uint8Array(analyser.frequencyBinCount);
    // Output latency (ms): how long after the graph renders a sample it is heard.
    const latency = () => ((context.baseLatency || 0) + (context.outputLatency || 0)) * 1000;
    const graph = { analyser, latency, read: () => { analyser.getByteTimeDomainData(frame); return frame; }, bass: () => { analyser.getByteFrequencyData(spectrum); return bassLevel(spectrum, context.sampleRate, analyser.fftSize); } };
    // The element now plays through this context: wake it with the music, let it sleep 2 s after.
    routed.add(element);
    element.addEventListener('play', () => idle.wake());
    for (const type of ['pause', 'ended', 'emptied']) element.addEventListener(type, () => idle.idle());
    graphs.set(element, graph); return graph;
  } catch { return null; }
}
export const analyserFor = (element) => (element && graphs.get(element)) || null;
