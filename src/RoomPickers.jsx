import React from 'react';
import PixelCat from './pet/PixelCat';
import { Check } from './icons';
import { PETS } from './pet/pet-catalog.mjs';
import './room-pickers.css';

// The companion picker: Settings › 小屋与奶糖, the drawer's 伙伴 panel and the first-run guide's 伙伴 step.
// 3.1: the home is the desk, so there is no room-scene picker any more; the stored `look` (which only
// picks the lyric skin now) is left as it is.
// `compact` drops the heading's hint and the descriptions for the guide's narrower column.
export default function RoomPickers({ petId, onChange, reduceMotion = false, compact = false }) {
  return <div className={`room-pickers${compact ? ' is-compact' : ''}`}>
    <section aria-labelledby="pet-picker-title"><div className="personalization-heading"><h3 id="pet-picker-title">陪你的小伙伴</h3>{!compact && <span>同步到桌宠与动态桌面</span>}</div>
      <div className="pet-options">{PETS.map((pet) => <button type="button" key={pet.id} className="pet-choice" aria-pressed={petId === pet.id} onClick={() => onChange({ petId: pet.id })} aria-label={`选择桌宠 ${pet.name || pet.label}`}>
        <PixelCat packOverride={null} petId={pet.id} pose={petId === pet.id ? 'groove' : 'idle'} reduceMotion={reduceMotion}/><strong>{pet.name || pet.label}</strong>{!compact && <small>{pet.description || pet.personality || ''}</small>}<span className="choice-mark" aria-hidden="true">{petId === pet.id && <Check size={12}/>}</span>
      </button>)}</div>
    </section>
  </div>;
}
