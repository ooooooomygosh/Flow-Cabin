import { useEffect, useState } from 'react';
import { readPetMotion, subscribePetMotion } from './pet-motion.mjs';

// OS preference always applies; main-window focus does not gate desktop surfaces.
export function useCatMotion(reduceMotion = false, hidden = false) {
  const [state, setState] = useState(() => readPetMotion());
  useEffect(() => subscribePetMotion(setState), []);
  return { visible: state.visible && !hidden, reduced: Boolean(reduceMotion || state.reduced) };
}
