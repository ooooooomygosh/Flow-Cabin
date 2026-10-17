// The built-in focus faces (专注画面), by id. Each: { id, size(model) → {w,h},
// paint(model, palette, anim?) → raster, steps (progress resolution), wall?, flips? }.
import { face as flip } from './flip.mjs';
import { face as ring } from './ring.mjs';
import { face as record } from './record.mjs';
import { face as minimal } from './minimal.mjs';
import { face as window } from './window.mjs';
import { face as growth } from './growth.mjs';
import { faceModel } from '../face-model.mjs';

export const FACES = Object.freeze({ flip, ring, record, minimal, window, growth });
export const getFace = (id) => FACES[id] || flip;
// The still frame a picker shows: a round a third of the way in, at 21:47.
export const PREVIEW_NOW = new Date(2026, 9, 16, 21, 47, 0).getTime();
export const previewModel = (id) => faceModel({ now: PREVIEW_NOW, show: id === 'window' || id === 'flip' ? 'clock' : 'timer', focus: { phase: 'focus', endsAt: PREVIEW_NOW + 16 * 60000 + 24000, duration: 25 * 60000, round: 1, longEvery: 4 } });
