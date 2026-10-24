// 单词发音 with the system's own voices (speechSynthesis): nothing is
// downloaded or bundled. Android's WebView has no speechSynthesis, so the
// button simply is not offered there.
export const SPEAK_KEY = 'flow-cabin-study-speak-v1';

// The language of a card's front, from its script. Latin text defaults to English.
export function speechLang(text) {
  const value = String(text ?? '');
  if (/[぀-ヿ]/.test(value)) return 'ja-JP';
  if (/[가-힯]/.test(value)) return 'ko-KR';
  if (/[一-鿿]/.test(value)) return 'zh-CN';
  if (/[Ѐ-ӿ]/.test(value)) return 'ru-RU';
  if (/[äöüß]/i.test(value)) return 'de-DE';
  if (/[àâçéèêëîïôûùœ]/i.test(value)) return 'fr-FR';
  if (/[ñ¿¡]/i.test(value)) return 'es-ES';
  return 'en-US';
}

// Prefer an exact local voice, then the same language family, then nothing
// (the engine picks its default for `lang`).
export function pickVoice(voices = [], lang = 'en-US') {
  const family = lang.split('-')[0].toLowerCase();
  const local = (voice) => voice.localService !== false;
  const exact = voices.filter((voice) => String(voice.lang).replace('_', '-').toLowerCase() === lang.toLowerCase());
  const near = voices.filter((voice) => String(voice.lang).toLowerCase().startsWith(family));
  return exact.find(local) || exact[0] || near.find(local) || near[0] || null;
}

// What to read aloud: the headword only, without phonetics in /slashes/ or [brackets].
export function speakableText(front) {
  return String(front ?? '').replace(/\/[^/]*\/|\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

export const canSpeak = (win = globalThis) => Boolean(win?.speechSynthesis && typeof win.SpeechSynthesisUtterance === 'function');

// Speak once, interrupting anything still being read. Returns false when the
// system cannot speak.
export function speak(text, { win = globalThis, rate = 0.9 } = {}) {
  const words = speakableText(text);
  if (!words || !canSpeak(win)) return false;
  const synth = win.speechSynthesis, utterance = new win.SpeechSynthesisUtterance(words);
  utterance.lang = speechLang(words); utterance.rate = rate;
  const voice = pickVoice(synth.getVoices?.() || [], utterance.lang); if (voice) utterance.voice = voice;
  synth.cancel(); synth.speak(utterance);
  return true;
}
export function readAutoSpeak(storage = globalThis.localStorage) { try { return storage.getItem(SPEAK_KEY) === 'auto'; } catch { return false; } }
export function writeAutoSpeak(on, storage = globalThis.localStorage) { try { storage.setItem(SPEAK_KEY, on ? 'auto' : 'off'); } catch {} return on; }
