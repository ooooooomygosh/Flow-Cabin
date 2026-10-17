import React from 'react';
import PixelCat from './pet/PixelCat';
import { Check } from './icons';
import { PETS } from './pet/pet-catalog.mjs';
import { ROOM_SCENES } from './scene-catalog.mjs';
import './room-pickers.css';

// Small picker art (scripts/art/scene-thumbs.py), not the full room illustration.
export const sceneThumb = (scene) => `/room-scenes/thumbs/${scene.id}.png`;

// Scene + companion pickers: Settings › 房间与桌宠 and the first-run guide's 房间 step.
// `compact` drops the headings' hints and the descriptions for the guide's narrower column.
export default function RoomPickers({ look, petId, onChange, reduceMotion = false, compact = false }) {
  return <div className={`room-pickers${compact ? ' is-compact' : ''}`}>
    <section aria-labelledby="scene-picker-title"><div className="personalization-heading"><h3 id="scene-picker-title">你的休憩角落</h3>{!compact && <span>所有场景 · 随时切换</span>}</div>
      <div className="scene-options">{ROOM_SCENES.map((scene) => <button type="button" className="scene-choice" key={scene.id} aria-pressed={look === scene.id} onClick={() => onChange({ look: scene.id })} aria-label={`选择场景 ${scene.label}`}>
        <img src={sceneThumb(scene)} alt="" width="362" height="272" decoding="async"/><span className="choice-copy"><strong>{scene.label}</strong>{!compact && <small>{scene.description}</small>}</span><span className="choice-mark" aria-hidden="true">{look === scene.id && <Check size={12}/>}</span>
      </button>)}</div>
    </section>
    <section aria-labelledby="pet-picker-title"><div className="personalization-heading"><h3 id="pet-picker-title">陪你的小伙伴</h3>{!compact && <span>同步到桌宠与动态桌面</span>}</div>
      <div className="pet-options">{PETS.map((pet) => <button type="button" key={pet.id} className="pet-choice" aria-pressed={petId === pet.id} onClick={() => onChange({ petId: pet.id })} aria-label={`选择桌宠 ${pet.name || pet.label}`}>
        <PixelCat petId={pet.id} pose={petId === pet.id ? 'groove' : 'idle'} reduceMotion={reduceMotion}/><strong>{pet.name || pet.label}</strong>{!compact && <small>{pet.description || pet.personality || ''}</small>}<span className="choice-mark" aria-hidden="true">{petId === pet.id && <Check size={12}/>}</span>
      </button>)}</div>
    </section>
  </div>;
}
