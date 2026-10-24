// The volume slider is perceptual: its position is what the listener hears as
// "how loud", the element gets the matching amplitude. A cubic curve is close to
// how loudness is perceived (-18 dB at the middle), so the lower half of the
// slider is usable instead of everything happening in the first few percent.
export const VOLUME_STEP = .05;
const clamp = (value) => Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : 0));
export const sliderToGain = (value) => { const v = clamp(value); return v <= 0 ? 0 : v >= 1 ? 1 : v * v * v; };
export const gainToSlider = (gain) => { const g = clamp(gain); return g <= 0 ? 0 : g >= 1 ? 1 : Math.cbrt(g); };
export const volumePercent = (value) => Math.round(clamp(value) * 100);
// One wheel notch (or a trackpad's worth of small deltas) is one step.
export const wheelVolume = (value, deltaY, step = VOLUME_STEP) => { const notches = Math.sign(Number(deltaY) || 0); return Math.round(clamp(clamp(value) - notches * step) * 100) / 100; };
