import test from 'node:test';
import assert from 'node:assert/strict';
import { canSpeak, pickVoice, readAutoSpeak, speak, speakableText, speechLang, writeAutoSpeak } from './speech.mjs';

test('the language follows the script of the word', () => {
  assert.equal(speechLang('serene'), 'en-US');
  assert.equal(speechLang('光合作用'), 'zh-CN');
  assert.equal(speechLang('ありがとう'), 'ja-JP');
  assert.equal(speechLang('감사합니다'), 'ko-KR');
  assert.equal(speechLang('Straße'), 'de-DE');
  assert.equal(speechLang('café'), 'fr-FR');
});

test('a local exact voice wins, then the same language family', () => {
  const voices = [{ lang: 'en-GB', name: 'UK', localService: true }, { lang: 'en-US', name: 'Cloud', localService: false }, { lang: 'en-US', name: 'Local', localService: true }, { lang: 'zh_CN', name: 'Ting' }];
  assert.equal(pickVoice(voices, 'en-US').name, 'Local');
  assert.equal(pickVoice(voices, 'en-AU').name, 'UK');
  assert.equal(pickVoice(voices, 'zh-CN').name, 'Ting', 'Android-style underscores');
  assert.equal(pickVoice(voices, 'ja-JP'), null);
});

test('phonetics and notes are not read aloud', () => {
  assert.equal(speakableText('serene /səˈriːn/'), 'serene');
  assert.equal(speakableText('record [n.] (唱片)'), 'record');
  assert.equal(speakableText(''), '');
});

test('speak interrupts the previous word and reports when the system cannot speak', () => {
  const calls = [];
  class Utterance { constructor(text) { this.text = text; } }
  const win = { SpeechSynthesisUtterance: Utterance, speechSynthesis: { getVoices: () => [{ lang: 'en-US', name: 'A' }], cancel: () => calls.push('cancel'), speak: (u) => calls.push(u) } };
  assert.equal(canSpeak(win), true);
  assert.equal(speak('window /ˈwɪndoʊ/', { win }), true);
  assert.equal(calls[0], 'cancel');
  assert.deepEqual([calls[1].text, calls[1].lang, calls[1].voice.name], ['window', 'en-US', 'A']);
  assert.equal(speak('window', { win: {} }), false);
  assert.equal(speak('  ', { win }), false);
});

test('the 翻面自动朗读 preference survives a broken storage', () => {
  const data = {}, storage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  assert.equal(readAutoSpeak(storage), false);
  writeAutoSpeak(true, storage); assert.equal(readAutoSpeak(storage), true);
  assert.equal(readAutoSpeak({ getItem: () => { throw Error('denied'); } }), false);
  assert.equal(writeAutoSpeak(true, { setItem: () => { throw Error('full'); } }), true);
});
